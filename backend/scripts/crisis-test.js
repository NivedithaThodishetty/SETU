/**
 * Crisis-detection coverage suite.
 *
 * Runs with `npm run test:crisis` in backend/, and needs no API key, no
 * database and no network — every assertion here is about the pattern layer,
 * which is precisely the layer that has to keep working when none of those are
 * available.
 *
 * Three things are asserted, in descending order of how much they matter:
 *
 *  1. POSITIVES — every phrase a person in distress might actually type, in
 *     every language the product advertises, trips the guard. These fixtures
 *     are the real content of this file; the code is scaffolding around them.
 *
 *  2. NEGATIVES — ordinary frustration, idiom, and academic or third-person
 *     discussion of suicide do NOT trip it. A guard that fires on "this
 *     deadline is killing me" gets switched off by the user, and a switched-off
 *     guard protects nobody. This half is why the patterns are narrow.
 *
 *  3. COVERAGE — every language in config/languages.js has patterns, and every
 *     pattern in crisisDetector.js is exercised by at least one fixture. The
 *     second check is the one that catches a pattern broken by a bad paste or a
 *     mojibake'd script: a regex that can never match anything is invisible in
 *     production and obvious here.
 */

const {
  INTENT_PATTERNS,
  KEYWORD_PATTERNS,
  COVERED_LANGUAGES,
  detectCrisisLanguage,
  inspectCrisisLanguage,
  buildCrisisResponse
} = require('../services/crisisDetector');
const { LANGUAGES } = require('../config/languages');

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Positives — these must all be caught                                    */
/* -------------------------------------------------------------------------- */

/**
 * Written as whole sentences rather than bare keywords on purpose: a pattern
 * that only matches an isolated phrase but not the same phrase inside a real
 * sentence is a pattern that will miss in production.
 */
const MUST_DETECT = {
  'en-IN': [
    'i want to kill myself',
    'I have been thinking about suicide for weeks',
    "i don't want to be here anymore",
    'everyone would be better off without me',
    'there is no point in living',
    'i have been cutting myself again',
    'i keep hurting myself when it gets bad',
    'i have been self-harming again',
    'i am going to take my own life',
    'kms honestly',
    'i want to end my life tonight',
    'I keep thinking I want to die'
  ],
  'hi-IN': [
    'मुझे मरना है अब और नहीं हो रहा',
    'मैं आत्महत्या करना चाहता हूँ',
    'जीने का मन नहीं करता',
    'अब ज़िंदा नहीं रहना है',
    'मैं जान दे दूंगा',
    'खुदकुशी के अलावा कोई रास्ता नहीं',
    'अपने आप को मार दूंगा',
    'मैं मरना चाहती हूँ',
    'खुद को खत्म कर लूंगा',
    'मैं जीना नहीं चाहता',
    // romanised / Hinglish — for many users this is the primary input mode
    'yaar mujhe marna hai ab',
    'bas ab marna hai',
    'ab to bas mar jaana hai',
    'jeene ka mann nahi karta',
    'main jeena nahi chahta',
    'zinda nahi rehna mujhe',
    'khudkushi kar lunga',
    'sab khatam kar dunga apna',
    'main jaan de dunga',
    'aatmahatya hi ek rasta hai'
  ],
  'bn-IN': [
    'আমি আত্মহত্যা করতে চাই',
    'আমি মরতে চাই',
    'আর বাঁচতে চাই না',
    'নিজেকে শেষ করে দেব',
    'আমি মরে যেতে চাই',
    'ami morte chai',
    'bachte chai na ar',
    'atmahatya chara upay nei'
  ],
  'gu-IN': [
    'મારે આપઘાત કરવો છે',
    'મારે મરવું છે',
    'મારે જીવવું નથી',
    'હું આત્મહત્યા કરીશ',
    'મારે જીવવા નથી માંગતો',
    'mane marvu chhe',
    'jeevavu nathi have',
    'aapghat kari lais'
  ],
  'kn-IN': [
    'ನಾನು ಆತ್ಮಹತ್ಯೆ ಮಾಡಿಕೊಳ್ಳುತ್ತೇನೆ',
    'ನನಗೆ ಸಾಯಬೇಕು',
    'ಬದುಕಲು ಇಷ್ಟವಿಲ್ಲ',
    'ನನಗೆ ಸಾಯಲು ಬಯಸುತ್ತೇನೆ',
    'ಇನ್ನು ಬದುಕಬೇಕು ಅನಿಸುತ್ತಿಲ್ಲ',
    'nanage saayabeku',
    'badukalu ishtavilla',
    'aatmahatye madikolluttene'
  ],
  'ml-IN': [
    'എനിക്ക് ആത്മഹത്യ ചെയ്യണം',
    'എനിക്ക് മരിക്കണം',
    'ജീവിക്കാൻ വയ്യ',
    'മരിക്കാൻ ആഗ്രഹമുണ്ട്',
    'ജീവിക്കാൻ താൽപ്പര്യമില്ല',
    'enikku marikkanam',
    'jeevikkan vayya',
    'atmahatya cheyyanam'
  ],
  'mr-IN': [
    'मला आत्महत्या करायची आहे',
    'मला मरायचं आहे',
    'मला जगायचं नाही',
    'आता जगावंसं वाटत नाही',
    'मला मरायचे आहे',
    'mala maraycha ahe',
    'jagaycha nahi mala'
  ],
  'od-IN': [
    'ମୁଁ ଆତ୍ମହତ୍ୟା କରିବି',
    'ମୁଁ ମରିବାକୁ ଚାହେଁ',
    'ମୁଁ ବଞ୍ଚିବାକୁ ଚାହେଁ ନାହିଁ',
    'ନିଜକୁ ଶେଷ କରିଦେବି',
    'mu maribaku chahen',
    'banchibaku chahen nahin',
    'atmahatya kariba'
  ],
  'pa-IN': [
    'ਮੈਂ ਖੁਦਕੁਸ਼ੀ ਕਰਨੀ ਹੈ',
    'ਮੈਂ ਆਤਮ ਹੱਤਿਆ ਕਰਾਂਗਾ',
    'ਮੈਂ ਮਰਨਾ ਚਾਹੁੰਦਾ ਹਾਂ',
    'ਮੈਂ ਜੀਣਾ ਨਹੀਂ ਚਾਹੁੰਦਾ',
    'ਮੈਂ ਮਰ ਜਾਣਾ ਚਾਹੁੰਦਾ ਹਾਂ',
    'main khudkushi kar lawanga',
    'marna chahunda haan',
    'jeena nahi chahunda'
  ],
  'ta-IN': [
    'நான் தற்கொலை செய்ய போகிறேன்',
    'எனக்கு சாக வேண்டும்',
    'எனக்கு சாகணும்',
    'வாழ விரும்பவில்லை',
    'நான் இறக்க வேண்டும்',
    'உயிரை விட்டு விடுவேன்',
    // the audit names this exact romanisation as a miss in the old detector
    'enakku saaganum',
    'saaga venum ippo',
    'tharkolai pannika poren',
    'vaazha virumbavillai'
  ],
  'te-IN': [
    'నేను ఆత్మహత్య చేసుకుంటాను',
    'నాకు చనిపోవాలని ఉంది',
    'చావాలని ఉంది',
    'బతకాలని లేదు',
    'బ్రతకాలని లేదు ఇంక',
    'naaku chanipovalani undi',
    'batakalani ledu',
    'aatmahatya chesukuntanu'
  ],
  'es-ES': [
    'quiero morirme ya',
    'me quiero matar',
    'estoy pensando en el suicidio',
    'no quiero vivir más',
    'quiero acabar con mi vida',
    'pienso en quitarme la vida',
    'quiero hacerme daño'
  ],
  'fr-FR': [
    'je veux mourir',
    'je pense à me suicider',
    'je veux en finir',
    'je ne veux plus vivre',
    'je veux mettre fin à mes jours',
    'je veux me faire du mal',
    'des pensées suicidaires depuis des mois'
  ],
  'de-DE': [
    'ich will sterben',
    'ich denke an selbstmord',
    'ich will mich umbringen',
    'ich will nicht mehr leben',
    'ich will mir das leben nehmen',
    'ich will mich selbst verletzen',
    'gedanken an suizid'
  ],
  'pt-BR': [
    'quero morrer',
    'quero me matar',
    'penso em suicídio',
    'não quero viver mais',
    'quero acabar com a minha vida',
    'quero me machucar'
  ],
  'it-IT': [
    'voglio morire',
    'penso al suicidio',
    'voglio uccidermi',
    'voglio farla finita',
    'non voglio vivere più',
    'voglio farmi del male',
    'ho pensato di ammazzarmi'
  ],
  'ar-SA': [
    'أريد أن أموت',
    'أفكر في الانتحار',
    'سوف أقتل نفسي',
    'لا أريد العيش',
    'أريد أن أنهي حياتي',
    'أريد أن أؤذي نفسي'
  ],
  'zh-CN': [
    '我想死',
    '我想自杀',
    '我不想活了',
    '我想结束生命',
    '我想伤害自己'
  ],
  'ja-JP': [
    '死にたい',
    '自殺を考えている',
    '消えたい',
    'もう生きたくない',
    '自分を傷つけたい'
  ],
  'ko-KR': [
    '죽고 싶다',
    '자살하고 싶어',
    '살기 싫다',
    '사라지고 싶어',
    '자해를 했다'
  ],
  'ru-RU': [
    'я хочу умереть',
    'думаю о самоубийстве',
    'мысли о суициде',
    'хочу покончить с собой',
    'я не хочу жить',
    'хочу причинить себе вред'
  ],
  'id-ID': [
    'saya ingin mati',
    'aku mau mati saja',
    'saya berpikir bunuh diri',
    'tidak ingin hidup lagi',
    'ingin mengakhiri hidup',
    'ingin menyakiti diri sendiri'
  ],
  'tr-TR': [
    'ölmek istiyorum',
    'intihar etmeyi düşünüyorum',
    'kendimi öldürmek istiyorum',
    'yaşamak istemiyorum',
    'kendime zarar vermek istiyorum'
  ]
};

console.log('\nCrisis detection — positives (must all be caught)');

for (const [language, phrases] of Object.entries(MUST_DETECT)) {
  const missed = phrases.filter((phrase) => !detectCrisisLanguage(phrase));
  check(
    `  ${language}: ${phrases.length} phrases`,
    missed.length === 0,
    missed.length ? `MISSED ${missed.length}: ${missed.map((m) => JSON.stringify(m)).join(', ')}` : ''
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Negatives — these must NOT trip the guard                               */
/* -------------------------------------------------------------------------- */

/**
 * The cost of a false positive is not zero. Interrupting someone who is venting
 * about a deadline with a suicide helpline banner is patronising, it teaches
 * them the feature is broken, and the next time it fires they will ignore it.
 * These fixtures are the guard against the patterns being widened carelessly.
 */
const MUST_NOT_DETECT = [
  // English idiom and hyperbole
  'this deadline is killing me',
  'i am dying of boredom in this lecture',
  'my feet are killing me after that walk',
  'i could kill for a coffee right now',
  'that presentation killed me',
  'i am dead tired today',
  'this homework is the death of me',
  'i am so done with this assignment',
  'i feel really low and stressed about exams',
  'i am anxious about the results tomorrow',
  // explicit negation of the crisis phrase
  "i don't want to die, i just want this to stop",
  'i do not want to die',
  // third-person, academic and news contexts
  'we studied suicide prevention in psychology class',
  'my essay is about suicide rates in india',
  // other languages — negation and idiom
  'no quiero morir, solo quiero descansar',
  'não quero morrer',
  'non voglio morire',
  'я не хочу умереть',
  'tidak ingin mati',
  'ölmek istemiyorum',
  'je ne veux pas mourir',
  'ich will nicht sterben',
  // Hinglish idiom that shares vocabulary with the real patterns
  'yaar main to mar gaya haste haste',
  'itna kaam hai mar jaunga kya majak hai',
  // "kms" is kilometres far more often than it is slang, in this audience
  'i drove 500 kms today and i am exhausted',
  'the school is 8 kms away from my house',
  'we walked 3 kms to reach the exam centre',
  // empty and whitespace
  '',
  '   '
];

console.log('\nCrisis detection — negatives (must NOT fire)');

const falsePositives = MUST_NOT_DETECT.filter((phrase) => detectCrisisLanguage(phrase));
check(
  `  ${MUST_NOT_DETECT.length} benign phrases stay quiet`,
  falsePositives.length === 0,
  falsePositives.length
    ? `FIRED on ${falsePositives.length}: ${falsePositives
        .map((p) => `${JSON.stringify(p)} → ${inspectCrisisLanguage(p).language}`)
        .join(', ')}`
    : ''
);

/* -------------------------------------------------------------------------- */
/* 3. Coverage — the checks that stop this file rotting                       */
/* -------------------------------------------------------------------------- */

console.log('\nCoverage');

// Every advertised language has patterns. Adding a language to the catalogue
// without adding patterns here is the exact failure this module exists to
// prevent, so it breaks the build rather than a person.
const uncovered = LANGUAGES.filter((entry) => !COVERED_LANGUAGES.includes(entry.code));
check(
  `  all ${LANGUAGES.length} catalogue languages have patterns`,
  uncovered.length === 0,
  uncovered.length ? `missing: ${uncovered.map((e) => e.code).join(', ')}` : ''
);

// Every language has positive fixtures too — patterns nobody tested are not
// coverage, they are a claim.
const untested = COVERED_LANGUAGES.filter((code) => !MUST_DETECT[code]?.length);
check(
  `  all ${COVERED_LANGUAGES.length} pattern blocks have fixtures`,
  untested.length === 0,
  untested.length ? `no fixtures: ${untested.join(', ')}` : ''
);

// Every individual pattern fires on at least one fixture. This is what catches
// a regex broken by a bad paste, a mojibake'd script, or a leading  before a
// non-ASCII letter — all of which are invisible in production and permanently
// dead in effect.
const allFixtures = Object.values(MUST_DETECT).flat();
const deadPatterns = [];

for (const [layer, dictionary] of [['intent', INTENT_PATTERNS], ['keyword', KEYWORD_PATTERNS]]) {
  for (const [language, patterns] of Object.entries(dictionary)) {
    patterns.forEach((pattern, index) => {
      if (!allFixtures.some((phrase) => pattern.test(phrase))) {
        deadPatterns.push(`${layer}:${language}[${index}] ${pattern}`);
      }
    });
  }
}

const patternCount =
  Object.values(INTENT_PATTERNS).flat().length + Object.values(KEYWORD_PATTERNS).flat().length;

check(
  `  all ${patternCount} patterns matched by a fixture`,
  deadPatterns.length === 0,
  deadPatterns.length ? `never match: ${deadPatterns.join(' | ')}` : ''
);

// Both layers cover every language. A language with intent patterns but no
// keyword patterns misses "I have been thinking about suicide"; the reverse
// misses everything except the noun.
const keywordGaps = COVERED_LANGUAGES.filter((code) => !KEYWORD_PATTERNS[code]?.length);
check(
  '  every language has both intent and keyword patterns',
  keywordGaps.length === 0,
  keywordGaps.length ? `no keyword patterns: ${keywordGaps.join(', ')}` : ''
);

// The academic guard must suppress a keyword hit and never an intent hit.
check(
  '  academic context suppresses a bare keyword',
  detectCrisisLanguage('my essay is about suicide rates') === false
);
check(
  '  academic context never suppresses stated intent',
  detectCrisisLanguage('i want to kill myself, and i have an essay due tomorrow') === true
);
check(
  '  a suppressed keyword reports no match, not a wrong one',
  inspectCrisisLanguage('we studied suicide prevention in class').matched === false
);

/* -------------------------------------------------------------------------- */
/* 4. The response itself                                                     */
/* -------------------------------------------------------------------------- */

console.log('\nCrisis response');

const english = buildCrisisResponse('en-IN');
check('  is flagged as a crisis turn', english.crisis === true);
check('  carries Tele-MANAS 14416', JSON.stringify(english.helplines).includes('14416'));
check('  carries KIRAN', JSON.stringify(english.helplines).includes('1800-599-0019'));
check('  carries an international directory', JSON.stringify(english.helplines).includes('findahelpline.com'));
check('  English needs no language note', english.languageNote === null);

const tamil = buildCrisisResponse('ta-IN');
check('  unreviewed language falls back to English text', tamil.language === 'en-IN');
check('  and records what was asked for', tamil.requestedLanguage === 'ta-IN');
check('  and explains why in a note', typeof tamil.languageNote === 'string' && tamil.languageNote.length > 0);
check('  and still carries the multilingual helplines', JSON.stringify(tamil.helplines).includes('14416'));

// An unknown code must not throw or produce an empty script.
const unknown = buildCrisisResponse('xx-XX');
check('  unknown language still returns the script', typeof unknown.message === 'string' && unknown.message.length > 0);

/* -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('Crisis coverage is intact.\n');
