/**
 * SETU — head-position detector.
 * ==============================
 *
 * The signal-processing half of Gaze Scroll, with no DOM and no permissions of
 * its own, so the exact same code runs in two places: inside the extension's
 * camera frame (the normal path) and directly in the page (the fallback).
 * Keeping one implementation matters because the tuning constants here are the
 * difference between "the page holds still when I do" and an unusable feature.
 *
 * Honest description of the technique: this tracks *head position*, not pupil
 * gaze. Frames are read into a small canvas and discarded — no video, no image,
 * and no derived measurement ever leaves the machine.
 */

(() => {
  const scope = typeof self !== 'undefined' ? self : globalThis;
  if (scope.SETU_GAZE) return;

  /** Detector resolution. Small on purpose — this runs next to a live page. */
  const SAMPLE_W = 80;
  const SAMPLE_H = 60;

  /** Detection rate. 60fps of getImageData buys nothing a head can express. */
  const DETECT_HZ = 24;

  /** Neutral-relative drift, as a fraction of frame height. */
  const DEADZONE = 0.045;
  const FULL_TILT = 0.16;

  /** Peak scroll speed in CSS pixels per second, before sensitivity. */
  const MAX_SPEED = 820;

  /** How long drift must stay outside the deadzone before scrolling starts. */
  const DWELL_MS = 130;

  /** How long the head must sit inside the deadzone before neutral re-centres. */
  const RECENTRE_AFTER_MS = 2200;

  /** How soon to retry calibration after a failed attempt. */
  const RECALIBRATE_RETRY_MS = 700;

  /**
   * Adaptive low-pass filter.
   *
   * The whole problem with a fixed smoothing coefficient is that jitter and
   * intent look identical to it. This one widens its own bandwidth in
   * proportion to how fast the signal is genuinely changing, so a still head
   * is filtered hard (no creep) and a deliberate movement is barely filtered
   * at all (no lag).
   *
   * Casiez, Roussel & Vogel, CHI 2012.
   */
  class OneEuro {
    constructor({ minCutoff = 0.55, beta = 0.4, dCutoff = 1 } = {}) {
      this.minCutoff = minCutoff;
      this.beta = beta;
      this.dCutoff = dCutoff;
      this.x = null;
      this.dx = 0;
      this.at = 0;
    }

    static alpha(cutoff, dt) {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / dt);
    }

    reset(value = null) {
      this.x = value;
      this.dx = 0;
      this.at = 0;
    }

    filter(value, now) {
      if (this.x === null) {
        this.x = value;
        this.at = now;
        return value;
      }

      const dt = Math.max(1 / 120, (now - this.at) / 1000);
      this.at = now;

      const rawDx = (value - this.x) / dt;
      this.dx = this.dx + OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);

      const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
      this.x = this.x + OneEuro.alpha(cutoff, dt) * (value - this.x);
      return this.x;
    }
  }

  /**
   * Locate the face in one frame and return
   * `{ headY: 0..1, confidence: 0..1 }`, or null when there is no face.
   *
   * Works on the *row profile* rather than on individual pixels. Counting
   * skin-like pixels per row and then taking the longest contiguous run of
   * well-populated rows finds the head and rejects almost everything else: a
   * hand at the edge of frame occupies too few rows, a wooden background
   * occupies too many, and neither forms a band of the right size in the right
   * place. A plain centroid could not tell any of them apart.
   */
  function detectInFrame(imageData) {
    const { data } = imageData;
    const rows = new Uint16Array(SAMPLE_H);
    let total = 0;

    for (let y = 0; y < SAMPLE_H; y += 1) {
      let count = 0;
      for (let x = 0; x < SAMPLE_W; x += 1) {
        const i = (y * SAMPLE_W + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // YCbCr, not RGB. The chroma plane separates skin from lighting far
        // better than raw channel comparisons, which is why this survives a
        // warm lamp or a dim room where an RGB envelope does not.
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luma < 45 || luma > 245) continue;

        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        if (cb >= 77 && cb <= 130 && cr >= 133 && cr <= 177) count += 1;
      }
      rows[y] = count;
      total += count;
    }

    // Nothing, or the camera is looking at a wall of skin tone.
    const fraction = total / (SAMPLE_W * SAMPLE_H);
    if (fraction < 0.012 || fraction > 0.62) return null;

    // Longest contiguous run of rows carrying a plausible amount of face.
    //
    // The threshold adapts to the frame instead of being a fixed count. A
    // fixed 10%-of-width bar assumed a well-lit face filling a good part of
    // the frame; in a dim room, against a window, or with a webcam that
    // renders skin cool, enough rows fell just under it that no run ever
    // formed and the face was simply never found. Scaling it to the busiest
    // row keeps the same shape test while following the exposure the camera
    // actually gave us.
    let busiestRow = 0;
    for (let y = 0; y < SAMPLE_H; y += 1) {
      if (rows[y] > busiestRow) busiestRow = rows[y];
    }
    const threshold = Math.max(3, Math.min(SAMPLE_W * 0.1, busiestRow * 0.35));
    let bestStart = -1;
    let bestLength = 0;
    let runStart = -1;

    for (let y = 0; y <= SAMPLE_H; y += 1) {
      const populated = y < SAMPLE_H && rows[y] >= threshold;
      if (populated && runStart === -1) {
        runStart = y;
      } else if (!populated && runStart !== -1) {
        const length = y - runStart;
        if (length > bestLength) {
          bestLength = length;
          bestStart = runStart;
        }
        runStart = -1;
      }
    }

    // A band that is a few rows tall is noise; one that fills the frame is the
    // background, not a head.
    if (bestLength < SAMPLE_H * 0.08 || bestLength > SAMPLE_H * 0.85) return null;

    // Weighted centre within the band, so the estimate moves smoothly rather
    // than jumping a whole row at a time.
    let weight = 0;
    let sum = 0;
    for (let y = bestStart; y < bestStart + bestLength; y += 1) {
      weight += rows[y];
      sum += rows[y] * y;
    }
    if (!weight) return null;

    return {
      headY: sum / weight / SAMPLE_H,
      confidence: Math.min(1, bestLength / (SAMPLE_H * 0.45))
    };
  }

  /**
   * Turn a `<video>` element into a stream of smoothed head samples.
   *
   * Owns the sampling canvas, the filter, the neutral point, and the
   * calibration state — everything that has to behave identically whichever
   * side of the iframe boundary it is running on. It deliberately does *not*
   * own scrolling: the caller integrates the returned drift, because only the
   * caller knows which surface is being read.
   */
  function createTracker(video) {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const filter = new OneEuro();

    const state = {
      headY: 0.5,
      neutralY: 0.5,
      confidence: 0,
      calibrated: false,
      insideSince: 0,
      outsideSince: 0,
      lastDetect: 0,
      autoCalibrateAt: 0
    };

    /** Read one frame, or null if the video is not producing them yet. */
    function sampleFrame() {
      if (!video || video.readyState < 2) return null;
      try {
        ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
        return detectInFrame(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H));
      } catch (_) {
        // A cross-origin frame taints the canvas. Nothing to be done here.
        return null;
      }
    }

    return {
      state,

      /**
       * Adopt the current head position as the rest position.
       *
       * A failed attempt re-arms itself rather than giving up. This was the
       * single reason Gaze Scroll could appear completely dead: auto-calibration
       * fired 1.4 seconds after the camera opened, and if the face had not been
       * found yet — a camera still adjusting its exposure, someone still
       * settling into their chair — it cleared its own timer and never tried
       * again. The tracker then sat there uncalibrated forever, with a live
       * camera, a visible panel, and no possible way to scroll.
       */
      calibrate({ auto = false } = {}) {
        if (state.confidence <= 0.15) {
          state.autoCalibrateAt = auto ? performance.now() + RECALIBRATE_RETRY_MS : 0;
          return false;
        }

        state.autoCalibrateAt = 0;
        state.neutralY = state.headY;
        state.calibrated = true;
        state.insideSince = 0;
        state.outsideSince = 0;
        return true;
      },

      armAutoCalibration(now, delay = 1400) {
        state.autoCalibrateAt = now + delay;
      },

      /**
       * Advance the tracker. Call every animation frame; detection throttles
       * itself internally.
       *
       * @returns {{drift: number, magnitude: number, dwelled: boolean,
       *            confidence: number, calibrated: boolean, lost: boolean,
       *            calibratedNow: boolean}}
       */
      update(now) {
        let calibratedNow = false;

        if (now - state.lastDetect >= 1000 / DETECT_HZ) {
          state.lastDetect = now;
          const reading = sampleFrame();

          if (!reading) {
            state.confidence = 0;
            filter.reset();
            state.outsideSince = 0;
          } else {
            state.confidence = reading.confidence;
            state.headY = filter.filter(reading.headY, now);

            if (!state.calibrated) {
              if (state.autoCalibrateAt && now >= state.autoCalibrateAt) {
                calibratedNow = this.calibrate({ auto: true });
              }
            } else {
              const drift = state.headY - state.neutralY;
              if (Math.abs(drift) < DEADZONE) {
                state.outsideSince = 0;
                if (!state.insideSince) state.insideSince = now;

                // Slow posture drift is the single most common reason head
                // tracking "stops working" after a minute: the neutral point
                // silently becomes wrong and the page creeps. Re-centre once
                // the head has genuinely settled.
                if (now - state.insideSince > RECENTRE_AFTER_MS) {
                  state.neutralY += (state.headY - state.neutralY) * 0.06;
                }
              } else {
                state.insideSince = 0;
                if (!state.outsideSince) state.outsideSince = now;
              }
            }
          }
        }

        const drift = state.calibrated ? state.headY - state.neutralY : 0;
        const magnitude = Math.abs(drift);

        return {
          drift,
          magnitude,
          dwelled: Boolean(state.outsideSince && now - state.outsideSince >= DWELL_MS),
          confidence: state.confidence,
          calibrated: state.calibrated,
          headY: state.headY,
          neutralY: state.neutralY,
          lost: state.confidence <= 0.15,
          calibratedNow
        };
      },

      reset() {
        filter.reset();
        state.calibrated = false;
        state.confidence = 0;
        state.insideSince = 0;
        state.outsideSince = 0;
      }
    };
  }

  /**
   * Peak-limited scroll speed for a given drift, in CSS pixels per second.
   *
   * Squared response: small movements stay gentle and controllable, and only a
   * deliberate tilt reaches full speed.
   */
  function speedFor(drift, sensitivity = 1, invert = false) {
    const magnitude = Math.abs(drift);
    if (magnitude < DEADZONE) return 0;

    const reach = Math.min(1, (magnitude - DEADZONE) / (FULL_TILT - DEADZONE));
    const speed = reach * reach * MAX_SPEED * sensitivity;
    return speed * Math.sign(drift) * (invert ? -1 : 1);
  }

  /**
   * Turn a getUserMedia rejection into something the user can act on.
   * "NotAllowedError" is not an instruction.
   */
  function explainCameraFailure(error) {
    switch (error?.name) {
      case 'NotAllowedError':
        return 'Camera access has not been granted to SETU yet.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No camera was found on this device, so Gaze Scroll cannot run.';
      case 'NotReadableError':
        return 'The camera is already in use by another app. Close it and try again.';
      case 'SecurityError':
        return 'This site does not permit camera access, so Gaze Scroll cannot run here.';
      default:
        return `Gaze Scroll could not start the camera: ${error?.message || 'unknown error'}`;
    }
  }

  scope.SETU_GAZE = {
    SAMPLE_W,
    SAMPLE_H,
    DETECT_HZ,
    DEADZONE,
    FULL_TILT,
    MAX_SPEED,
    DWELL_MS,
    RECENTRE_AFTER_MS,
    OneEuro,
    detectInFrame,
    createTracker,
    speedFor,
    explainCameraFailure
  };
})();
