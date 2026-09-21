/**
 * Pack a signed .crx — `node pack.js`
 *
 * `build.js` produces the .zip the Chrome Web Store wants. This produces the
 * signed .crx you need for the other two deployment routes: self-hosting with
 * an update manifest, and enterprise policy installs.
 *
 * It packs the *staged copy extracted from the verified zip*, not the working
 * folder, so the .crx contains exactly the files build.js checked — no test
 * directory, no signing key, no editor leftovers.
 *
 * The signing key is the extension's identity. Reusing it keeps the extension
 * ID stable across releases; losing it means every existing install stops
 * recognising your updates. It is written to dist/, which is gitignored, and
 * must never be committed or shared.
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const STAGING = path.join(DIST, 'staging');
const KEY = path.join(DIST, 'setu-signing-key.pem');

/* -------------------------------------------------------------------------- */
/* Locate a Chromium browser                                                  */
/* -------------------------------------------------------------------------- */

/** Any Chromium build can pack a .crx; they all take the same switches. */
function findBrowser() {
  const candidates =
    process.platform === 'win32'
      ? [
          `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
          `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
            '/snap/bin/chromium'
          ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

/* -------------------------------------------------------------------------- */
/* Extension identity                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Chrome derives the extension ID from the SHA-256 of the DER public key:
 * the first 16 bytes, with each hex nibble mapped 0-f onto a-p.
 */
function identity(pemPath) {
  const privateKey = crypto.createPrivateKey(fs.readFileSync(pemPath));
  const der = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const digest = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);

  return {
    id: [...digest].map((nibble) => String.fromCharCode(parseInt(nibble, 16) + 97)).join(''),
    publicKey: der.toString('base64')
  };
}

/** Sanity-check the packed file really is a CRX3 archive. */
function verifyCrx(file) {
  const header = fs.readFileSync(file).subarray(0, 8);
  if (header.subarray(0, 4).toString('ascii') !== 'Cr24') {
    throw new Error(`${path.basename(file)} is not a CRX archive.`);
  }
  const format = header.readUInt32LE(4);
  if (format !== 3) throw new Error(`${path.basename(file)} is CRX${format}; Chrome requires CRX3.`);
}

/* -------------------------------------------------------------------------- */

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const zip = path.join(DIST, `setu-${manifest.version}.zip`);

  if (!fs.existsSync(zip)) {
    console.error(`No ${path.relative(ROOT, zip)} — run \`node build.js\` first.`);
    process.exitCode = 1;
    return;
  }

  const browser = findBrowser();
  if (!browser) {
    console.error(
      'No Chromium browser found to sign with.\n' +
        'Install Chrome or Edge, or upload the .zip to the Web Store instead —\n' +
        'the store signs the package itself and does not need a .crx.'
    );
    process.exitCode = 1;
    return;
  }

  // Pack the verified contents, not the working directory.
  fs.rmSync(STAGING, { recursive: true, force: true });
  fs.mkdirSync(STAGING, { recursive: true });
  extractZip(zip, STAGING);

  const producedCrx = path.join(DIST, 'staging.crx');
  const producedKey = path.join(DIST, 'staging.pem');
  fs.rmSync(producedCrx, { force: true });

  // Chromium refuses to pack when a key file already sits beside the target
  // directory and it was not told to use one, so a leftover from an
  // interrupted run silently blocks every subsequent pack. Promote it if it is
  // the only key we have; otherwise clear it out of the way.
  if (fs.existsSync(producedKey)) {
    if (fs.existsSync(KEY)) fs.rmSync(producedKey, { force: true });
    else fs.renameSync(producedKey, KEY);
  }

  const reusingKey = fs.existsSync(KEY);
  const args = [
    `--pack-extension=${STAGING}`,
    '--no-message-box',
    '--no-first-run',
    // A throwaway profile is essential: without it the switch is handed to an
    // already-running browser instance, which ignores it entirely and exits
    // straight away, packing nothing.
    `--user-data-dir=${path.join(DIST, '.pack-profile')}`
  ];
  if (reusingKey) args.push(`--pack-extension-key=${KEY}`);

  try {
    execFileSync(browser, args, { stdio: 'ignore', timeout: 120000 });
  } catch (_) {
    // Chromium can return non-zero even on success; the artefact is the signal.
  }

  // It writes the file after the process returns, so wait for it rather than
  // trusting the exit code.
  const deadline = Date.now() + 60000;
  while (!fs.existsSync(producedCrx) && Date.now() < deadline) {
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},400)']);
  }

  fs.rmSync(path.join(DIST, '.pack-profile'), { recursive: true, force: true });

  if (!fs.existsSync(producedCrx)) {
    console.error(
      `${path.basename(browser)} did not produce a .crx within 60s.\n` +
        'Close every window of that browser and try again, or upload the .zip\n' +
        'to the Web Store instead — the store signs the package itself.'
    );
    process.exitCode = 1;
    return;
  }

  const crx = path.join(DIST, `setu-${manifest.version}.crx`);
  fs.rmSync(crx, { force: true });
  fs.renameSync(producedCrx, crx);
  if (fs.existsSync(producedKey)) fs.renameSync(producedKey, KEY);

  verifyCrx(crx);
  fs.rmSync(STAGING, { recursive: true, force: true });

  const { id, publicKey } = identity(KEY);
  const kb = (fs.statSync(crx).size / 1024).toFixed(1);

  console.log(`SETU ${manifest.version} — packed with ${path.basename(browser)}`);
  console.log(`  → ${path.relative(process.cwd(), crx)} (${kb} KB, CRX3)`);
  console.log(`  extension id: ${id}`);
  console.log(
    reusingKey
      ? '  signed with the existing key — the id is unchanged.'
      : `  NEW signing key written to ${path.relative(process.cwd(), KEY)}.`
  );
  console.log(
    '\n  Keep that .pem. It is this extension\'s identity: reuse it for every\n' +
      '  release to keep the id stable, and never commit or share it.\n' +
      '  (dist/ is gitignored, so it is already out of version control.)'
  );
  console.log(
    `\n  To pin the same id when loading unpacked, add to manifest.json:\n` +
      `    "key": "${publicKey.slice(0, 32)}…"\n` +
      '  Remove it again before a first Web Store upload — the store issues its own.'
  );
}

/* -------------------------------------------------------------------------- */
/* Zip reader (store + deflate, matching what build.js writes)                */
/* -------------------------------------------------------------------------- */

function extractZip(file, target) {
  const zlib = require('zlib');
  const buffer = fs.readFileSync(file);

  // Walk the central directory backwards from the end-of-central-directory
  // record, which is the only reliable way to find the entries.
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('Not a zip archive.');

  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt central directory.');

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    const destination = path.join(target, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, method === 0 ? raw : zlib.inflateRawSync(raw));

    offset += 46 + nameLength + extraLength + commentLength;
  }
}

main();
