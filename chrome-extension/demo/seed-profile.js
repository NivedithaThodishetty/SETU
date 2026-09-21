#!/usr/bin/env node
/**
 * Load the demo applicant into the extension's saved-details store.
 *
 * The profile lives in `chrome.storage.local` under `setuProfile`, inside the
 * browser — deliberately not in MongoDB and deliberately not in
 * `chrome.storage.sync`. Sync would push a home address and a date of birth
 * through a Google account to every machine that account touches, which is
 * exactly the thing the design refuses to do. That means this script cannot
 * write the profile itself: nothing outside the browser can reach that store.
 *
 * So it does the two things it usefully can:
 *
 *   1. VALIDATES `profile-demo.json` against the real field catalogue in
 *      `shared/setu-profile.js`, so a typo'd key or an option that is not in a
 *      dropdown's list is caught here rather than silently ignored at load.
 *   2. PRINTS a one-line snippet to paste into the extension's console, which
 *      writes the validated profile in.
 *
 * Usage:
 *   node demo/seed-profile.js                     validate + print the snippet
 *   node demo/seed-profile.js --with-placeholders include the invalid ID stand-ins
 *   node demo/seed-profile.js --out seed.js       write the snippet to a file
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const WITH_PLACEHOLDERS = args.includes('--with-placeholders');
const OUT = (() => {
  const i = args.indexOf('--out');
  return i !== -1 ? args[i + 1] : null;
})();

/* -------------------------------------------------------------------------- */
/* Load the real catalogue                                                    */
/* -------------------------------------------------------------------------- */

const profileModule = path.join(EXT, 'shared', 'setu-profile.js');

if (!fs.existsSync(profileModule)) {
  console.error(`
  shared/setu-profile.js is not present on this branch.

  The saved-details autofill lives on 'feat/copilot-saved-details-autofill' and
  has not been merged. Without it there is no store to seed and no catalogue to
  validate against.

    git merge feat/copilot-saved-details-autofill

  Then run this again.
`);
  process.exit(1);
}

/**
 * Run the real module in a sandbox to read its catalogue.
 *
 * Reading the schema from the shipped file rather than restating it here is the
 * point: a copy would drift, and the failure mode of drift is a demo profile
 * whose keys are silently discarded on load, leaving half the form unfilled on
 * stage with no error anywhere.
 */
const sandbox = {
  console,
  chrome: {
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    runtime: { lastError: null }
  }
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(profileModule, 'utf8'), sandbox, { filename: 'setu-profile.js' });

const Profile = sandbox.self.SETU_PROFILE;
if (!Profile) {
  console.error('  setu-profile.js loaded but did not expose SETU_PROFILE.');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Validate                                                                   */
/* -------------------------------------------------------------------------- */

const demo = JSON.parse(fs.readFileSync(path.join(__dirname, 'profile-demo.json'), 'utf8'));

const values = { ...demo.profile };
if (WITH_PLACEHOLDERS) {
  for (const [key, value] of Object.entries(demo.placeholders)) {
    if (key === '_readme') continue;
    values[key] = value;
  }
}

const problems = [];
const sensitiveFilled = [];

for (const [key, value] of Object.entries(values)) {
  const field = Profile.fieldFor(key);

  if (!field) {
    problems.push(`unknown key "${key}" — not in the catalogue, would be discarded on load`);
    continue;
  }

  // A value outside a dropdown's option list is not merely odd: the editor
  // renders a select, and a value it has no option for shows as blank.
  if (field.options && value && !field.options.includes(value)) {
    problems.push(`"${key}" = ${JSON.stringify(value)} is not one of: ${field.options.join(', ')}`);
  }

  if (field.sensitive && value) sensitiveFilled.push(key);
}

const known = new Set(Object.keys(values));
const missing = Profile.FIELDS.filter((f) => !f.sensitive && !known.has(f.key)).map((f) => f.key);

console.log('\n  Demo applicant — validation against the shipped catalogue\n');
console.log(`    fields provided     ${Object.keys(values).length}`);
console.log(`    catalogue fields    ${Profile.FIELDS.length} (${Profile.FIELDS.filter((f) => f.sensitive).length} sensitive)`);
console.log(`    non-sensitive gaps  ${missing.length}${missing.length ? ` — ${missing.join(', ')}` : ''}`);

if (sensitiveFilled.length) {
  console.log(`\n    SENSITIVE FIELDS FILLED: ${sensitiveFilled.join(', ')}`);
  console.log('    These are format-invalid stand-ins for screenshots. A real portal will');
  console.log('    reject them, which is the point. Do not submit a form filled with them.');
} else {
  console.log('\n    Government ID and bank fields: EMPTY, by design.');
  console.log('    The agent will fill everything else and stop at these — which is worth');
  console.log('    saying out loud in the demo rather than apologising for.');
}

if (problems.length) {
  console.error('\n  PROBLEMS:');
  for (const problem of problems) console.error(`    ✗ ${problem}`);
  console.error('');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Emit                                                                       */
/* -------------------------------------------------------------------------- */

/*
 * Written through the module's own `save()` rather than straight to
 * chrome.storage.local, so the stored record goes through `normalise` and picks
 * up the schema version and the derived fields (fullName, age, dobDMY and the
 * rest). A raw write would store a shape the loader then has to repair, and the
 * derived values — which is what a form asking for "Full Name" actually matches
 * against — would simply be absent.
 */
const snippet =
  `await SETU_PROFILE.save(${JSON.stringify(values)});\n` +
  `console.log('SETU demo profile loaded:', (await SETU_PROFILE.load()).fullName);`;

if (OUT) {
  fs.writeFileSync(OUT, snippet + '\n');
  console.log(`\n  Snippet written to ${OUT}\n`);
} else {
  console.log('\n  ────────────────────────────────────────────────────────────────');
  console.log('  Paste this into the extension\'s console:');
  console.log('    chrome://extensions -> SETU -> "service worker"');
  console.log('  ────────────────────────────────────────────────────────────────\n');
  console.log(snippet);
  console.log('\n  Then open the options page to see it, or open any form and ask the');
  console.log('  agent to fill it.\n');
}
