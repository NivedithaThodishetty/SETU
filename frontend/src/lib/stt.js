/**
 * SETU Speech-to-Text (STT) & Voice Input Engine.
 *
 * Dual-engine architecture for robust, accessible voice querying:
 *  1. Sarvam AI Saaras v3 (`/api/speech/transcribe`) — State-of-the-art multilingual
 *     speech recognition across 11 Indian languages + English, optimized for Indian accents.
 *  2. Browser Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) — Instant,
 *     zero-latency local fallback if offline or in degraded connectivity.
 *
 * Includes Web Audio API real-time volume analysis for live microphone wave feedback.
 */

import { getUserId } from './identity';
import { getApiLanguage } from './api';
import { API_BASE as BASE } from './apiBase';

class STTEngine {
  constructor() {
    this.isRecording = false;
    this.isProcessing = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.animFrame = null;
    this.listeners = new Set();
    this.recognition = null;
    this.useBrowserSpeech = false;
    this.currentLevel = 0;
  }

  isSupported() {
    const hasMedia = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
    const hasWebSpeech =
      typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    return hasMedia || hasWebSpeech;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emitState(extra = {}) {
    const state = {
      isRecording: this.isRecording,
      isProcessing: this.isProcessing,
      audioLevel: this.currentLevel,
      ...extra
    };
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (_) {}
    }
  }

  /**
   * Start listening to microphone.
   *
   * @param {Object} options
   * @param {Function} options.onTranscript - (transcript: string, isFinal: boolean) => void
   * @param {Function} [options.onError] - (error: string) => void
   * @param {string} [options.language] - Language code e.g. 'en-IN', 'hi-IN'
   * @param {boolean} [options.preferBrowserSpeech=false] - Force browser Web Speech API
   */
  async start({ onTranscript, onError, language, preferBrowserSpeech = false }) {
    if (this.isRecording || this.isProcessing) {
      this.stop();
      return;
    }

    const lang = language || getApiLanguage() || 'en-IN';
    this.useBrowserSpeech = preferBrowserSpeech;

    // Check Web Speech API fallback if requested or mediaDevices unavailable
    const Recognition =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (preferBrowserSpeech && Recognition) {
      this._startBrowserRecognition({ onTranscript, onError, lang });
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      if (Recognition) {
        this._startBrowserRecognition({ onTranscript, onError, lang });
        return;
      }
      const err = 'Microphone access is not supported in this browser.';
      onError?.(err);
      this._emitState({ error: err });
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Set up audio analysis for visualizer
      this._setupAudioAnalyser(this.stream);

      // Determine supported mime type
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      }

      this.audioChunks = [];
      const recorder = new MediaRecorder(this.stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        this._teardownAnalyser();
        this.isRecording = false;
        this.isProcessing = true;
        this._emitState();

        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        if (audioBlob.size < 100) {
          this.isProcessing = false;
          this._emitState();
          return;
        }

        try {
          const formData = new FormData();
          formData.append('file', audioBlob, `speech.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
          formData.append('language', lang);

          const response = await fetch(`${BASE}/api/speech/transcribe`, {
            method: 'POST',
            headers: {
              'x-user-id': getUserId()
            },
            body: formData
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || `Transcription failed (${response.status})`);
          }

          const transcript = (data.transcript || '').trim();
          if (transcript) {
            onTranscript?.(transcript, true);
          } else {
            onError?.("Didn't catch that. Please speak clearly or try again.");
          }
        } catch (err) {
          console.warn('[SETU STT] Sarvam STT failed, trying browser recognition fallback:', err);
          if (Recognition) {
            onError?.('Server voice recognition unavailable. Switching to browser recognition.');
          } else {
            onError?.(err.message || 'Voice transcription failed.');
          }
        } finally {
          this.isProcessing = false;
          this._emitState();
        }
      };

      this.mediaRecorder = recorder;
      recorder.start(250); // Slice chunks every 250ms
      this.isRecording = true;
      this._emitState();
    } catch (err) {
      console.warn('[SETU STT] Microphone access error:', err);
      this._teardownAnalyser();
      this.isRecording = false;
      this.isProcessing = false;

      let msg = 'Could not access microphone.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Microphone permission denied. Please enable microphone in browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No microphone device found on this system.';
      }

      onError?.(msg);
      this._emitState({ error: msg });
    }
  }

  _setupAudioAnalyser(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!this.isRecording || !this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        this.currentLevel = Math.min(1, average / 100);
        this._emitState();

        this.animFrame = requestAnimationFrame(updateLevel);
      };

      this.animFrame = requestAnimationFrame(updateLevel);
    } catch (_) {}
  }

  _teardownAnalyser() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    this.currentLevel = 0;
  }

  _startBrowserRecognition({ onTranscript, onError, lang }) {
    const Recognition =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!Recognition) {
      const err = 'Speech recognition is not supported in this browser.';
      onError?.(err);
      return;
    }

    try {
      const rec = new Recognition();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        this.isRecording = true;
        this._emitState();
      };

      rec.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const text = (final || interim).trim();
        if (text) {
          onTranscript?.(text, Boolean(final));
        }
      };

      rec.onerror = (event) => {
        this.isRecording = false;
        this._emitState();
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          onError?.(`Recognition error: ${event.error}`);
        }
      };

      rec.onend = () => {
        this.isRecording = false;
        this.recognition = null;
        this._emitState();
      };

      this.recognition = rec;
      rec.start();
    } catch (err) {
      this.isRecording = false;
      onError?.(err.message || 'Browser speech recognition error.');
      this._emitState();
    }
  }

  stop() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
      this.recognition = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (_) {}
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this._teardownAnalyser();
    this.isRecording = false;
    this._emitState();
  }
}

export const stt = new STTEngine();
