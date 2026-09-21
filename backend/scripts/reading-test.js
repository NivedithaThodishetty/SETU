/**
 * Reading-assessment scoring suite.
 *
 * `npm run test:reading` in backend/. No key, no network, no database.
 *
 * The scoring here is the only thing in SETU that produces a number about a
 * child, so it gets the same treatment as the crisis detector: the failure
 * modes are enumerated as fixtures, and each one exists because it is a
 * plausible way to be wrong in a way that harms a real reader.
 *
 * The four that matter most:
 *
 *   1. A skipped word must not misalign everything after it. Naive positional
 *      comparison scores a near-perfect reader at zero.
 *   2. Running out of time must not read as errors. A slow but accurate reader
 *      would otherwise be banded "worth assessment" for reading carefully.
 *   3. Fast-and-inaccurate must not pass. Guessing from first letters is a
 *      classic compensatory pattern that posts a good rate while decoding badly.
 *   4. Matras must survive normalisation. कि and का are different aksharas, and
 *      confusing them is one of the characteristic error patterns this whole
 *      feature exists to detect — normalising them away erases the signal.
 */

const {
  BANDS,
  BAND_COPY,
  RESULT_DISCLAIMER,
  normaliseWord,
  tokenise,
  alignSequences,
  scoreOralReading,
  scoreRan,
  combineBands
} = require('../services/readingAssessment');

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
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

console.log('\nNormalisation');

check('lowercases and strips punctuation', normaliseWord('Cat,') === 'cat');
check('strips the Devanagari danda', normaliseWord('गया।') === 'गया');
check('handles empty input', normaliseWord(null) === '');

/*
 * The load-bearing assertion in this file.
 *
 * कि (ki) and का (kaa) are the same base consonant with different matras, and
 * they are different aksharas — not accented variants of one letter. A reader
 * who says का where the page says कि has made exactly the error this tool is
 * built to notice. If normalisation folded them together, that error would score
 * as correct and the child would be told there is no concern.
 */
check('कि and का stay distinct after normalisation', normaliseWord('कि') !== normaliseWord('का'));
check('Tamil ki and kaa stay distinct', normaliseWord('கி') !== normaliseWord('கா'));
check('Kannada ki and kaa stay distinct', normaliseWord('ಕಿ') !== normaliseWord('ಕಾ'));

// NFC composition means two encodings of the same akshara still compare equal.
check(
  'the same akshara in two encodings compares equal',
  normaliseWord('कि') === normaliseWord('कि'.normalize('NFD'))
);

check('tokenise splits on whitespace and drops empties', tokenise('  the   cat  sat ').length === 3);

/* -------------------------------------------------------------------------- */
/* Alignment                                                                  */
/* -------------------------------------------------------------------------- */

console.log('\nAlignment');

{
  const a = alignSequences(['the', 'cat', 'sat'], ['the', 'cat', 'sat']);
  check('a perfect read has no errors', a.correct === 3 && a.substitutions === 0 && a.omissions === 0);
}

{
  const a = alignSequences(['the', 'cat', 'sat', 'on', 'it'], ['the', 'cat', 'on', 'it']);
  check('one skipped word costs exactly one omission', a.omissions === 1, `omissions=${a.omissions}`);
  check('and the rest still aligns', a.correct === 4, `correct=${a.correct}`);
}

{
  const a = alignSequences(['the', 'cat', 'sat'], ['the', 'cot', 'sat']);
  check('a misread word is a substitution', a.substitutions === 1 && a.correct === 2);
}

{
  const a = alignSequences(['the', 'cat'], ['the', 'big', 'cat']);
  check('an extra spoken word is an insertion', a.insertions === 1 && a.correct === 2);
}

/* -------------------------------------------------------------------------- */
/* Oral reading probe                                                         */
/* -------------------------------------------------------------------------- */

console.log('\nOral reading probe');

const PASSAGE = 'the sun came up over the small village and the birds began to sing loudly';

{
  // 15 words, perfectly, in 30 seconds -> 30 wcpm.
  const r = scoreOralReading({
    passage: PASSAGE,
    transcript: PASSAGE,
    durationMs: 30000,
    grade: 4
  });
  check('a perfect read is 100% accurate', r.accuracy === 1, `accuracy=${r.accuracy}`);
  check('wcpm is words-correct scaled to a minute', r.wcpm === 30, `wcpm=${r.wcpm}`);
  check('no words counted as missed', r.missedWords.length === 0);
}

{
  /*
   * FAILURE MODE 2 — ran out of time.
   *
   * Read the first 8 of 15 words perfectly, then stopped. The unread tail must
   * be "not reached", not seven omissions. If it were scored as errors, a slow
   * but perfectly accurate reader would land at 53% accuracy and be banded
   * "worth a professional assessment" for reading carefully.
   */
  const r = scoreOralReading({
    passage: PASSAGE,
    transcript: 'the sun came up over the small village',
    durationMs: 60000,
    grade: 2
  });
  check('the unread tail is reported as not-reached', r.notReached === 7, `notReached=${r.notReached}`);
  check('accuracy reflects only what was attempted', r.accuracy === 1, `accuracy=${r.accuracy}`);
  check('the tail is not charged as errors', r.errors === 0, `errors=${r.errors}`);
  check('wcpm still reflects the slow pace', r.wcpm === 8, `wcpm=${r.wcpm}`);
}

{
  /*
   * FAILURE MODE 2b — stopped early AND misread some of what they did read.
   *
   * The 2a fixture above was too easy and let a real bug through: because its
   * transcript was a perfect prefix, the hypothesis was exhausted at the tail
   * and no substitution could possibly land there. This one misreads three
   * words before stopping, which lets a trailing substitution tie with an
   * omission — and under the original tie-breaking the passage's LAST word was
   * paired with the child's LAST spoken word, so nothing registered as unread
   * and a careful reader scored 29% accuracy instead of 77%.
   *
   * 38-word passage, 13 words attempted, 3 of them misread.
   */
  const passage =
    'The sun came up over the small village. A girl went to the well with a pot. ' +
    'The water was cold and clear. She filled the pot and walked back home. ' +
    'Her mother was happy to see her.';

  const r = scoreOralReading({
    passage,
    transcript: 'The sun come up over the small village A girl want to the wall',
    durationMs: 60000,
    grade: 2
  });

  check('a partial read with misreads still detects the stop point', r.notReached === 24, `notReached=${r.notReached}`);
  check('only the attempted words are scored', r.wordsAttempted === 14, `attempted=${r.wordsAttempted}`);
  check('the three misreads are the only errors', r.errors === 3, `errors=${r.errors}`);
  check('accuracy reflects the words they read', Math.abs(r.accuracy - 11 / 14) < 0.01, `accuracy=${r.accuracy}`);
  check('unread text is not charged as omissions', r.errorBreakdown.omissions === 0, `omissions=${r.errorBreakdown.omissions}`);
  check(
    'the misreads are attributed at the right words',
    r.missedWords.every((w) => ['came', 'went', 'well'].includes(w.expected)),
    JSON.stringify(r.missedWords)
  );
  check(
    'the unread tail is not listed as missed words',
    r.missedWords.length === 3,
    `missedWords=${r.missedWords.length}`
  );
}

{
  /*
   * FAILURE MODE 1 — a skipped word early on.
   *
   * "sun" is dropped from position 2. Everything after it shifts by one. A
   * positional comparison would mark almost every remaining word wrong.
   */
  const r = scoreOralReading({
    passage: PASSAGE,
    transcript: 'the came up over the small village and the birds began to sing loudly',
    durationMs: 30000,
    grade: 4
  });
  check('an early omission does not cascade', r.wordsCorrect === 14, `wordsCorrect=${r.wordsCorrect}`);
  check('and is charged exactly once', r.errors === 1, `errors=${r.errors}`);
}

{
  /*
   * FAILURE MODE 3 — fast and inaccurate.
   *
   * Read at a good clip but got a third of the words wrong: the guessing-from-
   * first-letters pattern. Rate alone would pass this; accuracy must gate it.
   */
  const r = scoreOralReading({
    passage: PASSAGE,
    transcript: 'the sun car up over the small village and the bird begin to sit loud',
    durationMs: 10000,
    grade: 2
  });
  check('a fast inaccurate read is caught', r.band === BANDS.refer, `band=${r.band} accuracy=${r.accuracy} wcpm=${r.wcpm}`);
  check('and its accuracy is reported honestly', r.accuracy < 0.9, `accuracy=${r.accuracy}`);
}

{
  // A strong reader for their grade lands clear.
  const r = scoreOralReading({
    passage: PASSAGE,
    transcript: PASSAGE,
    durationMs: 6000,
    grade: 2
  });
  check('a strong read bands clear', r.band === BANDS.clear, `band=${r.band} wcpm=${r.wcpm}`);
}

{
  // Comprehension is carried through when supplied, and null when not.
  const withQ = scoreOralReading({
    passage: PASSAGE, transcript: PASSAGE, durationMs: 30000, grade: 4,
    comprehensionCorrect: 3, comprehensionTotal: 4
  });
  check('comprehension is reported as a proportion', withQ.comprehension.proportion === 0.75);

  const withoutQ = scoreOralReading({ passage: PASSAGE, transcript: PASSAGE, durationMs: 30000 });
  check('comprehension is null when not asked', withoutQ.comprehension === null);
}

{
  let threw = false;
  try {
    scoreOralReading({ passage: '', transcript: 'anything', durationMs: 1000 });
  } catch (error) {
    threw = error.status === 400;
  }
  check('an empty passage is rejected, not scored as zero', threw);
}

{
  // Silence must not crash, and must not look like a good read.
  const r = scoreOralReading({ passage: PASSAGE, transcript: '', durationMs: 30000, grade: 4 });
  check('an empty transcript scores zero rather than throwing', r.wcpm === 0 && r.accuracy === 0);
  check('and bands for assessment', r.band === BANDS.refer);
}

/* -------------------------------------------------------------------------- */
/* Devanagari end-to-end                                                      */
/* -------------------------------------------------------------------------- */

console.log('\nDevanagari scoring');

{
  const hindi = 'सूरज निकला और चिड़िया गाने लगी';
  const perfect = scoreOralReading({ passage: hindi, transcript: hindi, durationMs: 12000, grade: 3 });
  check('a perfect Hindi read is 100% accurate', perfect.accuracy === 1, `accuracy=${perfect.accuracy}`);

  /*
   * A matra substitution — निकला read as निकली — must register as an error.
   * This is the assertion that proves the scorer is akshara-aware rather than
   * just Unicode-tolerant.
   */
  const matraError = scoreOralReading({
    passage: hindi,
    transcript: 'सूरज निकली और चिड़िया गाने लगी',
    durationMs: 12000,
    grade: 3
  });
  check('a matra substitution counts as an error', matraError.errors === 1, `errors=${matraError.errors}`);
  check('and is reported as a substitution', matraError.errorBreakdown.substitutions === 1);
}

/* -------------------------------------------------------------------------- */
/* RAN                                                                        */
/* -------------------------------------------------------------------------- */

console.log('\nRapid Automatized Naming');

const RAN_ITEMS = ['क', 'म', 'र', 'स', 'त', 'क', 'र', 'म', 'त', 'स'];

{
  const fast = scoreRan({ items: RAN_ITEMS, transcript: RAN_ITEMS.join(' '), durationMs: 7000 });
  check('fluent naming bands clear', fast.band === BANDS.clear, `band=${fast.band} ips=${fast.itemsPerSecond}`);

  const slow = scoreRan({ items: RAN_ITEMS, transcript: RAN_ITEMS.join(' '), durationMs: 20000 });
  check('slow naming is flagged', slow.band === BANDS.refer, `band=${slow.band} ips=${slow.itemsPerSecond}`);

  /*
   * A trial with many errors is measuring whether the child knows the aksharas,
   * not how fast they name them. Banding that as slow naming would be a
   * misreading of the task, so accuracy short-circuits to "watch" instead.
   */
  const unknown = scoreRan({ items: RAN_ITEMS, transcript: 'क म', durationMs: 6000 });
  check('a low-accuracy trial is not read as slow naming', unknown.band === BANDS.watch, `band=${unknown.band}`);
}

/* -------------------------------------------------------------------------- */
/* Banding and copy                                                           */
/* -------------------------------------------------------------------------- */

console.log('\nBands');

check('two refers combine to refer', combineBands([BANDS.refer, BANDS.refer, BANDS.clear]) === BANDS.refer);
check('one refer plus one watch combines to refer', combineBands([BANDS.refer, BANDS.watch]) === BANDS.refer);
check('one refer alone is watch', combineBands([BANDS.refer, BANDS.clear, BANDS.clear]) === BANDS.watch);
check('two watches combine to watch', combineBands([BANDS.watch, BANDS.watch]) === BANDS.watch);
check('all clear stays clear', combineBands([BANDS.clear, BANDS.clear]) === BANDS.clear);
check('no tasks yields no band', combineBands([]) === null);

/*
 * The regulatory guardrails, asserted as tests.
 *
 * Under CDSCO's function-based guidance, software acquires a medical purpose —
 * and becomes regulated Medical Device Software needing a licence, bias and
 * drift documentation, and Indian-population validation — the moment it claims
 * diagnosis. These assertions are what stop a well-meaning copy edit from
 * walking the product across that line.
 */
console.log('\nRegulatory guardrails');

const allCopy = JSON.stringify(BAND_COPY) + RESULT_DISCLAIMER;

check('no band copy says "dyslexia"', !/dyslex/i.test(allCopy));
check('no band copy says "diagnos" as a claim', !/\bwe diagnos/i.test(allCopy));
check('no band copy reports a percentage', !/\d+\s?%/.test(allCopy));
check('no band copy calls it a test', !/\btest\b/i.test(allCopy));
check('the disclaimer denies being a diagnosis', /not a diagnosis/i.test(RESULT_DISCLAIMER));
check('the disclaimer says it cannot replace a professional', /qualified professional/i.test(RESULT_DISCLAIMER));
check('the disclaimer admits the norms are provisional', /provisional/i.test(RESULT_DISCLAIMER));
check(
  'every band names a concrete next step',
  Object.values(BAND_COPY).every((entry) => entry.nextStep && entry.nextStep.length > 20)
);
check(
  'the refer band says where a real assessment happens',
  /psychologist|RCI|district/i.test(BAND_COPY[BANDS.refer].nextStep)
);

/* -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('Reading assessment scores correctly.\n');
