/**
 * Line Focus — dims the page and keeps one band of text lit.
 *
 * Rewritten in v3. The previous version tracked the raw cursor Y with a fixed
 * 44px band, so the highlight drifted off the text it was meant to isolate and
 * the two 0.75-alpha masks plus a brightness(0.35) backdrop-filter stacked into
 * near-black, hiding the very line the user was reading.
 *
 * Now the band snaps to the real rendered line box under the cursor, so it
 * tracks prose of any size, and the dimming is a single tunable layer.
 */

(() => {
  const { Feature, UI, Store, Text, Scroll, icon } = window.SETU;

  class LineFocus extends Feature {
    static key = 'lineFocus';

    constructor() {
      super();
      this.lines = 1;          // how many text lines the band covers
      this.dim = 0.72;         // mask opacity
      this.targetTop = null;   // where the band wants to be (viewport px)
      this.targetHeight = 44;
      this.currentTop = null;  // where it actually is, eased toward target
      this.currentHeight = 44;
      this.pointerY = window.innerHeight / 3;
      this.usingKeyboard = false;
    }

    onEnable() {
      this.lines = Store.getSetting('lineFocusHeight') || 1;
      this.build();
      this.bind();
      this.snapToPointer();
      this.loop(() => this.tick());
      UI.toast('Line Focus on — move your cursor, or use ↑ ↓', { tone: 'success' });
    }

    onDisable() {
      UI.destroyHost('line-focus');
      this.currentTop = null;
      this.targetTop = null;
    }

    onSettings() {
      const next = Store.getSetting('lineFocusHeight');
      if (next && next !== this.lines) {
        this.lines = next;
        this.syncPillButtons();
        this.snapToPointer();
      }
    }

    /* ------------------------------------------------------------------ */

    build() {
      const root = UI.host('line-focus', { layer: 'dim', interactive: false });

      const style = document.createElement('style');
      style.textContent = `
        .mask {
          position: fixed; left: 0; right: 0;
          background: rgba(32, 30, 29, var(--dim, .55));
          pointer-events: none;
          transition: background .2s ease;
        }
        .band {
          position: fixed; left: 0; right: 0;
          pointer-events: none;
          border-top: 2px solid var(--accent);
          border-bottom: 2px solid var(--accent);
          background: rgba(0, 136, 176, 0.04);
        }
        .pill {
          position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px 8px 15px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-lg); box-shadow: var(--shadow);
          pointer-events: auto; white-space: nowrap; font-family: var(--font);
        }
        .pill-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--accent-700); letter-spacing: .08em; }
        .sep { width: 1px; height: 16px; background: var(--border); }
        .seg { display: flex; gap: 4px; }
        .seg button {
          background: transparent; color: var(--text-dim);
          border: 1px solid var(--border);
          padding: 4px 11px; border-radius: var(--radius-sm);
          font-family: var(--font); font-size: 12.5px; font-weight: 600; cursor: pointer;
          transition: background .15s ease, border-color .15s ease, color .15s ease;
        }
        .seg button:hover { background: var(--accent-100); border-color: var(--accent); color: var(--accent-900); }
        .seg button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
        .seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .close {
          background: transparent; border: none; color: var(--text-dim);
          display: grid; place-items: center; cursor: pointer;
          padding: 3px; border-radius: var(--radius-sm);
        }
        .close:hover { color: var(--accent-2-700); background: var(--accent-2-100); }
        .close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `;
      root.appendChild(style);

      const scope = document.createElement('div');
      scope.className = 'setu-scope';
      scope.style.setProperty('--dim', this.dim);
      scope.innerHTML = `
        <div class="mask" data-mask="top"></div>
        <div class="mask" data-mask="bottom"></div>
        <div class="band"></div>
        <div class="pill" role="group" aria-label="Line Focus controls">
          <span class="pill-label">LINE FOCUS</span>
          <div class="sep"></div>
          <div class="seg">
            <button data-lines="1" aria-pressed="true">1 line</button>
            <button data-lines="2" aria-pressed="false">2 lines</button>
            <button data-lines="4" aria-pressed="false">Block</button>
          </div>
          <div class="sep"></div>
          <button class="close" title="Close Line Focus (Alt+L)" aria-label="Close Line Focus">${icon('x', { size: 16 })}</button>
        </div>
      `;
      root.appendChild(scope);

      this.scope = scope;
      this.topMask = scope.querySelector('[data-mask="top"]');
      this.bottomMask = scope.querySelector('[data-mask="bottom"]');
      this.band = scope.querySelector('.band');

      scope.querySelectorAll('.seg button').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.lines = Number(btn.dataset.lines);
          this.syncPillButtons();
          Store.set({ settings: { lineFocusHeight: this.lines } });
          this.snapToPointer();
        });
      });

      scope.querySelector('.close').addEventListener('click', () => {
        window.setuLens?.toggle('lineFocus', false);
      });

      this.syncPillButtons();
    }

    syncPillButtons() {
      this.scope?.querySelectorAll('.seg button').forEach((btn) => {
        btn.setAttribute('aria-pressed', String(Number(btn.dataset.lines) === this.lines));
      });
    }

    bind() {
      this.listen(
        window,
        'mousemove',
        (event) => {
          this.usingKeyboard = false;
          this.pointerY = event.clientY;
          this.resolveTarget(event.clientX, event.clientY);
        },
        { passive: true }
      );

      // Keep the band on its line as the page moves under it. Captured,
      // because a scroll inside the Focus Mode reader is a shadow-DOM event
      // that never bubbles to window — without capture the band froze in place
      // the moment the two features were used together.
      this.listen(window, 'scroll', () => this.snapToPointer(), { passive: true, capture: true });
      this.listen(window, 'resize', () => this.snapToPointer(), { passive: true });

      this.listen(window, 'keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        // Never steal arrows from a field the user is typing in.
        const active = document.activeElement;
        if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return;

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); // otherwise the page scrolls out from under the band
          this.usingKeyboard = true;
          this.step(event.key === 'ArrowDown' ? 1 : -1);
        }
      });
    }

    /* ------------------------------------------------------------------ */

    /** Snap the band to the line box at (x, y), falling back to a plain band. */
    resolveTarget(x, y) {
      const box = Text.lineBoxAt(x, y) || Text.findLineBoxNear(y);

      if (box) {
        // Grow downward from the found line to cover `lines` line-heights.
        const padding = 4;
        this.targetTop = box.top - padding;
        this.targetHeight = box.height * this.lines + padding * 2;
      } else {
        // No text under the cursor (image, gutter, video) — keep a sane band.
        const fallback = 44 * this.lines;
        this.targetTop = y - fallback / 2;
        this.targetHeight = fallback;
      }

      this.clampTarget();
    }

    clampTarget() {
      this.targetHeight = Math.max(24, Math.min(window.innerHeight * 0.8, this.targetHeight));
      this.targetTop = Math.max(0, Math.min(window.innerHeight - this.targetHeight, this.targetTop));
    }

    snapToPointer() {
      if (!this.enabled) return;
      this.resolveTarget(window.innerWidth / 2, this.pointerY);
    }

    /** Move one line up or down using real line geometry where possible. */
    step(direction) {
      const currentHeight = this.currentHeight || 44;
      const probeY = this.pointerY + direction * (currentHeight * 0.85 + 6);
      const clampedY = Math.max(8, Math.min(window.innerHeight - 8, probeY));

      // Near an edge, scroll the page instead of pinning the band to the border.
      const margin = window.innerHeight * 0.2;
      if (clampedY > window.innerHeight - margin || clampedY < margin) {
        // Through the arbiter: `window.scrollBy` moves the document, and inside
        // Focus Mode the document is not what is scrolling — so stepping past
        // the bottom of the band did nothing at all there.
        Scroll.by(direction * currentHeight * 2);
      }

      this.pointerY = clampedY;
      this.resolveTarget(window.innerWidth / 2, clampedY);
    }

    /** Ease the band toward its target so tracking feels smooth, not jumpy. */
    tick() {
      if (this.targetTop === null) return;

      if (this.currentTop === null) {
        this.currentTop = this.targetTop;
        this.currentHeight = this.targetHeight;
      } else {
        // Keyboard steps land immediately; pointer tracking eases.
        const ease = this.usingKeyboard ? 0.45 : 0.28;
        this.currentTop += (this.targetTop - this.currentTop) * ease;
        this.currentHeight += (this.targetHeight - this.currentHeight) * ease;
      }

      const top = Math.round(this.currentTop);
      const height = Math.round(this.currentHeight);
      const bottom = top + height;

      this.topMask.style.top = '0px';
      this.topMask.style.height = `${Math.max(0, top)}px`;

      this.bottomMask.style.top = `${bottom}px`;
      this.bottomMask.style.height = `${Math.max(0, window.innerHeight - bottom)}px`;

      this.band.style.top = `${top}px`;
      this.band.style.height = `${height}px`;
    }
  }

  window.SETU.features.set('lineFocus', LineFocus);
})();
