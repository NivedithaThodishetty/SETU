/**
 * Reading Check endpoints.
 *
 * Two jobs, deliberately separated:
 *
 *   GET  /api/reading-check/stimuli  hand out a passage or a RAN grid
 *   POST /api/reading-check          score a completed task and store it
 *   GET  /api/reading-check          history, for the progress chart
 *   GET  /api/reading-check/class    roster view, for the teacher dashboard
 *
 * SCORING HAPPENS HERE, NOT IN THE BROWSER
 * ----------------------------------------
 * The client sends the transcript and the elapsed time; the server does the
 * alignment and the banding. That is not an accident of layering. It means the
 * band boundaries, the norms and the regulatory copy live in exactly one place
 * and can be corrected for everyone at once — which matters a great deal for a
 * number that gets shown to a parent about their child. A client-side scorer
 * would go stale in every browser that had ever cached it.
 */

const mongoService = require('../services/mongodbService');
const assessment = require('../services/readingAssessment');
const stimuli = require('../config/readingStimuli');
const { resolveLanguage } = require('../config/languages');
const { clampInteger } = require('../middleware/validator');

/** Same client-supplied identity every other controller uses. */
function userIdFrom(req) {
  return req.headers['x-user-id'] || req.body?.userId || req.query?.userId || 'anonymous_user';
}

/**
 * GET /api/reading-check/stimuli
 *
 * Query: language, grade, task ('oral-reading' | 'ran' | 'nonword' | 'deletion'),
 *        seed (optional, to reproduce a grid on retest)
 */
function handleGetStimuli(req, res, next) {
  try {
    const language = resolveLanguage(req.query.language);
    const grade = clampInteger(req.query.grade, 1, 12, 4);
    const task = String(req.query.task || 'oral-reading');
    const script = language.script;

    const base = {
      language: language.code,
      languageName: language.name,
      script,
      dir: language.dir,
      grade,
      // Carried on every response so no client can render a result without it.
      disclaimer: assessment.RESULT_DISCLAIMER
    };

    if (task === 'ran') {
      const seed = Number(req.query.seed) || Date.now();
      const grid = stimuli.buildRanGrid({ script, rows: 5, columns: 10, seed });
      return res.json({
        ...base,
        task,
        stimulusId: `ran-${script}-${seed}`,
        grid: grid.grid,
        items: grid.items,
        seed: grid.seed,
        instruction:
          'Name every one of these out loud, left to right, as fast as you can without making mistakes.'
      });
    }

    if (task === 'nonword') {
      return res.json({
        ...base,
        task,
        stimulusId: `nonword-${script}`,
        items: stimuli.nonwordsFor(script),
        instruction:
          'These are made-up words. Read each one out loud — sound it out, there is no right meaning.'
      });
    }

    if (task === 'deletion') {
      return res.json({
        ...base,
        task,
        stimulusId: `deletion-${script}`,
        items: stimuli.deletionItemsFor(script),
        instruction: 'Listen, then say the word again with one part taken away.'
      });
    }

    const passage = stimuli.passageFor(language.code, grade, req.query.index);
    return res.json({
      ...base,
      task: 'oral-reading',
      stimulusId: passage.id,
      title: passage.title,
      text: passage.text,
      wordCount: passage.text.split(/\s+/).filter(Boolean).length,
      questions: passage.questions.map((entry) => entry.q),
      instruction: 'Read this out loud. Take your time — read it the way you normally would.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/reading-check
 *
 * Body: { task, language, grade, stimulusId, transcript, durationMs,
 *         passage | items, comprehensionCorrect, comprehensionTotal,
 *         learnerLabel, keepTranscript }
 */
async function handleSubmit(req, res, next) {
  try {
    const body = req.body || {};
    const task = String(body.task || 'oral-reading');
    const language = resolveLanguage(body.language);
    const grade = body.grade == null ? null : clampInteger(body.grade, 1, 12, 4);

    let metrics;
    if (task === 'ran') {
      metrics = assessment.scoreRan({
        items: body.items,
        transcript: body.transcript,
        durationMs: body.durationMs
      });
    } else {
      metrics = assessment.scoreOralReading({
        passage: body.passage,
        transcript: body.transcript,
        durationMs: body.durationMs,
        grade: grade || 4,
        comprehensionCorrect: body.comprehensionCorrect,
        comprehensionTotal: body.comprehensionTotal
      });
    }

    const record = {
      id: `rc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: userIdFrom(req),
      type: task === 'ran' ? 'ran' : body.type === 'probe' ? 'probe' : 'oral-reading',
      language: language.code,
      script: language.script,
      grade,
      learnerLabel: String(body.learnerLabel || '').slice(0, 80),
      stimulusId: String(body.stimulusId || '').slice(0, 80),
      metrics,
      wcpm: metrics.wcpm ?? null,
      accuracy: metrics.accuracy ?? null,
      band: metrics.band || null,
      provisionalNorms: true,
      // Off unless the client explicitly asks. A transcript of a child reading
      // is recoverable content about a minor, and every number above has
      // already been computed from it.
      keepTranscript: Boolean(body.keepTranscript),
      transcript: body.keepTranscript ? String(body.transcript || '').slice(0, 4000) : ''
    };

    const saved = await mongoService.saveReadingCheck(record);

    res.json({
      // The result is returned whether or not the write landed. A database
      // outage must not cost a child the reading they just did — the client
      // shows the band either way, and `persistedToDb` says whether it will
      // still be there tomorrow.
      result: {
        ...record,
        transcript: undefined,
        band: metrics.band,
        bandCopy: metrics.band ? assessment.BAND_COPY[metrics.band] : null,
        disclaimer: assessment.RESULT_DISCLAIMER
      },
      persistedToDb: Boolean(saved)
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
}

/**
 * GET /api/reading-check — this user's history, oldest first.
 *
 * Oldest first because the only thing anyone does with this is draw a line
 * through it, and reversing a list in the browser to plot it is a step every
 * caller would otherwise have to remember.
 */
async function handleHistory(req, res, next) {
  try {
    const userId = userIdFrom(req);
    const type = req.query.type ? String(req.query.type) : null;
    const limit = clampInteger(req.query.limit, 1, 200, 60);

    const history = await mongoService.listReadingChecks({ userId, type, limit });

    // The chart's series, precomputed so every client draws the same thing.
    const series = history
      .filter((entry) => Number.isFinite(entry.wcpm))
      .map((entry) => ({
        at: entry.createdAt,
        wcpm: entry.wcpm,
        accuracy: entry.accuracy,
        band: entry.band,
        language: entry.language
      }));

    res.json({
      history,
      series,
      count: history.length,
      dbConnected: mongoService.isDbActive(),
      disclaimer: assessment.RESULT_DISCLAIMER
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reading-check/class — the teacher roster.
 *
 * One row per learner label, carrying their most recent band. This is the view
 * that changes the unit of adoption from one child with a laptop to one teacher
 * with a phone, which is the only distribution model that reaches an Indian
 * government school.
 */
async function handleClassRoster(req, res, next) {
  try {
    const userId = userIdFrom(req);
    const checks = await mongoService.listReadingChecks({ userId, limit: 500 });

    const byLearner = new Map();
    for (const check of checks) {
      const label = check.learnerLabel || 'Unlabelled';
      const existing = byLearner.get(label);
      // `checks` arrives oldest-first, so a later entry is always more recent.
      if (!existing || new Date(check.createdAt) >= new Date(existing.lastCheckedAt)) {
        byLearner.set(label, {
          learnerLabel: label,
          band: check.band,
          wcpm: check.wcpm,
          accuracy: check.accuracy,
          grade: check.grade,
          language: check.language,
          lastCheckedAt: check.createdAt,
          checkCount: (existing?.checkCount || 0) + 1
        });
      } else {
        existing.checkCount += 1;
      }
    }

    const roster = [...byLearner.values()];
    const order = { 'worth-assessment': 0, 'worth-watching': 1, 'no-concerns': 2 };

    // Sorted so the children who need looking at are at the top of the screen,
    // which is the entire point of handing this to a teacher with 45 of them.
    roster.sort((a, b) => (order[a.band] ?? 3) - (order[b.band] ?? 3));

    res.json({
      roster,
      counts: {
        total: roster.length,
        worthAssessment: roster.filter((r) => r.band === 'worth-assessment').length,
        worthWatching: roster.filter((r) => r.band === 'worth-watching').length,
        noConcerns: roster.filter((r) => r.band === 'no-concerns').length
      },
      dbConnected: mongoService.isDbActive(),
      disclaimer: assessment.RESULT_DISCLAIMER
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleGetStimuli,
  handleSubmit,
  handleHistory,
  handleClassRoster
};
