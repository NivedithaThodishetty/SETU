/**
 * SETU Mobile — read-aloud engine.
 *
 * Two engines behind one interface:
 *
 *  1. Sarvam Bulbul via `/api/speech` — a natural human voice in eleven Indian
 *     languages. This is the primary comprehension accommodation in SETU: for a
 *     reader whose difficulty is decoding rather than eyesight, hearing the text
 *     is not a convenience, it is the whole point.
 *  2. The device's own synthesiser via `expo-speech`, used whenever Sarvam is
 *     unconfigured, unreachable, or fails mid-passage. Never leaves the user in
 *     silence, and never blocks on the network to start.
 *
 * Long passages are split on sentence boundaries and pipelined: the next clip is
 * fetched while the current one plays, so the reader hears the first sentence in
 * about a second instead of waiting for the whole passage to synthesise. The
 * first chunk is deliberately short for exactly that reason; later chunks are
 * larger because they are fetched under cover of audio already playing, where
 * size costs nothing perceptible.
 */

import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { getApiBaseUrl } from './api';
import { peekUserId } from './identity';
import { DEFAULT_LANGUAGE } from '../constants/languages';
import { SarvamVoice } from '../types';

const FIRST_CHUNK_CHARS = 220;
const CHUNK_CHARS = 600;

/** Cached clips on disk, so re-tapping a branch replays instantly and free. */
const MAX_CACHED_CLIPS = 40;

export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  engine: 'sarvam' | 'device';
}

export interface SpeakOptions {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: unknown) => void;
  /** Skip the haptic tick — used for automatic speech the user did not ask for. */
  quiet?: boolean;
}

/**
 * Split text into speakable chunks on sentence boundaries.
 *
 * Danda (।) and double danda (॥) end a sentence in Devanagari, Bengali,
 * Gujarati, Punjabi and Odia. Without them a Hindi paragraph is one enormous
 * "sentence" and the whole pipelining scheme collapses back into one slow clip.
 */
export function chunkText(
  text: string,
  { first = FIRST_CHUNK_CHARS, rest = CHUNK_CHARS }: { first?: number; rest?: number } = {}
): string[] {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const sentences = clean.match(/[^.!?।॥]+[.!?।॥]+(\s|$)|[^.!?।॥]+$/g) || [clean];
  const chunks: string[] = [];
  let current = '';

  const limit = () => (chunks.length === 0 ? first : rest);

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (sentence.length > rest) {
      pushCurrent();
      let buffer = '';
      for (const word of sentence.split(' ')) {
        if (buffer && `${buffer} ${word}`.length > limit()) {
          chunks.push(buffer.trim());
          buffer = word;
        } else {
          buffer = buffer ? `${buffer} ${word}` : word;
        }
      }
      if (buffer.trim()) chunks.push(buffer.trim());
      continue;
    }

    if (current && `${current} ${sentence}`.length > limit()) pushCurrent();
    current = current ? `${current} ${sentence}` : sentence;
  }

  pushCurrent();
  return chunks;
}

/** Strip markdown so the voice does not read asterisks and backticks aloud. */
function cleanForSpeech(text: string): string {
  return String(text || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`~>[\]()|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable, filesystem-safe name for a clip. */
function clipFileName(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  return `setu-tts-${(hash >>> 0).toString(36)}.mp3`;
}

class TTSService {
  private rate = 1.0;
  private pitch = 1.0;
  private speaker: string | null = null;
  private language = DEFAULT_LANGUAGE;

  private playing = false;
  private paused = false;

  /**
   * Bumped on every stop and every new utterance.
   *
   * Every async step checks it before continuing, which is what stops a slow
   * clip from the previous passage playing over the one the user just asked for.
   */
  private playToken = 0;

  private player: AudioPlayer | null = null;
  private abortController: AbortController | null = null;

  private naturalAvailable: boolean | null = null;
  private sttAvailable: boolean | null = null;
  private voiceCatalogue: SarvamVoice[] = [];
  private probePromise: Promise<boolean> | null = null;

  private audioModeReady = false;
  private clipCache = new Map<string, string>();
  private listeners = new Set<(state: TTSState) => void>();

  /* ----------------------------- Settings ----------------------------- */

  setRate(rate: number): void {
    this.rate = Math.max(0.5, Math.min(2.0, Number(rate) || 1));
  }

  setPitch(pitch: number): void {
    this.pitch = Math.max(0.5, Math.min(1.5, Number(pitch) || 1));
  }

  setSpeaker(speakerId: string | null): void {
    if (this.speaker === speakerId) return;
    this.speaker = speakerId || null;
    this.clearClipCache();
  }

  getSpeaker(): string | null {
    return this.speaker;
  }

  setLanguage(code: string): void {
    if (this.language === code) return;
    this.language = code || DEFAULT_LANGUAGE;
    this.clearClipCache();
  }

  getLanguage(): string {
    return this.language;
  }

  /**
   * Forget which engine is live.
   *
   * Called when the backend address changes, because "natural voice is
   * unavailable" is a fact about one server, not about the app.
   */
  resetProbe(): void {
    this.naturalAvailable = null;
    this.sttAvailable = null;
    this.probePromise = null;
    this.clearClipCache();
  }

  /* ---------------------------- Availability ---------------------------- */

  async probeNaturalVoice(force = false): Promise<boolean> {
    if (!force && this.naturalAvailable !== null) return this.naturalAvailable;
    if (!force && this.probePromise) return this.probePromise;

    this.probePromise = (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/speech/voices`, {
          headers: { 'x-user-id': peekUserId() },
        });
        if (!response.ok) throw new Error('probe failed');

        const data = await response.json();
        this.naturalAvailable = Boolean(data.enabled);
        this.sttAvailable = Boolean(data.sttEnabled);
        this.voiceCatalogue = data.voices || [];
        if (!this.speaker && data.defaultSpeaker) this.speaker = data.defaultSpeaker;
        return this.naturalAvailable;
      } catch (_) {
        this.naturalAvailable = false;
        this.sttAvailable = false;
        return false;
      } finally {
        this.probePromise = null;
      }
    })();

    return this.probePromise;
  }

  async getVoiceCatalogue(): Promise<SarvamVoice[]> {
    await this.probeNaturalVoice();
    return this.voiceCatalogue;
  }

  async isNaturalVoiceAvailable(): Promise<boolean> {
    return this.probeNaturalVoice();
  }

  async isTranscriptionAvailable(): Promise<boolean> {
    await this.probeNaturalVoice();
    return Boolean(this.sttAvailable);
  }

  /* ------------------------------- Speak ------------------------------- */

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    const clean = cleanForSpeech(text);
    if (!clean) return;

    await this.stop();
    const token = (this.playToken += 1);

    if (!options.quiet) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (_) {}
    }

    const natural = await this.probeNaturalVoice();
    if (token !== this.playToken) return;

    if (natural) {
      try {
        await this.speakNatural(clean, token, options);
        return;
      } catch (_) {
        if (token !== this.playToken) return;
        // Sarvam failed outright — fall through to the device voice rather than
        // leaving the reader with nothing.
      }
    }
    if (token !== this.playToken) return;
    await this.speakDevice(clean, token, options);
  }

  private async ensureAudioMode(): Promise<void> {
    if (this.audioModeReady) return;
    try {
      // Without this a clip is silent on an iPhone with the ringer switch off,
      // which is how a lot of people carry their phone all day.
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
      this.audioModeReady = true;
    } catch (_) {
      /* the player still works with the platform default mode */
    }
  }

  private async fetchClip(chunk: string, signal: AbortSignal): Promise<string> {
    const key = `${this.speaker || 'default'}|${this.language}|${this.rate}|${chunk}`;
    const cached = this.clipCache.get(key);
    if (cached) return cached;

    const response = await fetch(`${getApiBaseUrl()}/api/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': peekUserId() },
      body: JSON.stringify({
        text: chunk,
        speaker: this.speaker,
        pace: this.rate,
        language: this.language,
      }),
      signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // The server tells us when the failure is permanent for this deployment,
      // so we stop paying the round trip on every subsequent utterance.
      if (data.fallbackToBrowser) this.naturalAvailable = false;
      throw new Error(data.error || 'Speech synthesis failed.');
    }
    if (!data.audio) throw new Error('Voice engine returned no audio.');

    const file = new File(Paths.cache, clipFileName(key));
    if (file.exists) file.delete();
    file.create();
    file.write(String(data.audio).replace(/^data:[^;]+;base64,/, ''), { encoding: 'base64' });

    if (this.clipCache.size >= MAX_CACHED_CLIPS) {
      const oldestKey = this.clipCache.keys().next().value;
      if (oldestKey) {
        this.deleteClipFile(this.clipCache.get(oldestKey));
        this.clipCache.delete(oldestKey);
      }
    }
    this.clipCache.set(key, file.uri);
    return file.uri;
  }

  private playClip(uri: string, token: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (token !== this.playToken) {
        resolve();
        return;
      }

      let player: AudioPlayer;
      try {
        player = createAudioPlayer(uri);
      } catch (error) {
        reject(error);
        return;
      }

      this.player = player;
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        try {
          subscription?.remove();
        } catch (_) {}
        try {
          player.release();
        } catch (_) {}
        if (this.player === player) this.player = null;
        if (error) reject(error);
        else resolve();
      };

      const subscription = player.addListener('playbackStatusUpdate', (status: any) => {
        if (status?.didJustFinish) finish();
        else if (status?.error) finish(new Error(String(status.error)));
      });

      try {
        player.play();
      } catch (error) {
        finish(error as Error);
      }
    });
  }

  private async speakNatural(text: string, token: number, options: SpeakOptions): Promise<void> {
    const chunks = chunkText(text);
    if (!chunks.length) return;

    await this.ensureAudioMode();
    if (token !== this.playToken) return;

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    let pending: Promise<string | null> = this.fetchClip(chunks[0], signal);

    for (let index = 0; index < chunks.length; index += 1) {
      let uri: string | null = null;
      try {
        uri = await pending;
      } catch (error) {
        if (token !== this.playToken) return;
        if (index === 0) throw error;

        // A later chunk failed. Finish the passage in the device voice rather
        // than stopping mid-sentence — a truncated explanation is worse than a
        // change of voice.
        const remaining = chunks.slice(index).join(' ');
        if (remaining) return this.speakDevice(remaining, token, { ...options, quiet: true });
        break;
      }

      if (token !== this.playToken) return;
      if (!uri) break;

      pending =
        index + 1 < chunks.length
          ? this.fetchClip(chunks[index + 1], signal).catch(() => null)
          : Promise.resolve(null);

      if (index === 0) {
        this.playing = true;
        this.paused = false;
        this.emit();
        options.onStart?.();
      }

      try {
        await this.playClip(uri, token);
      } catch (_) {
        if (token !== this.playToken) return;
        const remaining = chunks.slice(index).join(' ');
        if (remaining) return this.speakDevice(remaining, token, { ...options, quiet: true });
      }

      if (token !== this.playToken) return;
    }

    if (token !== this.playToken) return;
    this.playing = false;
    this.paused = false;
    this.emit();
    options.onDone?.();
  }

  private speakDevice(text: string, token: number, options: SpeakOptions): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      try {
        Speech.speak(text, {
          rate: this.rate,
          pitch: this.pitch,
          language: this.language,
          onStart: () => {
            if (token !== this.playToken) return;
            this.playing = true;
            this.paused = false;
            this.emit();
            options.onStart?.();
          },
          onDone: () => {
            if (token === this.playToken) {
              this.playing = false;
              this.paused = false;
              this.emit();
              options.onDone?.();
            }
            finish();
          },
          onStopped: () => {
            if (token === this.playToken) {
              this.playing = false;
              this.paused = false;
              this.emit();
            }
            finish();
          },
          onError: (error) => {
            if (token === this.playToken) {
              this.playing = false;
              this.paused = false;
              this.emit();
              options.onError?.(error);
            }
            finish();
          },
        });
      } catch (error) {
        options.onError?.(error);
        finish();
      }
    });
  }

  /* ----------------------------- Transport ----------------------------- */

  pause(): void {
    if (!this.playing || this.paused) return;
    if (this.player) {
      try {
        this.player.pause();
      } catch (_) {}
    } else {
      // expo-speech has no pause on Android, so stopping is the honest fallback.
      Speech.stop().catch(() => {});
    }
    this.paused = true;
    this.emit();
  }

  resume(): void {
    if (!this.playing || !this.paused) return;
    if (this.player) {
      try {
        this.player.play();
      } catch (_) {}
    }
    this.paused = false;
    this.emit();
  }

  async stop(): Promise<void> {
    this.playToken += 1;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.player) {
      const player = this.player;
      this.player = null;
      try {
        player.pause();
        player.release();
      } catch (_) {}
    }

    try {
      await Speech.stop();
    } catch (_) {}

    this.playing = false;
    this.paused = false;
    this.emit();
  }

  async isSpeaking(): Promise<boolean> {
    if (this.playing) return true;
    try {
      return await Speech.isSpeakingAsync();
    } catch (_) {
      return false;
    }
  }

  /** Device voices, for the Settings picker when Sarvam is unavailable. */
  async getDeviceVoices() {
    try {
      return await Speech.getAvailableVoicesAsync();
    } catch (_) {
      return [];
    }
  }

  /* ------------------------------ Plumbing ------------------------------ */

  private deleteClipFile(uri?: string): void {
    if (!uri) return;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (_) {}
  }

  clearClipCache(): void {
    for (const uri of this.clipCache.values()) this.deleteClipFile(uri);
    this.clipCache.clear();
  }

  subscribe(listener: (state: TTSState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): TTSState {
    return {
      isPlaying: this.playing,
      isPaused: this.paused,
      engine: this.naturalAvailable ? 'sarvam' : 'device',
    };
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (_) {}
    }
  }
}

export const tts = new TTSService();
