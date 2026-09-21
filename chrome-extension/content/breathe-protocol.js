/**
 * The Breathe Protocol — behavioural overwhelm detection.
 *
 * Watches for the interaction signatures of cognitive overload: erratic cursor
 * reversals, rapid scroll thrash, and rage-clicking. When the combined score
 * crosses a threshold it dims the page and offers a box-breathing prompt, then
 * asks whether to simplify the page.
 *
 * Deliberately conservative: a false positive interrupts someone who was fine,
 * which is worse than a missed detection. Signals decay continuously, the
 * detector arms only after a settling period, and it will not re-trigger for
 * several minutes once dismissed.
 */

(() => {
  const { Feature, UI } = window.SETU;

  const TRIGGER_SCORE = 100;
  const REARM_MS = 4 * 60 * 1000;
  const ARM_DELAY_MS = 12 * 1000;

  class BreatheProtocol extends Feature {
    static key = 'breathe';

    constructor() {
      super();
      this.score = 0;
      this.armedAt = 0;
      this.mutedUntil = 0;
      this.active = false;
      this.last = { x: 0, y: 0, dir: 0, moveAt: 0, scrollY: 0, scrollDir: 0, clickAt: 0, clickX: 0, clickY: 0 };
      this.clickBurst = 0;
    }

    onEnable() {
      this.armedAt = Date.now() + ARM_DELAY_MS;
      this.bind();
      this.loop(() => this.decay());
    }

    onDisable() {
      UI.destroyHost('breathe');
      this.active = false;
      this.score = 0;
    }

    bind() {
      this.listen(
        window,
        'mousemove',
        (event) => {
          const now = performance.now();
          const dx = event.clientX - this.last.x;
          const dy = event.clientY - this.last.y;
          const distance = Math.hypot(dx, dy);
          const dt = now - this.last.moveAt;

          if (dt > 0 && dt < 120 && distance > 12) {
            const direction = Math.atan2(dy, dx);
            const turn = Math.abs(direction - this.last.dir);
            // A near-reversal at speed reads as searching/agitation.
            if (turn > 2.2 && turn < 4.1 && distance / dt > 1.4) {
              this.add(7);
            }
            this.last.dir = direction;
          }

          this.last.x = event.clientX;
          this.last.y = event.clientY;
          this.last.moveAt = now;
        },
        { passive: true }
      );

      this.listen(
        window,
        'scroll',
        () => {
          const y = window.scrollY;
          const direction = Math.sign(y - this.last.scrollY);
          // Direction flips while moving fast = hunting for something.
          if (direction !== 0 && direction !== this.last.scrollDir && Math.abs(y - this.last.scrollY) > 90) {
            this.add(9);
            this.last.scrollDir = direction;
          }
          this.last.scrollY = y;
        },
        { passive: true }
      );

      this.listen(
        window,
        'click',
        (event) => {
          const now = performance.now();
          const near = Math.hypot(event.clientX - this.last.clickX, event.clientY - this.last.clickY) < 44;

          if (now - this.last.clickAt < 600 && near) {
            this.clickBurst += 1;
            if (this.clickBurst >= 2) this.add(16); // third+ click in the same spot
          } else {
            this.clickBurst = 0;
          }

          this.last.clickAt = now;
          this.last.clickX = event.clientX;
          this.last.clickY = event.clientY;
        },
        { passive: true, capture: true }
      );
    }

    add(points) {
      if (this.active || Date.now() < this.armedAt || Date.now() < this.mutedUntil) return;

      this.score += points;
      if (this.score >= TRIGGER_SCORE) this.trigger();
    }

    /** Stress signals fade fast; a brief flurry should not accumulate forever. */
    decay() {
      if (this.score > 0) this.score = Math.max(0, this.score - 0.55);
    }

    trigger() {
      this.active = true;
      this.score = 0;
      this.render();
    }

    dismiss(simplify) {
      this.clearEvery('phase');
      UI.destroyHost('breathe');
      this.active = false;
      this.mutedUntil = Date.now() + REARM_MS;

      if (simplify) {
        window.setuLens?.toggle('focus', true);
        window.setuLens?.toggle('lineFocus', true);
      }
    }

    render() {
      const root = UI.host('breathe', { layer: 'panel', interactive: true });

      const style = document.createElement('style');
      style.textContent = `
        .veil {
          position: fixed; inset: 0;
          background: rgba(32, 30, 29, 0.45);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          display: grid; place-items: center; pointer-events: auto;
          animation: fade .4s ease;
        }
        @keyframes fade { from { opacity:0 } to { opacity:1 } }
        .card {
          width: min(420px, 90vw); text-align: center; padding: 36px 30px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius); box-shadow: var(--shadow);
          font-family: var(--font); color: var(--text);
        }
        .orb { width:128px; height:128px; margin:0 auto 22px; position:relative; }
        .ring {
          position:absolute; inset:0; border-radius:50%;
          border:2.5px solid var(--accent);
          animation: breathe 16s ease-in-out infinite;
        }
        .ring:nth-child(2) { animation-delay:-1.2s; opacity:.4; }
        @keyframes breathe {
          0%,100% { transform:scale(.62); opacity:.55; }  /* rest */
          25%     { transform:scale(1);   opacity:1; }    /* inhale 4s */
          50%     { transform:scale(1);   opacity:1; }    /* hold 4s */
          75%     { transform:scale(.62); opacity:.55; }  /* exhale 4s */
        }
        .phase {
          position:absolute; inset:0; display:grid; place-items:center;
          font-size:12px; font-weight:700; letter-spacing:.12em; color:var(--accent-700);
        }
        h2 { font-family: "Source Serif 4", Georgia, serif; font-size:20px; font-weight:700; color: var(--text); margin-bottom:10px; }
        p  { font-size:13.5px; color:var(--text-dim); line-height:1.6; margin-bottom:24px; }
        .row { display:flex; gap:10px; }
        .row .setu-btn { flex:1; min-height: 38px; }
      `;
      root.appendChild(style);

      const scope = document.createElement('div');
      scope.className = 'setu-scope';
      scope.innerHTML = `
        <div class="veil" role="dialog" aria-modal="true" aria-label="Take a breath">
          <div class="setu-card card">
            <div class="orb">
              <div class="ring"></div><div class="ring"></div>
              <div class="phase">BREATHE</div>
            </div>
            <h2>This page looks a bit intense.</h2>
            <p>Follow the circle for a few seconds — in as it grows, out as it shrinks.
               When you're ready, I can simplify this page and mark your reading line.</p>
            <div class="row">
              <button class="setu-btn" data-act="dismiss">I'm okay</button>
              <button class="setu-btn" data-variant="primary" data-act="simplify">Simplify this page</button>
            </div>
          </div>
        </div>
      `;
      root.appendChild(scope);

      // Cycle the phase label in time with the 16s animation.
      const phase = scope.querySelector('.phase');
      const labels = ['BREATHE IN', 'HOLD', 'BREATHE OUT', 'REST'];
      let index = 0;
      // Named, so a second trigger replaces the first timer rather than
      // stacking another one behind it for the life of the page.
      this.every('phase', 4000, () => {
        index = (index + 1) % labels.length;
        phase.textContent = labels[index];
      });

      scope.querySelector('[data-act="dismiss"]').onclick = () => this.dismiss(false);
      scope.querySelector('[data-act="simplify"]').onclick = () => this.dismiss(true);
    }
  }

  window.SETU.features.set('breathe', BreatheProtocol);
})();
