/**
 * Does every CSS custom property a stylesheet uses actually get defined
 * somewhere that stylesheet can see?
 *
 * This exists because of a real bug: the popup names its tokens `--color-accent`
 * and the options page names the same token `--accent`. A block copied between
 * them referenced `--color-accent` in options.css, where it does not exist.
 * `background: var(--color-accent)` is then invalid at computed-value time, so
 * the declaration is dropped and the element silently paints transparent —
 * while the neighbouring `color: var(--on-accent)` still worked, because that
 * one name happens to exist in both. The result was a selected button with no
 * fill and no error anywhere.
 *
 * The content scripts are checked too: their CSS lives in JS string arrays and
 * draws on the token set defined in setu-core's baseStyle.
 */

const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..');

/** Properties the browser provides or that are set from inline style attributes. */
const AMBIENT = new Set(['--sw', '--sf']);

const read = (relative) => fs.readFileSync(path.join(EXT, relative), 'utf8');

const defined = (source) =>
  new Set([
    ...[...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
    // Set at runtime from script — the ruler colour is assigned this way.
    ...[...source.matchAll(/setProperty\(\s*['"](--[\w-]+)['"]/g)].map((m) => m[1])
  ]);

/**
 * Only references without a fallback can break. `var(--dim, .55)` is fine
 * however `--dim` is (or isn't) defined, so flagging it would be noise.
 */
const referenced = (source) =>
  new Set(
    [...source.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)]
      .filter((m) => m[2] === ')')
      .map((m) => m[1])
  );

let problems = 0;

function check(label, sources, extraDefinitions = []) {
  const combined = sources.map(read).join('\n');
  const available = new Set([...AMBIENT, ...defined(combined)]);
  for (const extra of extraDefinitions) {
    for (const name of defined(read(extra))) available.add(name);
  }

  const missing = [...referenced(combined)].filter((name) => !available.has(name)).sort();

  if (missing.length) {
    console.log(`  ${label}`);
    for (const name of missing) {
      console.log(`    MISSING  ${name} is used but never defined`);
      problems += 1;
    }
  } else {
    console.log(`  ok  ${label} — ${referenced(combined).size} properties all defined`);
  }
}

// Each page defines its own token set; its markup can contribute via inline style.
check('popup', ['popup/popup.css', 'popup/popup.html']);
check('options', ['options/options.css', 'options/options.html']);

// Content scripts inherit the shadow-root token set from setu-core's baseStyle.
const contentFiles = fs
  .readdirSync(path.join(EXT, 'content'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => `content/${f}`);

for (const file of contentFiles) {
  const source = read(file);
  if (!referenced(source).size) continue;
  check(file, [file], ['shared/setu-core.js']);
}

console.log(problems ? `\n${problems} undefined custom propert(ies)` : '\nevery custom property resolves');
/* -------------------------------------------------------------------------- */
/* Reading-theme contrast                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The reading themes recolour arbitrary websites, which means they can just as
 * easily destroy contrast as improve it — and nothing re-verified the result.
 *
 * The specific failure this guards: the theme applied `color: {text}` and
 * `background-color: transparent` to essentially every element, so on a real
 * site a primary button, a destructive button and a paragraph all collapsed to
 * the same colour on the same background. A "Delete account" button became
 * visually indistinguishable from body text. An accessibility feature that
 * removes the affordance telling you what is clickable is an accessibility
 * regression, and it lands on the users least able to absorb it.
 *
 * Controls are now carved out of the override and given `btnBg` / `btnBorder`.
 * These assertions are what stop a future palette tweak from quietly
 * reintroducing the collapse:
 *
 *   text on btnBg    >= 4.5:1   WCAG 2.1 SC 1.4.3 Contrast (Minimum), AA
 *   btnBorder on bg  >= 3:1     WCAG 2.1 SC 1.4.11 Non-text Contrast, AA
 *   text on bg       >= 4.5:1   the body copy the theme exists to make readable
 */

function relativeLuminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4]
    .map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

console.log('\nReading-theme contrast');

const themeSource = read('content/dyslexia-theme.js');
const themeBlock = themeSource.match(/const THEMES = \{([\s\S]*?)\n  \};/);

let contrastProblems = 0;

if (!themeBlock) {
  console.log('  FAIL  could not find the THEMES table in content/dyslexia-theme.js');
  contrastProblems += 1;
} else {
  const entries = [...themeBlock[1].matchAll(/^\s*(\w+):\s*\{(.+)\},?\s*$/gm)];

  if (!entries.length) {
    console.log('  FAIL  THEMES table parsed but yielded no themes');
    contrastProblems += 1;
  }

  for (const [, name, body] of entries) {
    // Built from a literal rather than `new RegExp(key + '...')` with escapes:
    // a single backslash inside a JS string is not an escape the regex ever
    // sees, so ":\s*" silently becomes ":s*" and every field comes back
    // undefined — which reads exactly like a missing colour.
    const field = (key) => {
      const pattern = new RegExp(`\\b${key}:\\s*'(#[0-9a-fA-F]{3,8})'`);
      return (body.match(pattern) || [])[1];
    };

    const bg = field('bg');
    const text = field('text');
    const btnBg = field('btnBg');
    const btnBorder = field('btnBorder');

    if (!bg || !text || !btnBg || !btnBorder) {
      console.log(`  FAIL  ${name} — missing a colour (bg/text/btnBg/btnBorder must all be hex)`);
      contrastProblems += 1;
      continue;
    }

    const assertions = [
      ['body text on page', contrastRatio(text, bg), 4.5],
      ['control text on control', contrastRatio(text, btnBg), 4.5],
      ['control border on page', contrastRatio(btnBorder, bg), 3]
    ];

    for (const [label, ratio, minimum] of assertions) {
      if (ratio >= minimum) {
        console.log(`  ok  ${name}: ${label} ${ratio.toFixed(2)}:1 (needs ${minimum})`);
      } else {
        console.log(`  FAIL  ${name}: ${label} ${ratio.toFixed(2)}:1 — below ${minimum}:1`);
        contrastProblems += 1;
      }
    }
  }
}

console.log(
  contrastProblems
    ? `\n${contrastProblems} contrast failure(s)`
    : '\nevery reading theme keeps controls distinguishable and text legible'
);

process.exitCode = problems || contrastProblems ? 1 : 0;
