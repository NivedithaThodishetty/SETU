/**
 * Package the extension — `node build.js`
 *
 * Verifies the extension before it is zipped, because the failure mode this
 * guards against is expensive: an upload with a mistyped path or a syntax
 * error in one content script installs fine, then breaks silently on real
 * pages, and a Chrome Web Store review round-trip costs days.
 *
 * Checks, then writes `dist/setu-lens-<version>.zip`:
 *   1. Every path the manifest references actually exists.
 *   2. Every shipped .js file parses.
 *   3. Every icon the manifest declares is a real PNG of the right size.
 *   4. No stray development files are swept into the package.
 *
 * Deliberately dependency-free — the ZIP writer below is about 80 lines and is
 * worth that to keep `node build.js` working on a clean checkout.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'dist');

/** Never packaged, whatever else is in the folder. */
const EXCLUDE_DIRS = new Set(['dist', 'test', 'node_modules', '.git']);
// Developer tooling and store paperwork: useful in the repo, dead weight in
// the package, and an unexplained script in the bundle invites review questions.
const EXCLUDE_FILES = new Set([
  'build.js',
  'pack.js',
  'generate-icons.js',
  'generate-icon-set.js',
  'STORE_LISTING.md',
  '.DS_Store'
]);
// .pem especially: shipping the signing key would hand anyone the ability to
// publish updates as this extension.
const EXCLUDE_EXT = new Set(['.zip', '.crx', '.pem', '.log', '.map']);

const problems = [];
const notes = [];

/**
 * Control characters that must never appear in source.
 *
 * This is not hypothetical tidiness. A `\b` word boundary in a regular
 * expression was once written into this codebase as a literal backspace byte
 * (0x08) by an editing pass that mis-escaped it. The file still parsed, the
 * extension still loaded, and the regex silently matched nothing at all — so
 * the Commander stopped recognising action requests and answered them with
 * prose instead of doing them. Nothing but a byte-level check finds that: it is
 * invisible in every editor, and valid JavaScript.
 *
 * Tab, newline and carriage return are the only C0 characters with any business
 * being in a source file.
 */
const ALLOWED_CONTROL = new Set([0x09, 0x0a, 0x0d]);

function verifyNoControlCharacters(files) {
  for (const file of files) {
    if (!/\.(js|json|html|css|md)$/i.test(file)) continue;

    let buffer;
    try {
      buffer = fs.readFileSync(path.join(ROOT, file));
    } catch (_) {
      continue;
    }

    for (let i = 0; i < buffer.length; i += 1) {
      const byte = buffer[i];
      if (byte >= 0x20 || ALLOWED_CONTROL.has(byte)) continue;

      const line = buffer.subarray(0, i).toString('utf8').split('\n').length;
      problems.push(
        `${file}:${line} contains a raw control character (0x${byte.toString(16).padStart(2, '0')}). ` +
          'A mis-escaped sequence — most likely a regex escape written as a literal byte.'
      );
      break;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

function readManifest() {
  const file = path.join(ROOT, 'manifest.json');
  if (!fs.existsSync(file)) {
    problems.push('manifest.json is missing.');
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`manifest.json is not valid JSON: ${error.message}`);
    return null;
  }
}

/** Collect every path the manifest points at, so none can silently go stale. */
function manifestPaths(manifest) {
  const paths = [];

  const pushIcons = (icons) => {
    for (const [size, file] of Object.entries(icons || {})) paths.push({ file, size: Number(size) });
  };

  pushIcons(manifest.icons);
  pushIcons(manifest.action?.default_icon);

  if (manifest.action?.default_popup) paths.push({ file: manifest.action.default_popup });
  if (manifest.options_ui?.page) paths.push({ file: manifest.options_ui.page });
  if (manifest.background?.service_worker) paths.push({ file: manifest.background.service_worker });

  for (const entry of manifest.content_scripts || []) {
    for (const file of entry.js || []) paths.push({ file });
    for (const file of entry.css || []) paths.push({ file });
  }

  // Web-accessible resources fail *silently*: a stale path here does not stop
  // the extension loading, it just makes whatever needed that file quietly
  // stop working on every site. Gaze Scroll's camera frame is exactly such a
  // file, so a typo would look like a camera bug rather than a build one.
  // Glob entries are skipped — only literal paths can be checked.
  for (const entry of manifest.web_accessible_resources || []) {
    for (const file of entry.resources || []) {
      if (file.includes('*')) continue;
      paths.push({ file });
    }
  }

  return paths;
}

/**
 * The limits Chrome and the Web Store enforce at load and upload time.
 *
 * These fail the build rather than warn, because every one of them is a hard
 * rejection later: an over-long description is refused by the store listing
 * form, a fifth suggested key is dropped silently at load, and a malformed
 * version stops the extension loading at all.
 */
function verifyStoreLimits(manifest) {
  const name = String(manifest.name || '');
  if (!name) problems.push('manifest has no name.');
  if (name.length > 75) problems.push(`name is ${name.length} characters; Chrome allows 75.`);

  const description = String(manifest.description || '');
  if (!description) problems.push('manifest has no description.');
  if (description.length > 132) {
    problems.push(`description is ${description.length} characters; Chrome allows 132.`);
  }

  // 1-4 dot-separated integers, each 0-65535, no leading zeroes.
  const version = String(manifest.version || '');
  const parts = version.split('.');
  const validVersion =
    parts.length >= 1 &&
    parts.length <= 4 &&
    parts.every((part) => /^(0|[1-9]\d*)$/.test(part) && Number(part) <= 65535);
  if (!validVersion) {
    problems.push(`version "${version}" is not 1-4 dot-separated integers in 0-65535.`);
  }

  // Chrome honours at most four suggested key bindings per extension.
  const suggested = Object.values(manifest.commands || {}).filter((c) => c.suggested_key);
  if (suggested.length > 4) {
    problems.push(`${suggested.length} commands declare a suggested_key; Chrome honours 4.`);
  }

  // Remote code is the most common review rejection.
  const csp = manifest.content_security_policy?.extension_pages || '';
  if (/unsafe-eval|unsafe-inline|https?:/.test(csp)) {
    problems.push(`extension_pages CSP loosens script-src ("${csp}") — the store rejects remote code.`);
  }

  if (manifest.manifest_version !== 3) {
    problems.push(`manifest_version is ${manifest.manifest_version}; the store only accepts 3.`);
  }
}

function verifyReferences(manifest) {
  for (const { file, size } of manifestPaths(manifest)) {
    const absolute = path.join(ROOT, file);
    if (!fs.existsSync(absolute)) {
      problems.push(`manifest references "${file}", which does not exist.`);
      continue;
    }
    if (size) verifyPng(absolute, file, size);
  }
}

/** Read a PNG header directly — a mislabelled icon is rejected at upload. */
function verifyPng(absolute, file, expectedSize) {
  const buffer = fs.readFileSync(absolute);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];

  if (buffer.length < 24 || signature.some((byte, i) => buffer[i] !== byte)) {
    problems.push(`"${file}" is not a PNG.`);
    return;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== expectedSize || height !== expectedSize) {
    problems.push(`"${file}" is ${width}x${height}, but the manifest declares ${expectedSize}.`);
  }
}

/** Parse every shipped script. A syntax error here is a dead extension. */
function verifyScripts(files) {
  for (const file of files) {
    if (path.extname(file) !== '.js') continue;
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    try {
      new vm.Script(source, { filename: file });
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
    }
  }
}

/**
 * Warn when the packaged engine URL is a localhost address.
 *
 * That is correct for local development and wrong for anything published, and
 * it is the single most common reason a shipped build has no working AI.
 */
function verifyDefaults() {
  const file = path.join(ROOT, 'shared', 'setu-config.js');
  if (!fs.existsSync(file)) return;

  const source = fs.readFileSync(file, 'utf8');
  const host = source.match(/apiHost:\s*'([^']+)'/)?.[1];
  const app = source.match(/sanctuaryUrl:\s*'([^']+)'/)?.[1];

  for (const [label, url] of [['engine', host], ['Sanctuary', app]]) {
    if (!url) continue;
    if (/localhost|127\.0\.0\.1/.test(url)) {
      notes.push(
        `Default ${label} URL is "${url}". Fine for local use; set a public https URL in ` +
          'shared/setu-config.js before publishing to the Web Store.'
      );
    } else if (!/^https:\/\//.test(url)) {
      // A published extension calling http:// is blocked as mixed content on
      // every https page, which is most of the web.
      problems.push(`Default ${label} URL "${url}" is not https.`);
    }
  }

  if (host && app) {
    notes.push(`Ships pointing at ${host} (engine) and ${app} (Sanctuary).`);
  }
}

/* -------------------------------------------------------------------------- */
/* File collection                                                            */
/* -------------------------------------------------------------------------- */

function collectFiles(dir = ROOT, prefix = '') {
  const collected = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      collected.push(...collectFiles(path.join(dir, entry.name), relative));
      continue;
    }

    if (EXCLUDE_FILES.has(entry.name)) continue;
    if (EXCLUDE_EXT.has(path.extname(entry.name))) continue;
    collected.push(relative);
  }

  return collected.sort();
}

/* -------------------------------------------------------------------------- */
/* Minimal ZIP writer                                                         */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/** MS-DOS timestamp, as the ZIP local header wants it. */
function dosStamp(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function writeZip(files, target) {
  const stamp = dosStamp(new Date());
  const locals = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file, 'utf8');
    const raw = fs.readFileSync(path.join(ROOT, file));
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    // Storing is smaller than deflating for already-compressed data (PNGs).
    const store = deflated.length >= raw.length;
    const body = store ? raw : deflated;
    const method = store ? 0 : 8;
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, name, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(stamp.time, 12);
    entry.writeUInt16LE(stamp.day, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30); // extra
    entry.writeUInt16LE(0, 32); // comment
    entry.writeUInt16LE(0, 34); // disk
    entry.writeUInt16LE(0, 36); // internal attrs
    entry.writeUInt32LE(0, 38); // external attrs
    entry.writeUInt32LE(offset, 42);

    central.push(entry, name);
    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(target, Buffer.concat([...locals, directory, end]));
}

/* -------------------------------------------------------------------------- */

function main() {
  const manifest = readManifest();
  if (!manifest) {
    report();
    return;
  }

  const files = collectFiles();

  verifyStoreLimits(manifest);
  verifyReferences(manifest);
  verifyScripts(files);
  verifyNoControlCharacters(files);
  verifyDefaults();

  if (problems.length) {
    report();
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const target = path.join(OUT_DIR, `setu-${manifest.version}.zip`);
  writeZip(files, target);

  const kb = (fs.statSync(target).size / 1024).toFixed(1);
  console.log(`SETU ${manifest.version}`);
  console.log(`  ${files.length} files verified`);
  console.log(`  → ${path.relative(process.cwd(), target)} (${kb} KB)`);
  report();
}

function report() {
  for (const note of notes) console.log(`\n  note: ${note}`);
  if (problems.length) {
    console.error('\nBuild failed:');
    for (const problem of problems) console.error(`  - ${problem}`);
  }
}

main();
