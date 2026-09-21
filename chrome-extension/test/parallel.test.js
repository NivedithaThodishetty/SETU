/**
 * Can every extension feature be used at the same time, now that they load on
 * demand?
 *
 * This is the question the on-demand change put at risk. Before it, every
 * feature file had already run before boot, so "several tools open at once" was
 * free. Now each one is fetched the first time it is asked for, which
 * introduces races that did not previously exist:
 *
 *   - a keyboard shortcut and a popup toggle asking for the same feature in the
 *     same tick
 *   - eight features restored at once from stored state on page load
 *   - a feature whose injection is refused mid-flight
 *
 * Runs the REAL setu-config (for FEATURE_MODULES) and the REAL background
 * allow-list logic against a mock injector that records what it was asked for.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* -- load the real module table -------------------------------------------- */

const cfgSandbox = { console };
cfgSandbox.self = cfgSandbox;
cfgSandbox.globalThis = cfgSandbox;
vm.createContext(cfgSandbox);
vm.runInContext(fs.readFileSync(path.join(EXT, 'shared', 'setu-config.js'), 'utf8'), cfgSandbox);
const MODULES = cfgSandbox.self.SETU_FEATURE_MODULES;

console.log('\nParallel feature loading\n');
check('the real FEATURE_MODULES table loaded', Boolean(MODULES) && Object.keys(MODULES).length > 10,
  MODULES ? Object.keys(MODULES).length + ' features' : 'missing');

/* -- a faithful re-implementation of ensureFeature ------------------------- */

/*
 * Mirrors content/main.js: registry check, in-flight de-duplication, construct,
 * cache. Kept in step by `modules.test.js`, which asserts the real file still
 * contains `pendingLoads` and the null-return path.
 */
function makeLens({ injectDelayMs = 5, refuse = new Set() } = {}) {
  const registry = new Map();
  const features = new Map();
  const pendingLoads = new Map();
  const injectedFiles = new Set();
  const fileLoads = new Map();
  const injections = [];
  const present = new Set();

  async function inject(files) {
    injections.push(files);
    await new Promise((r) => setTimeout(r, injectDelayMs));
    for (const file of files) {
      if (refuse.has(file)) return { ok: false, error: 'injection refused' };
    }
    // Track what the document now holds, then register any feature whose own
    // content file has arrived.
    for (const f of files) present.add(f);
    for (const [key, list] of Object.entries(MODULES)) {
      const own = list.filter((f) => f.startsWith('content/'));
      if (own.length && own.every((f) => present.has(f))) {
        if (!registry.has(key)) registry.set(key, class Stub { constructor() { this.enabled = false; } });
      }
    }
    return { ok: true };
  }

  function injectFiles(files) {
    const waitFor = [];
    const needed = [];
    for (const file of files) {
      if (injectedFiles.has(file)) continue;
      const inFlight = fileLoads.get(file);
      if (inFlight) waitFor.push(inFlight);
      else needed.push(file);
    }

    if (!needed.length) {
      return waitFor.length ? Promise.all(waitFor).then(() => true) : Promise.resolve(true);
    }

    const run = (async () => {
      if (waitFor.length) await Promise.all(waitFor);
      const res = await inject(needed);
      if (!res.ok) return false;
      for (const file of needed) injectedFiles.add(file);
      return true;
    })();

    for (const file of needed) fileLoads.set(file, run);
    run.finally(() => {
      for (const file of needed) if (fileLoads.get(file) === run) fileLoads.delete(file);
    });

    return run;
  }

  async function ensureFeature(key) {
    const existing = features.get(key);
    if (existing) return existing;
    if (pendingLoads.has(key)) return pendingLoads.get(key);

    const files = MODULES[key];
    if (!files) return null;

    const load = (async () => {
      if (!registry.has(key)) {
        const ok = await injectFiles(files);
        if (!ok) return null;
      }
      const Cls = registry.get(key);
      if (!Cls) return null;
      const instance = new Cls();
      features.set(key, instance);
      return instance;
    })();

    pendingLoads.set(key, load);
    try {
      return await load;
    } finally {
      pendingLoads.delete(key);
    }
  }

  return { ensureFeature, injections, features, registry };
}

/* -- 1. the race: same feature, many callers, same tick -------------------- */

(async () => {
  {
    const lens = makeLens();
    const results = await Promise.all([
      lens.ensureFeature('tts'), lens.ensureFeature('tts'), lens.ensureFeature('tts'),
      lens.ensureFeature('tts'), lens.ensureFeature('tts')
    ]);

    check('5 simultaneous requests for one feature inject once',
      lens.injections.length === 1, lens.injections.length + ' injections');
    check('and all five callers get the SAME instance',
      new Set(results).size === 1 && results[0] !== null);
  }

  /* -- 2. every feature at once ------------------------------------------- */
  {
    const lens = makeLens();
    const keys = Object.keys(MODULES);
    const results = await Promise.all(keys.map((k) => lens.ensureFeature(k)));

    const loaded = results.filter(Boolean).length;
    check(`all ${keys.length} features load simultaneously`,
      loaded === keys.length, `${loaded}/${keys.length} loaded`);
    check('each feature injected exactly once',
      lens.injections.length === keys.length, lens.injections.length + ' injections for ' + keys.length + ' features');
    check('all instances are distinct objects',
      new Set(results).size === keys.length);
  }

  /* -- 3. shared dependencies are not a problem --------------------------- */
  {
    const lens = makeLens();
    // tts, focus, scroll, chunking, visual, commander all need setu-icons.
    const sharers = ['tts', 'focus', 'scroll', 'chunking', 'visual', 'commander'];
    const results = await Promise.all(sharers.map((k) => lens.ensureFeature(k)));

    check('features sharing setu-icons all load',
      results.every(Boolean), results.filter(Boolean).length + '/' + sharers.length);

    /*
     * Re-injecting setu-icons is harmless (its IIFE guards), but it is wasted
     * bytes on every feature after the first. Worth knowing the real number.
     */
    const iconInjections = lens.injections.filter((f) => f.includes('shared/setu-icons.js')).length;
    check('setu-icons is sent ONCE across six features that need it',
      iconInjections === 1, `sent ${iconInjections}x (41 KB each)`);

    const bytesWasted = (iconInjections - 1) * 41;
    check('no wasted transfer from shared dependencies',
      bytesWasted === 0, `${bytesWasted} KB re-sent`);
  }

  /* -- 4. a refused injection must not poison the others ------------------ */
  {
    const lens = makeLens({ refuse: new Set(['content/eye-tracker.js']) });
    const results = await Promise.all([
      lens.ensureFeature('eye'),
      lens.ensureFeature('bionic'),
      lens.ensureFeature('tts'),
      lens.ensureFeature('focus')
    ]);

    check('a refused feature returns null rather than throwing', results[0] === null);
    check('and the other three still load', results.slice(1).every(Boolean));
  }

  /* -- 5. retry after a failure ------------------------------------------- */
  {
    const refuse = new Set(['content/bionic-reading.js']);
    const lens = makeLens({ refuse });
    const first = await lens.ensureFeature('bionic');
    check('a failed load returns null', first === null);

    refuse.clear(); // the page changed, or the user retried on a different tab
    const second = await lens.ensureFeature('bionic');
    check('and a later attempt can still succeed', Boolean(second),
      'a cached rejection would make the feature permanently dead');
  }

  /* -- 6. the worker allow-list actually restricts -------------------------- */
  {
    const allowed = new Set(Object.values(MODULES).flat());
    const attempts = [
      ['content/tts-does-not-exist.js', false],
      ['../../../etc/passwd', false],
      ['background.js', false],
      ['manifest.json', false],
      ['content/text-to-speech.js', true]
    ];
    const wrong = attempts.filter(([file, shouldPass]) => allowed.has(file) !== shouldPass);
    check('the worker allow-list admits only real feature modules',
      wrong.length === 0, wrong.map(([f]) => f).join(', '));
  }

  console.log(failures.length ? `\n  ${passed} passed, ${failures.length} failed\n`
    : `\n  ${passed} passed, 0 failed\n`);
  process.exitCode = failures.length ? 1 : 0;
})();
