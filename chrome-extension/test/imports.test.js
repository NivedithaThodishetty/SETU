/**
 * Static sweep over the content scripts: does every file that uses a SETU
 * runtime object actually pull it out of window.SETU?
 *
 * A missing one is a ReferenceError at feature-enable time — invisible until a
 * user turns that feature on, on some page, somewhere.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'content');
const CORE = path.join(__dirname, '..', 'shared', 'setu-core.js');

/**
 * Everything setu-core actually exports, read from setu-core itself.
 *
 * Hand-listing a handful of names meant the check silently stopped covering
 * the runtime as it grew: `Scroll`, `Dock`, `Page`, `Session` and later
 * `Reading`, `Bus` and the language helpers were all reachable without being
 * imported, and a missing one is a ReferenceError that only fires when a
 * particular user turns a particular feature on. Deriving the list keeps the
 * check honest as new exports appear.
 */
function coreExports() {
  const source = fs.readFileSync(CORE, 'utf8');
  const start = source.indexOf('window.SETU = {');
  const end = source.indexOf('\n  };', start);
  const body = source.slice(start, end);

  const names = new Set();
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*(\w+)[,:]/);
    if (match) names.add(match[1]);
  }

  // Data, not namespaces: these are used as bare values, so the `Name.` test
  // below cannot see them and a separate rule covers them.
  return names;
}

const EXPORTS = coreExports();

/** Exports used as plain values or functions rather than as `Name.thing`. */
const VALUE_LIKE = new Set([
  'LANGUAGES',
  'resolveLanguage',
  'languageLabel',
  'deepQueryAll',
  'readableRoots',
  'prefersReducedMotion',
  'icon'
]);

/**
 * Namespace bookkeeping rather than API: `ready` guards double-loading and
 * `VERSION` is read off `window.SETU` directly. Both are also ordinary English
 * words that occur in the user-facing strings these files are full of, so
 * checking them would report matches inside prose.
 */
const NOT_IMPORTED = new Set(['ready', 'VERSION', 'DEFAULTS']);

const NAMES = [...EXPORTS].filter((name) => !VALUE_LIKE.has(name) && !NOT_IMPORTED.has(name));

let problems = 0;

for (const file of fs.readdirSync(DIR).sort()) {
  if (!file.endsWith('.js')) continue;

  const source = fs.readFileSync(path.join(DIR, file), 'utf8');
  // Strip comments so prose like "Features driven by..." cannot register as use.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const destructured = new Set();
  /** Local name each import is bound to — `features: registry` binds `registry`. */
  const boundAs = new Map();

  const match = code.match(/const\s*\{([^}]+)\}\s*=\s*window\.SETU/);
  if (match) {
    for (const raw of match[1].split(',')) {
      const [key, alias] = raw.split(':').map((part) => part.trim());
      if (!key) continue;
      destructured.add(key);
      boundAs.set(key, alias || key);
    }
  }

  for (const name of NAMES) {
    const used =
      new RegExp(`(?<![.\\w])${name}\\.`).test(code) ||
      new RegExp(`extends\\s+${name}\\b`).test(code);
    const viaWindow = new RegExp(`window\\.SETU\\.${name}`).test(code);

    if (used && !destructured.has(name) && !viaWindow) {
      console.log(`  MISSING  ${file} uses ${name} without importing it`);
      problems += 1;
    }
    const local = boundAs.get(name) || name;
    const localUsed =
      used ||
      new RegExp(`(?<![.\\w])${local}\\b`).test(code) ||
      new RegExp(`extends\\s+${local}\\b`).test(code);

    if (destructured.has(name) && !localUsed) {
      console.log(`  unused   ${file} imports ${name} but never uses it`);
    }
  }

  // Value-like exports are called or read directly, so the `Name.` shape above
  // would never see them.
  for (const name of VALUE_LIKE) {
    const used = new RegExp(`(?<![.\\w])${name}\\b`).test(code);
    const viaWindow = new RegExp(`window\\.SETU\\.${name}`).test(code);
    const declaredLocally = new RegExp(`(?:const|let|var|function)\\s+${name}\\b`).test(code);

    if (used && !destructured.has(name) && !viaWindow && !declaredLocally) {
      console.log(`  MISSING  ${file} uses ${name} without importing it`);
      problems += 1;
    }
  }
}

console.log(problems ? `\n${problems} missing import(s)` : '\nno missing imports');
process.exitCode = problems ? 1 : 0;
