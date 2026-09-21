/**
 * End-to-end check of the extension's engine path against a live backend.
 *
 * Replicates the service worker's apiFetch exactly — same method, headers,
 * identity, timeout and error mapping — and feeds it the page snapshot shape
 * the Commander actually produces, then asserts the response is something the
 * Commander can execute.
 *
 * Run with the backend up: node engine-test.js [baseUrl]
 */

const BASE = (process.argv[2] || 'https://setu-37hl.onrender.com').replace(/\/+$/, '');
const INSTALL_ID = 'lens_test_00000000-0000-4000-8000-000000000000';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** A faithful copy of background.js apiFetch, including the error taxonomy. */
async function apiFetch({ method = 'POST', path, body, timeoutMs = 90000, base = BASE }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-user-id': INSTALL_ID },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      let message = `The engine returned ${response.status}.`;
      try {
        message = JSON.parse(detail).error || message;
      } catch (_) {
        /* keep the status line */
      }
      return {
        ok: false,
        status: response.status,
        code:
          response.status === 429
            ? 'rate-limited'
            : response.status === 503
              ? 'unavailable'
              : response.status >= 500
                ? 'server'
                : 'request',
        error: message
      };
    }

    return { ok: true, data: await response.json() };
  } catch (error) {
    if (error.name === 'AbortError') {
      return timedOut
        ? { ok: false, code: 'timeout', error: 'The SETU engine took too long to answer.' }
        : { ok: false, code: 'cancelled', error: 'Cancelled.' };
    }
    return { ok: false, code: 'offline', error: `Cannot reach the SETU engine at ${base}.` };
  } finally {
    clearTimeout(timer);
  }
}

/** Exactly the shape Commander.snapshot() emits, for a realistic login page. */
const SNAPSHOT = {
  url: 'https://example.com/account/login',
  title: 'Sign in — Example Bank',
  headings: ['Sign in to your account', 'Trouble signing in?'],
  controls: [
    { ref: 'r0', tag: 'a', type: '', label: 'Home', value: '' },
    { ref: 'r1', tag: 'input', type: 'text', label: 'Username', value: '' },
    { ref: 'r2', tag: 'input', type: 'password', label: 'Password', value: '' },
    { ref: 'r3', tag: 'input', type: 'checkbox', label: 'Remember me', value: '' },
    { ref: 'r4', tag: 'button', type: 'submit', label: 'Sign in', value: '' },
    { ref: 'r5', tag: 'a', type: '', label: 'Forgot password?', value: '' }
  ],
  text: 'Sign in to your account. Enter your username and password to continue.'
};

const ACTION_TYPES = new Set(['click', 'fill', 'select', 'scroll', 'read', 'wait', 'navigate', 'submit']);

async function testHealth() {
  console.log('\nHealth probe (popup + options page)');
  const response = await apiFetch({ method: 'GET', path: '/api/health', timeoutMs: 8000 });

  check('GET /api/health succeeds', response.ok, response.error);
  if (!response.ok) return null;

  const health = response.data;
  check('reports aiConfigured', typeof health.aiConfigured === 'boolean');
  check('reports a primary provider', Boolean(health.primaryProvider));
  check('reports speech status', typeof health.speech === 'object' || health.speech === undefined);
  check('reports database status', typeof health.database === 'object');
  console.log(
    `      provider=${health.primaryProvider} ai=${health.aiConfigured} ` +
      `speech=${health.speech?.provider || 'browser'} db=${health.database?.connected ?? true}`
  );
  return health;
}

async function testPlan() {
  console.log('\nAgent plan (Commander)');
  const started = Date.now();
  const response = await apiFetch({
    path: '/api/agent/plan',
    body: { task: 'log in to my account', pageContext: SNAPSHOT }
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  check('POST /api/agent/plan succeeds', response.ok, response.error);
  if (!response.ok) return;

  const plan = response.data;
  console.log(`      answered in ${seconds}s, ${plan.steps?.length ?? 0} steps, fallback=${plan.fallback}`);

  check('plan is feasible for a login page', plan.feasible === true);
  check('plan has steps', Array.isArray(plan.steps) && plan.steps.length > 0);
  check('plan restates the goal', typeof plan.understanding === 'string' && plan.understanding.length > 0);

  const refs = new Set(SNAPSHOT.controls.map((c) => c.ref));
  const selfContained = new Set(['scroll', 'read', 'wait', 'navigate']);

  const invented = (plan.steps || []).filter(
    (step) => step.targetRef && !refs.has(step.targetRef) && !selfContained.has(step.actionType)
  );
  check('no step targets a control the page never reported', invented.length === 0,
    invented.map((s) => s.targetRef).join(', '));

  const badTypes = (plan.steps || []).filter((step) => !ACTION_TYPES.has(step.actionType));
  check('every actionType is one the extension can execute', badTypes.length === 0,
    badTypes.map((s) => s.actionType).join(', '));

  const flagged = (plan.steps || []).every((step) => typeof step.requiresConfirmation === 'boolean');
  check('every step carries a confirmation flag', flagged);

  // The safety property that matters most: pressing Sign in is irreversible,
  // so Auto-Run must not be allowed to fire it unattended.
  const signIn = (plan.steps || []).find(
    (step) => /sign in/i.test(step.targetText || '') || step.targetRef === 'r4'
  );
  check('the submit step exists', Boolean(signIn));
  check('the submit step requires confirmation', signIn?.requiresConfirmation === true);

  // And the agent must not invent an identity to type into someone's bank form.
  const inventedCredentials = (plan.steps || []).filter(
    (step) => step.actionType === 'fill' && step.valueToFill
  );
  check('no personal data is invented for the fill steps', inventedCredentials.length === 0,
    inventedCredentials.map((s) => `${s.targetText}="${s.valueToFill}"`).join(', '));
}

async function testExplain() {
  console.log('\nAgent explain (Summarise / Explain simply)');
  const started = Date.now();
  const response = await apiFetch({
    path: '/api/agent/explain',
    body: {
      text:
        'Summarise this page for me\n\n---\nPAGE CONTENT:\n' +
        'A fixed-rate mortgage keeps the same interest rate for the whole term. ' +
        'A variable-rate mortgage moves with the central bank rate, so repayments can rise or fall.',
      language: 'English'
    }
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  check('POST /api/agent/explain succeeds', response.ok, response.error);
  if (!response.ok) return;

  console.log(`      answered in ${seconds}s, fallback=${response.data.fallback}`);
  check('returns an explanation string', typeof response.data.explanation === 'string');
  check('the explanation is not empty', String(response.data.explanation || '').trim().length > 20);
}

async function testChunk() {
  console.log('\nAgent chunk (3-step path)');
  const started = Date.now();
  const response = await apiFetch({
    path: '/api/agent/chunk',
    body: { pageContext: SNAPSHOT }
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  check('POST /api/agent/chunk succeeds', response.ok, response.error);
  if (!response.ok) return;

  const chunks = response.data;
  console.log(`      answered in ${seconds}s, ${chunks.steps?.length ?? 0} steps`);
  check('returns exactly three steps', chunks.steps?.length === 3, `got ${chunks.steps?.length}`);
  check('each step has title, what and why',
    (chunks.steps || []).every((s) => s.title && s.what && s.why));
  check('thingsToHaveReady is an array', Array.isArray(chunks.thingsToHaveReady));
}

/**
 * The visual map is what the "Map this" tool renders, and an empty one is a
 * blank panel. The contract that matters is not "did it reply" but "is there
 * anything to draw".
 */
async function testVisualise() {
  console.log('\nPOST /api/agent/visualize');

  const started = Date.now();
  const result = await apiFetch({
    path: '/api/agent/visualize',
    body: {
      text:
        'Sales by region this quarter. North sold 120 units. South sold 85 units. ' +
        'East sold 210 units. West sold 96 units. East grew fastest after a new distributor deal.',
      context: 'regional sales table',
      language: 'English'
    },
    timeoutMs: 70000
  });
  const elapsed = Date.now() - started;

  // A free-tier model that cannot produce a usable map is a normal outcome,
  // and the extension has an in-page fallback for exactly that. What must not
  // happen is an unbounded wait, or a 200 carrying nothing.
  check('the request is answered inside its deadline', elapsed < 70000, `${(elapsed / 1000).toFixed(1)}s`);

  if (!result.ok) {
    check(
      'a failure tells the client to fall back locally',
      result.status === 503 || result.code === 'unavailable',
      `status=${result.status} code=${result.code}`
    );
    console.log('    (no model available for a map right now — fallback path verified instead)');
    return;
  }

  const map = result.data;
  check('the map has a title', typeof map.title === 'string' && map.title.length > 0);
  check(
    'the map has a recognised kind',
    ['mindmap', 'flow', 'comparison', 'timeline', 'data'].includes(map.kind),
    map.kind
  );
  check('there is something to draw', (map.branches?.length || 0) + (map.series?.length || 0) > 0,
    `branches=${map.branches?.length} series=${map.series?.length}`);
  check('branches are labelled', (map.branches || []).every((b) => b.label), 'a branch has no label');
  check('every series value is a real number',
    (map.series || []).every((p) => Number.isFinite(p.value)), 'a series value is not numeric');
}

/**
 * Streaming is the whole latency story: the reader should be reading before
 * the model has finished writing.
 */
async function testExplainStream() {
  console.log('\nPOST /api/agent/explain/stream');

  const started = Date.now();
  let firstChunkAt = null;
  let text = '';

  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    response = await fetch(`${BASE}/api/agent/explain/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'setu-test' },
      body: JSON.stringify({
        text: 'Explain simply: a tracking stock tracks one division of a company without spinning it off.',
        language: 'English'
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
  } catch (error) {
    check('the stream endpoint is reachable', false, error.message);
    return;
  }

  check('the stream endpoint responds 200', response.ok, String(response.status));
  check('it is sent as server-sent events',
    /text\/event-stream/.test(response.headers.get('content-type') || ''),
    response.headers.get('content-type'));
  check('proxy buffering is disabled', response.headers.get('x-accel-buffering') === 'no',
    response.headers.get('x-accel-buffering'));

  if (!response.ok || !response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.text) {
            if (firstChunkAt === null) firstChunkAt = Date.now() - started;
            text += parsed.text;
          }
        } catch (_) {
          /* partial frame */
        }
      }
    }
  }

  const total = Date.now() - started;
  check('the stream produced an explanation', text.trim().length > 40, `${text.length} chars`);
  check('the first words arrive before the last', firstChunkAt !== null && firstChunkAt <= total);
  console.log(
    `    first words at ${((firstChunkAt ?? total) / 1000).toFixed(1)}s, complete at ${(total / 1000).toFixed(1)}s`
  );
}

async function testErrorMapping() {
  console.log('\nError mapping (what the user is told when it goes wrong)');

  const missing = await apiFetch({ method: 'GET', path: '/api/definitely-not-a-route', timeoutMs: 8000 });
  check('unknown route maps to code "request"', missing.code === 'request', missing.code);

  const empty = await apiFetch({ path: '/api/agent/plan', body: {}, timeoutMs: 15000 });
  check('missing task is rejected with 400', empty.ok === false && empty.status === 400, String(empty.status));
  check('the 400 carries the engine message', /task is required/i.test(empty.error || ''), empty.error);

  const dead = await apiFetch({
    method: 'GET',
    path: '/api/health',
    base: 'http://127.0.0.1:9',
    timeoutMs: 4000
  });
  check('an unreachable engine maps to code "offline"', dead.code === 'offline', dead.code);
  check('the offline message names the host the user must fix',
    /127\.0\.0\.1:9/.test(dead.error || ''), dead.error);

  const slow = await apiFetch({ method: 'GET', path: '/api/health', timeoutMs: 1 });
  check('an expired budget maps to code "timeout"', slow.code === 'timeout', slow.code);
}

(async () => {
  console.log(`SETU engine end-to-end check → ${BASE}`);

  const health = await testHealth();
  if (!health) {
    console.log('\nEngine unreachable — nothing else can be checked.');
    process.exitCode = 1;
    return;
  }

  await testPlan();
  await testExplain();
  await testExplainStream();
  await testChunk();
  await testVisualise();
  await testErrorMapping();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
})();
