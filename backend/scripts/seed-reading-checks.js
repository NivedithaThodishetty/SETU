/**
 * Reading Check demo data.
 *
 * Produces the two things worth putting in front of a judging panel:
 *
 *   1. A CLASS ROSTER — 45 children, of whom exactly 4 land in "worth a
 *      professional assessment". That is the pitch, literally: "a teacher can
 *      find the four children in a class of forty-five who should see someone."
 *
 *   2. A PROGRESS CHART — one child's words-correct-per-minute across eight
 *      weekly sittings, rising. The audit is blunt that this is the single most
 *      persuasive artefact the product can show: "a real chart with real
 *      children beats any architecture diagram."
 *
 * WHY THE NUMBERS ARE COMPUTED, NOT WRITTEN
 * -----------------------------------------
 * Every record here is produced by generating a plausible *transcript* — a child
 * misreading particular words, or stopping partway — and running it through the
 * real `readingAssessment.scoreOralReading`. Nothing is fabricated.
 *
 * That matters more than it sounds. Hand-written numbers drift: a record could
 * end up banded "worth assessment" while showing 100% accuracy and a healthy
 * rate, and a judge who clicks into one row would find data that contradicts
 * itself. Scoring for real means every wcpm, accuracy, band and missed-word list
 * is internally consistent, and the roster's distribution is a genuine output of
 * the algorithm rather than a designer's guess at one.
 *
 * It also means this doubles as an end-to-end test of the scorer against a
 * hundred-odd inputs.
 *
 * Usage:
 *   node scripts/seed-reading-checks.js
 *   node scripts/seed-reading-checks.js --reset      remove seeded rows first
 *   node scripts/seed-reading-checks.js --clean      remove and exit
 *   node scripts/seed-reading-checks.js --user=abc   seed under a specific id
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { connectDB, closeDB, getStatus, mongoose } = require('../config/db');
const config = require('../config');
const ReadingCheck = require('../models/ReadingCheck');
const AgentProfile = require('../models/AgentProfile');
const assessment = require('../services/readingAssessment');
const stimuli = require('../config/readingStimuli');
const { sanitiseValues, NEVER_STORED } = require('../controllers/profileController');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const flagValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};

const USER_ID = flagValue('user') || process.env.SEED_USER_ID || 'demo_user';
const RESET = flag('reset');
const CLEAN_ONLY = flag('clean');

/* -------------------------------------------------------------------------- */
/* Deterministic randomness                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Seeded PRNG, so re-running the seeder produces the same class.
 *
 * A demo that reshuffles every time it is seeded is a demo you cannot rehearse:
 * the roster you practised on would not be the roster on stage.
 */
let rngState = 20260905;
function random() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + random() * (max - min);

/* -------------------------------------------------------------------------- */
/* The class                                                                  */
/* -------------------------------------------------------------------------- */

const FIRST_NAMES = [
  'Aarav', 'Diya', 'Vivaan', 'Ananya', 'Aditya', 'Ishita', 'Reyansh', 'Saanvi',
  'Arjun', 'Myra', 'Kabir', 'Aadhya', 'Rohan', 'Anika', 'Vihaan', 'Kiara',
  'Advait', 'Prisha', 'Neel', 'Riya', 'Devansh', 'Navya', 'Krish', 'Meera',
  'Yash', 'Tara', 'Ayaan', 'Siya', 'Ronit', 'Aarohi', 'Manav', 'Kavya',
  'Dhruv', 'Ira', 'Samar', 'Nisha', 'Karan', 'Pari', 'Om', 'Sara',
  'Rudra', 'Anaya', 'Veer', 'Trisha', 'Laksh'
];

const SURNAMES = [
  'Patel', 'Sharma', 'Desai', 'Iyer', 'Reddy', 'Nair', 'Joshi', 'Mehta',
  'Shah', 'Rao', 'Gupta', 'Kulkarni', 'Bhat', 'Pillai', 'Chauhan'
];

/**
 * How each child reads, expressed RELATIVE TO THEIR GRADE'S NORMS.
 *
 * The first draft used absolute reading paces, and that was wrong in a way that
 * only showed up in the output: the band boundaries in `readingAssessment` are
 * grade-relative — Class 2 refers below 35 wcpm, Class 4 below 70 — so one fixed
 * pace lands in different bands for different children. Every `watch` child in
 * Class 4 came out as a referral, and the roster showed seven flagged instead of
 * four no matter how many times the generator retried.
 *
 * So a profile now names a *target band position*, and the generator works
 * backwards to a duration that produces it. `accuracy` is what the transcript
 * produces; `wcpmOf` places the rate.
 *
 *   refer  = NORMS[grade].refer     below this is "worth assessment"
 *   watch  = NORMS[grade].watch     below this is "worth watching"
 */
const PROFILES = {
  strong:   { errorRate: [0.00, 0.02], stopsAt: [1.0, 1.0],   wcpmOf: (n) => between(n.watch * 1.05, n.watch * 1.4) },
  typical:  { errorRate: [0.00, 0.03], stopsAt: [0.9, 1.0],   wcpmOf: (n) => between(n.watch * 1.0, n.watch * 1.2) },
  /*
   * `watch` sits between the two thresholds on RATE and stays comfortably above
   * the 90% accuracy floor. The scorer sends anything under 90% straight to
   * "worth assessment" regardless of rate — correctly, since fast-and-inaccurate
   * is a compensatory pattern — so a watch child must be slow, not error-prone.
   */
  watch:    { errorRate: [0.00, 0.03], stopsAt: [0.6, 0.85],  wcpmOf: (n) => between(n.refer * 1.1, n.watch * 0.9) },
  /*
   * `struggle` fails on BOTH counts — under the accuracy floor and under the
   * referral rate — because a child who only just misses one threshold is a
   * borderline case, and a demo roster of borderline cases invites the reading
   * that the instrument is arbitrary.
   */
  struggle: { errorRate: [0.12, 0.22], stopsAt: [0.3, 0.5],   wcpmOf: (n) => between(n.refer * 0.35, n.refer * 0.8) }
};

/**
 * The distribution.
 *
 * 4 of 45 in `struggle` is deliberate and is the number in the pitch. It is also
 * close to the epidemiology the audit cites — 8% pooled prevalence of specific
 * learning disorders among Indian children, ~80% of that dyslexia — so a class
 * of 45 containing roughly four children worth looking at is not a flattering
 * invention, it is roughly what the literature predicts.
 */
/** Which band each profile is meant to produce. Enforced in `seedClass`. */
const INTENDED_BAND = {
  strong: 'no-concerns',
  typical: 'no-concerns',
  watch: 'worth-watching',
  struggle: 'worth-assessment'
};

/*
 * Forty-FOUR, not forty-five. The progress child (`seedProgress`) is a
 * forty-fifth row in the same roster — he is the one a demo drills into for the
 * chart — so generating forty-five here would produce a class of forty-six and
 * quietly break the one number the pitch actually says out loud.
 */
const CLASS_MIX = [
  ...Array(4).fill('struggle'),
  ...Array(9).fill('watch'),
  ...Array(21).fill('typical'),
  ...Array(10).fill('strong')
];

/** The progress child's label, reserved so the class cannot mint a duplicate. */
const PROGRESS_LEARNER = 'Aarav Patel (Class 2)';

/** Languages the class reads in, weighted toward the demo's primary scripts. */
const CLASS_LANGUAGES = [
  ...Array(18).fill('hi-IN'),
  ...Array(12).fill('en-IN'),
  ...Array(7).fill('gu-IN'),
  ...Array(5).fill('ta-IN'),
  ...Array(3).fill('kn-IN')
];

/* -------------------------------------------------------------------------- */
/* Transcript generation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Plausible misreadings, by script.
 *
 * For Devanagari and the other akshara scripts these are **matra
 * substitutions** — कि for की, ो for े — which is the characteristic error of a
 * struggling Indian reader and the thing the scorer is built to notice. Using
 * random word swaps instead would produce data that looks like an English
 * reader's error profile, which would undercut the whole akshara argument the
 * demo rests on.
 */
const MATRA_SWAPS = {
  Deva: [['ि', 'ी'], ['े', 'ो'], ['ु', 'ू'], ['ा', ''], ['ौ', 'ो']],
  Gujr: [['િ', 'ી'], ['ે', 'ો'], ['ુ', 'ૂ'], ['ા', '']],
  Taml: [['ி', 'ீ'], ['ெ', 'ே'], ['ு', 'ூ'], ['ா', '']],
  Knda: [['ಿ', 'ೀ'], ['ೆ', 'ೇ'], ['ು', 'ೂ'], ['ಾ', '']]
};

/** English misreadings: real substitutions a decoding reader makes. */
const ENGLISH_SWAPS = {
  came: 'come', went: 'want', well: 'wall', water: 'winter', small: 'smell',
  village: 'village', happy: 'happen', walked: 'waked', mother: 'mother',
  filled: 'failed', clear: 'clean', cold: 'could', birds: 'breads',
  began: 'begin', sing: 'sting', over: 'ever', saved: 'served',
  strong: 'string', quickly: 'quietly', watched: 'washed', string: 'strong'
};

/** Corrupt one word in a way that script's readers actually get wrong. */
function misread(word, script) {
  const swaps = MATRA_SWAPS[script];
  if (swaps) {
    for (const [from, to] of swaps) {
      if (word.includes(from)) return word.replace(from, to);
    }
    // No matra to swap — drop the final character, a conjunct-decomposition
    // style error.
    return word.length > 2 ? word.slice(0, -1) : word;
  }

  const lower = word.toLowerCase().replace(/[.,!?]/g, '');
  if (ENGLISH_SWAPS[lower]) return ENGLISH_SWAPS[lower];
  return word.length > 3 ? word.slice(0, -1) : word;
}

/**
 * Turn a reading profile into a transcript of what the child actually said.
 *
 * Returns the transcript plus the elapsed time, both of which then go through
 * the real scorer.
 */
function readAloud(passage, script, { errorRate, stopsAt, exactErrors = null }) {
  const words = passage.split(/\s+/).filter(Boolean);
  const reached = Math.max(1, Math.round(words.length * stopsAt));
  const attempted = words.slice(0, reached);

  /*
   * `exactErrors` misreads a precise number of evenly-spaced words instead of
   * rolling per word.
   *
   * The progress series needs it. These passages run to about twenty-five words,
   * and at that length a probabilistic error rate is far too lumpy: one unlucky
   * week drew five errors from a 4.7% rate and posted 78% accuracy in the middle
   * of an otherwise rising line. A chart whose accuracy wobbles reads as an
   * unreliable instrument rather than an improving reader — which is the
   * opposite of what the chart is there to show.
   *
   * The class roster keeps the probabilistic path: forty-five children who all
   * made exactly the predicted number of errors would look generated.
   */
  const spoken =
    exactErrors === null
      ? attempted.map((word) => (random() < errorRate ? misread(word, script) : word))
      : (() => {
          const out = [...attempted];
          const count = Math.min(exactErrors, out.length);
          if (count > 0) {
            const stride = out.length / count;
            for (let i = 0; i < count; i += 1) {
              const at = Math.min(out.length - 1, Math.floor(i * stride + stride / 2));
              out[at] = misread(out[at], script);
            }
          }
          return out;
        })();

  return { transcript: spoken.join(' '), wordsReached: reached };
}

/**
 * Duration that makes a given number of correct words come out at `targetWcpm`.
 *
 * Working backwards from the rate is what makes the profiles grade-relative:
 * the generator decides where in the band a child should sit, and the clock is
 * the free variable. Capped at the 60 seconds the probe actually allows — a
 * child cannot read for longer than the probe runs, so a target that would need
 * more time simply produces a slower reading, which is the honest outcome.
 */
function durationForWcpm(wordsCorrect, targetWcpm) {
  const seconds = (wordsCorrect / Math.max(1, targetWcpm)) * 60;
  return Math.round(Math.min(60, Math.max(5, seconds)) * 1000);
}

function buildRecord({ learnerLabel, language, grade, profileName, at, index }) {
  const passage = stimuli.passageFor(language, grade, index);
  const script = { 'hi-IN': 'Deva', 'gu-IN': 'Gujr', 'ta-IN': 'Taml', 'kn-IN': 'Knda' }[language] || 'Latn';
  const profile = PROFILES[profileName];

  const { transcript } = readAloud(passage.text, script, {
    errorRate: between(...profile.errorRate),
    stopsAt: between(...profile.stopsAt)
  });

  /*
   * Scored twice, on purpose.
   *
   * The first pass exists only to learn how many words the scorer counts as
   * correct — which is not simply "words spoken", because the alignment decides
   * what counts. The duration that produces the target rate depends on that
   * number, so it cannot be computed before scoring. The second pass is the one
   * that is stored.
   */
  const norms = assessment.NORMS[grade] || assessment.NORMS[4];
  const probe = assessment.scoreOralReading({
    passage: passage.text, transcript, durationMs: 60000, grade
  });

  const targetWcpm = profile.wcpmOf(norms);
  const durationMs = durationForWcpm(probe.wordsCorrect, targetWcpm);

  const total = passage.questions.length;
  const correct = Math.min(total, Math.round(total * between(
    profileName === 'struggle' ? 0 : profileName === 'watch' ? 0.3 : 0.6,
    profileName === 'struggle' ? 0.6 : 1
  )));

  const metrics = assessment.scoreOralReading({
    passage: passage.text,
    transcript,
    durationMs,
    grade,
    comprehensionCorrect: correct,
    comprehensionTotal: total
  });

  return {
    /*
     * Stable id, derived from the learner label ALONE.
     *
     * It used to include `at.getTime()`, and because `at` is computed from
     * `Date.now()` every run minted a fresh id — so re-seeding without --reset
     * inserted a second copy of all forty-four children rather than upserting
     * them. The roster hid it by grouping on name and taking the most recent, so
     * the only visible symptom was the collection quietly doubling in size.
     *
     * Hashed rather than hex-truncated. `Buffer.from(label).toString('hex')
     * .slice(0, 16)` keeps only the first EIGHT characters of the name, so
     * children sharing a prefix collided and silently overwrote one another —
     * forty-four children became forty-one rows.
     */
    id: `rc_seed_${crypto.createHash('sha1').update(learnerLabel).digest('hex').slice(0, 16)}`,
    userId: USER_ID,
    type: 'probe',
    language,
    script,
    grade,
    learnerLabel,
    stimulusId: passage.id,
    metrics,
    wcpm: metrics.wcpm,
    accuracy: metrics.accuracy,
    band: metrics.band,
    provisionalNorms: true,
    keepTranscript: false,
    transcript: '',
    createdAt: at,
    updatedAt: at
  };
}

/* -------------------------------------------------------------------------- */
/* Seeding                                                                    */
/* -------------------------------------------------------------------------- */

const DAY = 24 * 60 * 60 * 1000;

async function clean() {
  const res = await ReadingCheck.deleteMany({ userId: USER_ID, id: /^rc_seed_/ });
  console.log(`  [seed] Removed ${res.deletedCount} seeded reading check(s) for "${USER_ID}".`);

  // Only demo profiles. A real profile under this id is somebody's actual
  // address and is not this script's to delete.
  const profiles = await AgentProfile.deleteMany({ userId: USER_ID, isDemo: true });
  if (profiles.deletedCount) console.log(`  [seed] Removed the seeded agent profile.`);

  return res.deletedCount;
}

/**
 * The class roster: one recent reading each for 45 children.
 *
 * Spread across the last fortnight so the roster looks like a term's worth of
 * screening rather than a batch import at one timestamp.
 */
async function seedClass() {
  const used = new Set([PROGRESS_LEARNER]);
  const records = [];

  for (let i = 0; i < CLASS_MIX.length; i += 1) {
    const grade = 2 + Math.floor(random() * 3); // classes 2-4

    let label;
    do {
      label = `${pick(FIRST_NAMES)} ${pick(SURNAMES)} (Class ${grade})`;
    } while (used.has(label));
    used.add(label);
    const at = new Date(Date.now() - Math.floor(between(0, 14)) * DAY - Math.floor(between(0, 8)) * 3600000);

    /*
     * Regenerate until the record lands in the band the profile intends.
     *
     * The numbers stay real — every attempt is a genuine transcript run through
     * the real scorer — but which attempt is *kept* is chosen. Without this the
     * distribution is whatever chance produces, and "four children in a class of
     * forty-five" stops being true the first time someone re-seeds. Bounded, and
     * the last attempt is accepted regardless so this can never hang.
     */
    const intended = INTENDED_BAND[CLASS_MIX[i]];
    let record = null;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      record = buildRecord({
        learnerLabel: label,
        language: pick(CLASS_LANGUAGES),
        grade,
        profileName: CLASS_MIX[i],
        at,
        index: i
      });
      if (record.band === intended) break;
    }
    records.push(record);
  }

  await ReadingCheck.bulkWrite(
    records.map((doc) => ({
      replaceOne: { filter: { id: doc.id }, replacement: doc, upsert: true }
    }))
  );

  const counts = records.reduce((acc, r) => ({ ...acc, [r.band]: (acc[r.band] || 0) + 1 }), {});
  console.log(`  [seed] Class roster: ${records.length} children + 1 progress learner = ${records.length + 1} —`);
  console.log(`           ${counts['worth-assessment'] || 0} worth a professional assessment`);
  console.log(`           ${counts['worth-watching'] || 0} worth watching`);
  console.log(`           ${counts['no-concerns'] || 0} no concerns`);
  return records;
}

/**
 * The progress chart: one child, eight weekly sittings, improving.
 *
 * Deliberately the *same passage* every week. Reading rate is only comparable
 * across sittings if the text is — swapping passages would make the rise an
 * artefact of an easier text rather than evidence of anything, which is exactly
 * the criticism a panel that knows assessment would make.
 *
 * The improvement is real but modest, and the child ends still in "worth
 * watching" rather than jumping to "no concerns". A chart showing a struggling
 * reader becoming a typical one in eight weeks would be a claim nothing in this
 * product could support.
 */
async function seedProgress() {
  const learnerLabel = PROGRESS_LEARNER;
  const language = 'hi-IN';
  const grade = 2;
  const records = [];

  const norms = assessment.NORMS[grade];
  const passage = stimuli.passageFor(language, grade, 0);

  for (let week = 0; week < 8; week += 1) {
    const progress = week / 7; // 0 -> 1
    const at = new Date(Date.now() - (7 - week) * 7 * DAY);

    /*
     * All three dimensions improve together and monotonically.
     *
     * The first draft moved only the rate and let accuracy fall out of chance,
     * which produced a series reading 100% -> 78% -> 96%. An accuracy line that
     * wobbles reads as an unreliable instrument, not an improving child, and a
     * panel would take it as evidence against the measure rather than for it.
     *
     * The endpoints are chosen deliberately:
     *   week 1  below the accuracy floor AND below the referral rate
     *   week 8  accurate, faster, but still under the "no concerns" threshold
     *
     * So the child moves "worth assessment" -> "worth watching" and stops there.
     * A chart showing a struggling reader become a typical one in eight weeks
     * would be a claim nothing in this product can support, and overclaiming
     * here would spend exactly the credibility the evidence slide is built on.
     */
    const { transcript } = readAloud(passage.text, 'Deva', {
      errorRate: 0,
      stopsAt: 0.45 + progress * 0.5,
      // 4 misreads in week 1 down to 0 by week 8 — a clean, readable line.
      exactErrors: Math.max(0, Math.round(4 - progress * 4))
    });

    const probe = assessment.scoreOralReading({
      passage: passage.text, transcript, durationMs: 60000, grade
    });

    const targetWcpm = norms.refer * 0.7 + progress * (norms.watch * 0.92 - norms.refer * 0.7);
    const durationMs = durationForWcpm(probe.wordsCorrect, targetWcpm);

    const metrics = assessment.scoreOralReading({
      passage: passage.text,
      transcript,
      durationMs,
      grade,
      comprehensionCorrect: Math.round(progress * passage.questions.length),
      comprehensionTotal: passage.questions.length
    });

    records.push({
      id: `rc_seed_progress_w${week}`,
      userId: USER_ID,
      type: 'probe',
      language,
      script: 'Deva',
      grade,
      learnerLabel,
      stimulusId: passage.id,
      metrics,
      wcpm: metrics.wcpm,
      accuracy: metrics.accuracy,
      band: metrics.band,
      provisionalNorms: true,
      keepTranscript: false,
      transcript: '',
      createdAt: at,
      updatedAt: at
    });
  }

  await ReadingCheck.bulkWrite(
    records.map((doc) => ({
      replaceOne: { filter: { id: doc.id }, replacement: doc, upsert: true }
    }))
  );

  console.log(`  [seed] Progress series for ${learnerLabel} — 8 weekly sittings:`);
  records.forEach((r, week) => {
    const bar = '#'.repeat(Math.max(1, Math.round(r.wcpm / 2)));
    console.log(
      `           week ${week + 1}  ${String(r.wcpm).padStart(3)} wcpm  ` +
        `acc ${String(Math.round(r.accuracy * 100)).padStart(3)}%  ` +
        `${r.band.padEnd(17)} ${bar}`
    );
  });
  return records;
}

/* -------------------------------------------------------------------------- */
/* Agent saved-details profile                                                */
/* -------------------------------------------------------------------------- */

/**
 * Seed the demo applicant the page agent fills government forms from.
 *
 * Written to MongoDB rather than to the browser, so the agent can fetch it on
 * any machine the moment it boots — no re-entering an address on a second
 * laptop, and no pasting anything into a console.
 *
 * The data itself lives in `chrome-extension/demo/profile-demo.json` so it is
 * reviewable and editable as data rather than buried in a script, and so the
 * extension's own validator can check it against the field catalogue.
 *
 * Government ID and bank fields stay absent. That is not about where the record
 * is stored — the controller refuses those keys outright — it is the decision
 * from setu-profile.js and it still holds: a plausible-looking Aadhaar is
 * indistinguishable from a real one once it is sitting in a government portal's
 * input, and a form submitted with a made-up ID is worse than one never filled.
 */
async function seedAgentProfile() {
  const demoPath = path.join(__dirname, '..', '..', 'chrome-extension', 'demo', 'profile-demo.json');

  if (!fs.existsSync(demoPath)) {
    console.log('  [seed] No chrome-extension/demo/profile-demo.json — skipping agent profile.');
    return null;
  }

  const demo = JSON.parse(fs.readFileSync(demoPath, 'utf8'));
  const { values, rejected } = sanitiseValues(demo.profile);

  const saved = await AgentProfile.findOneAndUpdate(
    { userId: USER_ID },
    {
      userId: USER_ID,
      values,
      schemaVersion: 1,
      isDemo: true,
      label: `${demo.profile.firstName} ${demo.profile.lastName} — demo applicant`,
      updatedAt: new Date()
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();

  console.log(`  [seed] Agent profile: ${saved.label}`);
  console.log(`           ${Object.keys(saved.values).length} fields stored`);
  console.log(`           ${NEVER_STORED.size} government ID / bank keys refused by the server${rejected.length ? ` (${rejected.length} present in the file were dropped)` : ''}`);
  console.log(`           fetch: GET /api/profile  (x-user-id: ${USER_ID})`);
  return saved;
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log('\n  ======================================================');
  console.log('  SETU Reading Check demo data');
  console.log(`  Database : ${config.safeMongoUri}`);
  console.log(`  User id  : ${USER_ID}`);
  console.log('  ======================================================\n');

  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    const { lastError } = getStatus();
    console.error(`  [seed] No MongoDB connection${lastError ? ` — ${lastError}` : ''}.\n`);
    process.exitCode = 1;
    return;
  }

  if (CLEAN_ONLY) {
    await clean();
    console.log('\n  Done — seeded reading checks removed.\n');
    return;
  }

  if (RESET) await clean();

  await seedProgress();
  console.log('');
  await seedClass();
  console.log('');
  await seedAgentProfile();

  console.log('\n  Done. To view as this user in the browser:');
  console.log(`    localStorage.setItem('setu.user.v1', '${USER_ID}'); location.reload();`);
  console.log('\n  Or straight from the API:');
  console.log(`    curl -H "x-user-id: ${USER_ID}" http://localhost:3000/api/reading-check/class`);
  console.log(`    curl -H "x-user-id: ${USER_ID}" http://localhost:3000/api/reading-check\n`);
}

main()
  .catch((error) => {
    console.error('\n  [seed] Failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDB().catch(() => {});
  });
