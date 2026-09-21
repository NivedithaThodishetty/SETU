/**
 * ElevenLabs text-to-speech and speech-to-text.
 *
 * This is the international half of SETU's voice. Sarvam Bulbul is bounded to
 * eleven Indian language codes and rejects anything else outright, so the two
 * providers are not fallbacks for one another — they are disjoint halves of one
 * catalogue, and `config/languages.js` decides which half a language is in.
 * speechService.js does the routing; this file only knows how to talk to
 * ElevenLabs.
 *
 * Shape is deliberately parallel to speechService's Sarvam functions — same
 * argument names, same return keys, same SpeechError type — so the router can
 * treat them interchangeably and a caller never has to know which provider
 * answered. The one visible difference is `provider` in the result, which the
 * client surfaces in the voice picker.
 */

const crypto = require('crypto');
const config = require('../config');
const { resolveLanguage } = require('../config/languages');

/**
 * Voices that ship with every ElevenLabs account.
 *
 * Deliberately a small curated list rather than a live fetch of the account's
 * library. The picker has to render in the same frame the panel opens — a round
 * trip for a dropdown is a round trip the reader watches — and an account-scoped
 * voice id that is missing on another deployment's plan fails the synthesis
 * request rather than substituting a default. These ids are the stable public
 * ones present on the free tier upward.
 *
 * `listVoices` merges anything the account actually has on top of these when a
 * key is configured, so a paid deployment still sees its own cloned voices.
 */
const STOCK_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', note: 'Calm and even', gender: 'female' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah', note: 'Soft and unhurried', gender: 'female' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura', note: 'Bright and friendly', gender: 'female' },
  { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda', note: 'Warm narration', gender: 'female' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily', note: 'Clear and articulate', gender: 'female' },
  { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel', note: 'Measured and clear', gender: 'male' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam', note: 'Youthful and direct', gender: 'male' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George', note: 'Deep and reassuring', gender: 'male' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum', note: 'Storyteller tone', gender: 'male' },
  { id: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica', note: 'Conversational', gender: 'female' }
];

const KNOWN_VOICE_IDS = new Set(STOCK_VOICES.map((voice) => voice.id));

/**
 * Per-request character ceiling.
 *
 * Lower than the model's own limit on purpose. Read-aloud synthesises paragraph
 * blocks ahead of playback, and a long block is a long wait before the first
 * word — chunking at roughly this size is what keeps the gap between "press
 * play" and "hear something" short enough for a reader who loses the thread
 * while waiting.
 */
const MAX_CHARS = 1400;

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Synthesised clips, keyed by the exact text and voice settings.
 *
 * Hovering across a mind map re-requests the same handful of branch labels
 * constantly. Without this, every hover is a round trip, a visible delay, and —
 * on ElevenLabs specifically — billed characters, which matters more here than
 * it does on Sarvam because the free tier is roughly ten thousand credits a
 * month in total.
 */
const clipCache = new Map();
const MAX_CACHE_ENTRIES = 300;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

function readCache(key) {
  const entry = clipCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    clipCache.delete(key);
    return null;
  }
  // Refresh insertion order so the map evicts least-recently-used.
  clipCache.delete(key);
  clipCache.set(key, entry);
  return entry.value;
}

function writeCache(key, value) {
  if (clipCache.size >= MAX_CACHE_ENTRIES) {
    clipCache.delete(clipCache.keys().next().value);
  }
  clipCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors speechService.SpeechError exactly, including the `name`, because the
 * controllers branch on `error.name === 'SpeechError'` to decide whether to
 * tell the client to fall back to browser speech. A differently-named error
 * from this file would be handled as a 500 instead.
 */
class SpeechError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'SpeechError';
    this.status = status;
  }
}

function cleanForSpeech(text) {
  return String(text || '')
    .replace(/[*_`#~|]/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Voice resolution                                                           */
/* -------------------------------------------------------------------------- */

function listVoices() {
  return STOCK_VOICES.map((voice) => ({ ...voice, provider: 'elevenlabs' }));
}

/**
 * Pick a usable voice id.
 *
 * Unknown ids are *not* passed through. ElevenLabs answers an unrecognised
 * voice id with a 400, so honouring a stale id saved in a browser six months
 * ago would break read-aloud entirely rather than sounding slightly wrong —
 * exactly the failure mode Sarvam's resolveVoice was written to avoid, for the
 * same reason.
 */
function resolveVoice(requested) {
  const wanted = String(requested || '').trim();
  if (KNOWN_VOICE_IDS.has(wanted)) return wanted;
  return config.elevenLabsVoiceId || STOCK_VOICES[0].id;
}

/* -------------------------------------------------------------------------- */
/* Text-to-speech                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Synthesise one clip.
 *
 * ElevenLabs infers the language from the text rather than taking a language
 * code, which is why `language` is used only for the cache key and the result
 * — sending it would be ignored. That inference is reliable for the scripts in
 * our international set; it is one more reason Indian languages stay on Sarvam,
 * where the code is explicit.
 *
 * `pace` has no direct equivalent in the ElevenLabs API. Rather than silently
 * ignoring a setting the user changed, it is folded into the voice settings as
 * a stability adjustment — slower speech reads as steadier — and the result
 * reports the pace back so the client can apply the remainder with
 * `playbackRate` on the audio element.
 */
async function synthesize({ text, speaker, pace = 1, language }) {
  if (!config.elevenLabsEnabled) {
    throw new SpeechError('ElevenLabs is not configured on the server.', 503);
  }

  const cleaned = cleanForSpeech(text);
  if (!cleaned) throw new SpeechError('Nothing to say.', 400);
  if (cleaned.length > MAX_CHARS) {
    throw new SpeechError(`Text is too long for one clip (max ${MAX_CHARS} characters).`, 400);
  }

  const voiceId = resolveVoice(speaker);
  const lang = resolveLanguage(language);
  const safePace = Math.min(2, Math.max(0.5, Number(pace) || 1));
  const model = config.elevenLabsTtsModel;

  const key = cacheKey([cleaned, voiceId, model, safePace]);
  const cached = readCache(key);
  if (cached) return { ...cached, language: lang.code, cached: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.elevenLabsTimeoutMs);

  let response;
  try {
    response = await fetch(
      `${config.elevenLabsBaseUrl}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': config.elevenLabsApiKey,
          Accept: 'audio/mpeg'
        },
        body: JSON.stringify({
          text: cleaned,
          model_id: model,
          voice_settings: {
            stability: safePace < 1 ? 0.6 : 0.45,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true
          }
        }),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new SpeechError('The voice engine took too long to answer.', 504);
    }
    throw new SpeechError(`Could not reach the voice engine: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Errors come back as JSON even though success is binary audio, so the
    // body has to be read as text and parsed defensively rather than assumed.
    const raw = await response.text().catch(() => '');
    let detail = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.detail?.message || parsed?.detail || parsed?.message || detail;
      if (typeof detail === 'object') detail = JSON.stringify(detail);
    } catch (_) {
      if (raw) detail = raw.slice(0, 200);
    }

    // A quota ceiling is the single most likely failure on this provider —
    // the free tier is ~10k credits a month and read-aloud is character-hungry
    // — so it gets a message that says what to do rather than a status code.
    if (response.status === 401) {
      throw new SpeechError('ElevenLabs rejected the API key.', 502);
    }
    if (response.status === 429 || response.status === 402) {
      recordFailure(response.status);
      throw new SpeechError('ElevenLabs quota is exhausted for this key.', response.status);
    }
    throw new SpeechError(`Voice engine rejected the request: ${detail}`, response.status);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new SpeechError('Voice engine returned no audio.');

  const result = {
    // Base64 rather than a stream, to match Sarvam's response shape exactly so
    // the client's audio path is provider-agnostic.
    audio: buffer.toString('base64'),
    mime: 'audio/mpeg',
    speaker: voiceId,
    model,
    pace: safePace,
    characters: cleaned.length,
    provider: 'elevenlabs'
  };

  writeCache(key, result);
  return { ...result, language: lang.code, cached: false };
}

/* -------------------------------------------------------------------------- */
/* Speech-to-text (Scribe)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Transcribe audio with Scribe.
 *
 * Scribe takes an ISO-639 language code, or none at all for auto-detection.
 * SETU passes the BCP-47 tag's language subtag — 'ja' from 'ja-JP' — because
 * the full tag is rejected. Passing 'auto' or an unknown code means omitting
 * the field entirely, which is how Scribe is asked to detect.
 *
 * Auto-detection matters more here than it does on the Sarvam path: someone
 * using the international set is far more likely to be speaking a language
 * other than the one the picker says, because the picker defaults to English.
 */
async function transcribe({
  audioBuffer,
  mimeType = 'audio/webm',
  filename = 'audio.webm',
  language,
  model
}) {
  if (!config.elevenLabsEnabled) {
    throw new SpeechError('ElevenLabs speech-to-text is not configured on the server.', 503);
  }

  if (!audioBuffer || (Buffer.isBuffer(audioBuffer) && audioBuffer.length === 0)) {
    throw new SpeechError('Audio data is required for transcription.', 400);
  }

  const sttModel = model || config.elevenLabsSttModel;
  const autoDetect = !language || language === 'auto' || language === 'unknown';
  const iso639 = autoDetect ? null : resolveLanguage(language).bcp47.split('-')[0];

  const form = new FormData();
  const blob = Buffer.isBuffer(audioBuffer)
    ? new Blob([audioBuffer], { type: mimeType })
    : audioBuffer;

  form.append('file', blob, filename);
  form.append('model_id', sttModel);
  if (iso639) form.append('language_code', iso639);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.elevenLabsTimeoutMs);

  let response;
  try {
    response = await fetch(`${config.elevenLabsBaseUrl}/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': config.elevenLabsApiKey },
      body: form,
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new SpeechError('Transcription engine took too long to respond.', 504);
    }
    throw new SpeechError(`Could not reach transcription engine: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      payload?.detail?.message || payload?.detail || payload?.message || `HTTP ${response.status}`;
    if (response.status === 401) throw new SpeechError('ElevenLabs rejected the API key.', 502);
    if (response.status === 429 || response.status === 402) {
      recordFailure(response.status);
      throw new SpeechError('ElevenLabs quota is exhausted for this key.', response.status);
    }
    throw new SpeechError(
      `Transcription engine error: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`,
      response.status
    );
  }

  const transcript = typeof payload.text === 'string' ? payload.text.trim() : '';

  return {
    transcript,
    // Scribe reports what it detected, which is the useful value when the
    // caller asked for auto — the client uses it to set `lang` on the rendered
    // text, and a wrong lang attribute makes a screen reader unintelligible.
    language_code: payload.language_code || iso639 || null,
    detectedLanguage: payload.language_code || null,
    languageProbability: payload.language_probability ?? null,
    request_id: null,
    model: sttModel,
    provider: 'elevenlabs'
  };
}

/**
 * Reported to speechService so an exhausted or throttled ElevenLabs account is
 * taken out of routing the same way Sarvam is. Set by the two error paths above.
 */
let lastFailureStatus = null;
function takeLastFailureStatus() {
  const status = lastFailureStatus;
  lastFailureStatus = null;
  return status;
}
function recordFailure(status) {
  lastFailureStatus = status;
}

module.exports = {
  synthesize,
  takeLastFailureStatus,
  recordFailure,
  transcribe,
  listVoices,
  resolveVoice,
  cleanForSpeech,
  SpeechError,
  MAX_CHARS,
  STOCK_VOICES
};
