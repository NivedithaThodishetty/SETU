/**
 * On-demand module loading: the contract between the manifest, the feature
 * table, and the files that self-register.
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * Moving fifteen content scripts out of the manifest and behind
 * `ensureFeature()` cut every-page injection from ~473 KB to ~118 KB. It also
 * introduced a class of bug that did not previously exist and that fails
 * *silently*: under the old arrangement every feature file had already run
 * before boot, so a feature could not be missing. Now a feature whose key is
 * absent from `FEATURE_MODULES`, or whose file path has a typo, simply never
 * loads — `ensureFeature` logs a console warning nobody reads and the toggle
 * does nothing. The user sees a dead button.
 *
 * Every check here corresponds to a way that can happen. None of them needs a
 * browser: they are all static agreements between four files that must not
 * drift apart.
 */

const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(EXT, ...parts), 'utf8');

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

/* -- parse the three sources of truth --------------------------------------- */

const manifest = JSON.parse(read('manifest.json'));
const eager = manifest.content_scripts[0].js;

const configSource = read('shared', 'setu-config.js');
const tableMatch = configSource.match(/const FEATURE_MODULES = \{([\s\S]*?)\n  \};/);

if (!tableMatch) {
  console.log('  FAIL could not find FEATURE_MODULES in shared/setu-config.js');
  process.exit(1);
}

const MODULES = {};
for (const [, key, list] of tableMatch[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
  MODULES[key] = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const mainSource = read('content', 'main.js');
const backgroundSource = read('background.js');

console.log('\nOn-demand module loading');

/* -- 1. every listed file exists -------------------------------------------- */

const allListed = [...new Set(Object.values(MODULES).flat())];
const missingFiles = allListed.filter((file) => !fs.existsSync(path.join(EXT, file)));
check(
  `all ${allListed.length} listed module files exist`,
  missingFiles.length === 0,
  missingFiles.join(', ')
);

/* -- 2. every self-registering feature is reachable -------------------------- */

/*
 * The registry is populated by `window.SETU.features.set('key', Class)` at the
 * bottom of each feature file. A file that registers a key nothing can load is
 * dead code; a key in the table pointing at a file that registers a *different*
 * key loads the wrong thing. Both are invisible until a user clicks the button.
 */
const registrations = new Map(); // key -> file
for (const dir of ['content', 'shared']) {
  for (const name of fs.readdirSync(path.join(EXT, dir))) {
    if (!name.endsWith('.js')) continue;
    const rel = `${dir}/${name}`;
    for (const [, key] of read(dir, name).matchAll(/window\.SETU\.features\.set\('(\w+)'/g)) {
      registrations.set(key, rel);
    }
  }
}

check('features self-register in at least one file', registrations.size > 0);

for (const [key, file] of registrations) {
  const listed = MODULES[key];
  check(
    `"${key}" is reachable through FEATURE_MODULES`,
    Array.isArray(listed) && listed.includes(file),
    listed ? `table says ${listed.join(', ')} but "${key}" is registered in ${file}` : 'no table entry'
  );
}

/* -- 3. no table entry points at a key nothing registers --------------------- */

for (const key of Object.keys(MODULES)) {
  check(
    `"${key}" is actually registered by one of its files`,
    registrations.has(key),
    `no file calls features.set('${key}', ...)`
  );
}

/* -- 4. every toggleable feature can be loaded ------------------------------- */

/*
 * `applyState` loads whatever the user left switched on. A persisted toggle
 * with no module list restores as permanently off, and the stored `true` is
 * then overwritten with `false` — so the user's setting is silently discarded,
 * not merely ignored.
 */
const toggles = (mainSource.match(/const TOGGLES = \[([^\]]*)\]/) || [, ''])[1];
const toggleKeys = [...toggles.matchAll(/'(\w+)'/g)].map((m) => m[1]);

check('TOGGLES is not empty', toggleKeys.length > 0);
for (const key of toggleKeys) {
  check(`toggle "${key}" has a module list`, Boolean(MODULES[key]), 'missing from FEATURE_MODULES');
}

/* -- 5. eager and lazy sets do not overlap ----------------------------------- */

/*
 * A file in both is fetched eagerly AND re-executed on injection, which re-runs
 * its IIFE. That is the exact cost this change removed, paid twice.
 */
const overlap = allListed.filter((file) => eager.includes(file));
check('no file is both eager and lazily injected', overlap.length === 0, overlap.join(', '));

/* -- 6. the eager set stays small -------------------------------------------- */

const eagerBytes = eager.reduce((total, file) => total + fs.statSync(path.join(EXT, file)).size, 0);
const lazyBytes = allListed.reduce((total, file) => total + fs.statSync(path.join(EXT, file)).size, 0);
const eagerKb = Math.round(eagerBytes / 1024);

check(
  `the eager set stays under 150 KB (currently ${eagerKb} KB, ${Math.round(lazyBytes / 1024)} KB deferred)`,
  eagerKb < 150,
  `${eagerKb} KB on every page`
);
check('the manifest ships exactly the eager three', eager.length === 3, eager.join(', '));

/* -- 7. the worker can actually serve the request ---------------------------- */

check(
  'the worker handles "injectModules"',
  /case 'injectModules':/.test(backgroundSource),
  'main.js asks for it but background.js does not answer'
);
check(
  'the worker validates requested files against FEATURE_MODULES',
  /FEATURE_MODULES/.test(backgroundSource) && /allowed\.has/.test(backgroundSource),
  'a page-world caller could name arbitrary bundle paths'
);
check(
  'the worker reads the table from setu-config',
  /self\.SETU_FEATURE_MODULES/.test(backgroundSource)
);
check(
  'main.js asks the worker rather than calling chrome.scripting itself',
  /action: 'injectModules'/.test(mainSource) && !/chrome\.scripting/.test(mainSource),
  'chrome.scripting does not exist in a content script'
);

/* -- 8. the icon binding is resolved per call -------------------------------- */

/*
 * `setu-icons.js` is no longer eager. If `setu-core.js` captured `icon` once at
 * load — as it used to — the empty-string fallback would bind permanently and
 * every icon in the product would render as nothing, with no error anywhere.
 */
const coreSource = read('shared', 'setu-core.js');
check(
  'setu-core resolves icon() at call time, not load time',
  /const icon = \(\.\.\.args\) =>/.test(coreSource),
  'icon is captured once and will be the no-op fallback forever'
);
check(
  'the icon set is not in the eager manifest',
  !eager.includes('shared/setu-icons.js'),
  'if it is eager, the per-call resolution above is untested in production'
);

/* -- 9. concurrency and failure handling ------------------------------------- */

check(
  'ensureFeature de-duplicates concurrent loads',
  /pendingLoads/.test(mainSource),
  'a shortcut racing a popup toggle would inject twice'
);
check(
  'ensureFeature returns null rather than throwing on a refused injection',
  /injection refused|return null/.test(mainSource),
  'a restricted page would take the whole content script down'
);

/* --------------------------------------------------------------------------- */

console.log(
  failures.length
    ? `\n${passed} passed, ${failures.length} failed`
    : `\n${passed} passed, 0 failed`
);
if (failures.length) {
  for (const failure of failures) console.log(`  ✗ ${failure}`);
}
process.exitCode = failures.length ? 1 : 0;
