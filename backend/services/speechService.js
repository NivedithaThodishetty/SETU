/**
 * Sarvam AI text-to-speech & speech-to-text service.
 *
 * Read-aloud & voice querying are primary comprehension accommodations in SETU:
 * - Dyslexic & ADHD learners decode spoken information with far lower cognitive friction.
 * - High quality natural Indian voices (Bulbul v3) significantly improve retention.
 * - Multilingual Speech-to-Text (Saaras v3) enables direct voice interaction across 11 Indian languages + English.
 *
 * The API key never reaches the browser — clients call /api/speech endpoints.
 * Everything degrades to the browser's built-in speech synthesis / recognition when no key is configured.
 */

const crypto = require('crypto');
const config = require('../config');
const { resolveLanguage, LANGUAGES, ttsProviderFor, sttProviderFor } = require('../config/languages');
const elevenLabs = require('./elevenLabsService');

/**
 * Speaker catalogues, per model version.
 *
 * These are NOT interchangeable: `anushka` exists only on bulbul:v2 and `priya`
 * only on bulbul:v3, and sending the wrong pair is a hard 400 on every request.
 * Keeping both lists here lets `resolveVoice` repair a mismatch instead of
 * silently killing read-aloud.
 */
const VOICES = {
  'bulbul:v3': {
    female: [
      { id: 'priya', label: 'Priya', note: 'Warm and conversational' },
      { id: 'ritu', label: 'Ritu', note: 'Bright and clear' },
      { id: 'neha', label: 'Neha', note: 'Soft and unhurried' },
      { id: 'kavya', label: 'Kavya', note: 'Friendly, everyday' },
      { id: 'shreya', label: 'Shreya', note: 'Calm and even' },
      { id: 'ishita', label: 'Ishita', note: 'Gentle and low' },
      { id: 'tanya', label: 'Tanya', note: 'Lively and warm' },
      { id: 'simran', label: 'Simran', note: 'Steady narration' },
      { id: 'pooja', label: 'Pooja', note: 'Measured and clear' },
      { id: 'shruti', label: 'Shruti', note: 'Soft-spoken' },
      { id: 'suhani', label: 'Suhani', note: 'Light and easy' },
      { id: 'roopa', label: 'Roopa', note: 'Mature and reassuring' },
      { id: 'kavitha', label: 'Kavitha', note: 'Even and neutral' },
      { id: 'rupali', label: 'Rupali', note: 'Crisp and articulate' }
    ],
    male: [
      { id: 'shubh', label: 'Shubh', note: 'Clear and natural' },
      { id: 'aditya', label: 'Aditya', note: 'Warm and authoritative' },
      { id: 'rahul', label: 'Rahul', note: 'Youthful and energetic' },
      { id: 'rohan', label: 'Rohan', note: 'Calm and measured' },
      { id: 'amit', label: 'Amit', note: 'Professional and crisp' },
      { id: 'dev', label: 'Dev', note: 'Deep and resonant' },
      { id: 'varun', label: 'Varun', note: 'Conversational' },
      { id: 'kabir', label: 'Kabir', note: 'Storyteller tone' },
      { id: 'tarun', label: 'Tarun', note: 'Even and neutral' }
    ]
  },
  'bulbul:v2': {
    female: [
      { id: 'anushka', label: 'Anushka', note: 'Warm, the classic default' },
      { id: 'manisha', label: 'Manisha', note: 'Bright and friendly' },
      { id: 'vidya', label: 'Vidya', note: 'Calm and measured' },
      { id: 'arya', label: 'Arya', note: 'Soft and gentle' }
    ],
    male: [
      { id: 'abhilash', label: 'Abhilash', note: 'Deep' },
      { id: 'karun', label: 'Karun', note: 'Clear' },
      { id: 'hitesh', label: 'Hitesh', note: 'Even' }
    ]
  }
};

const DEFAULT_FEMALE = { 'bulbul:v3': 'priya', 'bulbul:v2': 'anushka' };

/** Sarvam's documented ceiling is 2500 (v3) / 1500 (v2); stay under the lower one. */
const MAX_CHARS = 1400;

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Synthesised clips, keyed by the exact text and voice settings.
 *
 * Hovering across a mind map re-requests the same handful of branch labels constantly.
 * Without this cache, every hover is an unnecessary round trip and visible delay.
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
  // Refresh insertion order
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
/* Voice resolution                                                           */
/* -------------------------------------------------------------------------- */

function listVoices(model = config.sarvamTtsModel) {
  const catalogue = VOICES[model] || VOICES['bulbul:v3'];
  return [...catalogue.female, ...catalogue.male];
}

/**
 * Pick a valid (model, speaker) pair.
 */
function resolveVoice(requestedSpeaker, requestedModel) {
  const model = VOICES[requestedModel] ? requestedModel : config.sarvamTtsModel;
  const catalogue = VOICES[model] || VOICES['bulbul:v3'];

  const known = new Set([
    ...catalogue.female.map((v) => v.id),
    ...catalogue.male.map((v) => (typeof v === 'string' ? v : v.id))
  ]);
  const wanted = String(requestedSpeaker || config.sarvamTtsSpeaker || '').toLowerCase();

  if (known.has(wanted)) return { model, speaker: wanted };
  return { model, speaker: DEFAULT_FEMALE[model] || catalogue.female[0].id };
}

/* -------------------------------------------------------------------------- */
/* Text-to-Speech Synthesis                                                   */
/* -------------------------------------------------------------------------- */

function cleanForSpeech(text) {
  return String(text || '')
    .replace(/[*_`#~|]/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

class SpeechError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'SpeechError';
    this.status = status;
  }
}

/**
 * Synthesise one clip with Sarvam Bulbul TTS.
 *
 * Called through `synthesize` below rather than directly: this function assumes
 * the language is one of the eleven Bulbul can actually speak, and sending it
 * anything else is a hard 400.
 */
async function synthesizeWithSarvam({ text, speaker, model, pace = 1, language }) {
  if (!config.sarvamEnabled) {
    throw new SpeechError('Sarvam is not configured on the server.', 503);
  }

  const cleaned = cleanForSpeech(text);
  if (!cleaned) throw new SpeechError('Nothing to say.', 400);
  if (cleaned.length > MAX_CHARS) {
    throw new SpeechError(`Text is too long for one clip (max ${MAX_CHARS} characters).`, 400);
  }

  const voice = resolveVoice(speaker, model);
  const lang = resolveLanguage(language, config.sarvamTtsLanguage);
  const safePace = Math.min(2, Math.max(0.5, Number(pace) || 1));

  const key = cacheKey([cleaned, voice.model, voice.speaker, safePace, lang.code]);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const body = {
    text: cleaned,
    language_code: lang.code,
    speaker: voice.speaker,
    model: voice.model,
    pace: safePace,
    output_audio_codec: 'mp3'
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.sarvamTimeoutMs);

  let response;
  try {
    response = await fetch(`${config.sarvamBaseUrl}/text-to-speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': config.sarvamApiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new SpeechError('The voice engine took too long to answer.', 504);
    }
    throw new SpeechError(`Could not reach the voice engine: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      payload?.error?.message || payload?.message || payload?.detail || `HTTP ${response.status}`;
    const status = response.status === 401 || response.status === 403 ? 502 : response.status;
    // 402 (out of credits) and 429 (rate limited) take Sarvam out of routing
    // for a cooldown, so the next request fails over instead of repeating a
    // call we already know will be refused.
    markProviderDown('sarvam', response.status, detail);
    throw new SpeechError(`Voice engine rejected the request: ${detail}`, status);
  }

  const audio = Array.isArray(payload.audios) ? payload.audios[0] : null;
  if (!audio) throw new SpeechError('Voice engine returned no audio.');

  const result = {
    audio,
    mime: 'audio/mpeg',
    speaker: voice.speaker,
    model: voice.model,
    language: lang.code,
    characters: cleaned.length,
    provider: 'sarvam'
  };

  writeCache(key, result);
  return { ...result, cached: false };
}

/* -------------------------------------------------------------------------- */
/* Speech-to-Text (STT) Transcription with Sarvam Saaras                       */
/* -------------------------------------------------------------------------- */

/**
 * Transcribe speech audio using Sarvam Saaras AI.
 *
 * @param {Object} options
 * @param {Buffer|Blob} options.audioBuffer - Audio binary buffer
 * @param {string} [options.mimeType='audio/webm'] - Mime type of input audio
 * @param {string} [options.filename='audio.webm'] - Virtual filename
 * @param {string} [options.language='en-IN'] - Language code (or 'auto')
 * @param {string} [options.model='saaras:v3'] - STT model
 * @param {string} [options.mode='transcribe'] - 'transcribe' | 'translate' | 'verbatim' | 'codemix'
 * @param {string} [options.prompt=''] - Optional context prompt
 */
async function transcribeWithSarvam({
  audioBuffer,
  mimeType = 'audio/webm',
  filename = 'audio.webm',
  language,
  model,
  mode = 'transcribe',
  prompt = ''
}) {
  if (!config.sarvamEnabled) {
    throw new SpeechError('Sarvam speech-to-text is not configured on the server.', 503);
  }

  if (!audioBuffer || (Buffer.isBuffer(audioBuffer) && audioBuffer.length === 0)) {
    throw new SpeechError('Audio data is required for transcription.', 400);
  }

  const sttModel = model || config.sarvamSttModel || 'saaras:v3';
  const lang = resolveLanguage(language, config.sarvamTtsLanguage);
  const languageCode = language === 'auto' || language === 'unknown' ? 'unknown' : lang.code;

  const form = new FormData();
  const blob = Buffer.isBuffer(audioBuffer)
    ? new Blob([audioBuffer], { type: mimeType })
    : audioBuffer;

  form.append('file', blob, filename);
  form.append('model', sttModel);
  if (languageCode && languageCode !== 'unknown') {
    form.append('language_code', languageCode);
  }
  if (mode) {
    form.append('mode', mode);
  }
  if (prompt) {
    form.append('prompt', String(prompt).slice(0, 500));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.sarvamTimeoutMs);

  let response;
  try {
    response = await fetch(`${config.sarvamBaseUrl}/speech-to-text`, {
      method: 'POST',
      headers: {
        'api-subscription-key': config.sarvamApiKey
      },
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
      payload?.error?.message || payload?.message || payload?.detail || `HTTP ${response.status}`;
    const status = response.status === 401 || response.status === 403 ? 502 : response.status;
    // 402 (out of credits) and 429 (rate limited) take Sarvam out of routing
    // for a cooldown, so the next request fails over instead of repeating a
    // call we already know will be refused.
    markProviderDown('sarvam', response.status, detail);
    throw new SpeechError(`Transcription engine error: ${detail}`, status);
  }

  const transcript = typeof payload.transcript === 'string' ? payload.transcript.trim() : '';

  return {
    transcript,
    language_code: payload.language_code || lang.code,
    request_id: payload.request_id || null,
    model: sttModel,
    provider: 'sarvam'
  };
}

/* -------------------------------------------------------------------------- */
/* Provider routing                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The asymmetry that shapes every function below.
 *
 * Sarvam Bulbul speaks eleven Indian languages and nothing else — it does not
 * degrade on a Japanese request, it rejects it. ElevenLabs Multilingual v2
 * speaks the international set *and* most of the Indian ones, at lower quality
 * on Indic prosody and noticeably worse on Hinglish code-mixing.
 *
 * So substitution is one-directional:
 *
 *   Indian language, no Sarvam key        -> ElevenLabs is an acceptable stand-in
 *   International language, no EL key     -> nothing on the server can speak it
 *
 * The second case is not a failure to handle gracefully by picking the other
 * provider; it is a case where the honest answer is "the server cannot do this,
 * use the browser's own voice", which is what `fallbackToBrowser` on the error
 * response tells the client to do.
 */
/* -------------------------------------------------------------------------- */
/* Provider health                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Providers that are configured but currently refusing work.
 *
 * A key existing is not the same thing as a key working, and conflating the two
 * produced a real failure: with an exhausted Sarvam account the key is present,
 * so routing sent every Hindi and Tamil request to Sarvam, which answered
 * `402 insufficient_quota_error` every time — and it would have kept doing so
 * even with an ElevenLabs key configured, because the fallback only triggered
 * on a *missing* key.
 *
 * So a provider that answers "I cannot serve you" is marked down for a while
 * and routing skips it. Same shape as the model cooldowns in aiService: learn
 * from the failure rather than repeating it once per request.
 *
 * Only two statuses trip this, and they mean different things:
 *
 *   402  out of credits. Will not fix itself; someone has to top up. Long
 *        cooldown, because retrying is guaranteed to fail and each attempt
 *        costs the user a visible delay before the browser voice takes over.
 *   429  rate limited. Transient by definition. Short cooldown.
 *
 * 401/403 are deliberately absent: a bad key is a deployment error, not a
 * runtime condition, and silently routing around it would hide a broken
 * configuration that the operator needs to see.
 */
const providerOutages = new Map();

const OUTAGE_MS = {
  402: 30 * 60 * 1000,
  429: 60 * 1000
};

function markProviderDown(provider, status, detail = '') {
  const cooldown = OUTAGE_MS[status];
  if (!cooldown) return;

  const until = Date.now() + cooldown;
  const existing = providerOutages.get(provider);
  if (existing && existing.until >= until) return;

  providerOutages.set(provider, { until, status, detail });
  console.warn(
    `[SETU speech] ${provider} marked unavailable for ${Math.round(cooldown / 60000)}m ` +
      `(HTTP ${status}${detail ? `: ${detail}` : ''}). Routing around it.`
  );
}

function isProviderDown(provider) {
  const outage = providerOutages.get(provider);
  if (!outage) return false;
  if (Date.now() >= outage.until) {
    providerOutages.delete(provider);
    return false;
  }
  return true;
}

/** A provider is usable when it has a key AND is not in a cooldown. */
function providerUsable(provider) {
  const configured = provider === 'sarvam' ? config.sarvamEnabled : config.elevenLabsEnabled;
  return configured && !isProviderDown(provider);
}

/** Outage state, for /api/health and the voice catalogue. */
function providerHealth() {
  const describe = (provider) => {
    const outage = providerOutages.get(provider);
    return {
      configured: provider === 'sarvam' ? config.sarvamEnabled : config.elevenLabsEnabled,
      available: providerUsable(provider),
      outage: outage && Date.now() < outage.until
        ? {
            status: outage.status,
            reason:
              outage.status === 402
                ? 'Out of credits — top up the account.'
                : 'Rate limited — this clears on its own.',
            retryAfterMs: outage.until - Date.now()
          }
        : null
    };
  };
  return { sarvam: describe('sarvam'), elevenlabs: describe('elevenlabs') };
}

/** Exposed so a redeploy or a manual top-up takes effect without a restart. */
function clearProviderOutages() {
  providerOutages.clear();
}

/* -------------------------------------------------------------------------- */

function pickTtsProvider(language) {
  const preferred = ttsProviderFor(language);

  if (preferred === 'sarvam') {
    if (providerUsable('sarvam')) return 'sarvam';
    // ElevenLabs Multilingual v2 covers most Indian languages too — worse on
    // Indic prosody and Hinglish code-mixing, which is why it is second, but
    // far better than dropping to the browser's synthesiser.
    if (providerUsable('elevenlabs')) return 'elevenlabs';
    return null;
  }

  // International. Sarvam cannot voice these at any point, key or no key.
  return providerUsable('elevenlabs') ? 'elevenlabs' : null;
}

function pickSttProvider(language) {
  const preferred = sttProviderFor(language);

  if (preferred === 'sarvam') {
    if (providerUsable('sarvam')) return 'sarvam';
    if (providerUsable('elevenlabs')) return 'elevenlabs';
    return null;
  }

  return providerUsable('elevenlabs') ? 'elevenlabs' : null;
}

/**
 * Synthesise one clip, from whichever engine can speak this language.
 *
 * Public entry point for every caller. `speaker` and `model` are
 * provider-specific and are simply handed to whichever engine is chosen —
 * a Sarvam speaker id reaching ElevenLabs resolves to that provider's default
 * rather than failing, which is what makes switching language mid-session safe
 * even though the saved voice preference no longer applies.
 */
async function synthesize({ text, speaker, model, pace = 1, language }) {
  const provider = pickTtsProvider(language);

  if (!provider) {
    const lang = resolveLanguage(language);
    throw new SpeechError(
      lang.region === 'international'
        ? `No natural voice is configured for ${lang.name}. Set ELEVENLABS_API_KEY to enable it.`
        : 'No speech provider is configured on the server.',
      503
    );
  }

  if (provider === 'elevenlabs') {
    try {
      return await elevenLabs.synthesize({ text, speaker, pace, language });
    } catch (error) {
      // ElevenLabs reports quota failures through its own module; surface them
      // into the shared breaker so routing stops choosing it too.
      const status = elevenLabs.takeLastFailureStatus();
      if (status) markProviderDown('elevenlabs', status, error.message);
      throw error;
    }
  }
  return synthesizeWithSarvam({ text, speaker, model, pace, language });
}

/**
 * Transcribe audio with whichever engine handles this language best.
 *
 * `mode` and `prompt` are Sarvam-only concepts (verbatim/codemix transcription
 * and context priming). They are accepted here regardless and ignored on the
 * ElevenLabs path rather than rejected, because the caller does not know which
 * provider will answer and should not have to.
 */
async function transcribe({
  audioBuffer,
  mimeType = 'audio/webm',
  filename = 'audio.webm',
  language,
  model,
  mode = 'transcribe',
  prompt = ''
}) {
  // 'auto' has to resolve before routing, and it cannot: nobody knows the
  // language yet. Scribe detects it natively, so auto-detect goes to
  // ElevenLabs when available and to Sarvam's 'unknown' handling otherwise.
  const wantsAutoDetect = !language || language === 'auto' || language === 'unknown';

  const provider = wantsAutoDetect
    ? (config.elevenLabsEnabled && 'elevenlabs') || (config.sarvamEnabled && 'sarvam') || null
    : pickSttProvider(language);

  if (!provider) {
    const lang = resolveLanguage(language);
    throw new SpeechError(
      lang.region === 'international'
        ? `Speech-to-text is not configured for ${lang.name}. Set ELEVENLABS_API_KEY to enable it.`
        : 'Speech-to-text is not configured on the server.',
      503
    );
  }

  if (provider === 'elevenlabs') {
    try {
      return await elevenLabs.transcribe({ audioBuffer, mimeType, filename, language, model });
    } catch (error) {
      const status = elevenLabs.takeLastFailureStatus();
      if (status) markProviderDown('elevenlabs', status, error.message);
      throw error;
    }
  }
  return transcribeWithSarvam({ audioBuffer, mimeType, filename, language, model, mode, prompt });
}

/**
 * Every voice the server can offer, tagged with the provider that owns it.
 *
 * Both catalogues are returned whether or not both keys are set, because the
 * picker also has to render voices for a language the user has not selected
 * yet. Each entry carries `provider`, and the client filters by the active
 * language's provider so a Sarvam speaker is never offered for Japanese.
 */
function listAllVoices() {
  return [
    ...listVoices().map((voice) => ({ ...voice, provider: 'sarvam' })),
    ...elevenLabs.listVoices()
  ];
}

module.exports = {
  // Routed entry points — use these.
  synthesize,
  transcribe,
  listAllVoices,
  pickTtsProvider,
  pickSttProvider,
  providerHealth,
  clearProviderOutages,
  markProviderDown,
  // Sarvam specifics, still exported for the voice catalogue and the tests.
  synthesizeWithSarvam,
  transcribeWithSarvam,
  listVoices,
  resolveVoice,
  cleanForSpeech,
  SpeechError,
  MAX_CHARS,
  VOICES
};
