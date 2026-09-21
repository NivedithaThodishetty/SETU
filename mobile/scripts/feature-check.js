#!/usr/bin/env node
/**
 * Live feature check — `node scripts/feature-check.js [engineUrl] [language]`
 *
 * `mobile-test.js` is entirely static: it reads source and asserts structure.
 * That catches a screen wired to a route that does not exist, and it caught
 * every regression the shell merge introduced — but it cannot tell you whether
 * a feature actually WORKS, because it never sends a request. A screen can be
 * perfectly wired to an endpoint whose response shape has moved underneath it,
 * and the only symptom is a spinner that never resolves on a judge's phone.
 *
 * So this file does the other half. For each feature a screen offers, it sends
 * the request THAT SCREEN sends — same path, same body shape, same headers,
 * same `language` stamp that `withLanguage` adds — and then asserts on the
 * exact fields the screen destructures out of the reply. A field that arrives
 * as `undefined` is the bug this is built to find.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED
 * ---------------------------------
 * Item COUNTS. The engine runs on free model tiers where the same prompt
 * returns three steps one minute and five the next. Asserting "exactly three
 * micro-steps" produces a suite that fails for reasons no one can fix and that
 * everyone learns to ignore. Presence, type and non-emptiness are the contract
 * a screen actually depends on; quantity is model variance.
 *
 * Native features — camera, microphone, audio playback — are not reachable
 * from node and are reported as such rather than silently skipped, because
 * "not tested" and "passed" must never look the same in this output.
 */

const ENGINE = (process.argv[2] || process.env.SETU_ENGINE_URL || 'http://localhost:3000').replace(
  /\/+$/,
  ''
);
const LANGUAGE = process.argv[3] || 'en-IN';

/** Mirrors `peekUserId()` — a stable per-install id, sent on every request. */
const USER_ID = 'feature_check_probe';

/** Mirrors TIMEOUTS.ai in services/api.ts. */
const AI_TIMEOUT_MS = 120000;

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function note(text) {
  console.log(`       ${text}`);
}

/** The request shape `services/api.ts` builds, reproduced exactly. */
async function call(method, path, body, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(`${ENGINE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-user-id': USER_ID,
      },
      // `withLanguage` stamps the chosen language onto every object body.
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body.language ? body : { ...body, language: LANGUAGE }) }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data, ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {},
      ms: Date.now() - started,
      error: error.name === 'AbortError' ? 'timed out' : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isList = (value) => Array.isArray(value) && value.length > 0;

/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`\nSETU mobile — live feature check`);
  console.log(`engine   ${ENGINE}`);
  console.log(`language ${LANGUAGE}\n`);

  /* --- Reachability, first, so everything after it has a known cause ------ */

  console.log('Engine');
  const health = await call('GET', '/api/health', undefined, 8000);
  check('the engine answers /api/health', health.ok, health.error || `status ${health.status}`);

  if (!health.ok) {
    console.log(
      `\nThe engine at ${ENGINE} is not reachable, so no feature can be checked.\n` +
        `Start it with \`npm start\` in ../backend, or pass a URL:\n` +
        `  node scripts/feature-check.js https://your-engine\n`
    );
    process.exit(1);
  }

  const ai = health.data.aiConfigured;
  check('an AI provider is configured', ai === true, 'aiConfigured is false — AI features will fall back');
  note(`provider ${health.data.primaryProvider}, model ${health.data.aiEngine?.model}`);

  /* --- Home: the mind map is the app's headline feature ------------------- */

  console.log('\nMind map (Home → Draw a map)');
  const map = await call('POST', '/api/research/mindmap', { topic: 'How a heat pump works' });
  check('POST /api/research/mindmap succeeds', map.ok, map.error || `status ${map.status}`);
  if (map.ok) {
    note(`answered in ${(map.ms / 1000).toFixed(1)}s`);

    /*
     * The shape asserted here is `MindMapDocument` from types/index.ts, read
     * the way MindMapScreen reads it: `map.root` is a `MindMapNode`, and the
     * branches are `root.children`, each carrying a `label`. Asserting a
     * friendlier-sounding `branches` array would pass against an engine that
     * had stopped serving anything the canvas can draw.
     */
    const record = map.data.mindMap || map.data.map || map.data;
    check('the map has a topic', isText(record.topic));
    check('the map has a root node', !!record.root && isText(record.root.label));

    const branches = record.root?.children;
    check('the root has children to draw', isList(branches), 'MindMapCanvas renders root.children');
    if (isList(branches)) {
      note(`${branches.length} branches`);
      check(
        'every branch carries a label',
        branches.every((child) => isText(child.label)),
        'an unlabelled branch renders as an empty node'
      );
    }
  }

  /* --- Tools / ModeWorkspace: one call per cognitive mode ----------------- */

  console.log('\nCognitive modes (Tools → a mode)');

  const modes = [
    {
      name: 'start',
      path: '/api/start',
      body: { task: 'Write the first page of my project report', isStuck: true },
      fields: (d) => [
        ['a supportive message', isText(d.supportiveMessage)],
        ['a ten-minute action', isText(d.immediateTenMinuteAction)],
        ['micro steps', isList(d.microSteps)],
        ['a confidence meter', !!d.confidenceMeter && isText(d.confidenceMeter.effortLevel)],
      ],
    },
    {
      name: 'simplify',
      path: '/api/simplify',
      body: {
        text: 'Notwithstanding the aforementioned provisions, the lessee shall remain liable for all outstanding sums.',
      },
      fields: (d) => [
        ['a readability grade', isText(d.readabilityGrade)],
        ['a plain-language rewrite', isText(d.plainLanguageRewrite)],
        ['key takeaways', isList(d.keyTakeaways)],
      ],
    },
    {
      name: 'learn',
      path: '/api/learn',
      body: { text: 'Photosynthesis converts light energy into chemical energy in plants.' },
      fields: (d) => [
        ['a summary', isText(d.summary)],
        ['a mind map with a root', !!d.mindMap && isText(d.mindMap.rootNode)],
        ['quiz questions', isList(d.quiz)],
        [
          'each quiz question has options and an answer',
          isList(d.quiz) &&
            d.quiz.every((q) => isList(q.options) && typeof q.answerIndex === 'number'),
        ],
      ],
    },
    {
      name: 'write',
      path: '/api/write',
      body: { text: 'The report was written by me and it was submitted late because of reasons.' },
      fields: (d) => [
        ['an original grade level', isText(d.originalGradeLevel)],
        ['improved text', isText(d.improvedText)],
        ['clarity fixes as a list', Array.isArray(d.clarityFixes)],
      ],
    },
    {
      name: 'guide',
      path: '/api/guide',
      body: { goal: 'Apply for a student travel pass' },
      fields: (d) => [
        ['steps', isList(d.steps)],
        [
          'every step is numbered and titled',
          isList(d.steps) &&
            d.steps.every((s) => typeof s.stepNumber === 'number' && isText(s.title)),
        ],
      ],
    },
    {
      name: 'numbers',
      path: '/api/numbers',
      body: { problem: 'If a train travels 240 km in 3 hours, what is its average speed?' },
      fields: (d) => [['something to show', isText(d.answer) || isList(d.steps) || isText(d.explanation)]],
    },
    {
      name: 'practice',
      path: '/api/practice',
      body: { topic: 'Asking a teacher for extra time on an assignment', userUtterance: '' },
      fields: (d) => [
        ['a scenario and opening line', isText(d.scenarioContext) && isText(d.openingLine)],
        ['suggested responses', isList(d.suggestedResponses)],
      ],
    },
    {
      name: 'meet',
      path: '/api/meet',
      body: {
        transcript:
          'Priya: we should ship Friday. Rahul: I can finish the report by Thursday. Priya: agreed, Rahul owns the report.',
      },
      fields: (d) => [
        ['a summary', isText(d.summary)],
        ['action items as a list', Array.isArray(d.actionItems)],
      ],
    },
  ];

  for (const mode of modes) {
    const result = await call('POST', mode.path, mode.body);
    check(`POST ${mode.path} succeeds`, result.ok, result.error || `status ${result.status}`);
    if (!result.ok) continue;
    note(`answered in ${(result.ms / 1000).toFixed(1)}s`);
    for (const [label, ok] of mode.fields(result.data)) {
      check(`  ${mode.name}: ${label}`, ok, 'the screen reads this field directly');
    }
  }

  /* --- Listen: the one path that must never depend on a model ------------- */

  console.log('\nListen (say it to someone)');
  const listen = await call('POST', '/api/listen', {
    entry: 'I have too much to do and I cannot start any of it.',
    mood: 'overwhelmed',
  });
  check('POST /api/listen succeeds', listen.ok, listen.error || `status ${listen.status}`);
  if (listen.ok) {
    check('there is something to say back', isText(listen.data.reflection || listen.data.reply));
  }

  /* --- Reading Check ------------------------------------------------------ */

  console.log('\nReading Check');
  const stimuli = await call(
    'GET',
    `/api/reading-check/stimuli?type=oral_reading&language=${encodeURIComponent(LANGUAGE)}`,
    undefined,
    15000
  );
  check('stimuli are served', stimuli.ok, stimuli.error || `status ${stimuli.status}`);
  const passage = stimuli.data?.stimulus || stimuli.data?.stimuli?.[0] || stimuli.data;
  if (stimuli.ok) {
    check('a passage came back with text', isText(passage?.text || passage?.passage));
  }

  const history = await call('GET', '/api/reading-check', undefined, 15000);
  check('history is readable', history.ok, history.error || `status ${history.status}`);

  /* --- Momentum and settings: local-first, mirrored to the engine --------- */

  console.log('\nMomentum and settings');
  const progress = await call('GET', '/api/progress', undefined, 15000);
  check('GET /api/progress succeeds', progress.ok, progress.error || `status ${progress.status}`);

  const settings = await call('GET', '/api/settings', undefined, 15000);
  check('GET /api/settings succeeds', settings.ok, settings.error || `status ${settings.status}`);

  /* --- Read-aloud --------------------------------------------------------- */

  console.log('\nRead-aloud');
  const voices = await call('GET', '/api/speech/voices', undefined, 15000);
  check('the voice catalogue loads', voices.ok, voices.error || `status ${voices.status}`);
  if (voices.ok) {
    const list = voices.data.voices || voices.data.speakers || voices.data;
    check('at least one voice is offered', isList(list) || (list && Object.keys(list).length > 0));
  }

  /* --- Summarise (Document reader) ---------------------------------------- */

  console.log('\nDocument reader');
  const summary = await call('POST', '/api/summarize', {
    text:
      'The water cycle describes how water moves between the sea, the air and the land. ' +
      'Water evaporates from the ocean, condenses into clouds, falls as rain, and runs back to the sea.',
  });
  check('POST /api/summarize succeeds', summary.ok, summary.error || `status ${summary.status}`);
  if (summary.ok) {
    check('a gist came back', isText(summary.data.gist));
    check('key points came back', isList(summary.data.points));
  }

  /* --- What this file cannot reach ---------------------------------------- */

  console.log('\nNot reachable from node');
  note('camera OCR, microphone capture and audio playback cross the native');
  note('boundary. They need a device — this run says nothing about them.');

  /* ------------------------------------------------------------------------ */

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailed:');
    for (const label of failures) console.log(`  - ${label}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nThe check itself crashed:', error);
  process.exit(1);
});
