/**
 * Does every icon the UI asks for exist in the generated set?
 *
 * A missing name renders an empty string by design, so the failure is a blank
 * button rather than an error — invisible in review, obvious to a user.
 */

const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..');

global.self = global;
require(path.join(EXT, 'shared', 'setu-icons.js'));
const available = new Set(self.SETU_ICONS.names);

const targets = [
  'popup/popup.html',
  'options/options.html',
  ...fs.readdirSync(path.join(EXT, 'content')).map((f) => `content/${f}`)
].filter((f) => /\.(html|js)$/.test(f));

let problems = 0;
const used = new Set();

for (const file of targets) {
  const source = fs.readFileSync(path.join(EXT, file), 'utf8');

  const names = [
    // markup: data-icon="name"
    ...[...source.matchAll(/data-icon="([\w-]+)"/g)].map((m) => m[1]),
    // scripts: icon('name'  /  icon("name"
    ...[...source.matchAll(/\bicon\(\s*['"]([\w-]+)['"]/g)].map((m) => m[1])
  ];

  for (const name of names) {
    used.add(name);
    if (!available.has(name)) {
      console.log(`  MISSING  ${file} asks for "${name}"`);
      problems += 1;
    }
  }
}

for (const name of [...available].sort()) {
  if (!used.has(name)) console.log(`  unused   "${name}" is generated but never drawn`);
}

console.log(
  problems
    ? `\n${problems} missing icon reference(s)`
    : `\nall ${used.size} icon references resolve`
);
process.exitCode = problems ? 1 : 0;
