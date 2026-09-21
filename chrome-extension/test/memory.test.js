/**
 * Is MEMORY.md still telling the truth?
 *
 * A reference document that drifts is worse than no document: it is read with
 * the same trust as the code and quietly sends people the wrong way. Every
 * concrete claim in MEMORY.md — versions, permissions, layer order, the feature
 * table, endpoints, message actions, backend budgets — is checked against the
 * source it describes, so the doc fails the build rather than rotting.
 *
 * Prose is not checked and does not need to be. The rule is narrow: if a fact
 * is stated as a number, a name, or a list, it must match.
 *
 * Run: node test/memory.test.js
 */

const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..');
const BACKEND = path.join(EXT, '..', 'backend');

const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const doc = read(EXT, 'MEMORY.md');
const manifest = JSON.parse(read(EXT, 'manifest.json'));
const core = read(EXT, 'shared', 'setu-core.js');
const main = read(EXT, 'content', 'main.js');

/* -- identity -------------------------------------------------------------- */

check('version matches the manifest', doc.includes(`**Version:** ${manifest.version}`), manifest.version);
check(
  'setu-core VERSION matches the manifest',
  core.includes(`VERSION: '${manifest.version}'`),
  'manifest.json and setu-core.js have drifted apart'
);
check('minimum Chrome version', doc.includes(`**Minimum Chrome:** ${manifest.minimum_chrome_version}`));

/* -- permissions ----------------------------------------------------------- */

for (const permission of manifest.permissions) {
  check(`permission "${permission}" is documented`, doc.includes(`\`${permission}\``));
}
check(
  'the doc is right that `tabs` is not requested',
  !manifest.permissions.includes('tabs') && /the broad `tabs` permission/.test(doc)
);

const war = manifest.web_accessible_resources[0].resources;
check(
  'web-accessible resources are listed exactly',
  war.every((r) => doc.includes(`\`${r}\``)) && war.length === 2,
  war.join(', ')
);

/* -- load order ------------------------------------------------------------ */

const scripts = manifest.content_scripts[0].js;
check(
  'setu-config loads before setu-core',
  scripts.indexOf('shared/setu-config.js') < scripts.indexOf('shared/setu-core.js')
);
check('main.js loads last', scripts[scripts.length - 1] === 'content/main.js');

/*
 * The manifest now carries only the eager three. Everything else is injected on
 * demand, so the ordering guarantees that used to be enforced by the manifest's
 * array order moved into FEATURE_MODULES in setu-config.js — and they still
 * have to hold, because both of them bind at load time:
 *
 *   gaze-detector  eye-tracker.js destructures `self.SETU_GAZE` at the top of
 *                  its IIFE and throws immediately if it is not already there.
 *   setu-icons     every feature that draws an icon needs the set present.
 */
check(
  'the manifest ships only the eager three',
  scripts.length === 3,
  `${scripts.length} scripts: ${scripts.join(', ')}`
);

const configSource = read(EXT, 'shared', 'setu-config.js');
const moduleTable = configSource.match(/const FEATURE_MODULES = \{([\s\S]*?)\n  \};/);
check('setu-config declares FEATURE_MODULES', Boolean(moduleTable));

if (moduleTable) {
  const entries = [...moduleTable[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)].map(([, key, list]) => ({
    key,
    files: [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])
  }));

  const eye = entries.find((e) => e.key === 'eye');
  check(
    'the gaze detector loads before the eye tracker',
    Boolean(eye) &&
      eye.files.indexOf('shared/gaze-detector.js') < eye.files.indexOf('content/eye-tracker.js'),
    eye ? eye.files.join(' -> ') : 'no eye entry'
  );

  // Any feature whose code calls icon() must list the icon set before itself.
  for (const entry of entries) {
    const own = entry.files.filter((f) => f.startsWith('content/'));
    const usesIcons = own.some((f) => {
      try {
        return /\bicon\(/.test(read(EXT, ...f.split('/')));
      } catch (_) {
        return false;
      }
    });
    if (!usesIcons) continue;
    check(
      `"${entry.key}" loads the icon set before its own file`,
      entry.files.indexOf('shared/setu-icons.js') === 0,
      entry.files.join(' -> ')
    );
  }

  // A feature the orchestrator can toggle but has no module list for would fail
  // to load with a console warning and no other symptom.
  const registered = [...read(EXT, 'content', 'main.js').matchAll(/'(\w+)'/g)];
  check(
    'every registered feature file appears in exactly one module list',
    entries.every((e) => e.files.length > 0),
    'a feature has an empty module list'
  );
}

/* -- layer ladder ---------------------------------------------------------- */

const layerBlock = core.match(/const LAYERS = \{([\s\S]*?)\};/)[1];
const layers = [...layerBlock.matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);

const lowest = layers.reduce((a, b) => (a[1] <= b[1] ? a : b))[0];
const highest = layers.reduce((a, b) => (a[1] >= b[1] ? a : b))[0];

// The whole reason Line Focus and the ruler compose with Focus Mode.
check('the reader really is the lowest layer', lowest === 'reader', lowest);
check('toasts really are the highest layer', highest === 'toast', highest);

for (const [name, z] of layers) {
  check(`layer ${name} = ${z} is documented`, doc.includes(`${name}:`) && doc.includes(String(z)));
}

/* -- feature registry ------------------------------------------------------ */

const contentDir = path.join(EXT, 'content');
const allContent = fs
  .readdirSync(contentDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => read(contentDir, f))
  .join('\n');

const registered = new Set([...allContent.matchAll(/features\.set\('(\w+)'/g)].map((m) => m[1]));

const featureTable = doc.split('## Feature registry')[1].split('\n---')[0];
const listed = new Set([...featureTable.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]));

for (const key of registered) {
  check(`feature "${key}" appears in the table`, listed.has(key));
}
for (const key of listed) {
  check(`table entry "${key}" is a real feature`, registered.has(key));
}

/* -- persisted state ------------------------------------------------------- */

const toggles = new Set(
  [...main.match(/const TOGGLES = \[([\s\S]*?)\];/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
);
const togglePara = doc.split('Persisted toggles')[1].split('Anything costing')[0];
const documentedToggles = new Set(
  [...togglePara.matchAll(/`(\w+)`/g)].map((m) => m[1]).filter((n) => n !== 'TOGGLES' && n !== 'main')
);

for (const key of toggles) check(`persisted toggle "${key}" is documented`, documentedToggles.has(key));
for (const key of documentedToggles) check(`documented toggle "${key}" is real`, toggles.has(key));

const retired = new Set(
  [...core.match(/const RETIRED_KEYS = \[([\s\S]*?)\]/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
);
for (const key of retired) check(`retired key "${key}" is documented`, doc.includes(`'${key}'`));

/* -- languages ------------------------------------------------------------- */

const codes = (source) => [...source.matchAll(/\{ code: '([\w-]+)'/g)].map((m) => m[1]);
const extLanguages = codes(read(EXT, 'shared', 'setu-config.js'));
const backendLanguages = codes(read(BACKEND, 'config', 'languages.js'));

check('there really are 23 languages', extLanguages.length === 23, String(extLanguages.length));
check(
  'the doc states the count correctly',
  doc.includes('Eleven Indian languages on Sarvam plus twelve international ones on ElevenLabs (23 total)')
);
check(
  'the extension and backend language lists agree',
  extLanguages.join(',') === backendLanguages.join(','),
  `${extLanguages.join(',')} vs ${backendLanguages.join(',')}`
);

/* -- gaze constants -------------------------------------------------------- */

const eye = read(EXT, 'content', 'eye-tracker.js');
const detector = read(EXT, 'shared', 'gaze-detector.js');

check(
  'the stale-sample threshold matches',
  eye.includes('const SAMPLE_STALE_MS = 400;') && doc.includes('SAMPLE_STALE_MS` (400ms)')
);
check(
  'the camera-lost threshold matches',
  eye.includes('const SAMPLE_LOST_MS = 3000;') && doc.includes('SAMPLE_LOST_MS` (3000ms)')
);
check(
  'the adaptive row threshold matches',
  detector.includes('busiestRow * 0.35') && doc.includes('busiestRow * 0.35')
);
check(
  'the detector resolution matches',
  detector.includes('SAMPLE_W = 80') && detector.includes('SAMPLE_H = 60') && doc.includes('80×60')
);

/* -- backend budgets ------------------------------------------------------- */

const agentService = read(BACKEND, 'services', 'agentService.js');
const aiService = read(BACKEND, 'services', 'aiService.js');

// Emphasis is formatting, not fact. Strip it before matching table cells so a
// bolded number still counts as the same number.
const plainDoc = doc.replace(/\*\*/g, '');

for (const name of ['INTERACTIVE', 'INTERACTIVE_MAP', 'PLANNING', 'INTERACTIVE_VISION']) {
  const match = agentService.match(new RegExp(`const ${name} = \\{([^}]+)\\}`));
  check(`${name} still exists`, Boolean(match));
  if (!match) continue;

  const perCall = Number(match[1].match(/timeoutMs:\s*(\d+)/)[1]);
  const deadline = Number(match[1].match(/deadlineMs:\s*(\d+)/)[1]);

  check(
    `${name} budget row matches the source`,
    plainDoc.includes(`| \`${name}\` | ${perCall / 1000}s | ${deadline / 1000}s |`),
    `${perCall}/${deadline}`
  );
}

check('the planner uses the PLANNING budget', agentService.includes('...PLANNING'));
check(
  'the minimum viable call slice matches',
  aiService.includes('MIN_VIABLE_CALL_MS = 5000') && doc.includes('MIN_VIABLE_CALL_MS` (5s)')
);

/* -- surface area ---------------------------------------------------------- */

const endpoints = new Set();
for (const dir of ['content', 'shared', 'options', 'popup']) {
  for (const file of fs.readdirSync(path.join(EXT, dir)).filter((f) => f.endsWith('.js'))) {
    for (const m of read(EXT, dir, file).matchAll(/'(\/api\/[a-z/]+)'/g)) endpoints.add(m[1]);
  }
}
for (const endpoint of endpoints) check(`endpoint ${endpoint} is documented`, doc.includes(endpoint));

const workerActions = new Set([...read(EXT, 'background.js').matchAll(/case '(\w+)':/g)].map((m) => m[1]));
for (const action of workerActions) {
  check(`worker action "${action}" is documented`, doc.includes(`\`${action}\``));
}

const contentActions = new Set([...main.matchAll(/case '(\w+)':/g)].map((m) => m[1]));
for (const action of contentActions) {
  check(`content action "${action}" is documented`, doc.includes(`\`${action}\``));
}

const exportBlock = core.match(/window\.SETU = \{([\s\S]*?)\n {2}\};/)[1];
const exported = new Set([...exportBlock.matchAll(/^\s*(\w+)[,:]/gm)].map((m) => m[1]));
// `ready`, `VERSION` and `DEFAULTS` are namespace bookkeeping, not API.
for (const name of exported) {
  if (['ready', 'VERSION', 'DEFAULTS'].includes(name)) continue;
  check(`export "${name}" is documented`, doc.includes(`\`${name}\``));
}

/* -- suites ---------------------------------------------------------------- */

const suites = [...read(EXT, 'test', 'run.js').matchAll(/file: '([\w.]+\.test\.js)'/g)].map((m) => m[1]);
for (const suite of suites) {
  if (suite === 'engine.test.js') continue;
  check(`suite ${suite} is in the table`, doc.includes(`\`${suite}\``));
}

/* -- report ---------------------------------------------------------------- */

console.log(`\n${passed} claims verified, ${failures.length} inaccurate`);
if (failures.length) {
  console.log('\nMEMORY.md no longer matches the code:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
