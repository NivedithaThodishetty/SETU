/**
 * Test runner — `node test/run.js [engineUrl]`
 *
 * Two of these run without any server; the third needs a live SETU engine and
 * is skipped with a clear message when there isn't one, so the offline suite
 * stays useful on a laptop with no backend running.
 *
 * Not packaged — build.js excludes the test directory.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const engineUrl = process.argv[2] || process.env.SETU_ENGINE_URL || 'https://setu-37hl.onrender.com';

const suites = [
  { name: 'imports', file: 'imports.test.js', args: [], needsEngine: false },
  { name: 'dom contracts', file: 'dom.test.js', args: [], needsEngine: false },
  { name: 'icon contracts', file: 'icons.test.js', args: [], needsEngine: false },
  { name: 'css contracts', file: 'css.test.js', args: [], needsEngine: false },
  { name: 'core runtime', file: 'core.test.js', args: [], needsEngine: false },
  { name: 'gaze control law', file: 'gaze.test.js', args: [], needsEngine: false },
  { name: 'agent behaviour', file: 'agent.test.js', args: [], needsEngine: false },
  { name: 'module loading', file: 'modules.test.js', args: [], needsEngine: false },
  { name: 'parallel features', file: 'parallel.test.js', args: [], needsEngine: false },
  { name: 'saved details', file: 'profile.test.js', args: [], needsEngine: false },
  { name: 'MEMORY.md accuracy', file: 'memory.test.js', args: [], needsEngine: false },
  { name: 'engine end-to-end', file: 'engine.test.js', args: [engineUrl], needsEngine: true }
];

/**
 * Probe generously: the hosted engine sleeps when idle and takes the better
 * part of a minute to wake, so a short timeout would skip the end-to-end suite
 * against a service that is perfectly healthy.
 */
async function engineIsUp() {
  const target = `${engineUrl.replace(/\/+$/, '')}/api/health`;

  for (const [attempt, budget] of [[1, 6000], [2, 75000]]) {
    if (attempt === 2) console.log(`    engine did not answer in 6s — waking it (up to 75s)…`);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), budget);
      const response = await fetch(target, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return true;
    } catch (_) {
      /* try the longer budget, then give up */
    }
  }
  return false;
}

(async () => {
  const up = await engineIsUp();
  let failed = 0;

  for (const suite of suites) {
    if (suite.needsEngine && !up) {
      console.log(`\n=== ${suite.name} — SKIPPED (no engine at ${engineUrl}) ===`);
      console.log('    Start it with `npm start` in ../backend to run this suite.');
      continue;
    }

    console.log(`\n=== ${suite.name} ===`);
    const result = spawnSync(process.execPath, [path.join(__dirname, suite.file), ...suite.args], {
      stdio: 'inherit'
    });
    if (result.status !== 0) failed += 1;
  }

  console.log(failed ? `\n${failed} suite(s) failed.` : '\nAll suites passed.');
  process.exitCode = failed ? 1 : 0;
})();
