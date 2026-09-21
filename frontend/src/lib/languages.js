/**
 * The languages SETU can think and speak in, mirrored for the client.
 *
 * `backend/config/languages.js` is the source of truth — it holds the provider
 * routing and the prompt directive together, because setting only one of those
 * gives you a Hindi voice reading English sentences. This copy exists so a
 * screen can *label* the active language without waiting on
 * `/api/speech/voices`: the node explainer has to render "Explaining in हिन्दी"
 * in the same frame the panel opens, and a round trip for a chip is a round
 * trip the reader watches.
 *
 * Codes must stay identical to the backend list. Anything not in it falls back
 * to English rather than being passed through, which is what the engine does
 * with an unknown code anyway.
 *
 * Three fields here are not cosmetic and are easy to drop when editing:
 *
 *   bcp47  Goes into `lang=` on generated content. Differs from `code` only for
 *          Odia — Sarvam spells it 'od-IN', but the tag every browser and
 *          screen reader understands is 'or'. Emitting 'od-IN' means a screen
 *          reader reads Odia with an English voice engine, which is the WCAG
 *          3.1.2 failure this field exists to prevent.
 *
 *   dir    'rtl' for Arabic. Without it, mixed Arabic/Latin text renders in the
 *          wrong visual order.
 *
 *   region Which provider tier serves it, and therefore which voices are
 *          offerable. The server annotates each language with a live
 *          `ttsProvider` on /api/speech/voices; this is the offline default.
 */

export const LANGUAGES = [
  // Indian languages — Sarvam Bulbul / Saaras
  { code: 'en-IN', bcp47: 'en-IN', name: 'English',   native: 'English',   dir: 'ltr', region: 'india' },
  { code: 'hi-IN', bcp47: 'hi-IN', name: 'Hindi',     native: 'हिन्दी',      dir: 'ltr', region: 'india' },
  { code: 'bn-IN', bcp47: 'bn-IN', name: 'Bengali',   native: 'বাংলা',      dir: 'ltr', region: 'india' },
  { code: 'gu-IN', bcp47: 'gu-IN', name: 'Gujarati',  native: 'ગુજરાતી',     dir: 'ltr', region: 'india' },
  { code: 'kn-IN', bcp47: 'kn-IN', name: 'Kannada',   native: 'ಕನ್ನಡ',      dir: 'ltr', region: 'india' },
  { code: 'ml-IN', bcp47: 'ml-IN', name: 'Malayalam', native: 'മലയാളം',    dir: 'ltr', region: 'india' },
  { code: 'mr-IN', bcp47: 'mr-IN', name: 'Marathi',   native: 'मराठी',      dir: 'ltr', region: 'india' },
  { code: 'od-IN', bcp47: 'or-IN', name: 'Odia',      native: 'ଓଡ଼ିଆ',      dir: 'ltr', region: 'india' },
  { code: 'pa-IN', bcp47: 'pa-IN', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ',      dir: 'ltr', region: 'india' },
  { code: 'ta-IN', bcp47: 'ta-IN', name: 'Tamil',     native: 'தமிழ்',       dir: 'ltr', region: 'india' },
  { code: 'te-IN', bcp47: 'te-IN', name: 'Telugu',    native: 'తెలుగు',      dir: 'ltr', region: 'india' },

  // International — ElevenLabs Multilingual v2 / Scribe
  { code: 'es-ES', bcp47: 'es-ES', name: 'Spanish',    native: 'Español',    dir: 'ltr', region: 'international' },
  { code: 'fr-FR', bcp47: 'fr-FR', name: 'French',     native: 'Français',   dir: 'ltr', region: 'international' },
  { code: 'de-DE', bcp47: 'de-DE', name: 'German',     native: 'Deutsch',    dir: 'ltr', region: 'international' },
  { code: 'pt-BR', bcp47: 'pt-BR', name: 'Portuguese', native: 'Português',  dir: 'ltr', region: 'international' },
  { code: 'it-IT', bcp47: 'it-IT', name: 'Italian',    native: 'Italiano',   dir: 'ltr', region: 'international' },
  { code: 'ar-SA', bcp47: 'ar-SA', name: 'Arabic',     native: 'العربية',     dir: 'rtl', region: 'international' },
  { code: 'zh-CN', bcp47: 'zh-CN', name: 'Chinese',    native: '中文',        dir: 'ltr', region: 'international' },
  { code: 'ja-JP', bcp47: 'ja-JP', name: 'Japanese',   native: '日本語',      dir: 'ltr', region: 'international' },
  { code: 'ko-KR', bcp47: 'ko-KR', name: 'Korean',     native: '한국어',      dir: 'ltr', region: 'international' },
  { code: 'ru-RU', bcp47: 'ru-RU', name: 'Russian',    native: 'Русский',    dir: 'ltr', region: 'international' },
  { code: 'id-ID', bcp47: 'id-ID', name: 'Indonesian', native: 'Bahasa Indonesia', dir: 'ltr', region: 'international' },
  { code: 'tr-TR', bcp47: 'tr-TR', name: 'Turkish',    native: 'Türkçe',     dir: 'ltr', region: 'international' }
];

const BY_CODE = new Map(LANGUAGES.map((entry) => [entry.code, entry]));
const BY_BCP47 = new Map(LANGUAGES.map((entry) => [entry.bcp47, entry]));

export const DEFAULT_LANGUAGE = BY_CODE.get('en-IN');

export const INDIAN_LANGUAGES = LANGUAGES.filter((entry) => entry.region === 'india');
export const INTERNATIONAL_LANGUAGES = LANGUAGES.filter(
  (entry) => entry.region === 'international'
);

/** Resolve a code — full ('hi-IN'), BCP-47 ('or-IN') or bare ('hi') — to an entry. */
export function resolveLanguage(code) {
  const raw = String(code || '').trim();
  if (BY_CODE.has(raw)) return BY_CODE.get(raw);
  if (BY_BCP47.has(raw)) return BY_BCP47.get(raw);

  const short = raw.toLowerCase().split(/[-_]/)[0];
  return (
    LANGUAGES.find((entry) => entry.code.split('-')[0] === short) ||
    LANGUAGES.find((entry) => entry.bcp47.split('-')[0] === short) ||
    DEFAULT_LANGUAGE
  );
}

/** True when the chosen language is not English — i.e. the chip is worth showing. */
export function isTranslated(code) {
  return resolveLanguage(code).code !== DEFAULT_LANGUAGE.code;
}

/**
 * The `lang` attribute value for content generated in this language.
 *
 * Always use this rather than the raw code. Emitting SETU's internal 'od-IN' as
 * a `lang` attribute is not merely untidy — it is not a valid language tag, so
 * assistive technology falls back to the document language and reads Odia with
 * an English voice engine. That is a WCAG 2.1 3.1.2 (Language of Parts, AA)
 * failure, and it breaks the exact feature this product leads with for the
 * exact users who most need it.
 */
export function langAttr(code) {
  return resolveLanguage(code).bcp47;
}

/** Writing direction, for `dir` on generated content. Only Arabic is rtl today. */
export function langDir(code) {
  return resolveLanguage(code).dir || 'ltr';
}
