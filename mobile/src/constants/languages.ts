/**
 * Languages SETU can hold a conversation in.
 *
 * Mirrors `backend/config/languages.js`, which is the source of truth, and the
 * same table the web app and the extension carry.
 *
 * The catalogue is two disjoint tiers, and the split is load-bearing rather
 * than cosmetic:
 *
 *   region: 'india'          Sarvam Bulbul (TTS) + Saaras (STT). Eleven codes.
 *                            Better than any general model on Indic audio and
 *                            on Hinglish code-mixing, which is how this
 *                            audience actually speaks.
 *   region: 'international'  ElevenLabs Multilingual v2 + Scribe. Sarvam cannot
 *                            voice these AT ALL — sending it 'ja-JP' is a hard
 *                            400, not a graceful miss — so the two are halves
 *                            of one catalogue rather than alternatives.
 *
 * Both tiers fall back to the device's own speech synthesiser when the engine
 * has no key for them, which is why every entry also carries a `bcp47` the
 * platform will accept.
 *
 * One code drives both halves at once: the language the model answers in, and
 * the language the audio is synthesised in. Setting only one gives you a Hindi
 * voice reading English sentences, which helps nobody.
 */

export interface Language {
  /** Canonical SETU code. Matches the provider tag for Indian languages. */
  code: string;
  /**
   * Valid BCP-47, for `accessibilityLanguage` and the platform speech API.
   *
   * Differs from `code` only for Odia: Sarvam spells it 'od-IN', which is not a
   * real language tag, so a screen reader ignores it and reads Odia with an
   * English voice engine. Anything user-facing must use this field.
   */
  bcp47: string;
  name: string;
  native: string;
  /** 'rtl' for Arabic. Mixed Arabic/Latin renders wrongly without it. */
  dir: 'ltr' | 'rtl';
  region: 'india' | 'international';
  /**
   * One sentence used by the "test voice" control.
   *
   * Written in the language itself rather than translated on the fly, so the
   * test actually demonstrates the voice a user is about to rely on. A Bulbul
   * speaker reading an English sentence in a Tamil voice tells you nothing about
   * whether Tamil read-aloud will work.
   */
  sample: string;
}

export const LANGUAGES: Language[] = [
  {
    code: 'en-IN',
    bcp47: 'en-IN',
    name: 'English',
    native: 'English',
    dir: 'ltr',
    region: 'india',
    sample: 'This is how SETU will read things back to you.',
  },
  {
    code: 'hi-IN',
    bcp47: 'hi-IN',
    name: 'Hindi',
    native: 'हिन्दी',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU आपको चीज़ें इसी आवाज़ में पढ़कर सुनाएगा।',
  },
  {
    code: 'bn-IN',
    bcp47: 'bn-IN',
    name: 'Bengali',
    native: 'বাংলা',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU আপনাকে এই কণ্ঠে পড়ে শোনাবে।',
  },
  {
    code: 'gu-IN',
    bcp47: 'gu-IN',
    name: 'Gujarati',
    native: 'ગુજરાતી',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU તમને આ અવાજમાં વાંચી સંભળાવશે.',
  },
  {
    code: 'kn-IN',
    bcp47: 'kn-IN',
    name: 'Kannada',
    native: 'ಕನ್ನಡ',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU ನಿಮಗೆ ಈ ಧ್ವನಿಯಲ್ಲಿ ಓದಿ ಹೇಳುತ್ತದೆ.',
  },
  {
    code: 'ml-IN',
    bcp47: 'ml-IN',
    name: 'Malayalam',
    native: 'മലയാളം',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU നിങ്ങൾക്ക് ഈ ശബ്ദത്തിൽ വായിച്ചു തരും.',
  },
  {
    code: 'mr-IN',
    bcp47: 'mr-IN',
    name: 'Marathi',
    native: 'मराठी',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU तुम्हाला याच आवाजात वाचून दाखवेल.',
  },
  {
    code: 'od-IN',
    bcp47: 'or-IN',
    name: 'Odia',
    native: 'ଓଡ଼ିଆ',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU ଆପଣଙ୍କୁ ଏହି ସ୍ୱରରେ ପଢ଼ି ଶୁଣାଇବ।',
  },
  {
    code: 'pa-IN',
    bcp47: 'pa-IN',
    name: 'Punjabi',
    native: 'ਪੰਜਾਬੀ',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU ਤੁਹਾਨੂੰ ਇਸੇ ਆਵਾਜ਼ ਵਿੱਚ ਪੜ੍ਹ ਕੇ ਸੁਣਾਏਗਾ।',
  },
  {
    code: 'ta-IN',
    bcp47: 'ta-IN',
    name: 'Tamil',
    native: 'தமிழ்',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU உங்களுக்கு இந்தக் குரலில் படித்துக் காட்டும்.',
  },
  {
    code: 'te-IN',
    bcp47: 'te-IN',
    name: 'Telugu',
    native: 'తెలుగు',
    dir: 'ltr',
    region: 'india',
    sample: 'SETU మీకు ఈ స్వరంలో చదివి వినిపిస్తుంది.',
  },
  {
    code: 'es-ES',
    bcp47: 'es-ES',
    name: 'Spanish',
    native: 'Español',
    dir: 'ltr',
    region: 'international',
    sample: 'Así es como SETU te leerá las cosas en voz alta.',
  },
  {
    code: 'fr-FR',
    bcp47: 'fr-FR',
    name: 'French',
    native: 'Français',
    dir: 'ltr',
    region: 'international',
    sample: 'Voici comment SETU vous lira les choses à voix haute.',
  },
  {
    code: 'de-DE',
    bcp47: 'de-DE',
    name: 'German',
    native: 'Deutsch',
    dir: 'ltr',
    region: 'international',
    sample: 'So wird SETU dir die Dinge vorlesen.',
  },
  {
    code: 'pt-BR',
    bcp47: 'pt-BR',
    name: 'Portuguese',
    native: 'Português',
    dir: 'ltr',
    region: 'international',
    sample: 'É assim que o SETU vai ler as coisas para você.',
  },
  {
    code: 'it-IT',
    bcp47: 'it-IT',
    name: 'Italian',
    native: 'Italiano',
    dir: 'ltr',
    region: 'international',
    sample: 'Ecco come SETU ti leggerà le cose ad alta voce.',
  },
  {
    code: 'ar-SA',
    bcp47: 'ar-SA',
    name: 'Arabic',
    native: 'العربية',
    dir: 'rtl',
    region: 'international',
    sample: 'هكذا سيقرأ لك SETU الأشياء بصوت عالٍ.',
  },
  {
    code: 'zh-CN',
    bcp47: 'zh-CN',
    name: 'Chinese',
    native: '中文',
    dir: 'ltr',
    region: 'international',
    sample: 'SETU 就是这样为你朗读的。',
  },
  {
    code: 'ja-JP',
    bcp47: 'ja-JP',
    name: 'Japanese',
    native: '日本語',
    dir: 'ltr',
    region: 'international',
    sample: 'SETU はこの声で読み上げます。',
  },
  {
    code: 'ko-KR',
    bcp47: 'ko-KR',
    name: 'Korean',
    native: '한국어',
    dir: 'ltr',
    region: 'international',
    sample: 'SETU가 이 목소리로 읽어 드립니다.',
  },
  {
    code: 'ru-RU',
    bcp47: 'ru-RU',
    name: 'Russian',
    native: 'Русский',
    dir: 'ltr',
    region: 'international',
    sample: 'Вот так SETU будет читать вам вслух.',
  },
  {
    code: 'id-ID',
    bcp47: 'id-ID',
    name: 'Indonesian',
    native: 'Bahasa Indonesia',
    dir: 'ltr',
    region: 'international',
    sample: 'Beginilah SETU akan membacakan untuk Anda.',
  },
  {
    code: 'tr-TR',
    bcp47: 'tr-TR',
    name: 'Turkish',
    native: 'Türkçe',
    dir: 'ltr',
    region: 'international',
    sample: 'SETU size işte böyle sesli okuyacak.',
  },
];

export const DEFAULT_LANGUAGE = 'en-IN';

const BY_CODE = new Map(LANGUAGES.map((entry) => [entry.code, entry]));

/** Normalise a requested tag to one we can actually speak ('hi' -> 'hi-IN'). */
export function resolveLanguage(requested?: string | null): Language {
  const raw = String(requested || '').trim();
  if (BY_CODE.has(raw)) return BY_CODE.get(raw)!;

  const short = raw.toLowerCase().split(/[-_]/)[0];
  const match = LANGUAGES.find((entry) => entry.code.split('-')[0] === short);
  return match || BY_CODE.get(DEFAULT_LANGUAGE)!;
}

/** The demo sentence for a language, used by the voice tester. */
export function languageSample(code?: string | null): string {
  return resolveLanguage(code).sample;
}

export function languageLabel(code?: string | null): string {
  const language = resolveLanguage(code);
  return language.code === DEFAULT_LANGUAGE
    ? language.name
    : `${language.native} · ${language.name}`;
}

/** Indian languages, for a picker that groups the two tiers. */
export const INDIAN_LANGUAGES = LANGUAGES.filter((entry) => entry.region === 'india');

/** International languages. */
export const INTERNATIONAL_LANGUAGES = LANGUAGES.filter(
  (entry) => entry.region === 'international'
);

/**
 * The tag to hand the platform for a piece of generated content.
 *
 * Always use this rather than the raw `code`. SETU stores Odia as 'od-IN'
 * because that is what Sarvam's API wants, but it is not a valid language tag:
 * passing it to `accessibilityLanguage` or to expo-speech means the platform
 * does not recognise it, falls back to the device language, and reads Odia with
 * an English voice engine.
 */
export function langAttr(code?: string | null): string {
  return resolveLanguage(code).bcp47;
}

/** Writing direction, for `I18nManager`-independent per-view layout. */
export function langDir(code?: string | null): 'ltr' | 'rtl' {
  return resolveLanguage(code).dir;
}
