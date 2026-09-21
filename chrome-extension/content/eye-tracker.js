/**
 * Gaze Scroll — hands-free scrolling driven by head position.
 *
 * Honest description of the technique: this tracks *head position*, not pupil
 * gaze. Tilt or move your head down and the page scrolls down; move it back up
 * and the page scrolls up; hold still and the page holds still. That is
 * achievable without shipping a multi-megabyte CV model, and the UI says so
 * rather than implying medical-grade eye tracking.
 *
 * Video never leaves the machine: frames are read into an 80×60 canvas and
 * discarded. Only a head offset — one number — is ever passed around.
 *
 * The camera is opened from an extension-origin frame rather than from this
 * content script, and that is the fix for the failure people actually hit.
 * `getUserMedia` in a content script asks for the *host page's* camera
 * permission: per-site, re-prompted on every new domain, and permanently
 * refused on any site whose Permissions-Policy withholds the camera or that
 * the user once denied. The result was a stream of `NotAllowedError`s and an
 * error message telling the reader to fix a per-site setting that would not
 * have helped on the next site anyway. A grant made to the extension holds
 * everywhere, once. See camera/frame.js.
 *
 * The in-page camera path is kept as a fallback for the rare page whose CSP
 * refuses to load an extension frame at all.
 */

(() => {
  const { Feature, UI, Store, Scroll, Dock, icon } = window.SETU;
  const Gaze = self.SETU_GAZE;

  const { DEADZONE, MAX_SPEED, speedFor, createTracker, explainCameraFailure } = Gaze;

  /**
   * How long to give the camera frame to *load*.
   *
   * Deliberately covers loading only, and is cleared the moment the frame says
   * hello. It used to cover the whole start-up, including the browser's own
   * permission prompt — so anyone who paused for four seconds to read that
   * prompt had the frame declared dead underneath them, and the in-page
   * fallback then raised a *second* prompt, this time the per-site one that
   * the frame exists to avoid. Reading the dialog was enough to break the
   * feature.
   */
  const FRAME_LOAD_TIMEOUT_MS = 4000;

  /**
   * Two silences, with very different meanings.
   *
   * Samples arrive at animation rate, so even a 400ms gap is a dozen missed
   * frames and there is no honest reason to keep moving through it — at full
   * tilt a single second of coasting carries the reader most of a screen past
   * where they meant to stop. But a brief stall (a garbage collection, a heavy
   * page) is not a dead camera, and telling someone their camera is gone every
   * time the machine hiccups would be worse than useless. So: stop moving
   * quickly and quietly, and only say something once it is really gone.
   */
  const SAMPLE_STALE_MS = 400;
  const SAMPLE_LOST_MS = 3000;

  class GazeScroll extends Feature {
    static key = 'eye';

    constructor() {
      super();
      this.stream = null;
      this.video = null;
      this.tracker = null;
      this.frame = null;
      this.mode = 'frame';

      this.reading = { drift: 0, magnitude: 0, dwelled: false, confidence: 0, calibrated: false };
      this.velocity = 0;
      this.lastFrame = 0;
      this.paused = false;
      this.resumeTimer = null;
      this.needsGrant = false;
      this.lastSampleAt = 0;

      // Set here as well as in applySettings: the camera frame can deliver its
      // first sample before the settings read completes, and integrating
      // against an undefined sensitivity produces NaN velocity — which then
      // sticks, because NaN never falls back under the stop threshold.
      this.sensitivity = 1;
      this.invert = false;
    }

    async onEnable() {
      this.build();

      // Registered before the camera is requested, so a stream that arrives
      // after a failure elsewhere is still shut down.
      this.cleanup(() => this.releaseCamera());

      try {
        await this.startFrameCamera();
      } catch (frameError) {
        // The extension frame could not run — either the page refused to load
        // it, or SETU has not been granted the camera yet. A missing grant is
        // worth surfacing as an action rather than retrying in the page, where
        // it would only produce a second prompt that helps on one site.
        if (frameError.needsGrant) {
          this.needsGrant = true;

          // Offer the fix rather than describing it. The panel is about to be
          // torn down by the base class's rollback, so the way out has to live
          // somewhere that survives — and a toast with one button is a far
          // better answer than a paragraph about the address bar.
          UI.toast('SETU needs your permission to use the camera.', {
            tone: 'warn',
            duration: 9000,
            action: {
              label: 'Allow camera',
              onClick: () => {
                try {
                  chrome.runtime.sendMessage({ action: 'openCameraPermission' });
                } catch (_) {
                  /* worker asleep — the settings page explains it too */
                }
              }
            }
          });

          throw new Error(
            'Gaze Scroll needs camera permission for SETU itself. Grant it once and it works on every site.'
          );
        }

        console.warn('[SETU:eye] camera frame unavailable, using the page camera:', frameError.message);
        await this.startPageCamera();
      }

      this.applySettings();
      this.bind();

      this.setStatus('Sit as you normally read, and hold still for a moment.', 'info');
      this.lastFrame = performance.now();
      this.loop((now) => this.tick(now));
    }

    onDisable() {
      clearTimeout(this.resumeTimer);
      clearTimeout(this.frameTimer);
      this.releaseCamera();
      this.releaseDock?.();
      this.releaseDock = null;
      UI.destroyHost('gaze');
      Scroll.reset();
      this.velocity = 0;
      this.reading = { drift: 0, magnitude: 0, dwelled: false, confidence: 0, calibrated: false };
      this.scope = null;
      this.frame = null;
      this.tracker = null;
    }

    onSettings() {
      this.applySettings();
    }

    applySettings() {
      this.sensitivity = Math.max(0.3, Math.min(2.5, Store.getSetting('gazeSensitivity') || 1));
      this.invert = Boolean(Store.getSetting('gazeInvert'));

      const slider = this.scope?.querySelector('[data-act="sensitivity"]');
      if (slider) slider.value = String(Math.round(this.sensitivity * 10));
      const readout = this.scope?.querySelector('.sens-value');
      if (readout) readout.textContent = `${this.sensitivity.toFixed(1)}×`;
      const invert = this.scope?.querySelector('[data-act="invert"]');
      if (invert) invert.setAttribute('aria-pressed', String(this.invert));
    }

    /* ------------------------------------------------------------------ */
    /* Camera — extension frame (normal path)                             */
    /* ------------------------------------------------------------------ */

    /**
     * Load the extension's camera frame and wait for it to report a stream.
     *
     * Rejects with `needsGrant` set when the extension itself has not been
     * given the camera, which is a one-click fix, and with a plain error when
     * the frame could not load at all, which is not.
     */
    startFrameCamera() {
      return new Promise((resolve, reject) => {
        let settled = false;

        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(this.frameTimer);
          fn(value);
        };

        const iframe = document.createElement('iframe');
        iframe.src = chrome.runtime.getURL('camera/frame.html');
        // Camera access is delegated to this cross-origin frame explicitly;
        // without the attribute Chrome refuses it no matter who has granted
        // what.
        iframe.allow = 'camera';
        iframe.setAttribute('title', 'SETU camera');
        iframe.style.cssText =
          'width:100%; height:100%; border:0; display:block; background:#000;';

        this.onFrameMessage = (event) => {
          if (event.source !== iframe.contentWindow) return;
          const message = event.data;
          if (!message || message.channel !== 'setu-gaze') return;

          switch (message.type) {
            case 'loaded':
              // The frame is alive, so the load timer has done its job. From
              // here the only thing we are waiting on is a human deciding, and
              // there is no deadline on that.
              clearTimeout(this.frameTimer);
              this.frameTimer = null;
              this.setStatus('Waiting for you to allow the camera…', 'info');
              this.postToFrame({ type: 'start' });
              break;

            case 'ready':
              this.mode = 'frame';
              finish(resolve, true);
              break;

            case 'sample':
              this.reading = message;
              this.lastSampleAt = performance.now();
              if (message.calibratedNow) this.announceCalibration();
              this.paintSpeed();
              this.narrate();
              break;

            case 'calibrate-failed':
              this.setStatus(
                'No face detected yet. Make sure your face is lit and centred.',
                'error'
              );
              break;

            case 'error': {
              const error = new Error(message.message || 'The camera could not start.');
              error.needsGrant = Boolean(message.recoverable);
              finish(reject, error);
              break;
            }

            default:
              break;
          }
        };

        window.addEventListener('message', this.onFrameMessage);
        this.cleanup(() => window.removeEventListener('message', this.onFrameMessage));

        iframe.addEventListener('error', () =>
          finish(reject, new Error('This page blocked the SETU camera frame.'))
        );

        this.stage.appendChild(iframe);
        this.frame = iframe;

        // A page whose CSP forbids `frame-src chrome-extension:` never fires an
        // error event — the frame simply stays blank forever. Time the *load*
        // out so the in-page fallback still gets its chance.
        this.frameTimer = setTimeout(
          () => finish(reject, new Error('This page did not allow the SETU camera frame to load.')),
          FRAME_LOAD_TIMEOUT_MS
        );
      });
    }

    postToFrame(message) {
      try {
        this.frame?.contentWindow?.postMessage({ channel: 'setu-gaze-control', ...message }, '*');
      } catch (_) {
        /* frame torn down */
      }
    }

    /* ------------------------------------------------------------------ */
    /* Camera — in-page fallback                                          */
    /* ------------------------------------------------------------------ */

    async startPageCamera() {
      this.mode = 'page';

      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.style.cssText =
        'width:100%; height:100%; object-fit:cover; transform:scaleX(-1); display:block;';
      this.stage.appendChild(video);
      this.video = video;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error('No camera API on this page.'), { name: 'SecurityError' });
        }
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
          audio: false
        });
      } catch (error) {
        // Throwing (rather than quietly clearing `enabled`) is what lets the
        // base class roll the whole feature back, so no panel and no camera
        // stream is left stranded on the page.
        throw new Error(explainCameraFailure(error));
      }

      video.srcObject = this.stream;
      await video.play().catch(() => {});

      this.tracker = createTracker(video);
      this.tracker.armAutoCalibration(performance.now());
    }

    releaseCamera() {
      this.postToFrame({ type: 'stop' });
      this.frame?.remove();
      this.frame = null;

      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      if (this.video) {
        this.video.srcObject = null;
        this.video.remove();
        this.video = null;
      }
      this.tracker = null;
    }

    /* ------------------------------------------------------------------ */
    /* Control loop                                                       */
    /* ------------------------------------------------------------------ */

    tick(now) {
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;

      // In frame mode the samples arrive by message; in page mode we own the
      // tracker. Either way the integration below is identical, which is what
      // keeps the two paths behaving the same.
      if (this.mode === 'page' && this.tracker) {
        const reading = this.tracker.update(now);
        this.reading = reading;
        if (reading.calibratedNow) this.announceCalibration();
        this.paintPage(reading);
        this.narrate();
      } else if (this.mode === 'frame' && this.lastSampleAt) {
        // Watchdog. A reading is a *held* value, so if the frame stops sending
        // — the camera was revoked from the address bar, another app seized
        // the device, the frame crashed — the last sample stays true forever
        // and the page keeps scrolling on its own with nobody driving it.
        // Going quiet has to mean stop.
        const silence = now - this.lastSampleAt;

        if (silence > SAMPLE_STALE_MS) {
          this.reading = { drift: 0, magnitude: 0, dwelled: false, confidence: 0, calibrated: false };
          this.velocity = 0;
          Scroll.reset();
        }
        if (silence > SAMPLE_LOST_MS) {
          this.setStatus('Lost the camera. Turn Gaze Scroll off and on again.', 'error');
        }
      }

      this.integrate(dt);
    }

    /** Turn the current head position into motion. */
    integrate(dt) {
      let target = 0;

      const { drift, magnitude, dwelled, confidence, calibrated } = this.reading;

      if (calibrated && confidence > 0.15 && !this.paused && magnitude >= DEADZONE && dwelled) {
        target = speedFor(drift, this.sensitivity, this.invert);
      }

      // Exponential approach, framed in real time so it feels identical on a
      // 60Hz and a 144Hz display.
      const responsiveness = 1 - Math.exp(-dt / 0.14);
      this.velocity += (target - this.velocity) * responsiveness;

      if (Math.abs(this.velocity) < 1.5) {
        // Snap to a genuine stop. Left to decay asymptotically, the page
        // creeps for several seconds after the reader has stopped moving —
        // which is exactly the complaint this feature exists to avoid.
        this.velocity = 0;
        Scroll.reset();
        this.paintSpeed();
        return;
      }

      const moved = Scroll.by(this.velocity * dt);

      // A zero here usually means the sub-pixel carry has not yet reached a
      // whole pixel, which is the normal state at moderate speeds — at 45px/s
      // and 60fps each frame only asks for 0.75px. Treating that as "the page
      // will not move" zeroed the velocity every time it climbed past the
      // threshold, so the scroll ramped up and stalled, forever, without ever
      // moving. Only the real limit ends a run.
      if (moved === 0) {
        const atEnd =
          this.velocity > 0 ? Scroll.position() >= Scroll.max() - 1 : Scroll.position() <= 0;
        if (atEnd) {
          this.velocity = 0;
          Scroll.reset();
        }
      }

      this.paintSpeed();
    }

    calibrate() {
      if (this.mode === 'frame') {
        this.postToFrame({ type: 'calibrate' });
        return;
      }
      if (this.tracker?.calibrate()) this.announceCalibration();
      else this.setStatus('No face detected yet. Make sure your face is lit and centred.', 'error');
    }

    announceCalibration() {
      this.velocity = 0;
      Scroll.reset();
      this.setStatus('Calibrated. Tilt your head down to scroll, up to go back.', 'ok');
      UI.toast('Gaze Scroll calibrated', { tone: 'success' });
    }

    /** Say what the tracker is currently doing, in the reader's terms. */
    narrate() {
      const { calibrated, lost, magnitude, drift } = this.reading;

      if (lost) {
        if (calibrated) this.setStatus('Face lost — move back into frame.', 'error');
        return;
      }
      if (!calibrated) return;

      if (magnitude < DEADZONE) {
        this.setStatus('Ready — tilt down to scroll, up to go back.', 'ok');
      } else {
        this.setStatus(
          (drift > 0) !== this.invert ? 'Scrolling down…' : 'Scrolling back up…',
          'ok'
        );
      }
    }

    /**
     * Manual scrolling wins.
     *
     * If the reader reaches for the wheel, they want to be somewhere specific,
     * and fighting them for the scroll position is worse than doing nothing.
     */
    bind() {
      const nudge = () => {
        this.paused = true;
        this.velocity = 0;
        Scroll.reset();
        clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => {
          this.paused = false;
        }, 1500);
      };

      this.listen(window, 'wheel', nudge, { passive: true, capture: true });
      this.listen(window, 'touchstart', nudge, { passive: true, capture: true });

      // A hidden tab still runs its rAF loop at a reduced rate on some
      // platforms; scrolling a page nobody is looking at is never wanted.
      this.listen(document, 'visibilitychange', () => {
        this.paused = document.visibilityState !== 'visible';
        if (this.paused) {
          this.velocity = 0;
          Scroll.reset();
        }
      });
    }

    /* ------------------------------------------------------------------ */
    /* Panel                                                              */
    /* ------------------------------------------------------------------ */

    build() {
      const root = UI.host('gaze', { layer: 'control' });

      const style = document.createElement('style');
      style.textContent = `
        .panel {
          position: fixed; width: 232px;
          padding: 12px; background: var(--surface);
          border: 1px solid var(--border); border-radius: var(--radius-lg);
          box-shadow: var(--shadow); font-family: var(--font); color: var(--text);
        }
        .head { display:flex; align-items:center; justify-content:space-between; margin-bottom:9px; }
        .title { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--accent-700); }
        .close {
          background:none; border:1px solid transparent; color:var(--text-dim);
          cursor:pointer; padding:3px; border-radius:var(--radius); display:grid; place-items:center;
        }
        .close:hover { color:var(--accent-2-700); background:var(--accent-2-100); border-color:var(--accent-2); }
        .close:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

        .stage { position:relative; border-radius:var(--radius); overflow:hidden; background:#000; aspect-ratio:4/3; }
        .stage iframe, .stage video { width:100%; height:100%; display:block; border:0; }

        .status { margin-top:9px; font-size:11.5px; line-height:1.45; color:var(--text-dim); min-height:32px; }
        .status[data-tone="error"] { color:var(--danger); }
        .status[data-tone="ok"] { color:var(--accent-700); }

        .speed { height:4px; background:var(--bg); border-radius:3px; overflow:hidden; margin-top:8px; position:relative; }
        .speed-fill {
          position:absolute; top:0; bottom:0; left:50%; width:0;
          background:var(--accent-2); transition:none;
        }
        .speed-mid { position:absolute; top:0; bottom:0; left:50%; width:1px; background:var(--border); }

        .row { display:flex; gap:6px; margin-top:9px; align-items:center; }
        .row .setu-btn { flex:1; min-height:32px; font-size:12px; padding:6px 8px; }
        .toggle {
          display:inline-flex; align-items:center; gap:5px; flex-shrink:0;
          border:1px solid var(--border); border-radius:999px; padding:4px 10px;
          background:transparent; color:var(--text-dim); cursor:pointer;
          font-family:var(--font); font-size:11px; font-weight:700;
        }
        .toggle[aria-pressed="true"] { background:var(--accent-100); border-color:var(--accent); color:var(--accent-900); }
        .toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

        .how { margin-top:10px; font-size:11.5px; color:var(--text-dim); }
        .how summary {
          cursor:pointer; font-weight:700; color:var(--accent-700);
          list-style:none; padding:2px 0;
        }
        .how summary::-webkit-details-marker { display:none; }
        .how summary::before { content:'? '; font-weight:700; }
        .how summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .how ol { margin:6px 0 6px 16px; display:flex; flex-direction:column; gap:4px; }
        .how li { line-height:1.45; }
        .how p { margin-top:6px; line-height:1.45; }

        .sens { margin-top:10px; }
        .sens-head { display:flex; justify-content:space-between; font-size:11px; color:var(--text-dim); margin-bottom:4px; }
        .sens-value { font-weight:700; color:var(--text); font-variant-numeric:tabular-nums; }
        input[type="range"] { width:100%; accent-color: var(--accent); }
      `;
      root.appendChild(style);

      const scope = document.createElement('div');
      scope.className = 'setu-scope';
      scope.innerHTML = `
        <div class="panel" role="region" aria-label="Gaze scroll">
          <div class="head">
            <span class="title">GAZE SCROLL</span>
            <button class="close" aria-label="Close gaze scroll">${icon('x', { size: 16 })}</button>
          </div>
          <div class="stage"></div>
          <div class="speed"><div class="speed-mid"></div><div class="speed-fill"></div></div>
          <p class="status" role="status" aria-live="polite"></p>
          <div class="row">
            <button class="setu-btn" data-variant="primary" data-act="calibrate">Recalibrate</button>
            <button class="toggle" data-act="invert" aria-pressed="false" title="Swap which way your head scrolls the page">Invert</button>
          </div>
          <div class="sens">
            <div class="sens-head"><span>Sensitivity</span><span class="sens-value">1.0×</span></div>
            <input type="range" data-act="sensitivity" min="3" max="25" step="1" value="10"
                   aria-label="Gaze scroll sensitivity" />
          </div>
          <details class="how">
            <summary>How to use this</summary>
            <ol>
              <li>Sit the way you normally read and hold still. The cyan band is
                  your rest position — it is set for you after a second.</li>
              <li>Lower your chin, or move your head down, to scroll down.
                  Raise it to go back up.</li>
              <li>Return to the band to stop. Further from it means faster.</li>
              <li>Touch the mouse wheel at any time and it yields to you.</li>
            </ol>
            <p>It follows your head, not your eyes, and it re-learns your rest
               position as you settle. If it drifts, press Recalibrate.</p>
          </details>
        </div>
      `;
      root.appendChild(scope);

      this.scope = scope;
      this.stage = scope.querySelector('.stage');
      this.speedFill = scope.querySelector('.speed-fill');

      scope.querySelector('.close').onclick = () => window.setuLens?.toggle('eye', false);
      scope.querySelector('[data-act="calibrate"]').onclick = () => this.calibrate();

      scope.querySelector('[data-act="invert"]').onclick = (event) => {
        const next = event.currentTarget.getAttribute('aria-pressed') !== 'true';
        event.currentTarget.setAttribute('aria-pressed', String(next));
        this.invert = next;
        Store.set({ settings: { gazeInvert: next } });
      };

      scope.querySelector('[data-act="sensitivity"]').addEventListener('input', (event) => {
        this.sensitivity = Number(event.target.value) / 10;
        const readout = scope.querySelector('.sens-value');
        if (readout) readout.textContent = `${this.sensitivity.toFixed(1)}×`;
      });
      scope.querySelector('[data-act="sensitivity"]').addEventListener('change', (event) => {
        Store.set({ settings: { gazeSensitivity: Number(event.target.value) / 10 } });
      });

      const panel = scope.querySelector('.panel');
      this.releaseDock = Dock.register('gaze', 'top-right', panel);
      Dock.observe(panel);
    }

    setStatus(message, tone = 'info') {
      const el = this.scope?.querySelector('.status');
      if (!el || el.textContent === message) return;
      el.textContent = message;
      el.dataset.tone = tone;
    }

    /** Speed bar grows out from the centre, in the direction of travel. */
    paintSpeed() {
      if (!this.speedFill) return;
      const fraction = Math.max(-1, Math.min(1, this.velocity / MAX_SPEED));
      const width = Math.abs(fraction) * 50;
      this.speedFill.style.width = `${width}%`;
      this.speedFill.style.left = fraction >= 0 ? '50%' : `${50 - width}%`;
    }

    /**
     * The in-page fallback has to draw its own guides.
     *
     * The extension frame paints these itself, which is why there is no
     * equivalent in the normal path — the overlay lives next to the video it
     * describes rather than being reconstructed across a message boundary.
     */
    paintPage(reading) {
      if (!this.video) return;

      if (!this.pageOverlay) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
        overlay.innerHTML = `
          <div data-el="zone" style="position:absolute; left:0; right:0; display:none;
               background:color-mix(in srgb, var(--accent) 20%, transparent);
               border-top:1px solid var(--accent); border-bottom:1px solid var(--accent);"></div>
          <div data-el="neutral" style="position:absolute; left:0; right:0; height:0; display:none;
               border-top:1px dashed rgba(255,255,255,.5);"></div>
          <div data-el="reticle" style="position:absolute; left:6%; right:6%; height:2px; top:50%;
               background:var(--accent-2); box-shadow:0 0 9px var(--accent-2);"></div>
        `;
        this.stage.appendChild(overlay);
        this.pageOverlay = {
          zone: overlay.querySelector('[data-el="zone"]'),
          neutral: overlay.querySelector('[data-el="neutral"]'),
          reticle: overlay.querySelector('[data-el="reticle"]')
        };
        this.cleanup(() => {
          overlay.remove();
          this.pageOverlay = null;
        });
      }

      const { zone, neutral, reticle } = this.pageOverlay;
      if (!reading.lost) reticle.style.top = `${(reading.headY * 100).toFixed(1)}%`;

      const neutralPct = reading.neutralY * 100;
      neutral.style.top = `${neutralPct.toFixed(1)}%`;
      zone.style.top = `${(neutralPct - DEADZONE * 100).toFixed(1)}%`;
      zone.style.height = `${(DEADZONE * 200).toFixed(1)}%`;
      zone.style.display = reading.calibrated ? 'block' : 'none';
      neutral.style.display = reading.calibrated ? 'block' : 'none';
    }
  }

  window.SETU.features.set('eye', GazeScroll);
})();
