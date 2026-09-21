/**
 * Does every element the popup/options scripts reach for actually exist in
 * their markup, and is every wired control reachable from the script?
 *
 * The two halves are edited independently, and a stale `#id` fails silently at
 * runtime — the control simply does nothing, which is indistinguishable from a
 * broken extension.
 */

const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..');

const PAIRS = [
  { name: 'popup', html: 'popup/popup.html', js: 'popup/popup.js' },
  { name: 'options', html: 'options/options.html', js: 'options/options.js' }
];

let problems = 0;

for (const pair of PAIRS) {
  const html = fs.readFileSync(path.join(EXT, pair.html), 'utf8');
  const js = fs.readFileSync(path.join(EXT, pair.js), 'utf8');

  console.log(`\n${pair.name}`);

  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const htmlClasses = new Set(
    [...html.matchAll(/\bclass="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/))
  );
  const htmlDataAttrs = new Set([...html.matchAll(/\b(data-[a-z-]+)=/g)].map((m) => m[1]));

  /* --- every #id the script reaches for must exist --- */
  const wanted = new Set([
    ...[...js.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]),
    ...[...js.matchAll(/querySelector(?:All)?\('#([\w-]+)'\)/g)].map((m) => m[1]),
    ...[...js.matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1])
  ]);

  for (const id of [...wanted].sort()) {
    if (!htmlIds.has(id)) {
      console.log(`  MISSING in html: #${id}`);
      problems += 1;
    }
  }

  /* --- class selectors the script reaches for --- */
  const wantedClasses = new Set(
    [...js.matchAll(/querySelector(?:All)?\('\.([\w-]+)/g)].map((m) => m[1])
  );
  for (const cls of [...wantedClasses].sort()) {
    if (!htmlClasses.has(cls)) {
      console.log(`  MISSING in html: .${cls}`);
      problems += 1;
    }
  }

  /* --- data attributes the script queries --- */
  const wantedData = new Set(
    [...js.matchAll(/querySelector(?:All)?\('\[?(data-[a-z-]+)/g)].map((m) => m[1])
  );
  for (const attr of [...wantedData].sort()) {
    if (!htmlDataAttrs.has(attr)) {
      console.log(`  MISSING in html: [${attr}]`);
      problems += 1;
    }
  }

  /* --- every id in the markup should be used, or it is dead weight --- */
  for (const id of [...htmlIds].sort()) {
    if (!wanted.has(id)) console.log(`  unused in js : #${id}`);
  }

  console.log(`  ${wanted.size} ids + ${wantedClasses.size} classes referenced`);
}

console.log(problems ? `\n${problems} broken reference(s)` : '\nall references resolve');
process.exitCode = problems ? 1 : 0;
