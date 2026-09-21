/**
 * Languages SETU can hold a conversation in.
 *
 * This is the single source of truth for three things that have to agree:
 * the code used to synthesise audio, the code used to transcribe it, and the
 * instruction that makes the model answer in that language in the first place.
 * Keeping them in one list is deliberate — setting only the voice gives you a
 * Hindi speaker reading English sentences, which is worse than either alone.
 *
 * The catalogue is split by who can actually speak each language:
 *
 *   region: 'india'         Sarvam Bulbul (TTS) + Saaras (STT). 11 codes, the
 *                           same for bulbul v2 and v3. Saaras is materially
 *                           better than any general model on Indic audio and on
 *                           Hinglish code-mixing, which is how these users
 *                           actually type and speak, so it stays primary here
 *                           even though ElevenLabs nominally covers the same
 *                           languages.
 *
 *   region: 'international' ElevenLabs Multilingual v2 (TTS) + Scribe (STT).
 *                           Sarvam cannot voice these at all — sending one of
 *                           these codes to Bulbul is a hard 400 — so the
 *                           routing below is load-bearing, not an optimisation.
 *
 * Both tiers degrade to the browser's own SpeechSynthesis / SpeechRecognition
 * when no key is configured, which is why every entry also carries a `bcp47`
 * that the Web Speech API will accept. Sarvam's `od-IN` for Odia is not a real
 * BCP-47 tag (`or` is), and passing it to the browser silently selects no voice
 * at all — so the two are stored separately rather than derived from each other.
 */

/**
 * @typedef {object} Language
 * @property {string}  code    Canonical SETU code. Matches the provider tag for
 *                             Indian languages, so Sarvam takes it unmodified.
 * @property {string}  bcp47   Valid BCP-47 for `lang=` attributes and the Web
 *                             Speech API. Differs from `code` only for Odia.
 * @property {string}  name    English name, used in prompts and labels.
 * @property {string}  native  Endonym, shown in the picker.
 * @property {string}  script  ISO 15924 code, for font selection and screener
 *                             stimulus generation.
 * @property {'ltr'|'rtl'} dir Writing direction. Arabic is the only rtl entry
 *                             today, and it needs `dir` on generated content or
 *                             mixed Arabic/Latin text renders in the wrong order.
 * @property {'india'|'international'} region  Which provider tier serves it.
 * @property {'sarvam'|'elevenlabs'} tts       Preferred speech synthesiser.
 * @property {'sarvam'|'elevenlabs'} stt       Preferred transcriber.
 * @property {boolean} akshara  True for alphasyllabaries (abugidas), where the
 *                              unit of decoding is a consonant-core syllable
 *                              modified by matras rather than a letter. The
 *                              Reading Check screener builds its stimuli around
 *                              this: an akshara-deletion task is the correct
 *                              analogue of English phoneme deletion, and a
 *                              phoneme task in Devanagari measures the wrong
 *                              unit. Tamil is included — it is an abugida —
 *                              though it has far fewer conjuncts than the
 *                              northern scripts.
 */

/** @type {Language[]} */
const LANGUAGES = [
  // -- India: Sarvam Bulbul / Saaras -----------------------------------------
  { code: 'en-IN', bcp47: 'en-IN', name: 'English',   native: 'English',   script: 'Latn', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: false },
  { code: 'hi-IN', bcp47: 'hi-IN', name: 'Hindi',     native: 'हिन्दी',      script: 'Deva', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },
  { code: 'bn-IN', bcp47: 'bn-IN', name: 'Bengali',   native: 'বাংলা',      script: 'Beng', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },
  { code: 'gu-IN', bcp47: 'gu-IN', name: 'Gujarati',  native: 'ગુજરાતી',     script: 'Gujr', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },
  { code: 'kn-IN', bcp47: 'kn-IN', name: 'Kannada',   native: 'ಕನ್ನಡ',      script: 'Knda', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },
  { code: 'ml-IN', bcp47: 'ml-IN', name: 'Malayalam', native: 'മലയാളം',    script: 'Mlym', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },
  { code: 'mr-IN', bcp47: 'mr-IN', name: 'Marathi',   native: 'मराठी',      script: 'Deva', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },
  // Sarvam spells Odia 'od-IN'; the ISO 639-1 code, and the one every browser
  // and screen reader expects, is 'or'. Both are kept — see the type note.
  { code: 'od-IN', bcp47: 'or-IN', name: 'Odia',      native: 'ଓଡ଼ିଆ',      script: 'Orya', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },
  { code: 'pa-IN', bcp47: 'pa-IN', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ',      script: 'Guru', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },
  { code: 'ta-IN', bcp47: 'ta-IN', name: 'Tamil',     native: 'தமிழ்',       script: 'Taml', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },
  { code: 'te-IN', bcp47: 'te-IN', name: 'Telugu',    native: 'తెలుగు',      script: 'Telu', dir: 'ltr', region: 'india', tts: 'sarvam', stt: 'sarvam', akshara: true  },

  // -- International: ElevenLabs Multilingual v2 / Scribe ---------------------
  { code: 'es-ES', bcp47: 'es-ES', name: 'Spanish',    native: 'Español',    script: 'Latn', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'fr-FR', bcp47: 'fr-FR', name: 'French',     native: 'Français',   script: 'Latn', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'de-DE', bcp47: 'de-DE', name: 'German',     native: 'Deutsch',    script: 'Latn', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'pt-BR', bcp47: 'pt-BR', name: 'Portuguese', native: 'Português',  script: 'Latn', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'it-IT', bcp47: 'it-IT', name: 'Italian',    native: 'Italiano',   script: 'Latn', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'ar-SA', bcp47: 'ar-SA', name: 'Arabic',     native: 'العربية',     script: 'Arab', dir: 'rtl', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'zh-CN', bcp47: 'zh-CN', name: 'Chinese',    native: '中文',        script: 'Hans', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'ja-JP', bcp47: 'ja-JP', name: 'Japanese',   native: '日本語',      script: 'Jpan', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'ko-KR', bcp47: 'ko-KR', name: 'Korean',     native: '한국어',      script: 'Kore', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'ru-RU', bcp47: 'ru-RU', name: 'Russian',    native: 'Русский',    script: 'Cyrl', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'id-ID', bcp47: 'id-ID', name: 'Indonesian', native: 'Bahasa Indonesia', script: 'Latn', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false },
  { code: 'tr-TR', bcp47: 'tr-TR', name: 'Turkish',    native: 'Türkçe',     script: 'Latn', dir: 'ltr', region: 'international', tts: 'elevenlabs', stt: 'elevenlabs', akshara: false }
];

const BY_CODE = new Map(LANGUAGES.map((entry) => [entry.code, entry]));

/** Also index the BCP-47 tag, so 'or-IN' resolves to Odia rather than English. */
const BY_BCP47 = new Map(LANGUAGES.map((entry) => [entry.bcp47, entry]));

const DEFAULT_CODE = 'en-IN';

const INDIAN_LANGUAGES = LANGUAGES.filter((entry) => entry.region === 'india');
const INTERNATIONAL_LANGUAGES = LANGUAGES.filter((entry) => entry.region === 'international');

/** Languages whose scripts are alphasyllabaries — the Reading Check cohort. */
const AKSHARA_LANGUAGES = LANGUAGES.filter((entry) => entry.akshara);

/**
 * Normalise a requested language to one we can actually speak.
 *
 * Accepts a bare tag as well as a full code ("hi" -> "hi-IN"), because browser
 * locale strings and hand-written config both show up in that shorter form.
 * Anything unrecognised falls back to the default rather than being passed
 * through to a provider, which would reject it.
 *
 * The bare-tag search walks `LANGUAGES` in order, so a prefix shared by two
 * entries resolves to the earlier one. That is why the Indian block is listed
 * first: a bare "en" must mean en-IN, not some future en-US.
 */
function resolveLanguage(requested, fallback = DEFAULT_CODE) {
  const raw = String(requested || '').trim();
  if (!raw) return BY_CODE.get(fallback) || BY_CODE.get(DEFAULT_CODE);

  if (BY_CODE.has(raw)) return BY_CODE.get(raw);
  if (BY_BCP47.has(raw)) return BY_BCP47.get(raw);

  const short = raw.toLowerCase().split(/[-_]/)[0];
  const match =
    LANGUAGES.find((entry) => entry.code.split('-')[0] === short) ||
    LANGUAGES.find((entry) => entry.bcp47.split('-')[0] === short);

  return match || BY_CODE.get(fallback) || BY_CODE.get(DEFAULT_CODE);
}

function isSupported(code) {
  const raw = String(code || '');
  return BY_CODE.has(raw) || BY_BCP47.has(raw);
}

/**
 * Which speech provider should serve this language.
 *
 * Callers use this to decide where to send the request *before* building a
 * provider-specific body, because the two APIs disagree about almost every
 * field name. Returns the preference from the catalogue; whether that provider
 * is actually configured is a separate question the speech service answers.
 */
function ttsProviderFor(code) {
  return resolveLanguage(code).tts;
}

function sttProviderFor(code) {
  return resolveLanguage(code).stt;
}

/**
 * The instruction appended to every model prompt for a non-English language.
 *
 * The enum caveat is load-bearing rather than decorative. Several mode schemas
 * carry English enums — effort levels, action-item priorities, the operation
 * type on each Numbers step — and the client compares those values as literal
 * strings. A model that helpfully translates "High" to "उच्च" silently breaks
 * priority badges and object rendering, and it fails in a way that looks like a
 * data bug rather than a translation one. Same for the JSON keys themselves.
 *
 * Returns an empty string for English so the English path is byte-identical to
 * what it was before languages existed.
 */
function languageDirective(code) {
  const language = resolveLanguage(code);
  if (language.code === DEFAULT_CODE) return '';

  return `

LANGUAGE
Write every piece of human-readable prose in ${language.name} (${language.native}), using its
native script. This includes summaries, explanations, labels, questions, steps, and any text a
person reads or hears.

These must stay exactly as specified in the schema and must NOT be translated:
- every JSON key name, in English;
- every value of a property that declares an "enum" — output the English string verbatim;
- numbers, which stay as digits.

Write naturally in ${language.name} rather than translating word-for-word from English. Keep
widely used English technical terms in English where a ${language.name} speaker would normally say
them that way.`;
}

/** Plain-language sentence used where a directive would be overkill (chat replies). */
function replyLanguageNote(code) {
  const language = resolveLanguage(code);
  if (language.code === DEFAULT_CODE) return '';
  return `\n\nReply in ${language.name} (${language.native}), in its native script, written naturally rather than translated word-for-word.`;
}

module.exports = {
  LANGUAGES,
  INDIAN_LANGUAGES,
  INTERNATIONAL_LANGUAGES,
  AKSHARA_LANGUAGES,
  DEFAULT_CODE,
  resolveLanguage,
  isSupported,
  ttsProviderFor,
  sttProviderFor,
  languageDirective,
  replyLanguageNote
};
