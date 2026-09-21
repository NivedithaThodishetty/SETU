/**
 * SETU — camera frame.
 * ====================
 *
 * The reason this file exists at all is a permission boundary.
 *
 * Calling `getUserMedia` from a content script asks for the *host page's*
 * camera permission. That is per-origin, so the user is prompted again on
 * every single site, and any site whose Permissions-Policy withholds the
 * camera — or that the user once denied — makes Gaze Scroll permanently
 * impossible there. In practice it failed with `NotAllowedError` almost
 * everywhere, with an error message telling the reader to fix a setting that
 * was never really theirs to fix.
 *
 * This page is served from the extension's own origin. A grant made once (on
 * the permission page, or on the first prompt here) belongs to the extension
 * and applies on every site afterwards. The content script embeds this frame
 * inside its panel, so what the reader sees is unchanged.
 *
 * Only a head *position* crosses the boundary — a number between 0 and 1.
 * Frames are drawn into an 80×60 canvas, measured, and discarded; no image
 * data is ever posted, stored, or sent anywhere.
 */

(() => {
  const { createTracker, explainCameraFailure, DEADZONE } = self.SETU_GAZE;

  const stage = document.querySelector('.stage');
  const video = document.querySelector('video');
  const zone = document.querySelector('.zone');
  const neutral = document.querySelector('.neutral');
  const reticle = document.querySelector('.reticle');

  let tracker = null;
  let stream = null;
  let frame = 0;

  /**
   * Report to whoever embedded us.
   *
   * Worth being exact about what this boundary buys. It keeps the *camera*
   * inside the extension: no pixels, no frames, and no stream ever cross into
   * the page, which is the point. It does not hide the head offset from the
   * page — a message to `parent` is delivered to the page's own listeners
   * whatever target origin is used, and no iframe can prevent that. That is an
   * acceptable trade because the page can already observe the scrolling this
   * number produces, so it learns nothing it could not have measured anyway.
   *
   * Inbound messages are checked against `parent` and matched on shape.
   */
  function post(message) {
    try {
      parent.postMessage({ channel: 'setu-gaze', ...message }, '*');
    } catch (_) {
      /* embedder went away */
    }
  }

  async function start() {
    if (stream) return;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('No camera API available.'), { name: 'NotFoundError' });
      }

      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false
      });
    } catch (error) {
      post({
        type: 'error',
        name: error?.name || 'Error',
        // `NotAllowedError` here means the *extension* has not been granted the
        // camera, which the host can fix with a single click — unlike the
        // per-site denial this whole file exists to avoid.
        recoverable: error?.name === 'NotAllowedError',
        message: explainCameraFailure(error)
      });
      return;
    }

    video.srcObject = stream;
    await video.play().catch(() => {});

    tracker = createTracker(video);
    tracker.armAutoCalibration(performance.now());

    post({ type: 'ready' });
    loop();
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    tracker = null;
    if (video) video.srcObject = null;
  }

  function loop() {
    frame = requestAnimationFrame(loop);
    if (!tracker) return;

    const now = performance.now();
    const reading = tracker.update(now);

    paint(reading);

    // The host integrates this against its own frame clock and its own scroll
    // surface. Sending drift rather than a scroll delta is what keeps Gaze
    // Scroll working inside Focus Mode, where the thing that scrolls is not
    // the document.
    post({
      type: 'sample',
      drift: reading.drift,
      magnitude: reading.magnitude,
      dwelled: reading.dwelled,
      confidence: reading.confidence,
      calibrated: reading.calibrated,
      lost: reading.lost,
      calibratedNow: reading.calibratedNow
    });
  }

  function paint(reading) {
    stage.dataset.lost = String(reading.lost);
    stage.dataset.calibrated = String(reading.calibrated);

    if (!reading.lost) {
      reticle.style.top = `${(reading.headY * 100).toFixed(1)}%`;
    }

    const neutralPct = reading.neutralY * 100;
    neutral.style.top = `${neutralPct.toFixed(1)}%`;
    zone.style.top = `${(neutralPct - DEADZONE * 100).toFixed(1)}%`;
    zone.style.height = `${(DEADZONE * 200).toFixed(1)}%`;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const request = event.data;
    if (!request || request.channel !== 'setu-gaze-control') return;

    switch (request.type) {
      case 'start':
        start();
        break;
      case 'calibrate':
        if (tracker && !tracker.calibrate()) {
          post({ type: 'calibrate-failed' });
        }
        break;
      case 'stop':
        stop();
        break;
      default:
        break;
    }
  });

  window.addEventListener('pagehide', stop);

  // Announce as soon as the document is parsed, so a host that never hears
  // this can fall back rather than waiting on a frame that will not load.
  post({ type: 'loaded' });
})();
