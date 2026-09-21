/**
 * Cognitive Mode Controllers
 * --------------------------
 * The seven modes share one shape: pull a field off the body, ask the AI for a
 * schema-shaped answer, and degrade to the deterministic L0 engine if that
 * fails. They are declared as data below and executed by a single runner, so a
 * fix to error handling or fallback reporting lands in all seven at once.
 */

const { requestStructuredAI } = require('../services/aiService');
const fallbacks = require('../services/fallbackEngine');
const { assessCrisisRisk, buildCrisisResponse } = require('../services/crisisDetector');
const config = require('../config');
const schemas = require('./modeSchemas');
const { languageDirective, resolveLanguage, DEFAULT_CODE } = require('../config/languages');

/**
 * @typedef {object} ModeDefinition
 * @property {string} name        Schema name sent to the provider.
 * @property {object} schema      JSON schema the response must satisfy.
 * @property {string} instructions System prompt.
 * @property {(body: object) => string} input  Builds the user turn.
 * @property {(body: object) => object} fallback Deterministic L0 result.
 */

/** @type {Record<string, ModeDefinition>} */
const MODES = {
  start: {
    name: 'setu_start',
    schema: schemas.startSchema,
    instructions: `You are SETU's task-initiation copilot for people facing executive dysfunction —
the "Wall of Awful". Return one clarifying question, one action small enough to
finish in ten minutes, 3-5 micro-steps, a warm supportive message, and an honest
effort/anxiety/time estimate.

The ten-minute action must be genuinely tiny and physically concrete — "open the
document and write one heading", not "start the report". Never imply the whole
task must be finished today.`,
    input: (b) => `TASK: "${b.task}"\nUSER REPORTS BEING STUCK: ${Boolean(b.isStuck)}`,
    fallback: (b) => fallbacks.generateLocalStartMode(b.task, Boolean(b.isStuck))
  },

  simplify: {
    name: 'setu_simplify',
    schema: schemas.simplifySchema,
    instructions: `Rewrite dense or bureaucratic text into plain language at roughly a Grade 6
reading level. Keep every fact, obligation, deadline, and number exactly intact —
simplifying must never change what the text actually says. Then extract 2-5 key
takeaways and give practical sensory-comfort tips for reading it.`,
    input: (b) => `TEXT:\n${b.text}`,
    fallback: (b) => fallbacks.generateLocalSimplifyMode(b.text)
  },

  learn: {
    name: 'setu_learn',
    schema: schemas.learnSchema,
    instructions: `Turn dense study material into a summary, a hierarchical mind map, and a short
self-quiz. Branch labels stay under six words. Quiz questions must be answerable
from the material alone, with plausible distractors — never a giveaway.`,
    input: (b) => `MATERIAL:\n${b.text}`,
    fallback: (b) => fallbacks.generateLocalLearnMode(b.text)
  },

  meet: {
    name: 'setu_meet',
    schema: schemas.meetSchema,
    instructions: `Rescue a meeting transcript. Extract the summary, decisions actually made,
and action items with their real owner and deadline. Only list an action item if
someone genuinely committed to it — do not invent owners or dates. Decode any
corporate jargon into plain words.`,
    input: (b) => `TRANSCRIPT:\n${b.transcript}`,
    fallback: (b) => fallbacks.generateLocalMeetMode(b.transcript)
  },

  practice: {
    name: 'setu_practice',
    schema: schemas.practiceSchema,
    instructions: `Act as a supportive rehearsal partner for a difficult conversation. Give the
scenario context, the other person's realistic opening line, 2-4 response scripts
in distinct tones the user can actually say out loud, and one coaching tip.
Scripts should sound like natural speech, not written prose.`,
    input: (b) => `TOPIC: "${b.topic}"\nUSER'S LAST LINE: "${b.userUtterance || ''}"`,
    fallback: (b) => fallbacks.generateLocalPracticeMode(b.topic, b.userUtterance)
  },

  write: {
    name: 'setu_write',
    schema: schemas.writeSchema,
    instructions: `Review a draft for accessibility. Report its reading grade, rewrite it more
clearly while preserving the author's voice and meaning, list genuine passive-voice
instances, and give specific line edits with reasons. Never flag something as
passive voice when it is not.`,
    input: (b) => `DRAFT:\n${b.text}`,
    fallback: (b) => fallbacks.generateLocalWriteMode(b.text)
  },

  guide: {
    name: 'setu_guide',
    schema: schemas.guideSchema,
    instructions: `Break a workflow into clear numbered steps. Each step is one action with a
concrete success signal, so the user always knows it worked before moving on.

"title" is a short label for the step, 2-6 words.
"actionRequired" is the single thing to do, phrased as an instruction.
"tip" is the observable signal that the step succeeded, written as a clause that
completes the sentence "You will know it worked when …" — so write
"the terminal prints Done", not "It worked when the terminal prints Done".`,
    input: (b) => `GOAL: "${b.goal}"`,
    fallback: (b) => fallbacks.generateLocalGuideMode(b.goal)
  },

  numbers: {
    name: 'setu_numbers',
    schema: schemas.numbersSchema,
    instructions: `You teach arithmetic to adults with dyscalculia, using the method special
education uses: countable physical objects inside a short everyday story. Never
explain with notation — no "carry the one", no equations, no algebra vocabulary.

Choose ONE everyday countable object and stay with it for the whole problem.
"objectEmoji" is a single emoji of that object, because the client draws that
many of it on screen — the picture is the explanation, the words only narrate it.

Every step must be something the reader could physically do with objects on a
table: put down, add, slide away, deal into piles. "count" is how many objects
that step involves, and "runningTotal" is how many are on the table afterwards —
the client draws exactly those numbers, so they must be arithmetically correct
and consistent from step to step, or the picture will contradict the words.

Keep numbers whole wherever the problem allows. "checkIt" is a physical way to
undo the operation and land back where they started. "realLife" is one ordinary
situation where this exact sum shows up.`,
    input: (b) => `NUMBER PROBLEM: "${b.problem}"`,
    fallback: (b) => fallbacks.generateLocalNumbersMode(b.problem)
  },

  listen: {
    name: 'setu_listen',
    schema: schemas.listenSchema,
    instructions: `You are a calm listener for someone who is frustrated, anxious, or worn down.
Many of the people writing to you are dyslexic or ADHD adults who have spent the
day being told they are careless when they are working twice as hard as anyone
around them.

Reflect back what you actually heard in their own register, name the feeling
plainly, and validate it without flattery or forced positivity. Offer one short
grounding exercise they can do at their desk, one open question, and one small
concrete thing for the next ten minutes.

Hard limits: you are not a therapist and must not present as one. Do not
diagnose, do not interpret their childhood, do not mention medication, and do not
tell them what their feelings "really" mean. Do not promise things will be fine.
Never minimise with "at least" or "everyone feels that". Short sentences, second
person, warm but not saccharine.`,
    input: (b) => `WHAT THEY WROTE:\n${b.entry}\n\nHOW THEY RATED TODAY (1 worst - 5 best): ${b.mood || 'not given'}`,
    fallback: (b) => fallbacks.generateLocalListenMode(b.entry)
  }
};

/**
 * The wait a mode is allowed to impose before falling back.
 *
 * Every mode has a person watching a panel and a deterministic L0 answer ready
 * to show them, which changes what "give up" costs: it is not an error page,
 * it is a slightly worse answer arriving sooner. Left unbounded these inherited
 * the service-wide 90s ceiling, so a bad provider day meant a minute and a half
 * of spinner in front of a reader who — by definition of who this is for — has
 * likely lost the thread by second twenty.
 */
const MODE_BUDGET = { timeoutMs: 25000, maxRetries: 1, deadlineMs: 45000 };

/**
 * Build an Express handler for one mode.
 * Always answers 200 with usable content; `fallback` tells the client whether
 * it is looking at AI output or the deterministic local engine, and
 * `fallbackReason` says why — no silent substitution.
 */
function runMode(modeKey) {
  const mode = MODES[modeKey];

  return async function handler(req, res, next) {
    try {
      const language = resolveLanguage(req.body.language);

      // The deterministic L0 engine only speaks English. Saying so explicitly
      // is better than silently handing back English prose to someone who asked
      // for Tamil and leaving them to wonder whether the feature is broken.
      const fallbackPayload = (reason) => ({
        ...mode.fallback(req.body),
        fallback: true,
        fallbackReason: reason,
        language: DEFAULT_CODE,
        languageFallback: language.code !== DEFAULT_CODE ? language.code : undefined
      });

      if (!config.aiEnabled) {
        return res.json(fallbackPayload('No AI provider is configured on the server.'));
      }

      try {
        const result = await requestStructuredAI({
          name: mode.name,
          schema: mode.schema,
          instructions: `${mode.instructions}${languageDirective(language.code)}`,
          input: mode.input(req.body),
          ...MODE_BUDGET
        });
        res.json({ ...result, fallback: false, language: language.code });
      } catch (error) {
        console.warn(`[SETU ${modeKey}] AI failed, engaging L0 engine:`, error.message);
        res.json(fallbackPayload(error.message));
      }
    } catch (error) {
      next(error);
    }
  };
}

/**
 * POST /api/numbers — concrete-object arithmetic.
 *
 * Guarded rather than left to the shared runner: with no problem text the
 * deterministic engine would happily draw an empty table, and an explanation of
 * nothing reads as a broken feature.
 */
const numbersRunner = runMode('numbers');

function handleNumbersMode(req, res, next) {
  const problem = String(req.body.problem || '').trim();
  if (!problem) {
    return res.status(400).json({ error: 'Type the sum or the word problem you are stuck on.' });
  }
  return numbersRunner(req, res, next);
}

/**
 * POST /api/listen — reflective support, with the crisis path short-circuited.
 *
 * Risk language is checked *before* any provider call and answered from a fixed
 * script, so a crisis reply can never be a sampled one, never depends on the AI
 * being reachable, and never varies between runs. Only once that check passes
 * does the turn go to the normal mode runner.
 *
 * The check has two stages. Patterns run first, cover all twenty-three
 * languages including romanised and code-mixed input, and are synchronous and
 * network-free — so the guarantee holds in the offline deployment and cannot be
 * taken out by a provider outage. Only when the patterns find nothing does a
 * bounded yes/no classifier get a look, to catch the paraphrase no list can
 * enumerate. Either way the reply is the same fixed script: the classifier
 * chooses *whether* to show it and never writes a word of it.
 */
const listenRunner = runMode('listen');

async function handleListenMode(req, res, next) {
  try {
    const entry = String(req.body.entry || '').trim();
    if (!entry) return res.status(400).json({ error: 'Write something first — anything at all.' });

    const risk = await assessCrisisRisk(entry, {
      // The classifier is skipped when no provider is configured — there is
      // nothing to ask — and the pattern layer carries the whole guarantee.
      useClassifier: config.aiEnabled
    });

    if (risk.crisis) {
      // Logged without the message itself: knowing that the Tamil patterns
      // fired is operationally useful, keeping what someone wrote at 2am is
      // not, and this is the most sensitive text the product ever receives.
      console.log(`[SETU crisis] short-circuit via ${risk.via}${risk.language ? ` (${risk.language})` : ''}`);

      return res.json({
        ...buildCrisisResponse(resolveLanguage(req.body.language).code),
        fallback: false
      });
    }

    return listenRunner(req, res, next);
  } catch (error) {
    next(error);
  }
}

/** POST /api/summarize — key points from arbitrary page text. */
async function handleSummarize(req, res, next) {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Text is required.' });

    if (!config.aiEnabled) {
      return res.json({ points: fallbacks.generateLocalSummary(text, 5), fallback: true });
    }

    try {
      const result = await requestStructuredAI({
        name: 'setu_summary',
        schema: schemas.summarySchema,
        instructions: `Summarise the page for a reader with limited working memory. Give a one-line
gist, then 3-5 key points, each a single self-contained sentence that makes sense
without the others. Then estimate the reading time in minutes.`,
        input: text,
        ...MODE_BUDGET
      });
      res.json({ ...result, points: result.points || [], fallback: false });
    } catch (error) {
      res.json({
        points: fallbacks.generateLocalSummary(text, 5),
        fallback: true,
        fallbackReason: error.message
      });
    }
  } catch (error) {
    next(error);
  }
}

/** POST /api/export — render any artifact as portable markdown. */
function handleExport(req, res, next) {
  try {
    const { mode, data } = req.body;
    if (!mode || !data) {
      return res.status(400).json({ error: 'Both "mode" and "data" are required.' });
    }
    res.json({
      markdown: fallbacks.formatArtifactMarkdown(mode, data),
      filename: `setu-${mode}-${Date.now()}.md`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleStartMode: runMode('start'),
  handleSimplifyMode: runMode('simplify'),
  handleLearnMode: runMode('learn'),
  handleMeetMode: runMode('meet'),
  handlePracticeMode: runMode('practice'),
  handleWriteMode: runMode('write'),
  handleGuideMode: runMode('guide'),
  handleNumbersMode,
  handleListenMode,
  handleSummarize,
  handleExport
};
