/**
 * Reading assessment — scoring for the oral reading probe and the Reading Check.
 *
 * WHY THIS EXISTS
 * ---------------
 * SETU measured points, streaks and eleven milestones, and every one of those
 * is a measure of how much the app was used. None was a measure of whether the
 * person reads better, understands more, or finishes more. A streak goes up
 * whether or not the product is helping, which means it cannot be used to
 * iterate — only to add.
 *
 * This module turns a recording of a child reading a passage aloud into two
 * numbers that move only if reading actually changes:
 *
 *   WCPM      words correct per minute — the standard oral reading fluency
 *             measure, and the one with normative data behind it
 *   accuracy  proportion of the attempted words that were read correctly
 *
 * Those same two numbers do double duty. Collected once at onboarding and
 * weekly after, they are the outcome measure. Collected once against a
 * grade-levelled passage, they are one component of the Reading Check screener.
 * Build it well once, use it twice.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a diagnosis, and the vocabulary here is deliberate: this file computes
 * `band`, never `probability`, `score`, or anything with the word dyslexia in
 * it. Under CDSCO's function-based guidance, software acquires a medical
 * purpose — and becomes regulated Medical Device Software — the moment it
 * claims diagnosis, prevention, monitoring or treatment. An educational
 * screener that reports "worth a professional assessment" is outside that line.
 * A tool that reports "87% likely dyslexic" is not, and would need a licence,
 * bias and drift documentation, and Indian-population validation.
 *
 * A NOTE ON THE NORMS
 * -------------------
 * The band boundaries in `NORMS` are provisional and are labelled as such
 * everywhere they surface. They are derived from published English oral-reading
 * fluency percentiles, and there is no equivalent published normative table for
 * WCPM in Devanagari, Kannada or Tamil — partly because the akshara is a
 * different unit from the word, so rate means something subtly different. The
 * honest position, which the UI states, is that these flag children worth a
 * closer look rather than measuring them against a validated standard. Real
 * norms come from running this against a reference standard such as DALI with
 * enough children to build a table, which is validation work, not build work.
 */

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Reduce a word to what counts as "the same word" for scoring.
 *
 * Punctuation and case are stripped because speech-to-text supplies both by
 * guesswork — Sarvam decides where a comma goes, and a child cannot read a
 * comma aloud, so scoring one as an error would penalise the transcriber.
 *
 * Combining marks are deliberately KEPT. In an alphasyllabary the matra is not
 * an accent on a letter, it is what makes कि a different akshara from का — and
 * matra substitution is one of the characteristic error patterns of a
 * struggling Indian reader. Normalising them away, which a naive `NFD` strip
 * would do, would erase precisely the signal this tool exists to detect.
 *
 * NFC rather than NFD for the same reason: it composes to the canonical single
 * form so that two spellings of the same akshara compare equal, without
 * discarding the mark.
 */
function normaliseWord(word) {
  return String(word || '')
    .normalize('NFC')
    .toLowerCase()
    // Strip only punctuation that a reader does not pronounce. The Unicode
    // ranges here are Latin and Indic danda / double danda.
    .replace(/[.,!?;:"'`()[\]{}—–\-…«»“”‘’।॥]/g, '')
    .trim();
}

function tokenise(text) {
  return String(text || '')
    .split(/\s+/)
    .map(normaliseWord)
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Alignment                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Align what was read against what should have been read.
 *
 * A plain "count the matching words" comparison is wrong in the specific way
 * that matters here: a child who skips one word early has every subsequent word
 * misaligned, and would score near zero despite reading almost perfectly. So
 * this is a Levenshtein alignment over word sequences — the standard
 * word-error-rate computation from speech recognition — which recovers from an
 * insertion or omission and charges it once.
 *
 * The distinction between the three error types is not bookkeeping. They mean
 * different things in a reading assessment:
 *
 *   substitution  read a different word — a decoding error, the signal
 *   omission      skipped a word — often line-tracking rather than decoding
 *   insertion     added a word — usually self-correction or the transcriber
 *
 * Returns counts plus the aligned pairs, so a teacher-facing view can show
 * which words were missed rather than only how many.
 *
 * O(n·m) in time and memory. Passages are capped at a few hundred words, so the
 * matrix stays small; a 300×300 grid is trivial and the clarity is worth more
 * than a banded approximation here.
 */
function alignSequences(reference, hypothesis) {
  const n = reference.length;
  const m = hypothesis.length;

  // matrix[i][j] = edit distance between reference[0..i) and hypothesis[0..j)
  const matrix = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= m; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // omission: reference word not spoken
        matrix[i][j - 1] + 1, // insertion: extra spoken word
        matrix[i - 1][j - 1] + cost // match or substitution
      );
    }
  }

  // Walk back through the matrix to recover which operation happened where.
  const pairs = [];
  let correct = 0;
  let substitutions = 0;
  let omissions = 0;
  let insertions = 0;

  /*
   * TIE-BREAKING ORDER MATTERS, and not only cosmetically.
   *
   * Substitution and omission both cost 1, so an optimal path is frequently
   * ambiguous and the order these branches are tested in decides which one the
   * walk-back reports. Checking the diagonal first — the obvious way to write
   * this — produced a real, quiet mis-scoring: for a child who read the first
   * thirteen words of a thirty-eight-word passage and stopped, the walk paired
   * the passage's LAST word with the child's last spoken word as a
   * substitution, because that tied with an omission. The twenty-four words the
   * child never reached then sat in the middle of the alignment as errors
   * rather than at the end as unread, and a slow-but-accurate reader scored 29%
   * accuracy instead of 77%.
   *
   * So a cost-0 diagonal (a genuine match) is taken first and unconditionally,
   * and a cost-1 diagonal (a substitution) is taken LAST — only when neither an
   * omission nor an insertion is on an optimal path. That consumes the child's
   * spoken words at the earliest reference position they can belong to, which
   * is both the correct reading of what happened and what leaves unread text at
   * the tail where it belongs.
   *
   * This never changes the total edit distance, only which of several equally
   * optimal alignments is reported.
   */
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const diagonalCost = i > 0 && j > 0 ? (reference[i - 1] === hypothesis[j - 1] ? 0 : 1) : null;

    // 1. A real match always wins.
    if (diagonalCost === 0 && matrix[i][j] === matrix[i - 1][j - 1]) {
      correct += 1;
      pairs.push({ expected: reference[i - 1], read: hypothesis[j - 1], type: 'correct' });
      i -= 1;
      j -= 1;
      continue;
    }

    // 2. Omission — a passage word with nothing spoken against it.
    if (i > 0 && matrix[i][j] === matrix[i - 1][j] + 1) {
      omissions += 1;
      pairs.push({ expected: reference[i - 1], read: null, type: 'omission' });
      i -= 1;
      continue;
    }

    // 3. Insertion — a spoken word with nothing in the passage against it.
    if (j > 0 && matrix[i][j] === matrix[i][j - 1] + 1) {
      insertions += 1;
      pairs.push({ expected: null, read: hypothesis[j - 1], type: 'insertion' });
      j -= 1;
      continue;
    }

    // 4. Substitution, last.
    substitutions += 1;
    pairs.push({ expected: reference[i - 1], read: hypothesis[j - 1], type: 'substitution' });
    i -= 1;
    j -= 1;
  }

  pairs.reverse();
  return { correct, substitutions, omissions, insertions, pairs };
}

/* -------------------------------------------------------------------------- */
/* Bands                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Provisional WCPM boundaries by school grade.
 *
 * `watch` is the floor for "no concerns right now"; below `refer` is "worth a
 * professional assessment". Derived from published English oral-reading-fluency
 * percentile tables — roughly the 25th and 10th percentiles for mid-year.
 *
 * These are explicitly NOT validated for Indian languages, and every surface
 * that renders a band says so. See the module header.
 */
const NORMS = {
  1: { watch: 30, refer: 15 },
  2: { watch: 60, refer: 35 },
  3: { watch: 85, refer: 55 },
  4: { watch: 100, refer: 70 },
  5: { watch: 110, refer: 80 },
  6: { watch: 120, refer: 90 },
  7: { watch: 125, refer: 95 },
  8: { watch: 130, refer: 100 }
};

const BANDS = {
  clear: 'no-concerns',
  watch: 'worth-watching',
  refer: 'worth-assessment'
};

/**
 * Place a reading against the provisional bands.
 *
 * Accuracy gates the result independently of rate, because the two failure
 * modes look different and only one is caught by speed. A child who reads
 * quickly and inaccurately — guessing from first letters and context, which is
 * a classic compensatory pattern — can post an acceptable WCPM while decoding
 * poorly. Sub-90% accuracy means the passage was too hard regardless of pace,
 * which is the standard instructional-level cutoff.
 */
function bandFor({ wcpm, accuracy, grade }) {
  const norm = NORMS[grade] || NORMS[4];

  if (accuracy < 0.9) return BANDS.refer;
  if (wcpm < norm.refer) return BANDS.refer;
  if (wcpm < norm.watch || accuracy < 0.95) return BANDS.watch;
  return BANDS.clear;
}

/* -------------------------------------------------------------------------- */
/* The probe                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Score one oral reading probe.
 *
 * @param {object} options
 * @param {string} options.passage      The text the child was asked to read.
 * @param {string} options.transcript   What speech-to-text heard.
 * @param {number} options.durationMs   How long they read for.
 * @param {number} [options.grade=4]    School grade, for the band boundaries.
 * @param {number} [options.comprehensionCorrect]  Questions answered correctly.
 * @param {number} [options.comprehensionTotal]    Questions asked.
 */
function scoreOralReading({
  passage,
  transcript,
  durationMs,
  grade = 4,
  comprehensionCorrect = null,
  comprehensionTotal = null
}) {
  const reference = tokenise(passage);
  const hypothesis = tokenise(transcript);

  if (!reference.length) {
    const error = new Error('A passage is required to score a reading.');
    error.status = 400;
    throw error;
  }

  const seconds = Math.max(1, Number(durationMs) || 0) / 1000;
  const alignment = alignSequences(reference, hypothesis);

  /*
   * Only the portion actually attempted is scored.
   *
   * A child who runs out of time two thirds through a passage has not made a
   * third of a passage's worth of errors — they simply stopped. Counting the
   * unread tail as omissions would collapse their accuracy and band them as
   * "worth assessment" for reading slowly but perfectly, which is both wrong
   * and the kind of wrong that erodes a teacher's trust in the whole tool.
   *
   * The passage after the last word they actually spoke is therefore treated as
   * "not reached" rather than as errors. Interior omissions — words skipped in
   * the middle of what they did read — stay errors, because those are real.
   *
   * Computed from the position of the last reference word that a spoken word
   * was aligned to, NOT by scanning backwards for a run of omissions. The
   * scanning version was wrong in a way that survived its own test: a single
   * substitution landing at the tail (which tie-breaking can produce) halted
   * the scan at the first step and reported nothing as unread, collapsing a
   * careful reader's accuracy. Asking "where did they stop?" is the question
   * that was actually meant, and it cannot be derailed by one pair's type.
   */
  let referencePosition = 0;
  let lastSpokenAt = -1;
  for (const pair of alignment.pairs) {
    if (pair.type === 'insertion') continue; // consumes no reference word
    if (pair.type === 'correct' || pair.type === 'substitution') {
      lastSpokenAt = referencePosition;
    }
    referencePosition += 1;
  }
  const notReached = reference.length - (lastSpokenAt + 1);

  /*
   * Errors within the part they reached, for the teacher-facing list.
   *
   * Walks the alignment a second time rather than reusing the loop above,
   * because the two need different things: the loop above needs the LAST
   * aligned position, which is only known once it has finished, and this needs
   * to stop AT that position.
   */
  const missedWithinAttempted = [];
  let position = 0;
  for (const pair of alignment.pairs) {
    if (pair.type === 'insertion') {
      // An inserted word belongs to wherever the reader was, so it counts as
      // reached whenever anything after it was.
      if (position <= lastSpokenAt) missedWithinAttempted.push(pair);
      continue;
    }
    if (position > lastSpokenAt) break;
    if (pair.type === 'substitution' || pair.type === 'omission') {
      missedWithinAttempted.push(pair);
    }
    position += 1;
  }

  const interiorOmissions = alignment.omissions - notReached;
  const attempted = reference.length - notReached;
  const errors = alignment.substitutions + interiorOmissions;

  const wordsCorrect = alignment.correct;
  const wcpm = Math.round((wordsCorrect / seconds) * 60);
  const accuracy = attempted > 0 ? wordsCorrect / attempted : 0;

  const comprehension =
    Number.isFinite(comprehensionCorrect) && Number.isFinite(comprehensionTotal) && comprehensionTotal > 0
      ? {
          correct: comprehensionCorrect,
          total: comprehensionTotal,
          proportion: comprehensionCorrect / comprehensionTotal
        }
      : null;

  return {
    wcpm,
    accuracy: Number(accuracy.toFixed(3)),
    wordsCorrect,
    wordsAttempted: attempted,
    wordsInPassage: reference.length,
    notReached,
    errors,
    errorBreakdown: {
      substitutions: alignment.substitutions,
      omissions: interiorOmissions,
      insertions: alignment.insertions
    },
    durationMs: Math.round(seconds * 1000),
    comprehension,
    band: bandFor({ wcpm, accuracy, grade }),
    /*
     * Which words went wrong, for a teacher view — not just how many.
     *
     * Restricted to the portion the child actually reached. Including the
     * unread tail would hand a teacher a list of twenty-four words "missed" by
     * a child who simply ran out of time, burying the three real misreads that
     * are the entire diagnostic value of this list. Same reasoning as
     * `notReached` above, applied to the presentation rather than the score.
     *
     * Capped, because a full alignment of a long passage is more rows than
     * anyone reads past the first screen of.
     */
    missedWords: missedWithinAttempted
      .slice(0, 40)
      .map((pair) => ({ expected: pair.expected, read: pair.read, type: pair.type })),
    provisionalNorms: true
  };
}

/* -------------------------------------------------------------------------- */
/* Rapid Automatized Naming                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Score a RAN trial.
 *
 * RAN is the strongest single predictor in this battery — a meta-analysis of 60
 * samples and 10,513 participants put kindergarten RAN at r = -.38 against
 * later reading, contributing r = -.34 beyond phonological awareness. It is
 * also the cheapest: a grid of familiar aksharas or digits, named aloud as fast
 * as possible, two minutes.
 *
 * The measure is items per second, not accuracy — the whole point is
 * automaticity, and a child who names all fifty correctly but slowly is the
 * child the task is designed to find. Accuracy is still reported, because a
 * trial with many errors is a trial where the child did not know the items,
 * which measures something else entirely and should not be read as slow naming.
 */
function scoreRan({ items, transcript, durationMs }) {
  const reference = (items || []).map(normaliseWord).filter(Boolean);
  const hypothesis = tokenise(transcript);

  if (!reference.length) {
    const error = new Error('RAN items are required to score a trial.');
    error.status = 400;
    throw error;
  }

  const seconds = Math.max(1, Number(durationMs) || 0) / 1000;
  const alignment = alignSequences(reference, hypothesis);

  const itemsPerSecond = alignment.correct / seconds;
  const accuracy = alignment.correct / reference.length;

  return {
    itemsTotal: reference.length,
    itemsCorrect: alignment.correct,
    durationMs: Math.round(seconds * 1000),
    itemsPerSecond: Number(itemsPerSecond.toFixed(2)),
    secondsPerItem: Number((seconds / Math.max(1, alignment.correct)).toFixed(2)),
    accuracy: Number(accuracy.toFixed(3)),
    errors: alignment.substitutions + alignment.omissions,
    /*
     * Naming fewer than roughly one item per second is the conventional
     * flag point in the RAN literature for further looking. Reported as a band
     * rather than a cutoff score, and only when the child clearly knew the
     * items — below 80% accuracy the trial is measuring item knowledge, not
     * naming speed, and banding it as slow naming would be a misreading.
     */
    band:
      accuracy < 0.8
        ? BANDS.watch
        : itemsPerSecond < 0.7
          ? BANDS.refer
          : itemsPerSecond < 1.0
            ? BANDS.watch
            : BANDS.clear,
    provisionalNorms: true
  };
}

/* -------------------------------------------------------------------------- */
/* Combining tasks                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Roll several task bands into one overall band.
 *
 * Deliberately a transparent rule and not a model. A teacher and a parent
 * should be able to see exactly why a child was flagged, and CDSCO's AI-specific
 * obligations — bias, explainability, drift, generalisability — are obligations
 * this product does not want to acquire. "Two tasks in the refer band" is
 * explainable to a headteacher in one sentence. A gradient-boosted score is not,
 * and it would be trained on data nobody has yet collected in these languages.
 *
 * Conservative in the direction that matters: this recommends *looking*, and
 * the cost of a child being looked at unnecessarily is far lower than the cost
 * of one going unidentified for another five years.
 */
function combineBands(taskBands) {
  const bands = (taskBands || []).filter(Boolean);
  if (!bands.length) return null;

  const refer = bands.filter((band) => band === BANDS.refer).length;
  const watch = bands.filter((band) => band === BANDS.watch).length;

  if (refer >= 2) return BANDS.refer;
  if (refer === 1 && watch >= 1) return BANDS.refer;
  if (refer === 1 || watch >= 2) return BANDS.watch;
  return BANDS.clear;
}

/**
 * Plain-language copy for a band.
 *
 * Every string here was written to be readable by the parent this is handed to,
 * and to avoid four specific things the audit is explicit about: no percentage,
 * no score out of anything, never the word "test", and never the word
 * "dyslexia". `nextStep` always names what a real assessment involves and where
 * to get one, because a flag with no route forward is worse than no flag.
 */
const BAND_COPY = {
  [BANDS.clear]: {
    label: 'No concerns right now',
    summary:
      'Reading looks about where it should be for this age. Nothing here suggests a closer look is needed at the moment.',
    nextStep: 'Check again in a few months, or sooner if a teacher notices something.'
  },
  [BANDS.watch]: {
    label: 'Worth watching',
    summary:
      'Reading is a little behind what is typical for this age. That is common and often resolves with practice — but it is worth checking again rather than assuming it will.',
    nextStep:
      'Try again in four to six weeks. If it has not moved, talk to the class teacher about what they are seeing in school.'
  },
  [BANDS.refer]: {
    label: 'Worth a professional assessment',
    summary:
      'Reading is far enough behind what is typical for this age that it is worth someone qualified taking a proper look. This is not a diagnosis and it does not mean anything is wrong — it means a question is worth answering.',
    nextStep:
      'A full assessment is done by a clinical psychologist or an RCI-registered practitioner, often through a district hospital board. Ask the school to start the referral, or contact a district early-intervention centre directly.'
  }
};

/** The disclaimer that must appear on every result surface. Not optional. */
const RESULT_DISCLAIMER =
  'This is an educational screening tool. It is not a diagnosis and cannot replace assessment by a qualified professional. The bands are provisional and are not validated for Indian languages yet.';

module.exports = {
  BANDS,
  BAND_COPY,
  NORMS,
  RESULT_DISCLAIMER,
  normaliseWord,
  tokenise,
  alignSequences,
  bandFor,
  scoreOralReading,
  scoreRan,
  combineBands
};
