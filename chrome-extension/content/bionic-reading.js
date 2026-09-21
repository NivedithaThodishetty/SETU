/**
 * Bionic Reading — bolds the leading fixation of each word to anchor the eye.
 *
 * Rewritten in v3. The previous version had four defects that made it unsafe
 * to leave on:
 *   1. `parent.closest('.setu-*')` is not a valid CSS selector — closest()
 *      threw a SyntaxError inside the TreeWalker filter, aborting the walk.
 *   2. The MutationObserver observed the very DOM edits it was making, so each
 *      pass re-triggered itself — an unbounded loop that froze busy pages.
 *   3. Restore only looked for `.setu-bionic-text`, but the interactive-element
 *      branch emitted a bare <span>, so that text could never be restored.
 *   4. Words were injected via innerHTML without escaping, so page text
 *      containing markup characters was reinterpreted as HTML.
 *
 * The rewrite wraps each text node once, keeps a direct reference for exact
 * restoration, escapes all content, and pauses the observer while mutating.
 */

(() => {
  const { Feature, UI, Store, Text, Reading, Bus } = window.SETU;

  class BionicReading extends Feature {
    static key = 'bionic';

    constructor() {
      super();
      this.intensity = 0.45;
      this.observer = null;
      this.muted = false;      // true while we are the ones editing the DOM
      this.wrapped = new Set(); // <span data-setu-bionic> we created
      this.pending = null;
    }

    onEnable() {
      this.intensity = Store.getSetting('bionicIntensity') || 0.45;
      this.injectStyle();
      this.processAll();
      this.watch();

      // Focus Mode replaces the article wholesale with its own copy in a
      // shadow root. Re-anchoring onto it is the whole reason the two can be
      // used together — previously turning Focus Mode on left bionic text
      // bolded on a page nobody could see any more, and the reader itself
      // completely unstyled, which read as "bionic does not work in Focus
      // Mode".
      this.cleanup(Bus.on('reading-surface', () => this.reanchor()));

      UI.toast('Bionic Reading on', { tone: 'success' });
    }

    /**
     * Re-apply to whatever surface is now showing the article.
     *
     * Restores first: the nodes we wrapped may belong to a document that is
     * now hidden behind the reader, and leaving them wrapped would mean
     * unbolding them later against text that has since been re-rendered.
     */
    reanchor() {
      if (!this.enabled) return;
      this.mutate(() => {
        this.restoreAll();
        this.processAll();
      });
      this.watchSurface();
    }

    onDisable() {
      this.observer?.disconnect();
      this.observer = null;
      clearTimeout(this.pending);
      this.restoreAll();
      document.getElementById('setu-bionic-style')?.remove();
    }

    onSettings() {
      const next = Store.getSetting('bionicIntensity');
      if (next && Math.abs(next - this.intensity) > 0.01) {
        this.intensity = next;
        // Re-render from the original text rather than re-bolding bold text.
        this.mutate(() => {
          this.restoreAll();
          this.processAll();
        });
      }
    }

    /* ------------------------------------------------------------------ */

    /**
     * Bionic styling must reach the page's own DOM, so unlike our overlays it
     * cannot live in a shadow root. It is scoped to our own <b> tag and uses
     * `inherit` throughout, so it changes weight and nothing else.
     */
    injectStyle() {
      if (document.getElementById('setu-bionic-style')) return;

      const style = document.createElement('style');
      style.id = 'setu-bionic-style';
      style.setAttribute('data-setu', 'style');
      style.textContent = `
        b[data-setu-fix] {
          font-weight: 700 !important;
          color: inherit !important;
          background: none !important;
          font-family: inherit !important;
          font-size: inherit !important;
          font-style: inherit !important;
        }
        span[data-setu-bionic] {
          all: unset;
          font: inherit; color: inherit;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    /** Run `fn` without our own edits feeding back into the observer. */
    mutate(fn) {
      this.muted = true;
      try {
        fn();
      } finally {
        // Let the mutation records from this batch drain before unmuting.
        setTimeout(() => {
          this.muted = false;
        }, 0);
      }
    }

    processAll() {
      const surface = Reading.root();
      if (!surface) return;
      this.mutate(() => {
        for (const node of Text.collect(surface, { minLength: 3 })) {
          this.wrap(node);
        }
      });
    }

    /** Replace one text node with a span of bolded-prefix words. */
    wrap(textNode) {
      if (!textNode.parentNode) return;
      if (textNode.parentElement?.hasAttribute('data-setu-bionic')) return;

      const original = textNode.textContent;
      if (!original.trim() || original.length < 3) return;
      if (!/\p{L}{3,}/u.test(original)) return; // nothing worth anchoring

      const html = this.toBionic(original);
      if (!html) return;

      const span = document.createElement('span');
      span.setAttribute('data-setu-bionic', '');
      span.innerHTML = html;
      // Keep the source text verbatim so restore is exact, not reconstructed.
      span.__setuOriginal = original;

      try {
        textNode.parentNode.replaceChild(span, textNode);
        this.wrapped.add(span);
      } catch (_) {
        /* node moved mid-pass — skip it */
      }
    }

    /**
     * Bold the leading fraction of each word.
     * Operates on escaped text so page content can never inject markup.
     */
    toBionic(text) {
      let touched = false;

      const html = Text.escape(text).replace(/\p{L}[\p{L}\p{M}'’-]*/gu, (word) => {
        if (word.length < 2) return word;
        touched = true;
        // Short words get one anchor letter; longer words scale with intensity.
        const boldLength = word.length <= 3 ? 1 : Math.max(1, Math.round(word.length * this.intensity));
        return `<b data-setu-fix>${word.slice(0, boldLength)}</b>${word.slice(boldLength)}`;
      });

      return touched ? html : null;
    }

    restoreAll() {
      for (const span of this.wrapped) {
        if (!span.parentNode) continue;
        try {
          span.parentNode.replaceChild(
            document.createTextNode(span.__setuOriginal ?? span.textContent),
            span
          );
        } catch (_) {
          /* already detached */
        }
      }
      this.wrapped.clear();
    }

    /**
     * Re-process content added after enabling (infinite scroll, SPA routes).
     * Debounced, and skipped entirely while we are the one mutating.
     */
    watch() {
      this.observer = new MutationObserver((records) => {
        if (this.muted) return;

        const roots = [];
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !Text.isOurs(node)) roots.push(node);
            else if (node.nodeType === Node.TEXT_NODE && !Text.isOurs(node)) roots.push(node);
          }
        }
        if (!roots.length) return;

        clearTimeout(this.pending);
        this.pending = setTimeout(() => {
          this.mutate(() => {
            for (const root of roots) {
              if (!root.isConnected) continue;
              if (root.nodeType === Node.TEXT_NODE) {
                this.wrap(root);
              } else {
                for (const node of Text.collect(root, { minLength: 3 })) this.wrap(node);
              }
            }
          });
        }, 160);
      });

      this.observer.observe(document.body, { childList: true, subtree: true });
      this.watchSurface();
      this.cleanup(() => {
        this.observer?.disconnect();
        this.surfaceObserver?.disconnect();
      });
    }

    /**
     * Also watch the hosted reading surface when there is one.
     *
     * A MutationObserver on `document.body` never sees inside a shadow root,
     * so without this the reader's own lazy-loaded content — images resolving,
     * a Focus Mode re-extract after an SPA navigation — arrived unbolded.
     */
    watchSurface() {
      this.surfaceObserver?.disconnect();
      this.surfaceObserver = null;

      const surface = Reading.surface();
      if (!surface || !this.observer) return;

      this.surfaceObserver = new MutationObserver((records) => {
        if (this.muted) return;
        const added = records.some((record) => record.addedNodes.length);
        if (!added) return;

        clearTimeout(this.pending);
        this.pending = setTimeout(() => this.mutate(() => this.processAll()), 160);
      });
      this.surfaceObserver.observe(surface, { childList: true, subtree: true });
    }
  }

  window.SETU.features.set('bionic', BionicReading);
})();
