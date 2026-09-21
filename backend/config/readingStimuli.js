/**
 * Stimuli for the Reading Check.
 *
 * WHY THESE ARE NOT TRANSLATIONS
 * ------------------------------
 * The obvious way to build this is to write one English battery and translate
 * it. That produces an instrument that measures the wrong thing, and it is the
 * single reason every existing digital dyslexia screener is unsuitable for an
 * Indian child.
 *
 * Devanagari, Bengali, Gujarati, Kannada, Malayalam, Odia, Gurmukhi, Tamil and
 * Telugu are alphasyllabaries — akshara systems, not alphabets. The unit a
 * child decodes is the akshara: a consonant carrying an inherent vowel,
 * modified by matras and fused into conjuncts. An English phoneme-deletion task
 * ("say 'cat' without the /k/") has no clean analogue, because the phoneme is
 * not the unit being manipulated. The characteristic errors of a struggling
 * Indian reader — matra substitution (कि for की), conjunct decomposition failure
 * (क्ष), akshara-level confusion — have no English counterpart at all.
 *
 * This is why NIMHANS built DALI from scratch rather than translating an
 * English instrument, and it is why the published ML screeners do not transfer:
 * the multimodal framework reporting 92.8% accuracy was trained on 70 Czech
 * children. Transplanting those markers onto a Kannada-medium child is not
 * science.
 *
 * So each script here gets stimuli built around its own aksharas.
 *
 * PROVENANCE
 * ----------
 * The RAN item sets are high-frequency base consonants in each script, chosen
 * so that a child who can read at all will know them — RAN measures naming
 * *speed*, and an item the child has to work out measures something else.
 *
 * The passages are original, written to be decodable at the stated grade band
 * and to carry a small amount of meaning so the comprehension questions are
 * answerable. They are NOT from a validated normed instrument, and nothing in
 * this product claims they are; `provisionalNorms` rides along with every
 * result for that reason.
 */

/* -------------------------------------------------------------------------- */
/* Rapid Automatized Naming                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The five items each script's RAN grid is built from.
 *
 * Five, repeated, is the standard RAN design — the task is naming speed under
 * repetition, not vocabulary size. Alphanumeric stimuli outperform colours and
 * objects by about r = .13, so these are aksharas and digits rather than
 * pictures.
 *
 * English uses digits rather than letters deliberately: digit RAN is the
 * best-evidenced variant, and digits are equally familiar to a child who is
 * being schooled in any medium.
 */
const RAN_ITEMS = {
  Latn: ['2', '4', '6', '7', '9'],
  Deva: ['क', 'म', 'र', 'स', 'त'],
  Beng: ['ক', 'ম', 'র', 'স', 'ত'],
  Gujr: ['ક', 'મ', 'ર', 'સ', 'ત'],
  Knda: ['ಕ', 'ಮ', 'ರ', 'ಸ', 'ತ'],
  Mlym: ['ക', 'മ', 'ര', 'സ', 'ത'],
  Orya: ['କ', 'ମ', 'ର', 'ସ', 'ତ'],
  Guru: ['ਕ', 'ਮ', 'ਰ', 'ਸ', 'ਤ'],
  Taml: ['க', 'ம', 'ர', 'ச', 'த'],
  Telu: ['క', 'మ', 'ర', 'స', 'త']
};

/**
 * Build a RAN grid: `rows` x `columns` items drawn from the script's set.
 *
 * Two constraints, both of which change what the task measures:
 *
 *   - No item may sit next to a copy of itself, horizontally or vertically. A
 *     repeated pair is named as a chunk rather than as two retrievals, which
 *     inflates the rate for the child who happens to get one.
 *   - Every item appears an equal number of times, so one child is not handed
 *     a grid weighted toward an item they find easier.
 *
 * Deterministic given a seed, so a retest can be given the *same* grid (to
 * measure change) or a different one (to avoid practice effects) by choice
 * rather than by accident.
 */
function buildRanGrid({ script = 'Deva', rows = 5, columns = 10, seed = Date.now() } = {}) {
  const items = RAN_ITEMS[script] || RAN_ITEMS.Deva;
  const total = rows * columns;

  // Small deterministic PRNG — mulberry32. Math.random cannot be seeded, and an
  // unseeded grid cannot be reproduced for a retest.
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Equal counts, then shuffled.
  const pool = [];
  for (let i = 0; i < total; i += 1) pool.push(items[i % items.length]);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Repair adjacency by swapping any offending cell forward to a legal partner.
  const at = (index) => pool[index];
  const conflicts = (index, value) => {
    const left = index % columns === 0 ? null : at(index - 1);
    const above = index < columns ? null : at(index - columns);
    return value === left || value === above;
  };

  for (let index = 0; index < pool.length; index += 1) {
    if (!conflicts(index, pool[index])) continue;
    for (let other = index + 1; other < pool.length; other += 1) {
      if (!conflicts(index, pool[other])) {
        [pool[index], pool[other]] = [pool[other], pool[index]];
        break;
      }
    }
  }

  const grid = [];
  for (let r = 0; r < rows; r += 1) grid.push(pool.slice(r * columns, (r + 1) * columns));

  return { script, rows, columns, seed, items: pool, grid };
}

/* -------------------------------------------------------------------------- */
/* Oral reading passages                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Grade-levelled passages, by language.
 *
 * `grades` is the band a passage suits. Two comprehension questions each,
 * answerable from the passage alone — a question that needs outside knowledge
 * measures background, not reading.
 *
 * Kept short on purpose. The probe is 60 seconds; a passage a child cannot
 * finish in that window is fine (the scorer treats the tail as not-reached),
 * but one they finish in fifteen seconds gives a noisy rate.
 */
const PASSAGES = {
  'en-IN': [
    {
      id: 'en-g1-well',
      grades: [1, 2],
      title: 'The Well',
      text: 'The sun came up over the small village. A girl went to the well with a pot. The water was cold and clear. She filled the pot and walked back home. Her mother was happy to see her.',
      questions: [
        { q: 'Where did the girl go?', a: 'to the well' },
        { q: 'What was the water like?', a: 'cold and clear' }
      ]
    },
    {
      id: 'en-g3-kite',
      grades: [3, 4],
      title: 'The Kite',
      text: 'Ravi had saved money for weeks to buy a kite. On Sunday morning he took it to the open field behind the school. The wind was strong and the kite climbed quickly above the trees. A younger boy watched him from the edge of the field, so Ravi called him over and showed him how to hold the string.',
      questions: [
        { q: 'How long had Ravi saved for the kite?', a: 'for weeks' },
        { q: 'What did Ravi do when he saw the younger boy?', a: 'called him over and showed him how to hold the string' }
      ]
    },
    {
      id: 'en-g5-bridge',
      grades: [5, 6, 7, 8],
      title: 'The Bridge',
      text: 'The old bridge across the river had been closed for months, and the villagers were tired of walking the long way round. A group of them decided not to wait any longer. They gathered rope, timber and whatever tools they could find, and worked through two weekends until the crossing was safe again. The engineer who inspected it afterwards said it was rougher than regulations allowed, but sound.',
      questions: [
        { q: 'Why were the villagers tired?', a: 'walking the long way round' },
        { q: 'What did the engineer say about the bridge?', a: 'rougher than regulations allowed but sound' }
      ]
    }
  ],

  'hi-IN': [
    {
      id: 'hi-g1-suraj',
      grades: [1, 2],
      title: 'सूरज',
      text: 'सूरज निकला और चिड़िया गाने लगी। एक लड़की मटका लेकर कुएँ पर गई। पानी ठंडा और साफ था। वह मटका भरकर घर लौट आई। माँ उसे देखकर खुश हुई।',
      questions: [
        { q: 'लड़की कहाँ गई?', a: 'कुएँ पर' },
        { q: 'पानी कैसा था?', a: 'ठंडा और साफ' }
      ]
    },
    {
      id: 'hi-g3-patang',
      grades: [3, 4],
      title: 'पतंग',
      text: 'रवि ने कई हफ़्तों तक पैसे जोड़कर एक पतंग खरीदी। रविवार की सुबह वह उसे स्कूल के पीछे वाले मैदान में ले गया। हवा तेज़ थी और पतंग जल्दी ही पेड़ों से ऊपर चली गई। एक छोटा लड़का उसे दूर से देख रहा था, इसलिए रवि ने उसे बुलाया और डोर पकड़ना सिखाया।',
      questions: [
        { q: 'रवि ने पतंग कैसे खरीदी?', a: 'कई हफ़्तों तक पैसे जोड़कर' },
        { q: 'रवि ने छोटे लड़के के साथ क्या किया?', a: 'उसे बुलाया और डोर पकड़ना सिखाया' }
      ]
    }
  ],

  'gu-IN': [
    {
      id: 'gu-g1-kuvo',
      grades: [1, 2],
      title: 'સૂરજ',
      text: 'સૂરજ ઊગ્યો અને પક્ષીઓ ગાવા લાગ્યાં. એક છોકરી ઘડો લઈને કૂવા પર ગઈ. પાણી ઠંડું અને ચોખ્ખું હતું. તેણે ઘડો ભરીને ઘરે પાછી આવી. માતા તેને જોઈને ખુશ થઈ.',
      questions: [
        { q: 'છોકરી ક્યાં ગઈ?', a: 'કૂવા પર' },
        { q: 'પાણી કેવું હતું?', a: 'ઠંડું અને ચોખ્ખું' }
      ]
    }
  ],

  'ta-IN': [
    {
      id: 'ta-g1-kinaru',
      grades: [1, 2],
      title: 'சூரியன்',
      text: 'சூரியன் உதித்தது, பறவைகள் பாட ஆரம்பித்தன. ஒரு பெண் குடத்துடன் கிணற்றுக்குச் சென்றாள். தண்ணீர் குளிர்ச்சியாகவும் தெளிவாகவும் இருந்தது. அவள் குடத்தை நிரப்பி வீட்டுக்குத் திரும்பினாள். அம்மா அவளைப் பார்த்து மகிழ்ந்தாள்.',
      questions: [
        { q: 'பெண் எங்கே சென்றாள்?', a: 'கிணற்றுக்கு' },
        { q: 'தண்ணீர் எப்படி இருந்தது?', a: 'குளிர்ச்சியாகவும் தெளிவாகவும்' }
      ]
    }
  ],

  'kn-IN': [
    {
      id: 'kn-g1-bavi',
      grades: [1, 2],
      title: 'ಸೂರ್ಯ',
      text: 'ಸೂರ್ಯ ಉದಯಿಸಿದನು ಮತ್ತು ಹಕ್ಕಿಗಳು ಹಾಡಲು ಪ್ರಾರಂಭಿಸಿದವು. ಒಬ್ಬ ಹುಡುಗಿ ಕೊಡದೊಂದಿಗೆ ಬಾವಿಗೆ ಹೋದಳು. ನೀರು ತಂಪಾಗಿಯೂ ಶುದ್ಧವಾಗಿಯೂ ಇತ್ತು. ಅವಳು ಕೊಡವನ್ನು ತುಂಬಿಸಿ ಮನೆಗೆ ಮರಳಿದಳು. ತಾಯಿ ಅವಳನ್ನು ನೋಡಿ ಸಂತೋಷಪಟ್ಟಳು.',
      questions: [
        { q: 'ಹುಡುಗಿ ಎಲ್ಲಿಗೆ ಹೋದಳು?', a: 'ಬಾವಿಗೆ' },
        { q: 'ನೀರು ಹೇಗಿತ್ತು?', a: 'ತಂಪಾಗಿಯೂ ಶುದ್ಧವಾಗಿಯೂ' }
      ]
    }
  ]
};

/* -------------------------------------------------------------------------- */
/* Nonword reading                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Pronounceable non-words.
 *
 * The cleanest separation of decoding from everything else available: a real
 * word can be recognised by sight or guessed from context, so a child with a
 * large sight vocabulary and poor decoding reads real words far better than
 * they read. A non-word can only be decoded.
 *
 * Each is legal in its script — real aksharas in combinations that obey the
 * script's rules but do not form a word.
 */
const NONWORDS = {
  Latn: ['blim', 'trast', 'nodel', 'shup', 'grennit', 'plost', 'chibe', 'flemp'],
  Deva: ['बिलम', 'तरस', 'नोदल', 'शुप', 'ग्रेनित', 'पलोस', 'चिबे', 'फ्लेम'],
  Gujr: ['બિલમ', 'તરસ', 'નોદલ', 'શુપ', 'ગ્રેનિત', 'પલોસ'],
  Taml: ['பிலம்', 'தரஸ்', 'நோதல்', 'சுப்', 'கிரெனித்', 'பலோஸ்'],
  Knda: ['ಬಿಲಮ್', 'ತರಸ್', 'ನೋದಲ್', 'ಶುಪ್', 'ಗ್ರೆನಿತ್', 'ಪಲೋಸ್'],
  Telu: ['బిలమ్', 'తరస్', 'నోదల్', 'శుప్', 'గ్రెనిత్', 'పలోస్'],
  Beng: ['বিলম', 'তরস', 'নোদল', 'শুপ', 'গ্রেনিত', 'পলোস'],
  Mlym: ['ബിലം', 'തരസ്', 'നോദൽ', 'ശുപ്', 'ഗ്രെനിത്'],
  Orya: ['ବିଲମ', 'ତରସ', 'ନୋଦଲ', 'ଶୁପ', 'ଗ୍ରେନିତ'],
  Guru: ['ਬਿਲਮ', 'ਤਰਸ', 'ਨੋਦਲ', 'ਸ਼ੁਪ', 'ਗ੍ਰੇਨਿਤ']
};

/* -------------------------------------------------------------------------- */
/* Akshara deletion                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Akshara-deletion items: "say कमल without the क".
 *
 * The akshara-level analogue of English phoneme deletion, and the reason this
 * battery is not a translated English one. The unit removed is a whole
 * consonant-core syllable, because that is the unit an akshara reader
 * manipulates.
 *
 * Delivered as spoken prompts through TTS and answered by voice, so a child who
 * cannot yet read the instructions can still do the task — which is the point,
 * since the children this is looking for are exactly the ones who cannot read
 * the instructions.
 */
const DELETION_ITEMS = {
  Deva: [
    { word: 'कमल', remove: 'क', answer: 'मल' },
    { word: 'सागर', remove: 'सा', answer: 'गर' },
    { word: 'नदी', remove: 'न', answer: 'दी' },
    { word: 'पतंग', remove: 'प', answer: 'तंग' },
    { word: 'बादल', remove: 'बा', answer: 'दल' }
  ],
  Taml: [
    { word: 'கமலம்', remove: 'க', answer: 'மலம்' },
    { word: 'நதி', remove: 'ந', answer: 'தி' },
    { word: 'மரம்', remove: 'ம', answer: 'ரம்' }
  ],
  Knda: [
    { word: 'ಕಮಲ', remove: 'ಕ', answer: 'ಮಲ' },
    { word: 'ನದಿ', remove: 'ನ', answer: 'ದಿ' },
    { word: 'ಮರ', remove: 'ಮ', answer: 'ರ' }
  ],
  Gujr: [
    { word: 'કમળ', remove: 'ક', answer: 'મળ' },
    { word: 'નદી', remove: 'ન', answer: 'દી' }
  ],
  Latn: [
    { word: 'sunlight', remove: 'sun', answer: 'light' },
    { word: 'basket', remove: 'bas', answer: 'ket' },
    { word: 'window', remove: 'win', answer: 'dow' }
  ]
};

/* -------------------------------------------------------------------------- */

/** Passages suitable for a grade, falling back to the nearest available band. */
function passagesFor(languageCode, grade = 4) {
  const all = PASSAGES[languageCode] || PASSAGES['en-IN'];
  const matching = all.filter((passage) => passage.grades.includes(Number(grade)));
  return matching.length ? matching : all;
}

/** One passage for a grade, chosen deterministically from an index. */
function passageFor(languageCode, grade = 4, index = 0) {
  const candidates = passagesFor(languageCode, grade);
  return candidates[Math.abs(Number(index) || 0) % candidates.length];
}

function nonwordsFor(script = 'Deva') {
  return NONWORDS[script] || NONWORDS.Latn;
}

function deletionItemsFor(script = 'Deva') {
  return DELETION_ITEMS[script] || DELETION_ITEMS.Latn;
}

/** Which scripts have a full battery, for the language picker on the screener. */
function supportedScripts() {
  return Object.keys(RAN_ITEMS);
}

module.exports = {
  RAN_ITEMS,
  PASSAGES,
  NONWORDS,
  DELETION_ITEMS,
  buildRanGrid,
  passagesFor,
  passageFor,
  nonwordsFor,
  deletionItemsFor,
  supportedScripts
};
