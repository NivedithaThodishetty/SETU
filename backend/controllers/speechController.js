/**
 * Speech & Voice endpoints (TTS & STT).
 *
 * Provides natural text-to-speech read-aloud via Sarvam Bulbul and
 * high-accuracy multilingual speech-to-text via Sarvam Saaras.
 *
 * Designed with fail-safe fallbacks: machine-readable flags allow clients
 * to instantly switch to browser Web Speech APIs if offline.
 */

const speech = require('../services/speechService');
const config = require('../config');
const { LANGUAGES, resolveLanguage } = require('../config/languages');

/**
 * GET /api/speech/voices — Catalogue plus whether the natural voice and STT are live.
 */
function handleListVoices(_req, res) {
  res.json({
    enabled: config.speechEnabled,
    sttEnabled: config.sttEnabled,

    // Which engines are actually reachable, so the client can explain a gap
    // rather than just failing quietly. A deployment with only one key still
    // works — for half the catalogue — and the picker should say which half.
    providers: {
      sarvam: {
        ...speech.providerHealth().sarvam,
        ttsModel: config.sarvamTtsModel,
        sttModel: config.sarvamSttModel
      },
      elevenlabs: {
        ...speech.providerHealth().elevenlabs,
        ttsModel: config.elevenLabsTtsModel,
        sttModel: config.elevenLabsSttModel
      }
    },

    // Retained for older clients that read these flat fields.
    provider: 'sarvam',
    model: config.sarvamTtsModel,
    sttModel: config.sarvamSttModel,

    language: resolveLanguage(config.sarvamTtsLanguage).code,
    defaultSpeaker: speech.resolveVoice(null, config.sarvamTtsModel).speaker,
    maxCharacters: speech.MAX_CHARS,

    // Both catalogues, each entry tagged with its provider.
    voices: speech.listAllVoices(),

    /**
     * The catalogue, annotated with what the server can currently do for each
     * language. `ttsProvider: null` means no configured engine speaks it, and
     * the client should offer the browser voice and say so — which is a
     * materially different message from "read-aloud is off".
     */
    languages: LANGUAGES.map((language) => ({
      ...language,
      ttsProvider: speech.pickTtsProvider(language.code),
      sttProvider: speech.pickSttProvider(language.code)
    }))
  });
}

/**
 * POST /api/speech — Synthesise one clip of at most MAX_CHARS characters.
 */
async function handleSynthesize(req, res, next) {
  try {
    const { text, speaker, model, pace, language } = req.body || {};

    if (!String(text || '').trim()) {
      return res.status(400).json({ error: 'Nothing to say.' });
    }

    // Availability is per-language, not global: a Sarvam-only deployment can
    // speak Hindi and not Japanese, and answering "read-aloud is off" for the
    // second would be wrong. The router raises a SpeechError naming the gap.
    if (!speech.pickTtsProvider(language)) {
      const lang = resolveLanguage(language);
      return res.status(503).json({
        error:
          lang.region === 'international'
            ? `Natural voice is not configured for ${lang.name}. Set ELEVENLABS_API_KEY to enable it.`
            : 'Natural voice is not configured. Set SARVAM_API_KEY to enable it.',
        fallbackToBrowser: true
      });
    }

    const clip = await speech.synthesize({ text, speaker, model, pace, language });
    res.json(clip);
  } catch (error) {
    if (error.name === 'SpeechError') {
      return res.status(error.status).json({
        error: error.message,
        fallbackToBrowser: true
      });
    }
    next(error);
  }
}

/**
 * POST /api/speech/transcribe — Transcribe audio from microphone or file.
 * Accepts multipart/form-data with 'file' OR JSON with { audio: base64, mimeType, language }.
 */
async function handleTranscribe(req, res, next) {
  try {
    if (!config.sttEnabled) {
      return res.status(503).json({
        error:
          'Speech-to-text is not configured. Set SARVAM_API_KEY for Indian languages or ELEVENLABS_API_KEY for the rest.',
        fallbackToBrowser: true
      });
    }

    let audioBuffer = null;
    let mimeType = 'audio/webm';
    let filename = 'audio.webm';
    let language = req.body?.language || req.body?.language_code;
    let model = req.body?.model;
    let mode = req.body?.mode || 'transcribe';
    let prompt = req.body?.prompt || '';

    if (req.file) {
      audioBuffer = req.file.buffer;
      mimeType = req.file.mimetype || 'audio/webm';
      filename = req.file.originalname || 'audio.webm';
    } else if (req.body?.audio) {
      // Decode Base64 string
      const base64Data = req.body.audio.replace(/^data:[^;]+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
      mimeType = req.body.mimeType || 'audio/webm';
      filename = req.body.filename || 'audio.webm';
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({
        error: 'No audio data received. Please provide an audio file or base64 audio payload.'
      });
    }

    const result = await speech.transcribe({
      audioBuffer,
      mimeType,
      filename,
      language,
      model,
      mode,
      prompt
    });

    res.json(result);
  } catch (error) {
    if (error.name === 'SpeechError') {
      return res.status(error.status).json({
        error: error.message,
        fallbackToBrowser: true
      });
    }
    next(error);
  }
}

module.exports = {
  handleListVoices,
  handleSynthesize,
  handleTranscribe
};
