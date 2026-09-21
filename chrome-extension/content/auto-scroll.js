/**
 * Auto Scroll — hands-free reading at a chosen words-per-minute pace.
 *
 * Scrolls fractional pixels per frame rather than jumping on a timer, so the
 * text glides instead of stuttering — important for readers who lose their
 * place when content jumps.
 */

(() => {
  const { Feature, UI, Store, Scroll, Dock, icon } = window.SETU;

  class AutoScroll extends Feature {
    static key = 'scroll';

    constructor() {
      super();
      this.wpm = 220;
      this.running = true;
      this.remainder = 0; // sub-pixel carry, so slow speeds still move
      this.lastFrame = 0;
    }

    onEnable() {
      this.wpm = Store.getSetting('scrollWpm') || 220;
      // Reset the run state explicitly. The constructor only runs once per
      // page, so a session that ended by reaching the bottom of an article
      // left `running` false — and the next time Auto Scroll was switched on
      // it mounted its bar, said it was on, and never moved a pixel.
      this.running = true;
      this.remainder = 0;
      Scroll.reset();
      this.build();
      this.bind();
      this.lastFrame = performance.now();
      this.loop(() => this.tick());
      UI.toast('Auto Scroll on — Space pauses', { tone: 'success' });
    }

    onDisable() {
      clearTimeout(this.resumeTimer);
      this.releaseDock?.();
      this.releaseDock = null;
      Scroll.reset();
      UI.destroyHost('scroll');
      this.scope = null;
    }

    onSettings() {
      const next = Store.getSetting('scrollWpm');
      if (next && next !== this.wpm) {
        this.wpm = next;
        this.render();
      }
    }

    /**
     * Convert reading pace to scroll velocity.
     * Assumes ~11 words per rendered line, so px/sec = (wpm/60) / 11 * lineHeight.
     */
    pixelsPerSecond() {
      // Measure the surface that is actually scrolling. Inside Focus Mode the
      // reader sets its own generous line height, and pacing against the
      // hidden page body underneath made the same words-per-minute setting
      // scroll visibly too slowly there.
      const surface = Scroll.surface() || document.body;
      let lineHeight = NaN;
      try {
        lineHeight = parseFloat(getComputedStyle(surface).lineHeight);
      } catch (_) {
        /* detached element */
      }
      const safeLineHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 24;
      return (this.wpm / 60 / 11) * safeLineHeight;
    }

    tick() {
      const now = performance.now();
      const deltaSeconds = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;

      if (!this.running) return;

      // Through the arbiter: it carries the sub-pixel remainder (so 80 wpm
      // actually moves) and it targets the Focus Mode reader when that is
      // open, instead of scrolling the document uselessly behind it.
      const moved = Scroll.by(this.pixelsPerSecond() * deltaSeconds);

      if (moved === 0 && Scroll.position() >= Scroll.max() - 1) {
        // Reached the bottom — stop rather than spin against the end.
        this.running = false;
        this.render();
        UI.toast('Reached the end of the page.', { tone: 'info' });
      }
    }

    bind() {
      this.listen(window, 'keydown', (event) => {
        const active = document.activeElement;
        if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return;

        if (event.code === 'Space') {
          event.preventDefault();
          this.toggleRun();
        } else if (event.key === 'ArrowUp' && event.shiftKey) {
          event.preventDefault();
          this.changeSpeed(20);
        } else if (event.key === 'ArrowDown' && event.shiftKey) {
          event.preventDefault();
          this.changeSpeed(-20);
        }
      });

      // Any manual scroll input pauses, so the user is never fighting the page.
      this.listen(window, 'wheel', () => this.pauseBriefly(), { passive: true, capture: true });
      this.listen(window, 'touchstart', () => this.pauseBriefly(), { passive: true, capture: true });

      // Scrolling a page nobody is looking at is never wanted, and a
      // background tab still runs its rAF loop on some platforms — so an
      // article would silently scroll to its end while the user was in
      // another tab.
      this.listen(document, 'visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.lastFrame = performance.now();
        } else if (this.running) {
          this.pauseBriefly();
        }
      });
    }

    pauseBriefly() {
      if (!this.running) return;
      this.running = false;
      this.render();

      // One timer, replaced on each nudge. Registering a fresh cleanup per
      // wheel event leaked an entry for every scroll the user made.
      clearTimeout(this.resumeTimer);
      this.resumeTimer = setTimeout(() => {
        if (this.enabled) {
          this.running = true;
          this.lastFrame = performance.now();
          this.render();
        }
      }, 1800);
    }

    toggleRun() {
      this.running = !this.running;
      this.lastFrame = performance.now();
      this.render();
    }

    changeSpeed(delta) {
      this.wpm = Math.max(60, Math.min(900, this.wpm + delta));
      Store.set({ settings: { scrollWpm: this.wpm } });
      this.render();
    }

    build() {
      const root = UI.host('scroll', { layer: 'control', interactive: true });

      const style = document.createElement('style');
      style.textContent = `
        .bar {
          position: fixed;
          display: flex; align-items: center; gap: 10px;
          padding: 10px 15px; background: var(--surface);
          border: 1px solid var(--border); border-radius: var(--radius-lg);
          box-shadow: var(--shadow); pointer-events: auto; font-family: var(--font);
        }
        button {
          background: transparent; border: 1px solid var(--border);
          color: var(--text); width: 32px; height: 32px; border-radius: var(--radius);
          display: grid; place-items: center; cursor: pointer;
          transition: background .15s ease, border-color .15s ease, color .15s ease;
        }
        button:hover { background: var(--accent-100); border-color: var(--accent); color: var(--accent-900); }
        button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        button[data-primary] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
        button[data-primary]:hover { background: var(--accent-600); border-color: var(--accent-600); color: var(--on-accent); }
        .wpm { font-size: 12.5px; font-weight: 600; min-width: 66px; text-align: center; color: var(--text-dim); font-variant-numeric: tabular-nums; }
        .wpm b { color: var(--text); font-size: 14px; }
      `;
      root.appendChild(style);

      const scope = document.createElement('div');
      scope.className = 'setu-scope';
      scope.innerHTML = `
        <div class="bar" role="group" aria-label="Auto scroll controls">
          <button data-act="slower" aria-label="Slower" title="Slower (Shift+Down)">${icon('minus')}</button>
          <span class="wpm"><b>220</b> wpm</span>
          <button data-act="faster" aria-label="Faster" title="Faster (Shift+Up)">${icon('plus')}</button>
          <button data-primary data-act="run" aria-label="Pause" title="Pause / resume (Space)">${icon('pause')}</button>
          <button data-act="close" aria-label="Close auto scroll" title="Close">${icon('x')}</button>
        </div>
      `;
      root.appendChild(scope);
      this.scope = scope;

      // Docked rather than pinned to the corner: Read Aloud and the Commander
      // also live along the bottom edge, and three bars in one corner meant
      // two of them were unreachable.
      const bar = scope.querySelector('.bar');
      this.releaseDock = Dock.register('scroll', 'bottom-right', bar);
      Dock.observe(bar);

      scope.querySelector('[data-act="slower"]').onclick = () => this.changeSpeed(-20);
      scope.querySelector('[data-act="faster"]').onclick = () => this.changeSpeed(20);
      scope.querySelector('[data-act="run"]').onclick = () => this.toggleRun();
      scope.querySelector('[data-act="close"]').onclick = () => window.setuLens?.toggle('scroll', false);

      this.render();
    }

    render() {
      if (!this.scope) return;
      this.scope.querySelector('.wpm').innerHTML = `<b>${this.wpm}</b> wpm`;
      const btn = this.scope.querySelector('[data-act="run"]');
      btn.innerHTML = icon(this.running ? 'pause' : 'play');
      btn.setAttribute('aria-label', this.running ? 'Pause' : 'Resume');
    }
  }

  window.SETU.features.set('scroll', AutoScroll);
})();
