/**
 * The parts of the Commander that decide *what it does*, exercised without a
 * browser: how a goal is routed, and how a form field is actually written to.
 *
 * Both are places where the agent used to fail silently — doing something
 * plausible-looking that was not what was asked, and reporting success either
 * way. A wrong answer that announces itself is a bug; a wrong answer that
 * looks right is the reason someone stops trusting the tool.
 *
 * Run: node test/agent.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const AGENT = fs.readFileSync(path.join(__dirname, '..', 'content', 'agent-copilot.js'), 'utf8');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Lift a top-level function out of the content script.
 *
 * The module is an IIFE that needs a full DOM to load, and these two functions
 * are pure. Extracting them keeps the test honest — it runs the shipped source
 * rather than a copy that can drift — without standing up a browser.
 */
function extract(name, extras = '') {
  const start = AGENT.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found in agent-copilot.js`);

  // Walk braces from the function's opening one to find where it ends.
  const open = AGENT.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < AGENT.length; i += 1) {
    if (AGENT[i] === '{') depth += 1;
    else if (AGENT[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  const sandbox = { Object, String, RegExp, console };
  vm.createContext(sandbox);
  vm.runInContext(`${extras}\n${AGENT.slice(start, end)}\nglobalThis.__fn = ${name};`, sandbox);
  return sandbox.__fn;
}

/* -- routing --------------------------------------------------------------- */

console.log('\nGoal routing');

/**
 * Pull a top-level `const NAME = <value>;` out of the source as text.
 *
 * The `\r?` is load-bearing on Windows. Git is configured with
 * `core.autocrlf=true` and the repository carried no `.gitattributes`, so a
 * Windows checkout has CRLF line endings and a pattern anchored on a bare `;\n`
 * matches nothing at all — `match()` returns null and this file threw before
 * a single assertion ran. The whole extension suite was red on every Windows
 * clone and green on CI, which is the worst way for a test to fail.
 *
 * `.gitattributes` now normalises these files to LF, so this is belt and
 * braces — but a test helper that only works on one platform's line endings is
 * a trap worth closing permanently.
 */
function constantSource(name) {
  const match = AGENT.match(new RegExp(`const ${name} =\\s*([\\s\\S]*?);\\r?\\n`));
  if (!match) throw new Error(`agent-copilot.js no longer defines a top-level "${name}"`);
  return match[1];
}

const QUESTION_INTENT = constantSource('QUESTION_INTENT');
const ACTION_INTENT = constantSource('ACTION_INTENT');
const wantsAnswer = extract(
  'wantsAnswer',
  `const QUESTION_INTENT = ${QUESTION_INTENT};\nconst ACTION_INTENT = ${ACTION_INTENT};`
);

// Questions want prose.
for (const goal of [
  'summarise this page',
  'explain this in simple words',
  'what is this page about',
  'why does this form need my PAN number',
  'tell me the key takeaways'
]) {
  check(`"${goal}" is answered`, wantsAnswer(goal) === true);
}

// Actions want a plan — including the ones phrased as questions, which is the
// case that used to be answered with a paragraph instead of being done.
for (const goal of [
  'how do I log in',
  'where is the submit button',
  'can you fill this form for me',
  'click the continue button',
  'take me to the checkout page',
  'find the login button',
  'search for a train to Chennai'
]) {
  check(`"${goal}" is acted on`, wantsAnswer(goal) === false);
}

/* -- writing to a field ---------------------------------------------------- */

console.log('\nFilling a framework-controlled field');

const setNativeValue = extract('setNativeValue');

// A stand-in for the DOM's own value accessor.
let backing = '';
const nativeProto = {};
Object.defineProperty(nativeProto, 'value', {
  configurable: true,
  get: () => backing,
  set(v) {
    backing = String(v);
  }
});

// React interposes its own accessor to track writes. A write that goes through
// it is recorded as one the framework already knew about, so the `input` event
// that follows is treated as a no-op and the value is discarded on re-render.
const framework = Object.create(nativeProto);
Object.defineProperty(framework, 'value', {
  configurable: true,
  get: () => backing,
  set() {
    /* swallowed, exactly as a controlled input does */
  }
});

const controlled = Object.create(framework);

backing = '';
controlled.value = 'ravi@example.com';
check('a plain assignment really is swallowed', backing === '', `backing=${backing}`);

backing = '';
setNativeValue(controlled, 'ravi@example.com');
check('the native setter gets through', backing === 'ravi@example.com', `backing=${backing}`);

// An ordinary, un-wrapped input must keep working.
const plain = Object.create(nativeProto);
backing = '';
setNativeValue(plain, 'plain text');
check('an ordinary field still works', backing === 'plain text', `backing=${backing}`);

// Anything without a value accessor on its chain falls back to assignment.
const exotic = { value: '' };
setNativeValue(exotic, 'fallback');
check('an element with no accessor falls back', exotic.value === 'fallback', exotic.value);

/* -- report ---------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
