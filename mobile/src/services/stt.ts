/**
 * SETU Mobile — speech-to-text.
 *
 * Records a short utterance and sends it to `/api/speech/transcribe`, which
 * fronts Sarvam Saaras. Dictation matters here for the same reason read-aloud
 * does: for a dyslexic adult, saying a sentence and getting text is often the
 * difference between asking the question and abandoning it. It is also the only
 * comfortable way to enter Devanagari or Tamil on a phone keyboard.
 *
 * There is no on-device recogniser in this build, so when the server has no
 * Sarvam key the button says so plainly rather than pretending. An honest
 * "dictation is unavailable" is recoverable; a silently fabricated transcript
 * is not.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  type RecordingOptions,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { getApiBaseUrl, getApiLanguage } from './api';
import { peekUserId } from './identity';
import { tts } from './tts';

/**
 * Mono, 16 kHz, AAC.
 *
 * Speech recognisers downsample to roughly this anyway, and a short mono clip
 * uploads several times faster than the stereo 44.1 kHz preset — which is the
 * whole latency budget on a phone with two bars of signal.
 */
const SPEECH_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
};

/** Hard stop, so a forgotten open mic cannot record until the battery dies. */
const MAX_RECORDING_MS = 60_000;

export interface TranscriptionResult {
  transcript: string;
  language_code?: string;
}

/** Upload one recorded clip and get text back. */
export async function transcribeAudioFile(
  uri: string,
  language: string = getApiLanguage()
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append('file', {
    uri,
    type: 'audio/m4a',
    name: 'utterance.m4a',
  } as any);
  formData.append('language', language);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/speech/transcribe`, {
      method: 'POST',
      headers: { 'x-user-id': peekUserId() },
      body: formData,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        data.fallbackToBrowser
          ? 'Dictation is not switched on for this engine.'
          : data.error || 'Could not transcribe that recording.'
      );
    }
    return data as TranscriptionResult;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('The transcription took too long. Try a shorter recording.');
    }
    throw error instanceof Error ? error : new Error('Could not reach the transcription engine.');
  } finally {
    clearTimeout(timer);
  }
}

export type VoiceInputStatus = 'idle' | 'recording' | 'transcribing';

export interface UseVoiceInputResult {
  status: VoiceInputStatus;
  /** Null until the availability probe answers, so the UI can stay neutral. */
  available: boolean | null;
  error: string | null;
  toggle: () => Promise<void>;
  cancel: () => Promise<void>;
}

/**
 * Push-to-talk dictation.
 *
 * Returns a `toggle` because a hold-to-talk gesture is a poor fit for users with
 * motor differences or tremor — one tap to start, one to stop, with a visible
 * state in between and a hard timeout behind it.
 */
export function useVoiceInput(onTranscript: (text: string) => void): UseVoiceInputResult {
  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    tts.isTranscriptionAvailable().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      await recorder.stop();
    } catch (_) {
      /* nothing was recording; fall through to the uri check */
    }

    const uri = recorder.uri;
    if (cancelledRef.current || !uri) {
      if (mountedRef.current) setStatus('idle');
      return;
    }

    if (mountedRef.current) setStatus('transcribing');

    try {
      const result = await transcribeAudioFile(uri);
      const transcript = String(result?.transcript || '').trim();

      if (!transcript) {
        if (mountedRef.current) setError('Nothing was picked up. Try again a little closer.');
      } else {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (_) {}
        onTranscript(transcript);
      }
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message || 'Could not transcribe that recording.');
    } finally {
      if (mountedRef.current) setStatus('idle');
    }
  }, [onTranscript, recorder]);

  const start = useCallback(async () => {
    setError(null);
    cancelledRef.current = false;

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone access is off. Turn it on in your phone settings to dictate.');
      return;
    }

    // Read-aloud and the microphone cannot share the moment — the mic would
    // otherwise record the app talking to itself.
    await tts.stop();

    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (_) {
      setError('Could not start recording on this device.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}

    setStatus('recording');
    timeoutRef.current = setTimeout(() => {
      stopAndTranscribe();
    }, MAX_RECORDING_MS);
  }, [recorder, stopAndTranscribe]);

  const toggle = useCallback(async () => {
    if (status === 'transcribing') return;
    if (status === 'recording') {
      await stopAndTranscribe();
      return;
    }
    if (available === false) {
      setError('Dictation needs the speech engine, which is not switched on right now.');
      return;
    }
    await start();
  }, [available, start, status, stopAndTranscribe]);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      await recorder.stop();
    } catch (_) {}
    setStatus('idle');
  }, [recorder]);

  return { status, available, error, toggle, cancel };
}

/* -------------------------------------------------------------------------- */
/* Timed reading probe                                                        */
/* -------------------------------------------------------------------------- */

export type ReadingRecorderStatus = 'idle' | 'recording' | 'transcribing';

export interface ReadingTake {
  transcript: string;
  durationMs: number;
}

export interface UseReadingRecorderResult {
  status: ReadingRecorderStatus;
  available: boolean | null;
  error: string | null;
  /** Wall-clock seconds elapsed in the current take, for the on-screen timer. */
  elapsedMs: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
}

/**
 * Recording for the reading check, which needs two things `useVoiceInput` does
 * not provide.
 *
 * FIRST, THE DURATION IS THE MEASUREMENT.
 * Words-correct-per-minute is a rate, so the elapsed time is not incidental
 * telemetry — it is half the score. `useVoiceInput` throws it away because
 * dictation has no use for it. The clock here starts when the recorder actually
 * begins and stops when it actually stops, rather than when the button was
 * pressed, so permission prompts and hardware setup do not land in a child's
 * reading speed.
 *
 * SECOND, THE TRANSCRIPT IS THE DATA, NOT A SIDE EFFECT.
 * Dictation appends into whatever field has focus. A probe needs the text
 * returned to the caller so it can be scored, kept out of the UI, and — unless
 * the user explicitly asks otherwise — never stored.
 *
 * The 60-second cap is inherited deliberately rather than raised: a one-minute
 * oral reading probe is the standard administration, and letting it run longer
 * would produce a number that is not comparable to the norms it is banded
 * against.
 */
export function useReadingRecorder(
  onTake: (take: ReadingTake) => void
): UseReadingRecorderResult {
  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const [status, setStatus] = useState<ReadingRecorderStatus>('idle');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startedAtRef = useRef(0);
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (capRef.current) {
      clearTimeout(capRef.current);
      capRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    tts.isTranscriptionAvailable().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  const stop = useCallback(async () => {
    /*
     * Read the clock before anything awaits.
     *
     * `recorder.stop()` can take a couple of hundred milliseconds to flush the
     * file, and on a 60-second probe that is a measurable fraction of the rate.
     * Sampling first keeps the duration the reader's, not the filesystem's.
     */
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    clearTimers();

    try {
      await recorder.stop();
    } catch (_) {
      /* nothing was recording; the uri check below settles it */
    }

    const uri = recorder.uri;
    if (cancelledRef.current || !uri || durationMs < 1000) {
      if (mountedRef.current) {
        setStatus('idle');
        if (!cancelledRef.current && durationMs > 0 && durationMs < 1000) {
          setError('That was too short to score. Read for at least a few seconds.');
        }
      }
      return;
    }

    if (mountedRef.current) setStatus('transcribing');

    try {
      const result = await transcribeAudioFile(uri);
      const transcript = String(result?.transcript || '').trim();

      if (!transcript) {
        if (mountedRef.current) {
          setError('No speech was picked up. Check the microphone and try again.');
        }
      } else {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (_) {}
        onTake({ transcript, durationMs });
      }
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message || 'Could not transcribe that reading.');
    } finally {
      if (mountedRef.current) setStatus('idle');
    }
  }, [clearTimers, onTake, recorder]);

  const start = useCallback(async () => {
    setError(null);
    setElapsedMs(0);
    cancelledRef.current = false;

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone access is off. Turn it on in your phone settings to do a reading check.');
      return;
    }

    await tts.stop();

    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (_) {
      setError('Could not start recording on this device.');
      return;
    }

    startedAtRef.current = Date.now();
    setStatus('recording');

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}

    tickRef.current = setInterval(() => {
      if (mountedRef.current) setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);

    capRef.current = setTimeout(() => {
      stop();
    }, MAX_RECORDING_MS);
  }, [recorder, stop]);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    clearTimers();
    try {
      await recorder.stop();
    } catch (_) {}
    if (mountedRef.current) {
      setStatus('idle');
      setElapsedMs(0);
    }
  }, [clearTimers, recorder]);

  return { status, available, error, elapsedMs, start, stop, cancel };
}

/** The cap, exported so the UI can show how much of the minute is left. */
export const READING_PROBE_MAX_MS = MAX_RECORDING_MS;
