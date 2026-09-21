/**
 * SETU read-aloud engine.
 *
 * Two engines behind one interface:
 *
 *  1. Sarvam AI (`/api/speech`) — a natural human voice (Bulbul v3). This is the primary
 *     comprehension accommodation for readers whose difficulty is decoding text.
 *  2. The browser's SpeechSynthesis — used whenever Sarvam is unconfigured,
 *     unreachable, or blocked. Never leaves the user in silence.
 *
 * Long passages are split on sentence boundaries and pipelined: the next clip is
 * fetched while the current one plays, so the reader hears the first sentence
 * within a second instead of waiting for the whole passage to synthesise.
 */

import { getUserId } from './identity';
import { API_BASE as BASE } from './apiBase';

/**
 * Clip sizing.
 *
 * The first chunk is deliberately short so audio starts almost immediately;
 * later chunks are larger because they are being fetched under cover of the
 * clip already playing, where size costs nothing perceptible.
 */
const FIRST_CHUNK_CHARS = 220;
const CHUNK_CHARS = 600;

/** Blob URLs are cached so re-hovering a branch replays instantly and free. */
const MAX_CACHED_CLIPS = 60;

/**
 * Convert a base64 string to a Blob reliably without fetch('data:...')
 */
function base64ToBlob(base64, mimeType = 'audio/mpeg') {
  try {
    const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
    const binary = atob(cleaned);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } catch (err) {
    console.warn('[SETU TTS] base64 to blob conversion failed:', err);
    return null;
  }
}

/**
 * Split text into speakable chunks on sentence boundaries.
 */
export function chunkText(text, { first = FIRST_CHUNK_CHARS, rest = CHUNK_CHARS } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  // Danda (।) and double danda (॥) end a sentence in Devanagari, Bengali, Gujarati, Punjabi, Odia.
  const sentences = clean.match(/[^.!?।॥]+[.!?।॥]+(\s|$)|[^.!?।॥]+$/g) || [clean];
  const chunks = [];
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
        if (buffer && (buffer + ' ' + word).length > limit()) {
          chunks.push(buffer.trim());
          buffer = word;
        } else {
          buffer = buffer ? `${buffer} ${word}` : word;
        }
      }
      if (buffer.trim()) chunks.push(buffer.trim());
      continue;
    }

    if (current && (current + ' ' + sentence).length > limit()) {
      pushCurrent();
    }
    current = current ? `${current} ${sentence}` : sentence;
  }

  pushCurrent();
  return chunks;
}

class TTSEngine {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.isPlaying = false;
    this.isPaused = false;
    this.listeners = new Set();

    this.rate = 1.0;
    this.pitch = 1.0;
    this.voice = null;

    /** Sarvam speaker id. Null uses the server's configured default. */
    this.speaker = null;

    /**
     * Language the audio is synthesised in.
     * Bulbul voices are multilingual (11 Indic languages + English).
     */
    this.language = 'en-IN';

    this.currentCharIndex = -1;

    /* Natural-voice state */
    this.audio = null;
    this.abortController = null;
    this.playToken = 0;
    this.clipCache = new Map();

    this.naturalVoiceAvailable = null;
    this.sttAvailable = null;
    this.voiceCatalogue = [];
    this.probePromise = null;

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.stop());
    }
  }

  isAvailable() {
    return Boolean(this.synth) || this.naturalVoiceAvailable !== false;
  }

  /* ------------------------- Voice settings ------------------------- */

  getVoices() {
    if (!this.synth) return [];
    return this.synth.getVoices().filter((v) => v.lang.startsWith('en'));
  }

  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2.0, Number(rate) || 1));
  }

  setVoice(voice) {
    this.voice = voice;
  }

  setSpeaker(speakerId) {
    this.speaker = speakerId || null;
    this.clearClipCache();
  }

  getSpeaker() {
    return this.speaker;
  }

  setLanguage(code) {
    if (this.language === code) return;
    this.language = code || 'en-IN';
    this.clearClipCache();
  }

  getLanguage() {
    return this.language;
  }

  clearClipCache() {
    for (const url of this.clipCache.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
    this.clipCache.clear();
  }

  /* ----------------------------- Availability ----------------------------- */

  async probeNaturalVoice(force = false) {
    if (!force && this.naturalVoiceAvailable !== null) return this.naturalVoiceAvailable;
    if (!force && this.probePromise) return this.probePromise;

    this.probePromise = (async () => {
      try {
        const response = await fetch(`${BASE}/api/speech/voices`, {
          headers: { 'x-user-id': getUserId() }
        });
        if (!response.ok) throw new Error('probe failed');
        const data = await response.json();
        this.naturalVoiceAvailable = Boolean(data.enabled);
        this.sttAvailable = Boolean(data.sttEnabled);
        this.voiceCatalogue = data.voices || [];
        if (!this.speaker && data.defaultSpeaker) this.speaker = data.defaultSpeaker;
        return this.naturalVoiceAvailable;
      } catch (_) {
        this.naturalVoiceAvailable = false;
        this.sttAvailable = false;
        return false;
      } finally {
        this.probePromise = null;
      }
    })();

    return this.probePromise;
  }

  async getVoiceCatalogue() {
    await this.probeNaturalVoice();
    return this.voiceCatalogue;
  }

  /* -------------------------------- Speak -------------------------------- */

  speak(text, { onBoundary = null, onEnd = null, onStart = null } = {}) {
    this.stop();

    const clean = String(text || '')
      .replace(/[#*_`~>[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return Promise.resolve();

    const token = ++this.playToken;

    return this.probeNaturalVoice().then((natural) => {
      if (token !== this.playToken) return undefined;

      if (natural) {
        return this._speakNatural(clean, token, { onStart, onEnd, onBoundary }).catch(() => {
          if (token !== this.playToken) return undefined;
          return this._speakBrowser(clean, token, { onBoundary, onStart, onEnd });
        });
      }
      return this._speakBrowser(clean, token, { onBoundary, onStart, onEnd });
    });
  }

  async _fetchClip(chunk, signal) {
    const key = `${this.speaker || 'default'}|${this.language}|${this.rate}|${chunk}`;
    const cached = this.clipCache.get(key);
    if (cached) return cached;

    const response = await fetch(`${BASE}/api/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
      body: JSON.stringify({
        text: chunk,
        speaker: this.speaker,
        pace: this.rate,
        language: this.language
      }),
      signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.fallbackToBrowser) this.naturalVoiceAvailable = false;
      throw new Error(data.error || 'Speech synthesis failed.');
    }

    const blob = base64ToBlob(data.audio, data.mime || 'audio/mpeg');
    if (!blob) throw new Error('Invalid audio payload returned by speech engine.');

    const url = URL.createObjectURL(blob);

    if (this.clipCache.size >= MAX_CACHED_CLIPS) {
      const oldestKey = this.clipCache.keys().next().value;
      try {
        URL.revokeObjectURL(this.clipCache.get(oldestKey));
      } catch (_) {}
      this.clipCache.delete(oldestKey);
    }
    this.clipCache.set(key, url);
    return url;
  }

  _playClip(url, token) {
    return new Promise((resolve, reject) => {
      if (token !== this.playToken) return resolve();

      const audio = new Audio(url);
      audio.preload = 'auto';
      this.audio = audio;

      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio playback failed.'));

      audio.play().catch((error) => {
        if (token !== this.playToken) return resolve();
        return reject(error);
      });
    });
  }

  async _speakNatural(text, token, { onStart, onEnd, onBoundary }) {
    const chunks = chunkText(text);
    if (!chunks.length) return;

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    let pending = this._fetchClip(chunks[0], signal);

    for (let index = 0; index < chunks.length; index += 1) {
      let url = null;
      try {
        url = await pending;
      } catch (err) {
        if (token !== this.playToken) return;
        // If a subsequent chunk fails, finish the remaining chunks in browser voice
        const remainingText = chunks.slice(index).join(' ');
        if (remainingText) {
          return this._speakBrowser(remainingText, token, { onBoundary, onStart, onEnd });
        }
        break;
      }

      if (token !== this.playToken) return;
      if (!url) break;

      pending =
        index + 1 < chunks.length
          ? this._fetchClip(chunks[index + 1], signal)
          : Promise.resolve(null);

      if (index === 0) {
        this.isPlaying = true;
        this.isPaused = false;
        this._emitChange();
        onStart?.();
      }

      try {
        await this._playClip(url, token);
      } catch (playErr) {
        if (token !== this.playToken) return;
        // Fall back to browser voice for remainder
        const remainingText = chunks.slice(index).join(' ');
        if (remainingText) {
          return this._speakBrowser(remainingText, token, { onBoundary, onStart, onEnd });
        }
      }

      if (token !== this.playToken) return;
    }

    if (token !== this.playToken) return;
    this.isPlaying = false;
    this.isPaused = false;
    this.audio = null;
    this._emitChange();
    onEnd?.();
  }

  _speakBrowser(text, token, { onBoundary, onStart, onEnd }) {
    return new Promise((resolve) => {
      if (!this.synth) return resolve();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;
      utterance.lang = this.language;

      if (this.voice) {
        utterance.voice = this.voice;
      } else {
        const all = this.synth.getVoices();
        const short = this.language.split('-')[0];
        const sameLanguage = all.filter((v) => v.lang?.toLowerCase().startsWith(short));
        const pool = sameLanguage.length ? sameLanguage : this.getVoices();

        const preferred =
          pool.find((v) => /female|samantha|zira|aria|jenny|neural|swara|kalpana/i.test(v.name)) ||
          pool.find((v) => /Natural|Google/i.test(v.name)) ||
          pool[0];
        if (preferred) utterance.voice = preferred;
      }

      utterance.onstart = () => {
        if (token !== this.playToken) return;
        this.isPlaying = true;
        this.isPaused = false;
        this._emitChange();
        onStart?.();
      };

      utterance.onboundary = (event) => {
        this.currentCharIndex = event.charIndex;
        onBoundary?.(event);
        this._emitChange();
      };

      utterance.onend = () => {
        if (token === this.playToken) {
          this.isPlaying = false;
          this.isPaused = false;
          this._emitChange();
          onEnd?.();
        }
        resolve();
      };

      utterance.onerror = (event) => {
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          console.warn('[SETU TTS] Speech synthesis error:', event.error);
        }
        if (token === this.playToken) {
          this.isPlaying = false;
          this.isPaused = false;
          this._emitChange();
        }
        resolve();
      };

      this.synth.speak(utterance);
    });
  }

  /* ----------------------------- Transport ----------------------------- */

  pause() {
    if (!this.isPlaying || this.isPaused) return;
    if (this.audio) this.audio.pause();
    else this.synth?.pause();
    this.isPaused = true;
    this._emitChange();
  }

  resume() {
    if (!this.isPlaying || !this.isPaused) return;
    if (this.audio) this.audio.play().catch(() => {});
    else this.synth?.resume();
    this.isPaused = false;
    this._emitChange();
  }

  stop() {
    this.playToken += 1;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio = null;
    }

    this.synth?.cancel();

    this.isPlaying = false;
    this.isPaused = false;
    this._emitChange();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emitChange() {
    for (const listener of this.listeners) {
      try {
        listener({
          isPlaying: this.isPlaying,
          isPaused: this.isPaused,
          currentCharIndex: this.currentCharIndex,
          engine: this.naturalVoiceAvailable ? 'sarvam' : 'browser'
        });
      } catch (_) {}
    }
  }

  playCelebrationChime() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.5];

      freqs.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + index * 0.08);

        gain.gain.setValueAtTime(0, now + index * 0.08);
        gain.gain.linearRampToValueAtTime(0.15, now + index * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + index * 0.08);
        osc.stop(now + index * 0.08 + 0.65);
      });

      setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch (_) {}
  }
}

export const tts = new TTSEngine();
