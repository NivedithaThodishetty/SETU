/**
 * The Gaze Scroll control law, exercised with synthetic head positions.
 *
 * There is no camera in a test run, and there does not need to be: the part
 * that was broken was never the camera. It was the loop that turns a head
 * position into scroll movement, and that is pure arithmetic over a head
 * offset and an elapsed time. Feeding it a held-still head, a tilted head, and
 * a jittering one is a faithful test of everything the user actually
 * complained about.
 *
 * Run: node test/gaze.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');

/* ---- environment stub ---------------------------------------------------- */

const scroller = {
  scrollTop: 0,
  scrollHeight: 12000,
  clientHeight: 800,
  scrollTo({ top }) {
    this.scrollTop = top;
  }
};

const sandbox = {
  console,
  structuredClone,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: clearTimeout,
  performance: { now: () => Date.now() },
  innerWidth: 1280,
  innerHeight: 800,
  scrollX: 0,
  scrollY: 0,
  addEventListener() {},
  removeEventListener() {},
  chrome: {
    storage: {
      sync: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener() {} }
    },
    runtime: { sendMessage: async () => ({ ok: false }) }
  }
};

sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
  scrollingElement: scroller,
  documentElement: scroller,
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ getContext: () => ({}), style: {}, setAttribute() {} })
};

vm.createContext(sandbox);
for (const file of [
  ['shared', 'setu-config.js'],
  ['shared', 'gaze-detector.js'],
  ['shared', 'setu-core.js'],
  ['content', 'eye-tracker.js']
]) {
  vm.runInContext(fs.readFileSync(path.join(EXT, ...file), 'utf8'), sandbox, { filename: file[1] });
}

const { Scroll, features } = sandbox.window.SETU;
const GazeScroll = features.get('eye');

/* ---- harness -------------------------------------------------------------- */

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

const START = 4000;

/**
 * Hold a head at `offset` from neutral for `seconds`, and report how far the
 * page moved. Positive offset is a head below the calibrated rest position.
 */
function run(offset, { dt = 1 / 60, sensitivity = 1, invert = false, seconds = 2, jitter = 0 } = {}) {
  const gaze = new GazeScroll();
  gaze.enabled = true;
  gaze.sensitivity = sensitivity;
  gaze.invert = invert;
  gaze.setStatus = () => {};

  scroller.scrollTop = START;
  Scroll.reset();

  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i += 1) {
    const noise = jitter ? Math.sin(i * 7.3) * jitter : 0;
    const drift = offset + noise;

    // Stand in for the sample the tracker would have delivered — from the
    // detector in the camera frame in normal use, or from the in-page tracker
    // on the fallback path. Both produce exactly this shape, which is the
    // point of having one detector behind both.
    gaze.reading = {
      drift,
      magnitude: Math.abs(drift),
      dwelled: Math.abs(drift) >= 0.045,
      confidence: 1,
      calibrated: true,
      lost: false,
      headY: 0.5 + drift,
      neutralY: 0.5
    };

    gaze.integrate(dt);
  }

  return Math.round(scroller.scrollTop - START);
}

/* ---- tests ---------------------------------------------------------------- */

console.log('\nGaze Scroll — direction');

const down = run(0.13);
const up = run(-0.13);
check('a head held down scrolls the page down', down > 200, `moved=${down}`);
check('a head held up scrolls the page back up', up < -200, `moved=${up}`);
check('the two directions are symmetric', Math.abs(down + up) < 40, `down=${down} up=${up}`);

console.log('\nGaze Scroll — stillness');

// The whole complaint: "when I'm still the webpage should be still."
const still = run(0);
check('a head held still does not scroll at all', still === 0, `moved=${still}`);

// Camera noise is a couple of percent of frame height, every frame, forever.
const noisy = run(0, { jitter: 0.012, seconds: 5 });
check('camera jitter inside the deadzone never scrolls', noisy === 0, `moved=${noisy}`);

// A head just outside the deadzone should creep, not lurch.
const gentle = run(0.06);
check('a small tilt moves gently', gentle > 0 && gentle < 200, `moved=${gentle}`);

console.log('\nGaze Scroll — response');

const slow = run(0.10, { sensitivity: 0.4 });
const normal = run(0.10, { sensitivity: 1 });
const fast = run(0.10, { sensitivity: 2 });
check('sensitivity scales the pace', slow < normal && normal < fast, `${slow} < ${normal} < ${fast}`);
check('sensitivity scales roughly linearly', Math.abs(fast / normal - 2) < 0.25, `ratio=${(fast / normal).toFixed(2)}`);

const inverted = run(0.13, { invert: true });
check('invert flips the mapping', inverted < 0 && Math.abs(inverted + down) < 40, `moved=${inverted}`);

console.log('\nGaze Scroll — frame rate');

// The old loop moved a fixed number of pixels per *frame*, so it ran at more
// than double speed on a 144Hz display and half speed on a throttled tab.
const at60 = run(0.10, { dt: 1 / 60 });
const at144 = run(0.10, { dt: 1 / 144 });
const at30 = run(0.10, { dt: 1 / 30 });
check('60Hz and 144Hz travel the same distance', Math.abs(at144 / at60 - 1) < 0.05, `${at60} vs ${at144}`);
check('60Hz and 30Hz travel the same distance', Math.abs(at30 / at60 - 1) < 0.08, `${at60} vs ${at30}`);

console.log('\nGaze Scroll — page limits');

// Sub-pixel carry means a frame often moves nothing. Reading that as "the page
// has ended" stalled the scroll forever at moderate speeds.
scroller.scrollTop = 0;
const fromTop = run(0.10);
check('a mid-speed scroll does not stall on sub-pixel frames', fromTop > 100, `moved=${fromTop}`);

const gaze = new GazeScroll();
gaze.enabled = true;
gaze.sensitivity = 1;
gaze.setStatus = () => {};
gaze.reading = {
  drift: 0.13,
  magnitude: 0.13,
  dwelled: true,
  confidence: 1,
  calibrated: true,
  lost: false,
  headY: 0.63,
  neutralY: 0.5
};

scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
for (let i = 0; i < 120; i += 1) gaze.integrate(1 / 60);
check('reaching the bottom stops the run', gaze.velocity === 0, `velocity=${gaze.velocity}`);
check('it does not scroll past the end', scroller.scrollTop === 11200, `top=${scroller.scrollTop}`);

/* ---- detector ------------------------------------------------------------- */

const { SAMPLE_W, SAMPLE_H, detectInFrame, createTracker } = sandbox.self.SETU_GAZE;

/** A frame with a skin-coloured band `width` px wide over `rows` rows. */
function frameWith({ top = 12, rows = 20, width = 40, rgb = [200, 150, 120] } = {}) {
  const data = new Uint8ClampedArray(SAMPLE_W * SAMPLE_H * 4);
  // Everything else is a mid-grey wall, which must not read as skin.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 90;
    data[i + 1] = 90;
    data[i + 2] = 92;
    data[i + 3] = 255;
  }
  const left = Math.floor((SAMPLE_W - width) / 2);
  for (let y = top; y < top + rows; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const i = (y * SAMPLE_W + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
    }
  }
  return { data };
}

console.log('\nDetector');

const wellLit = detectInFrame(frameWith());
check('a well-lit face is found', wellLit !== null);
check(
  'the face sits where it was drawn',
  wellLit && Math.abs(wellLit.headY - 22 / SAMPLE_H) < 0.05,
  wellLit && `headY=${wellLit.headY.toFixed(3)}`
);

// Moving the band down must move the reading down.
const lower = detectInFrame(frameWith({ top: 32 }));
check('a lower face reads lower', lower && wellLit && lower.headY > wellLit.headY);

// A small or distant face: 6px of skin per row is under the old fixed bar of
// 10% of frame width, so it was never found at all.
const smallFace = detectInFrame(frameWith({ width: 6, rows: 20 }));
check('a small or distant face is still found', smallFace !== null);

// A dim room halves every channel; the chroma test still holds.
const dim = detectInFrame(frameWith({ rgb: [100, 75, 60] }));
check('a dimly lit face is still found', dim !== null);

// An empty room must not produce a phantom head.
check('an empty frame finds nothing', detectInFrame(frameWith({ rows: 0, width: 0 })) === null);

// A wall of skin tone is the background, not a face.
check(
  'a frame filled with skin tone finds nothing',
  detectInFrame(frameWith({ top: 0, rows: SAMPLE_H, width: SAMPLE_W })) === null
);

/* ---- calibration ---------------------------------------------------------- */

console.log('\nCalibration');

// The bug that made Gaze Scroll look completely dead: auto-calibration fired
// once, found no face because the camera was still adjusting, cleared its own
// timer, and never tried again.
{
  let frame = frameWith({ rows: 0, width: 0 }); // no face yet
  const video = { readyState: 2 };
  sandbox.document.createElement = () => ({
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {}, getImageData: () => frame })
  });

  const tracker = createTracker(video);
  tracker.armAutoCalibration(0, 100);

  // Past the deadline, with nothing to see.
  tracker.update(200);
  check('calibration does not succeed with no face', tracker.state.calibrated === false);
  check('a failed auto-calibration re-arms itself', tracker.state.autoCalibrateAt > 0);

  // The face arrives. performance.now() drives the retry deadline, so step
  // well past it.
  frame = frameWith();
  let calibrated = false;
  for (let t = 300; t <= 4000 && !calibrated; t += 50) {
    calibrated = tracker.update(t).calibrated;
  }
  check('calibration succeeds once the face appears', calibrated === true);
  check('the rest position was adopted', tracker.state.neutralY > 0 && tracker.state.neutralY < 1);
}

/* ---- watchdog ------------------------------------------------------------- */

console.log('\nGaze Scroll — camera silence');

// A reading is a held value. If the frame stops reporting — camera revoked
// from the address bar, another app takes the device — the last "head is
// down, keep scrolling" sample would otherwise stay true forever.
{
  const gaze = new GazeScroll();
  gaze.enabled = true;
  gaze.sensitivity = 1;
  gaze.setStatus = () => {};
  gaze.mode = 'frame';
  gaze.reading = {
    drift: 0.13, magnitude: 0.13, dwelled: true,
    confidence: 1, calibrated: true, lost: false, headY: 0.63, neutralY: 0.5
  };

  scroller.scrollTop = START;
  Scroll.reset();

  const now = sandbox.performance.now();
  gaze.lastSampleAt = now;
  gaze.lastFrame = now;

  // Samples still arriving: it scrolls.
  for (let i = 1; i <= 60; i += 1) {
    gaze.lastSampleAt = now + i * 16;
    gaze.tick(now + i * 16);
  }
  const whileReporting = scroller.scrollTop - START;
  check('it scrolls while the camera reports', whileReporting > 0, `moved=${whileReporting}`);

  // The frame goes silent. Nothing further should move.
  const wentQuietAt = now + 60 * 16;
  const before = scroller.scrollTop;
  for (let i = 1; i <= 240; i += 1) gaze.tick(wentQuietAt + i * 16);

  check('a silent camera stops the scroll', gaze.velocity === 0, `velocity=${gaze.velocity}`);
  // Bounded by the stale threshold, not by the much longer "camera is really
  // gone" one — at full tilt a second of coasting is most of a screen.
  check(
    'it does not coast on after going quiet',
    scroller.scrollTop - before < 250,
    `drifted=${scroller.scrollTop - before}`
  );
}

/* ---- report --------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
