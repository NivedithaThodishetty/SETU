/**
 * Offline crisis guard — GENERATED FILE, DO NOT EDIT.
 *
 * Regenerate with:  node scripts/generate-crisis-guard.js
 * Source of truth:  backend/services/crisisDetector.js
 *
 * WHAT THIS IS FOR
 * ----------------
 * Crisis detection is a server responsibility and stays one: the engine runs
 * all three layers, including the classifier second pass that catches the
 * paraphrase no pattern list can. This file exists for the case the server
 * cannot cover — a phone with no signal, or an engine that is down.
 *
 * Without it, someone typing "I want to die" into the check-in on a train with
 * no bars receives "Cannot reach the SETU engine." That is the worst possible
 * reply to that sentence, and it is the reply the app gave before this file
 * existed. The whole point of detection running before any model call is that
 * the guarantee does not depend on a network, and on mobile the network is the
 * thing most likely to be absent.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * Layer 3 — the classifier — is not here and cannot be: it is a model call, and
 * this path runs precisely when model calls are impossible. So the offline
 * guard is strictly less sensitive than the online one. It is a floor under the
 * failure case, not a replacement for the server, and the online path is always
 * preferred when it is reachable.
 *
 * The response is fixed reviewed text with real helpline numbers, exactly as on
 * the server. Nothing here is generated, and nothing here is translated —
 * a machine-translated suicide script is the one error in this codebase that
 * costs most, so non-English users get the reviewed English wording plus the
 * numbers, which need no translation and are answered by people who speak
 * their language.
 */

export interface CrisisHelplineEntry {
  region: string;
  name: string;
  contact: string;
  hours: string;
}

export interface OfflineCrisisResponse {
  crisis: true;
  offline: true;
  language: string;
  requestedLanguage: string;
  languageNote: string | null;
  message: string;
  helplines: CrisisHelplineEntry[];
  immediateStep: string;
  stayingHere: string;
}

/* -------------------------------------------------------------------------- */
/* Layer 1 — first-person intent. Never suppressed.                           */
/* -------------------------------------------------------------------------- */

const INTENT_PATTERNS: Record<string, RegExp[]> = {
  "en-IN": [
    new RegExp("\\bkill(?:ing)?\\s+my\\s?self\\b", "i"),
    new RegExp("\\bend(?:ing)?\\s+(?:my|it)\\s+(?:life|all)\\b", "i"),
    new RegExp("\\btake\\s+my\\s+own\\s+life\\b", "i"),
    new RegExp("(?<!\\bdon'?t\\s)(?<!\\bdo\\s not\\s)(?<!\\bnot\\s)\\b(?:want|going)\\s+to\\s+die\\b", "i"),
    new RegExp("\\bdon'?t\\s+want\\s+to\\s+(?:be\\s+here|live|wake\\s+up)\\b", "i"),
    new RegExp("\\bbetter\\s+off\\s+(?:dead|without\\s+me)\\b", "i"),
    new RegExp("\\bno\\s+(?:reason|point)\\s+(?:in\\s+|to\\s+)?(?:living|live|being\\s+here|go(?:ing)?\\s+on)\\b", "i"),
    new RegExp("\\bhurt(?:ing)?\\s+my\\s?self\\b", "i"),
    new RegExp("\\bcut(?:ting)?\\s+my\\s?self\\b", "i"),
    new RegExp("(?<!\\d)(?<!\\d\\s)\\bkms\\b", "i"),
  ],
  "hi-IN": [
    new RegExp("मुझे\\s*मरना\\s*है", ""),
    new RegExp("मरना\\s*चाहता|मरना\\s*चाहती", ""),
    new RegExp("जीने\\s*का\\s*मन\\s*नहीं", ""),
    new RegExp("जीना\\s*नहीं\\s*चाहता|जीना\\s*नहीं\\s*चाहती", ""),
    new RegExp("ज़िंदा\\s*नहीं\\s*रहना|जिंदा\\s*नहीं\\s*रहना", ""),
    new RegExp("ख़ुद\\s*को\\s*ख़त्म|खुद\\s*को\\s*खत्म", ""),
    new RegExp("जान\\s*दे\\s*दूँगा|जान\\s*दे\\s*दूंगा|जान\\s*दे\\s*दूँगी|जान\\s*दे\\s*दूंगी", ""),
    new RegExp("अपने\\s*आप\\s*को\\s*मार", ""),
    new RegExp("\\bmujhe\\s+marna\\b", "i"),
    new RegExp("\\bmarna\\s+hai\\b", "i"),
    new RegExp("\\bmar\\s+jaana\\s+hai\\b", "i"),
    new RegExp("\\bjeene\\s+ka\\s+mann?\\s+nahi", "i"),
    new RegExp("\\bjeena\\s+nahi\\s+chahta|\\bjeena\\s+nahi\\s+chahti", "i"),
    new RegExp("\\bzinda\\s+nahi\\s+rehna\\b", "i"),
    new RegExp("\\bkhatam\\s+kar\\s+dunga\\b|\\bkhatam\\s+kar\\s+dungi\\b", "i"),
    new RegExp("\\bjaan\\s+de\\s+dunga\\b|\\bjaan\\s+de\\s+dungi\\b", "i"),
  ],
  "bn-IN": [
    new RegExp("মরতে\\s*চাই", ""),
    new RegExp("বাঁচতে\\s*চাই\\s*না", ""),
    new RegExp("মরে\\s*যেতে\\s*চাই", ""),
    new RegExp("নিজেকে\\s*শেষ\\s*করে", ""),
    new RegExp("\\bmorte\\s+chai\\b", "i"),
    new RegExp("\\bbachte\\s+chai\\s+na\\b", "i"),
  ],
  "gu-IN": [
    new RegExp("મરવું\\s*છે", ""),
    new RegExp("જીવવું\\s*નથી", ""),
    new RegExp("જીવવા\\s*નથી\\s*માંગતો|જીવવા\\s*નથી\\s*માંગતી", ""),
    new RegExp("\\bmarvu\\s+chhe\\b", "i"),
    new RegExp("\\bjeevavu\\s+nathi\\b", "i"),
  ],
  "kn-IN": [
    new RegExp("ಸಾಯಬೇಕು", ""),
    new RegExp("ಸಾಯಲು\\s*ಬಯಸು", ""),
    new RegExp("ಬದುಕಲು\\s*ಇಷ್ಟವಿಲ್ಲ", ""),
    new RegExp("ಬದುಕಬೇಕು\\s*ಅನಿಸುತ್ತಿಲ್ಲ", ""),
    new RegExp("\\bsaayabeku\\b|\\bsayabeku\\b", "i"),
    new RegExp("\\bbadukalu\\s+ishtavilla\\b", "i"),
  ],
  "ml-IN": [
    new RegExp("മരിക്കണം", ""),
    new RegExp("മരിക്കാൻ\\s*ആഗ്രഹ", ""),
    new RegExp("ജീവിക്കാൻ\\s*വയ്യ", ""),
    new RegExp("ജീവിക്കാൻ\\s*താൽപ്പര്യമില്ല", ""),
    new RegExp("\\bmarikkanam\\b", "i"),
    new RegExp("\\bjeevikkan\\s+vayya\\b", "i"),
  ],
  "mr-IN": [
    new RegExp("मला\\s*मरायच", ""),
    new RegExp("मरायचं\\s*आहे|मरायचे\\s*आहे", ""),
    new RegExp("जगायचं\\s*नाही|जगायचे\\s*नाही", ""),
    new RegExp("जगावंसं\\s*वाटत\\s*नाही", ""),
    new RegExp("\\bmala\\s+maraych", "i"),
    new RegExp("\\bjagaycha\\s+nahi\\b|\\bjagayche\\s+nahi\\b", "i"),
  ],
  "od-IN": [
    new RegExp("ମରିବାକୁ\\s*ଚାହେଁ", ""),
    new RegExp("ବଞ୍ଚିବାକୁ\\s*ଚାହେଁ\\s*ନାହିଁ", ""),
    new RegExp("ନିଜକୁ\\s*ଶେଷ\\s*କରି", ""),
    new RegExp("\\bmaribaku\\s+chahen\\b", "i"),
    new RegExp("\\bbanchibaku\\s+chahen\\s+nahin\\b", "i"),
  ],
  "pa-IN": [
    new RegExp("ਮਰਨਾ\\s*ਚਾਹੁੰਦਾ|ਮਰਨਾ\\s*ਚਾਹੁੰਦੀ", ""),
    new RegExp("ਜੀਣਾ\\s*ਨਹੀਂ\\s*ਚਾਹੁੰਦਾ|ਜੀਣਾ\\s*ਨਹੀਂ\\s*ਚਾਹੁੰਦੀ", ""),
    new RegExp("ਮੈਂ\\s*ਮਰ\\s*ਜਾਣਾ", ""),
    new RegExp("\\bmarna\\s+chahunda\\b|\\bmarna\\s+chahundi\\b", "i"),
    new RegExp("\\bjeena\\s+nahi\\s+chahunda\\b", "i"),
  ],
  "ta-IN": [
    new RegExp("சாக\\s*வேண்டும்", ""),
    new RegExp("சாகணும்", ""),
    new RegExp("இறக்க\\s*வேண்டும்", ""),
    new RegExp("வாழ\\s*விரும்பவில்லை", ""),
    new RegExp("உயிரை\\s*விட", ""),
    new RegExp("\\benakku\\s+saaganum\\b", "i"),
    new RegExp("\\bsaaganum\\b|\\bsaaga\\s+venum\\b", "i"),
    new RegExp("\\bvaazha\\s+virumbavillai\\b", "i"),
  ],
  "te-IN": [
    new RegExp("చనిపోవాలని", ""),
    new RegExp("చావాలని\\s*ఉంది", ""),
    new RegExp("బతకాలని\\s*లేదు", ""),
    new RegExp("బ్రతకాలని\\s*లేదు", ""),
    new RegExp("\\bchanipovalani\\b", "i"),
    new RegExp("\\bbatakalani\\s+ledu\\b", "i"),
  ],
  "es-ES": [
    new RegExp("(?<!\\bno\\s)\\bquiero\\s+morir(?:me)?\\b", "i"),
    new RegExp("\\bme\\s+quiero\\s+matar\\b|\\bquiero\\s+matarme\\b", "i"),
    new RegExp("\\bno\\s+quiero\\s+vivir\\b", "i"),
    new RegExp("\\bacabar\\s+con\\s+mi\\s+vida\\b", "i"),
    new RegExp("\\bquitarme\\s+la\\s+vida\\b", "i"),
    new RegExp("\\bhacerme\\s+daño\\b", "i"),
  ],
  "fr-FR": [
    new RegExp("\\bme\\s+suicider\\b", "i"),
    new RegExp("\\bje\\s+veux\\s+mourir\\b", "i"),
    new RegExp("\\bje\\s+veux\\s+en\\s+finir\\b", "i"),
    new RegExp("\\bne\\s+(?:\\S+\\s+)?plus\\s+vivre\\b", "i"),
    new RegExp("\\bmettre\\s+fin\\s+à\\s+mes\\s+jours\\b", "i"),
    new RegExp("\\bme\\s+faire\\s+du\\s+mal\\b", "i"),
  ],
  "de-DE": [
    new RegExp("\\bich\\s+will\\s+sterben\\b", "i"),
    new RegExp("\\bmich\\s+umbringen\\b|\\bmich\\s+töten\\b", "i"),
    new RegExp("\\bnicht\\s+mehr\\s+leben\\b", "i"),
    new RegExp("\\bmir\\s+das\\s+leben\\s+nehmen\\b", "i"),
    new RegExp("\\bmich\\s+selbst\\s+verletzen\\b", "i"),
  ],
  "pt-BR": [
    new RegExp("(?<!\\bnão\\s)\\bquero\\s+morrer\\b", "i"),
    new RegExp("\\bme\\s+matar\\b|\\bquero\\s+me\\s+matar\\b", "i"),
    new RegExp("\\bnão\\s+quero\\s+viver\\b", "i"),
    new RegExp("\\bacabar\\s+com\\s+a\\s+minha\\s+vida\\b", "i"),
    new RegExp("\\bme\\s+machucar\\b", "i"),
  ],
  "it-IT": [
    new RegExp("(?<!\\bnon\\s)\\bvoglio\\s+morire\\b", "i"),
    new RegExp("\\buccidermi\\b|\\bammazzarmi\\b", "i"),
    new RegExp("\\bfarla\\s+finita\\b", "i"),
    new RegExp("\\bnon\\s+voglio\\s+vivere\\b", "i"),
    new RegExp("\\bfarmi\\s+del\\s+male\\b", "i"),
  ],
  "ar-SA": [
    new RegExp("أريد\\s*أن\\s*أموت|اريد\\s*ان\\s*اموت", ""),
    new RegExp("أقتل\\s*نفسي|اقتل\\s*نفسي", ""),
    new RegExp("لا\\s*أريد\\s*العيش|لا\\s*اريد\\s*العيش", ""),
    new RegExp("أنهي\\s*حياتي|انهي\\s*حياتي", ""),
    new RegExp("أؤذي\\s*نفسي|اؤذي\\s*نفسي", ""),
  ],
  "zh-CN": [
    new RegExp("我想死|想去死", ""),
    new RegExp("不想活", ""),
    new RegExp("结束生命|結束生命|了结自己", ""),
    new RegExp("伤害自己|傷害自己", ""),
  ],
  "ja-JP": [
    new RegExp("死にたい", ""),
    new RegExp("消えたい", ""),
    new RegExp("生きたくない", ""),
    new RegExp("自分を傷つけ", ""),
  ],
  "ko-KR": [
    new RegExp("죽고\\s*싶", ""),
    new RegExp("살기\\s*싫", ""),
    new RegExp("사라지고\\s*싶", ""),
  ],
  "ru-RU": [
    new RegExp("(?<!не\\s)хочу\\s+умереть", "i"),
    new RegExp("покончить\\s+с\\s+собой", "i"),
    new RegExp("не\\s+хочу\\s+жить", "i"),
    new RegExp("причинить\\s+себе\\s+вред", "i"),
  ],
  "id-ID": [
    new RegExp("(?<!\\btidak\\s)\\b(?:ingin|mau)\\s+mati\\b", "i"),
    new RegExp("\\btidak\\s+ingin\\s+hidup\\b|\\bgak\\s+mau\\s+hidup\\b", "i"),
    new RegExp("\\bmengakhiri\\s+hidup\\b", "i"),
    new RegExp("\\bmenyakiti\\s+diri\\b", "i"),
  ],
  "tr-TR": [
    new RegExp("ölmek\\s+istiyorum", "i"),
    new RegExp("\\bkendimi\\s+öldür", "i"),
    new RegExp("\\byaşamak\\s+istemiyorum\\b", "i"),
    new RegExp("\\bkendime\\s+zarar\\s+ver", "i"),
  ],
};

/* -------------------------------------------------------------------------- */
/* Layer 2 — bare keywords, suppressed by academic context.                    */
/* -------------------------------------------------------------------------- */

const KEYWORD_PATTERNS: Record<string, RegExp[]> = {
  "en-IN": [
    new RegExp("\\bsuicid(?:e|es|al)\\b", "i"),
    new RegExp("\\bself[\\s-]?harm(?:ing|ed)?\\b", "i"),
  ],
  "hi-IN": [
    new RegExp("आत्महत्या", ""),
    new RegExp("ख़ुदकुशी|खुदकुशी", ""),
    new RegExp("\\baatmahatya\\b|\\batmahatya\\b", "i"),
    new RegExp("\\bkhud\\s*kushi\\b|\\bkhudkushi\\b", "i"),
  ],
  "bn-IN": [
    new RegExp("আত্মহত্যা", ""),
    new RegExp("\\batmahatya\\b|\\batmohotya\\b", "i"),
  ],
  "gu-IN": [
    new RegExp("આપઘાત", ""),
    new RegExp("આત્મહત્યા", ""),
    new RegExp("\\baapghat\\b|\\bapghat\\b", "i"),
  ],
  "kn-IN": [
    new RegExp("ಆತ್ಮಹತ್ಯೆ", ""),
    new RegExp("\\baatmahatye\\b|\\batmahatye\\b", "i"),
  ],
  "ml-IN": [
    new RegExp("ആത്മഹത്യ", ""),
    new RegExp("\\batmahatya\\b|\\baathmahathya\\b", "i"),
  ],
  "mr-IN": [
    new RegExp("आत्महत्या", ""),
  ],
  "od-IN": [
    new RegExp("ଆତ୍ମହତ୍ୟା", ""),
    new RegExp("\\batmahatya\\b", "i"),
  ],
  "pa-IN": [
    new RegExp("ਖੁਦਕੁਸ਼ੀ", ""),
    new RegExp("ਆਤਮ\\s*ਹੱਤਿਆ", ""),
    new RegExp("\\bkhudkushi\\b|\\bkhud\\s*kushi\\b", "i"),
  ],
  "ta-IN": [
    new RegExp("தற்கொலை", ""),
    new RegExp("\\btharkolai\\b|\\bthar\\s*kolai\\b", "i"),
  ],
  "te-IN": [
    new RegExp("ఆత్మహత్య", ""),
    new RegExp("\\batmahatya\\b|\\baatmahatya\\b", "i"),
  ],
  "es-ES": [
    new RegExp("\\bsuicid(?:io|arme|arse|a|as)\\b", "i"),
  ],
  "fr-FR": [
    new RegExp("\\bsuicid(?:e|es|er|aire|aires)\\b", "i"),
  ],
  "de-DE": [
    new RegExp("\\bselbstmord\\b|\\bsuizid\\b", "i"),
  ],
  "pt-BR": [
    new RegExp("\\bsuicíd(?:io|ios)\\b|\\bsuicidar\\b", "i"),
  ],
  "it-IT": [
    new RegExp("\\bsuicid(?:io|armi|arsi)\\b", "i"),
  ],
  "ar-SA": [
    new RegExp("انتحار|أنتحر|الانتحار", ""),
  ],
  "zh-CN": [
    new RegExp("自杀|自殺", ""),
  ],
  "ja-JP": [
    new RegExp("自殺", ""),
  ],
  "ko-KR": [
    new RegExp("자살", ""),
    new RegExp("자해", ""),
  ],
  "ru-RU": [
    new RegExp("самоубийств|суицид", "i"),
  ],
  "id-ID": [
    new RegExp("\\bbunuh\\s+diri\\b", "i"),
  ],
  "tr-TR": [
    new RegExp("\\bintihar\\b", "i"),
  ],
};

const ACADEMIC_CONTEXT = new RegExp("\\b(?:essay|assignment|homework|thesis|dissertation|coursework|syllabus|curriculum|lecture|seminar|class(?:es|room)?|studied|studying|research(?:ing|er)?|paper|article|journal|news|documentary|movie|film|novel|book|chapter|statistics|stats|rates?|prevalence|prevention|awareness|campaign|helpline|hotline|policy|report|survey|module|exam|quiz|presentation|project)\\b", "i");

/** Languages carrying patterns. Exported so the suite can assert coverage. */
export const COVERED_LANGUAGES: string[] = ["en-IN","hi-IN","bn-IN","gu-IN","kn-IN","ml-IN","mr-IN","od-IN","pa-IN","ta-IN","te-IN","es-ES","fr-FR","de-DE","pt-BR","it-IT","ar-SA","zh-CN","ja-JP","ko-KR","ru-RU","id-ID","tr-TR"];

const ALL_INTENT = Object.values(INTENT_PATTERNS).flat();
const ALL_KEYWORD = Object.values(KEYWORD_PATTERNS).flat();

/**
 * Pattern-only detection. Synchronous, deterministic, no key and no network.
 *
 * Every language's patterns are tested regardless of the language the user
 * picked: the picker says Hindi but a user typing English at 2am is common, and
 * a guard that only watches the selected language would miss them.
 */
export function detectCrisisOffline(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;

  if (ALL_INTENT.some((pattern) => pattern.test(value))) return true;
  if (ALL_KEYWORD.some((pattern) => pattern.test(value))) return !ACADEMIC_CONTEXT.test(value);
  return false;
}

/** Detection with provenance, for the suite. The message itself is never logged. */
export function inspectCrisisOffline(text: string): {
  matched: boolean;
  layer: 'intent' | 'keyword' | null;
  language: string | null;
} {
  const value = String(text || '');
  const miss = { matched: false, layer: null, language: null } as const;
  if (!value.trim()) return { ...miss };

  for (const [language, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(value))) {
      return { matched: true, layer: 'intent', language };
    }
  }

  if (ACADEMIC_CONTEXT.test(value)) return { ...miss };

  for (const [language, patterns] of Object.entries(KEYWORD_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(value))) {
      return { matched: true, layer: 'keyword', language };
    }
  }

  return { ...miss };
}

/* -------------------------------------------------------------------------- */
/* The fixed response                                                          */
/* -------------------------------------------------------------------------- */

const HELPLINES: CrisisHelplineEntry[] = [
  {
    "region": "India",
    "name": "Tele-MANAS (Government of India)",
    "contact": "14416 or 1-800-891-4416",
    "hours": "24 hours, every day, free — answers in 20+ Indian languages"
  },
  {
    "region": "India",
    "name": "KIRAN Mental Health Helpline",
    "contact": "1800-599-0019",
    "hours": "24 hours, 13 languages, free"
  },
  {
    "region": "India",
    "name": "AASRA",
    "contact": "+91 98204 66726",
    "hours": "24 hours, every day"
  },
  {
    "region": "Anywhere",
    "name": "Find a Helpline (search by country)",
    "contact": "https://findahelpline.com",
    "hours": "Directory of verified local services in 130+ countries"
  },
  {
    "region": "International",
    "name": "International Association for Suicide Prevention",
    "contact": "https://www.iasp.info/resources/Crisis_Centres/",
    "hours": "Directory of crisis centres worldwide"
  }
];

const REVIEWED_LANGUAGES = ["en-IN"];

const ENGLISH_SCRIPT = {
  message: "I am really glad you said that out loud. What you are carrying sounds far too heavy to hold on your own, and I am a piece of software — not the right support for this. Please talk to a person tonight.",
  immediateStep: "If you are in immediate danger, call your local emergency number or go to the nearest emergency department.",
  stayingHere: "You can keep this open as long as you like. What you wrote is on this phone only — with the engine unreachable there is nowhere for it to go.",
};

const LANGUAGE_NOTE = "This message is shown in English so its wording stays exact — a mistranslated safety message is worse than an untranslated one. The helplines below answer in your language: Tele-MANAS covers 20+ Indian languages and KIRAN 13.";

/**
 * Build the offline crisis reply.
 *
 * Only reviewed scripts are ever served, which today means English alone. A
 * non-English user receives the reviewed English wording, the note explaining
 * why, and the numbers — which are the part that actually helps and the part
 * that needs no translation.
 */
export function buildOfflineCrisisResponse(language: string = 'en-IN'): OfflineCrisisResponse {
  const requested = language || 'en-IN';
  const servedInEnglish = !REVIEWED_LANGUAGES.includes(requested);

  return {
    crisis: true,
    offline: true,
    language: servedInEnglish ? 'en-IN' : requested,
    requestedLanguage: requested,
    languageNote: servedInEnglish ? LANGUAGE_NOTE : null,
    message: ENGLISH_SCRIPT.message,
    helplines: HELPLINES,
    immediateStep: ENGLISH_SCRIPT.immediateStep,
    stayingHere: ENGLISH_SCRIPT.stayingHere,
  };
}
