/**
 * Icon set generator — `node icons/generate-icon-set.js`
 *
 * The design system mandates Phosphor duotone throughout and forbids
 * hand-drawn SVG. The web app gets them from `@phosphor-icons/web`, but an
 * extension cannot: content scripts run inside a shadow root on a hostile page,
 * a webfont would have to be re-declared per root and served as a
 * web-accessible resource, and the whole duotone font is 164 KB of woff2 for
 * the ~40 glyphs actually used here.
 *
 * So this lifts the real path data for exactly the icons in use out of the
 * package's `selection.json` and writes `shared/setu-icons.js` — authentic
 * Phosphor geometry, inline, no font loading, no network. Re-run it after
 * adding a name to ICONS below.
 *
 * Phosphor is MIT licensed (© Phosphor Icons); the attribution travels in the
 * generated file's header.
 */

const fs = require('fs');
const path = require('path');

const SELECTION = path.join(
  __dirname,
  '..',
  '..',
  'frontend',
  'node_modules',
  '@phosphor-icons',
  'web',
  'src',
  'duotone',
  'selection.json'
);

const OUT = path.join(__dirname, '..', 'shared', 'setu-icons.js');

/** Local name → Phosphor icon name. Keep this list minimal; it ships. */
const ICONS = {
  // Popup — AI actions
  robot: 'robot',
  'list-checks': 'list-checks',
  'chart-bar': 'chart-bar',
  'arrow-square-in': 'arrow-square-in',
  'arrow-square-out': 'arrow-square-out',

  // Popup — reading tools
  'text-aa': 'text-aa',
  rows: 'rows',
  ruler: 'ruler',
  crosshair: 'crosshair',
  'speaker-high': 'speaker-high',
  'arrows-down-up': 'arrows-down-up',
  eye: 'eye',
  wind: 'wind',
  palette: 'palette',

  // Chrome
  gear: 'gear',
  power: 'power',
  'magnifying-glass': 'magnifying-glass',
  x: 'x',
  minus: 'minus',
  plus: 'plus',
  check: 'check',
  warning: 'warning',
  info: 'info',
  'arrow-counter-clockwise': 'arrow-counter-clockwise',
  'caret-down': 'caret-down',
  'dots-six': 'dots-six',
  'arrows-out': 'arrows-out',

  // Commander
  'arrow-up': 'arrow-up',
  microphone: 'microphone',
  'book-open': 'book-open',
  'tree-structure': 'tree-structure',
  'pen-nib': 'pen-nib',
  'hand-pointing': 'hand-pointing',
  'seal-check': 'seal-check',

  // Media controls
  play: 'play',
  pause: 'pause',
  stop: 'stop',
  'skip-forward': 'skip-forward',
  'skip-back': 'skip-back'
};

/* -------------------------------------------------------------------------- */

if (!fs.existsSync(SELECTION)) {
  console.error(
    'Cannot find @phosphor-icons/web. Run `npm install` in ../frontend first —\n' +
      'this generator reads its icon data. The already-generated shared/setu-icons.js\n' +
      'is committed, so this is only needed when changing the icon list.'
  );
  process.exit(1);
}

const selection = JSON.parse(fs.readFileSync(SELECTION, 'utf8'));

// IcoMoon stores aliases in one comma-separated `name` field — "seal-check-
// duotone, circle-wavy-check-duotone" is a single entry. Indexing on the raw
// string silently loses every aliased icon, so split it.
const byName = new Map();
for (const entry of selection.icons) {
  for (const alias of String(entry.properties.name).split(',')) {
    const key = alias.trim();
    if (key && !byName.has(key)) byName.set(key, entry);
  }
}

const missing = [];
const entries = [];

for (const [local, phosphor] of Object.entries(ICONS)) {
  const found = byName.get(`${phosphor}-duotone`);
  if (!found) {
    missing.push(phosphor);
    continue;
  }
  // Path 0 is the 20%-opacity duotone plate, path 1 the solid figure.
  const [duo, solid] = found.icon.paths;
  entries.push([local, duo, solid ?? duo]);
}

if (missing.length) {
  console.error(`Not found in Phosphor duotone: ${missing.join(', ')}`);
  process.exitCode = 1;
  return;
}

const body = entries
  .map(([name, duo, solid]) => `    '${name}': ['${duo}', '${solid}']`)
  .join(',\n');

const source = `/**
 * SETU Lens — icon set.
 *
 * GENERATED FILE — do not edit by hand.
 * Run \`node icons/generate-icon-set.js\` to regenerate.
 *
 * Phosphor Icons (duotone), MIT licensed, © Phosphor Icons.
 * https://phosphoricons.com — path data extracted from @phosphor-icons/web.
 *
 * Inlined rather than loaded as a webfont because these render inside shadow
 * roots on arbitrary pages, where a font would have to be re-declared per root
 * and served as a web-accessible resource.
 */

(() => {
  /** name -> [duotone plate path, solid figure path] on a 1024 grid. */
  const PATHS = {
${body}
  };

  /**
   * Inline SVG markup for \`name\`.
   *
   * Returns an empty string for an unknown name rather than throwing: an icon
   * is decoration, and a missing one must never take a control with it.
   */
  function icon(name, { size = 20, className = '', title = '' } = {}) {
    const paths = PATHS[name];
    if (!paths) return '';

    const label = title
      ? \`role="img" aria-label="\${String(title).replace(/"/g, '&quot;')}"\`
      : 'aria-hidden="true"';

    return (
      \`<svg viewBox="0 0 1024 1024" width="\${size}" height="\${size}" fill="currentColor" \` +
      \`focusable="false" \${label}\${className ? \` class="\${className}"\` : ''}>\` +
      \`<path opacity="0.2" d="\${paths[0]}"/><path d="\${paths[1]}"/></svg>\`
    );
  }

  const scope = typeof self !== 'undefined' ? self : globalThis;
  scope.SETU_ICONS = { icon, names: Object.keys(PATHS) };
})();
`;

fs.writeFileSync(OUT, source);
console.log(`wrote ${path.relative(process.cwd(), OUT)} — ${entries.length} icons, ${(source.length / 1024).toFixed(1)} KB`);
