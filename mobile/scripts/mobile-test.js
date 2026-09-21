/**
 * Mobile logic suite.
 *
 * `node scripts/mobile-test.js`. No device, no emulator, no network.
 *
 * WHY THIS EXISTS
 * ---------------
 * The audit's engineering section marks "the largest surface untested" as a
 * HIGH defect against the React frontend. Mobile had the same hole: a clean
 * `tsc --noEmit` proves the types line up and proves nothing about whether the
 * app does the right thing.
 *
 * A Metro bundle catches missing imports and syntax errors. Neither catches the
 * failures that actually reach a user — a spacing setting that computes to
 * zero, a language table that has drifted from the engine, a default that
 * silently disagrees with the other surfaces. Those are what this covers.
 *
 * The files under test are TypeScript, so each one is read and stripped of its
 * type syntax rather than imported. That is deliberately crude, and it is
 * enough: everything asserted here is plain data and pure functions.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const read = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Languages — must not drift from the engine                                 */
/* -------------------------------------------------------------------------- */

console.log('\nLanguages');

const backend = require('../../backend/config/languages.js');
const langSrc = read('constants', 'languages.ts');

const mobileCodes = [...langSrc.matchAll(/^\s*code: '([\w-]+)',/gm)].map((m) => m[1]);
const backendCodes = backend.LANGUAGES.map((l) => l.code);

check(
  `mobile carries all ${backendCodes.length} engine languages`,
  mobileCodes.length === backendCodes.length,
  `mobile ${mobileCodes.length}, engine ${backendCodes.length}`
);
check(
  'in the same order as the engine',
  JSON.stringify(mobileCodes) === JSON.stringify(backendCodes),
  'a bare tag like "en" resolves by list order, so order is behaviour'
);

/*
 * Odia is the one entry where the code and the tag differ, and getting it wrong
 * is silent: Sarvam wants 'od-IN', which is not a valid language tag, so a
 * screen reader or expo-speech ignores it, falls back to the device language,
 * and reads Odia aloud with an English voice engine.
 */
const odia = langSrc.match(/code: 'od-IN',\s*[\r\n]+\s*bcp47: '([^']+)'/);
check("Odia's bcp47 is or-IN, not Sarvam's od-IN", odia && odia[1] === 'or-IN', odia ? odia[1] : 'not found');

const arabic = langSrc.match(/code: 'ar-SA',[\s\S]{0,200}?dir: '([^']+)'/);
check('Arabic is marked right-to-left', arabic && arabic[1] === 'rtl', arabic ? arabic[1] : 'not found');

check(
  'every entry has code, bcp47, name, native, dir, region and a sample',
  backendCodes.every((code) => {
    const block = langSrc.match(new RegExp(`code: '${code}',[\\s\\S]{0,400}?\\n  \\},`));
    if (!block) return false;
    return ['bcp47:', 'name:', 'native:', 'dir:', 'region:', 'sample:'].every((f) => block[0].includes(f));
  })
);

/*
 * The sample sentence is read aloud by the voice tester. An English sentence in
 * a Tamil voice tells a user nothing about whether Tamil read-aloud will work
 * for them, which is the entire question the tester exists to answer.
 */
const englishSamples = backend.LANGUAGES.filter((l) => l.code !== 'en-IN').filter((l) => {
  const block = langSrc.match(new RegExp(`code: '${l.code}',[\\s\\S]{0,400}?sample: '([^']*)'`));
  return block && /^[\x00-\x7F\s]*$/.test(block[1]) && l.region === 'india';
});
check(
  'Indian-language voice samples are written in their own script',
  englishSamples.length === 0,
  englishSamples.map((l) => l.code).join(', ')
);

/* -------------------------------------------------------------------------- */
/* Letter spacing — the accommodation that used to do nothing                  */
/* -------------------------------------------------------------------------- */

console.log('\nLetter spacing');

const typography = read('components', 'Typography.tsx');

check(
  'Typography reads the spacing preference',
  /const \{[^}]*spacing[^}]*\} = useAccessibility\(\)/.test(typography),
  'the setting existed and nothing consumed it — a dead control'
);

/*
 * Recreated from the source rather than imported, because the file is TSX. The
 * numbers are asserted, not the implementation: this is the one typographic
 * lever with a controlled result behind it and the dose is the whole point.
 */
function spacingFor(setting, fontSize) {
  if (setting === 'spacious') return fontSize * 0.18;
  if (setting === 'relaxed') return fontSize * 0.12;
  return 0;
}

check('relaxed is the evidence-backed dose (0.12em)', spacingFor('relaxed', 100) === 12);
check('spacious reaches the tested magnitude (0.18em)', spacingFor('spacious', 100) === 18);
check('normal is the unstyled base', spacingFor('normal', 100) === 0);

check(
  'the source uses those same multipliers',
  /0\.12/.test(typography) && /0\.18/.test(typography),
  'the assertion above would be testing a copy, not the app'
);

/*
 * React Native's letterSpacing is in points, not ems. A fixed value tuned for
 * 16pt body text is nearly invisible at 30pt and overwhelming at 11pt, so the
 * spacing has to scale with the size the reader chose.
 */
check(
  'spacing scales with font size rather than being fixed',
  spacingFor('relaxed', 30) > spacingFor('relaxed', 16),
  'RN letterSpacing is absolute — a fixed value breaks at other sizes'
);

check(
  'headings are excluded from widened tracking',
  /variant === 'h1' \|\| variant === 'titleLg'[\s\S]{0,60}undefined/.test(typography),
  'at 28pt+ the crowding this fixes is not present'
);

/* -------------------------------------------------------------------------- */
/* Defaults — must agree across surfaces                                      */
/* -------------------------------------------------------------------------- */

console.log('\nDefaults');

const storage = read('services', 'storage.ts');
check(
  "spacing defaults to 'relaxed', matching web and the engine schema",
  /spacing: 'relaxed'/.test(storage),
  "shipping it 'normal' means almost nobody receives the intervention"
);

const webStorage = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'storage.js'),
  'utf8'
);
check(
  'web and mobile agree on the spacing default',
  /spacing: 'relaxed'/.test(webStorage) && /spacing: 'relaxed'/.test(storage)
);

/* -------------------------------------------------------------------------- */
/* Engine and identity — one backend, one user                                */
/* -------------------------------------------------------------------------- */

console.log('\nEngine and identity');

const config = read('constants', 'config.ts');
const api = read('services', 'api.ts');

const mobileHost = (config.match(/PRODUCTION_API_URL = '([^']+)'/) || [])[1];
const extHost = (
  fs
    .readFileSync(path.join(__dirname, '..', '..', 'chrome-extension', 'shared', 'setu-config.js'), 'utf8')
    .match(/apiHost: '([^']+)'/) || []
)[1];
const webHost = (
  fs
    .readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'apiBase.js'), 'utf8')
    .match(/PRODUCTION_FALLBACK = '([^']+)'/) || []
)[1];

check('all three surfaces target one engine', mobileHost === extHost && extHost === webHost,
  `mobile=${mobileHost} ext=${extHost} web=${webHost}`);

check('mobile identifies with x-user-id like the others', /'x-user-id'/.test(api));

/*
 * Endpoints added so mobile is not behind the other surfaces. A user who does a
 * reading check on the phone and opens the web app should see the same history,
 * and the agent's saved details should reach every device.
 */
for (const [name, path_] of [
  ['reading-check stimuli', '/api/reading-check/stimuli'],
  ['reading-check submit', "post<any>('/api/reading-check'"],
  ['reading-check history', 'readingHistory:'],
  ['agent profile read', "get<{ profile"],
  ['agent profile write', "post<any>('/api/profile'"]
]) {
  check(`mobile can reach ${name}`, api.includes(path_), path_);
}

/* -------------------------------------------------------------------------- */
/* The themed-styles trap                                                     */
/* -------------------------------------------------------------------------- */

console.log('\nThemed styles');

/*
 * A module-scope `StyleSheet.create` captures the palette once, at import. The
 * object is then frozen for the life of the process, so switching to the dark
 * or high-contrast theme repaints everything except that component — which
 * reads to a user as "the theme is broken", and is invisible in review because
 * the file looks perfectly ordinary.
 *
 * Screens must use a `makeStyles(t: Palette)` factory with `useThemedStyles`.
 */
const screens = fs.readdirSync(path.join(SRC, 'screens')).filter((f) => f.endsWith('.tsx'));
const frozen = screens.filter((file) => {
  const src = read('screens', file);
  return !/useThemedStyles/.test(src) && /StyleSheet\.create/.test(src);
});
/*
 * A subtler version of the same bug, which the check above cannot see.
 *
 * A file can use the factory correctly and still reach for the statically
 * imported `COLORS` inside it — the default palette, captured at import. The
 * component then themes perfectly except for that one property. Home's camera
 * hero did exactly this: it stayed cyan on the high-contrast ground, which is
 * the one palette a low-vision reader actually depends on.
 */
const surfaces = [
  ...screens.map((f) => ['screens', f]),
  ...fs.readdirSync(path.join(SRC, 'components')).filter((f) => f.endsWith('.tsx'))
    .map((f) => ['components', f]),
];
const staticInFactory = surfaces.filter(([dir, file]) => {
  const src = read(dir, file);
  const start = src.indexOf('const makeStyles = (t: Palette) =>');
  return start !== -1 && /\bCOLORS\./.test(src.slice(start));
});
check(
  'no style factory reaches for the static default palette',
  staticInFactory.length === 0,
  staticInFactory.map(([, f]) => f).join(', ')
);

check(
  `all ${screens.length} screens use themed style factories`,
  frozen.length === 0,
  frozen.length ? `module-scope StyleSheet.create in: ${frozen.join(', ')}` : ''
);

/* -------------------------------------------------------------------------- */
/* Screens and navigation resolve                                             */
/* -------------------------------------------------------------------------- */

console.log('\nNavigation');

const nav = read('navigation', 'RootNavigator.tsx');
const imported = [...nav.matchAll(/from '\.\.\/screens\/(\w+)'/g)].map((m) => m[1]);
const missing = imported.filter((name) => !fs.existsSync(path.join(SRC, 'screens', `${name}.tsx`)));
check(`all ${imported.length} navigator screens exist`, missing.length === 0, missing.join(', '));

const registered = [...nav.matchAll(/name="(\w+)"/g)].map((m) => m[1]);
check('every screen is registered on a route', registered.length >= imported.length,
  `${registered.length} routes for ${imported.length} screens`);

check(
  'the camera is reachable from Home as the primary action',
  /navigation\.navigate\('CameraOCR'\)/.test(read('screens', 'HomeScreen.tsx')) &&
    /cameraHero/.test(read('screens', 'HomeScreen.tsx')),
  'the audit calls this the most-wanted action from a parent of a struggling reader'
);

/* -------------------------------------------------------------------------- */
/* Offline crisis guard — the one guarantee that must not depend on a network */
/* -------------------------------------------------------------------------- */

console.log('\nOffline crisis guard');

const detector = require('../../backend/services/crisisDetector.js');

/*
 * The guard is generated from the backend detector, so the assertion that
 * matters is not "does it work" — it is "is the checked-in copy the one the
 * generator would produce today". A mirror that has drifted is worse than no
 * mirror, because the team believes the guard is in place.
 */
const generate = require('child_process').spawnSync(
  process.execPath,
  [path.join(__dirname, 'generate-crisis-guard.js'), '--check'],
  { encoding: 'utf8' }
);
check(
  'the generated guard matches the backend detector',
  generate.status === 0,
  (generate.stderr || '').trim().split('\n').pop()
);

/*
 * Load the generated module by stripping its type syntax, the same crude
 * approach the rest of this suite uses. Everything in it is plain data and pure
 * functions, so this is enough — and it means the detection logic is exercised
 * rather than merely re-implemented here, which would test nothing.
 */
const guardSrc = read('services', 'crisisGuard.generated.ts');
const guardJs = guardSrc
  .replace(/^export interface[\s\S]*?^}$/gm, '')
  .replace(/^export /gm, '')
  .replace(/: Record<string, RegExp\[\]>/g, '')
  .replace(/: CrisisHelplineEntry\[\]/g, '')
  .replace(/: string\[\]/g, '')
  .replace(/\(text: string\): boolean/g, '(text)')
  .replace(/\(text: string\): \{[\s\S]*?\n\} \{/g, '(text) {')
  .replace(/\(language: string = 'en-IN'\): OfflineCrisisResponse/g, "(language = 'en-IN')")
  .replace(/ as const/g, '')
  .replace(/'intent' \| 'keyword' \| null/g, 'null');

const guard = {};
try {
  new Function(
    'exports',
    `${guardJs}\nexports.detectCrisisOffline = detectCrisisOffline;` +
      `\nexports.buildOfflineCrisisResponse = buildOfflineCrisisResponse;` +
      `\nexports.COVERED_LANGUAGES = COVERED_LANGUAGES;`
  )(guard);
} catch (error) {
  check('the generated guard evaluates', false, error.message);
}

if (guard.detectCrisisOffline) {
  /*
   * Fixtures come from the backend suite rather than being written again here.
   * Two independently maintained fixture lists drift, and the one that drifts
   * is always the copy nobody is looking at.
   */
  const suiteSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'backend', 'scripts', 'crisis-test.js'),
    'utf8'
  );
  const literal = (name) => {
    const start = suiteSrc.indexOf(`const ${name} =`);
    if (start === -1) return null;
    const open = suiteSrc.indexOf('=', start) + 1;
    const close = suiteSrc.indexOf('\n};', open) >= 0 ? suiteSrc.indexOf('\n};', open) + 2
      : suiteSrc.indexOf('\n];', open) + 2;
    try {
      // eslint-disable-next-line no-eval
      return eval(`(${suiteSrc.slice(open, close).trim().replace(/;$/, '')})`);
    } catch (_) {
      return null;
    }
  };

  const mustDetect = literal('MUST_DETECT');
  const mustNotDetect = literal('MUST_NOT_DETECT');

  check(
    'the backend fixture corpus is readable',
    !!mustDetect && !!mustNotDetect,
    'crisis-test.js MUST_DETECT / MUST_NOT_DETECT could not be parsed'
  );

  if (mustDetect && mustNotDetect) {
    const positives = Object.values(mustDetect).flat();
    const missed = positives.filter((phrase) => !guard.detectCrisisOffline(phrase));
    check(
      `detects all ${positives.length} risk phrases with no engine`,
      missed.length === 0,
      missed.slice(0, 3).join(' | ')
    );

    /*
     * The audit named these four misses specifically. They are asserted by name
     * as well as in bulk, so the reason this file exists survives a fixture
     * being renamed or dropped upstream.
     */
    for (const phrase of ['मुझे मरना है', 'mujhe marna hai', 'enakku saaganum', '죽고 싶다']) {
      check(`offline detection fires on "${phrase}"`, guard.detectCrisisOffline(phrase));
    }

    const falsePositives = mustNotDetect.filter((phrase) => guard.detectCrisisOffline(phrase));
    check(
      `no false alarm on ${mustNotDetect.length} ordinary phrases`,
      falsePositives.length === 0,
      falsePositives.slice(0, 3).join(' | ')
    );

    const corpus = [...positives, ...mustNotDetect];
    const divergent = corpus.filter(
      (phrase) => guard.detectCrisisOffline(phrase) !== detector.detectCrisisLanguage(phrase)
    );
    check(
      `agrees with the engine on all ${corpus.length} phrases`,
      divergent.length === 0,
      divergent.slice(0, 3).join(' | ')
    );
  }

  check(
    `covers the same ${detector.COVERED_LANGUAGES.length} languages as the engine`,
    JSON.stringify(guard.COVERED_LANGUAGES) === JSON.stringify(detector.COVERED_LANGUAGES)
  );

  const offlineReply = guard.buildOfflineCrisisResponse('ta-IN');
  check(
    'the offline reply carries real dialable helplines',
    offlineReply.helplines.length >= 3 &&
      offlineReply.helplines.some((h) => /14416/.test(h.contact)),
    'Tele-MANAS 14416 is the number a Tamil speaker can actually use'
  );
  check(
    'a non-English request is served the reviewed English script, and says why',
    offlineReply.language === 'en-IN' && !!offlineReply.languageNote,
    'machine-translating a suicide script is the one error that costs most'
  );
  check(
    'the offline reply never claims to have been written for the user',
    offlineReply.message === detector.CRISIS_SCRIPTS['en-IN'].message,
    'the wording must be the same reviewed text the server serves'
  );
}

/*
 * The screen must consult the guard before the request, not only in the catch.
 * Checking only on failure still leaves someone waiting out an AI-length
 * timeout while holding that sentence, and still transmits it.
 */
const listenSrc = read('screens', 'ListenScreen.tsx');
const guardCall = listenSrc.indexOf('detectCrisisOffline(text)');
const apiCall = listenSrc.indexOf('api.listen(text');
check(
  'the check-in screen runs the guard before it calls the engine',
  guardCall > -1 && apiCall > -1 && guardCall < apiCall,
  'helplines must not wait on a network round trip'
);
check(
  'a crisis turn is never scored',
  /if \(!result\.crisis\) award\('checkIn'\)/.test(listenSrc),
  'attaching points to a risk disclosure would be grotesque'
);

/* -------------------------------------------------------------------------- */
/* Reading Check — the guardrails that keep it an educational screener        */
/* -------------------------------------------------------------------------- */

console.log('\nReading Check');

const rcSrc = read('screens', 'ReadingCheckScreen.tsx');

/*
 * Same regulatory assertions the backend suite makes, applied to the surface
 * that a parent actually reads. The server can be scrupulous about its wording
 * and still have a client that captions it "Dyslexia score: 62%".
 */
const resultStage = rcSrc.slice(rcSrc.indexOf("stage === 'result'"));

check(
  'the result surface never says "dyslexia"',
  resultStage.length > 200 && !/dyslexi/i.test(resultStage),
  'the word may appear where the screen explains what it cannot tell you, never in an outcome'
);
check(
  'the result quotes no score out of anything',
  !/ \/ 100| out of |score:/i.test(resultStage),
  'a percentage or a total is what turns a screener into a test'
);
check(
  'the server disclaimer is rendered, not restated',
  /\{result\.disclaimer\}/.test(rcSrc),
  'a hard-coded copy in the app goes stale the moment the wording is corrected'
);
check(
  'the band label comes from the server too',
  /result\.bandCopy\?\.label/.test(rcSrc) && /result\.bandCopy\?\.nextStep/.test(rcSrc),
  'band boundaries and their wording must live in one place'
);
check(
  'the client never decides a band itself',
  !/worth-assessment'\s*[:=]\s*(?!.*bandTint)/.test(rcSrc) &&
    !/wcpm\s*[<>]/.test(rcSrc) &&
    !/accuracy\s*[<>]/.test(rcSrc),
  'scoring is server-side so a correction does not wait on an app store review'
);
check(
  'the transcript is not kept unless asked',
  /useState\(false\)/.test(rcSrc) && /keepTranscript,/.test(rcSrc),
  'a recording of a child reading is recoverable content about a minor'
);

/*
 * The measurement must not be taken through the reader's own accommodations.
 * Scoring someone on widened text and banding them against norms collected on
 * ordinary text produces a flattering number that means nothing.
 */
check(
  'the passage is rendered outside the themed Typography component',
  /RawText/.test(rcSrc) && /letterSpacing: 0/.test(rcSrc),
  'the probe measures unaided reading'
);

check(
  'the reading check is reachable from Home',
  /navigate\('ReadingCheck'\)/.test(read('screens', 'HomeScreen.tsx')),
  'a screener buried three taps deep is a screener nobody runs'
);

const chartSrc = read('components', 'ReadingProgressChart.tsx');
check(
  'the progress chart has a non-visual alternative',
  /accessibilityLabel=\{spoken\}/.test(chartSrc) && /styles\.table/.test(chartSrc),
  'an SVG line is invisible to a screen reader'
);
check(
  'the chart y-axis starts at zero',
  /Math\.max\(20, Math\.ceil\(peak \/ 10\) \* 10\)/.test(chartSrc) &&
    /1 - point\.wcpm \/ top/.test(chartSrc),
  'cropping the axis would exaggerate a four-word gain into a climb'
);

/* -------------------------------------------------------------------------- */
/* Typefaces — the setting has to deliver the font it names                   */
/* -------------------------------------------------------------------------- */

console.log('\nTypefaces');

const FONT_FILES = [
  'AtkinsonHyperlegible-Regular.ttf',
  'AtkinsonHyperlegible-Bold.ttf',
  'Lexend-Regular.ttf',
  'Lexend-Bold.ttf',
  'SourceSerif4-Regular.ttf',
  'SourceSerif4-Bold.ttf',
];
const fontDir = path.join(__dirname, '..', 'assets', 'fonts');
const missingFonts = FONT_FILES.filter((f) => !fs.existsSync(path.join(fontDir, f)));
check(
  'the named typefaces are actually bundled',
  missingFonts.length === 0,
  missingFonts.join(', ') || 'offering "Atkinson Hyperlegible" and shipping Verdana is a claim, not a setting'
);

const fontsSrc = read('constants', 'fonts.ts');
const fontTypes = read('types', 'index.ts');
const offered = [...(fontTypes.match(/FontStyleOption = ([^;]+);/)?.[1] || '').matchAll(/'(\w+)'/g)]
  .map((m) => m[1]);
const unmapped = offered.filter((id) => !new RegExp(`^\\s*${id}: \\{`, 'm').test(fontsSrc));
check(
  `every one of the ${offered.length} font choices resolves to a family`,
  offered.length > 0 && unmapped.length === 0,
  unmapped.length
    ? `${unmapped.join(', ')} fall through to the default — 'lexend' silently rendered as serif before this`
    : ''
);

const typographySrc = read('components', 'Typography.tsx');
check(
  'Typography picks the family by weight, not just by preference',
  /familyFor\(font, weightFor\(fontWeight\)\)/.test(typographySrc),
  'Android will not synthesise bold from a single custom face — headings flatten silently'
);

check(
  'the app holds the splash until the faces are loaded',
  /useFonts\(FONT_ASSETS\)/.test(fs.readFileSync(path.join(SRC, '..', 'App.tsx'), 'utf8')),
  'otherwise the first frame paints in the platform font and reflows'
);

/* -------------------------------------------------------------------------- */

console.log(failures.length ? `\n  ${passed} passed, ${failures.length} failed\n` : `\n  ${passed} passed, 0 failed\n`);
if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
