/**
 * Focus Mode — a sensory-safe reader view.
 *
 * Rewritten in v3. The previous version copied `articleContent.innerHTML` into
 * an overlay, which cloned every id in the document, re-ran embedded markup,
 * and carried ads and tracking pixels straight into the "clean" view. It also
 * hid every body child by inline style, which broke pages that re-render, and
 * bound Escape to a non-focusable div so the shortcut never fired.
 *
 * The rewrite extracts *sanitised* content into an isolated shadow root: text,
 * headings, lists, quotes, links and images survive; scripts, iframes, ads, and
 * styling do not.
 */

(() => {
  const { Feature, UI, Store, Text, Scroll, Bus, icon } = window.SETU;

  /** Tags carried into the reader. Everything else is unwrapped or dropped. */
  const KEEP = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE',
    'PRE', 'CODE', 'FIGURE', 'FIGCAPTION', 'IMG', 'A', 'STRONG', 'EM', 'B', 'I',
    'BR', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SUP', 'SUB', 'DL', 'DT', 'DD'
  ]);

  const DROP = new Set([
    'SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'SELECT',
    'TEXTAREA', 'VIDEO', 'AUDIO', 'EMBED', 'OBJECT', 'CANVAS', 'SVG', 'NAV', 'ASIDE', 'FOOTER'
  ]);

  const JUNK = /\b(ad|ads|advert|advertisement|banner|promo|sponsor|newsletter|subscribe|social|share|comment|related|recommend|popup|modal|cookie|consent|sidebar|widget|tracking|paywall)\b/i;

  const THEMES = ['calm', 'sepia', 'dark', 'contrast'];

  class FocusMode extends Feature {
    static key = 'focus';

    constructor() {
      super();
      this.fontScale = 1;
      this.themeIndex = 0;
      this.previousOverflow = '';
    }

    onEnable() {
      const article = this.extract();
      if (!article) {
        // The message is the error, because the orchestrator surfaces
        // error.message to the user — "no-content" told them nothing.
        throw new Error(
          'Focus Mode needs an article to read, and this page does not have one it can find.'
        );
      }

      this.fontScale = Store.getSetting('fontScale') || 1;
      this.build(article);

      // Lock background scroll so the wheel drives the reader, not the page.
      this.previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      this.cleanup(() => {
        document.documentElement.style.overflow = this.previousOverflow;
      });

      // The text every other reading feature works on has just been replaced.
      // Bionic Reading in particular has to re-anchor onto the reader, and it
      // has no other way to hear that the article moved.
      Bus.emit('reading-surface');

      UI.toast('Focus Mode on — press Esc to exit', { tone: 'success' });
    }

    onDisable() {
      UI.destroyHost('focus');
      this.scope = null;
      this.surface = null;
      // Announce after the host is gone, so listeners resolve the page itself.
      Bus.emit('reading-surface');
    }

    /**
     * A single-page app replaced the article without a document load.
     *
     * Common enough to matter: every news site, every docs site, and every
     * React router does it. Without this the reader kept showing the previous
     * article while the page underneath had moved on — and because the reader
     * covers the viewport, there was no way to tell from the outside.
     *
     * A failed re-extract keeps what is on screen. The new view may simply not
     * have rendered yet, and replacing a readable article with an error would
     * be a worse answer than being one navigation behind.
     */
    onNavigate() {
      const article = this.extract();
      if (!article) return;

      const previousTheme = this.reader?.dataset.theme;
      UI.destroyHost('focus');
      this.runCleanups();
      this.build(article);
      if (previousTheme) this.reader.dataset.theme = previousTheme;

      // build() re-locks scrolling and re-claims the surface through cleanups,
      // which runCleanups() has just released.
      this.previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      this.cleanup(() => {
        document.documentElement.style.overflow = this.previousOverflow;
      });

      Bus.emit('reading-surface');
    }

    /* ------------------------------------------------------------------ */
    /* Extraction                                                         */
    /* ------------------------------------------------------------------ */

    /** Pick the element most likely to be the article body. */
    findRoot() {
      for (const selector of [
        'article',
        '[itemprop="articleBody"]',
        'main article',
        'main',
        '[role="main"]',
        '.post-content',
        '.entry-content',
        '.article-body',
        '#content'
      ]) {
        const el = document.querySelector(selector);
        if (el && el.innerText.trim().length > 400) return el;
      }

      // Density heuristic: the block holding the most paragraph text wins.
      let best = null;
      let bestScore = 0;
      for (const el of document.querySelectorAll('div, section')) {
        if (Text.isOurs(el)) continue;
        const paragraphs = el.querySelectorAll(':scope > p');
        if (paragraphs.length < 3) continue;
        const score = [...paragraphs].reduce((sum, p) => sum + p.innerText.trim().length, 0);
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
      return bestScore > 400 ? best : null;
    }

    extract() {
      const source = this.findRoot();
      if (!source) return null;

      const title =
        document.querySelector('h1')?.innerText.trim() ||
        document.title ||
        'Reader';

      const container = document.createElement('div');
      this.sanitizeInto(source, container);

      return container.textContent.trim().length > 200 ? { title, body: container } : null;
    }

    /**
     * Copy `source` into `target`, keeping only safe, semantic content.
     * Builds fresh nodes rather than cloning, so no page state comes along.
     */
    sanitizeInto(source, target) {
      for (const child of source.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.textContent.trim()) target.appendChild(document.createTextNode(child.textContent));
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        const tag = child.tagName;
        if (DROP.has(tag) || Text.isOurs(child)) continue;

        // Drop anything self-identifying as chrome rather than content.
        const signature = `${child.className || ''} ${child.id || ''}`;
        if (typeof signature === 'string' && JUNK.test(signature)) continue;
        if (child.getAttribute('aria-hidden') === 'true') continue;
        if (!child.getClientRects().length && tag !== 'BR') continue;

        if (!KEEP.has(tag)) {
          // Structural wrapper: keep its contents, discard the wrapper.
          this.sanitizeInto(child, target);
          continue;
        }

        const clean = document.createElement(tag);

        if (tag === 'A') {
          const href = child.getAttribute('href');
          if (href && /^https?:|^\//i.test(href)) {
            clean.href = new URL(href, location.href).toString();
            clean.target = '_blank';
            clean.rel = 'noopener noreferrer';
          }
        } else if (tag === 'IMG') {
          const src = child.currentSrc || child.src;
          if (!src || child.naturalWidth < 120) continue;
          clean.src = src;
          clean.alt = child.alt || '';
          clean.loading = 'lazy';
          target.appendChild(clean);
          continue;
        }

        this.sanitizeInto(child, clean);
        if (clean.textContent.trim() || clean.querySelector('img') || tag === 'HR' || tag === 'BR') {
          target.appendChild(clean);
        }
      }
    }

    /* ------------------------------------------------------------------ */
    /* View                                                               */
    /* ------------------------------------------------------------------ */

    build({ title, body }) {
      // `readable` lets the reading aids see the article inside this shadow
      // root. Without it Bionic Reading, read-aloud, the ruler and the line
      // band all treat the reader as extension chrome and refuse to touch it,
      // which is why none of them appeared to work in Focus Mode.
      const root = UI.host('focus', { layer: 'reader', readable: true });
      root.appendChild(this.styleSheet());

      const scope = document.createElement('div');
      scope.className = 'setu-scope';
      scope.innerHTML = `
        <div class="reader" data-theme="calm" role="dialog" aria-modal="true" aria-label="Focus Mode reader" tabindex="-1">
          <div class="progress"><div class="progress-fill"></div></div>
          <header class="bar">
            <span class="brand">SETU · Focus</span>
            <div class="tools">
              <button class="setu-btn" data-act="font-down" aria-label="Smaller text" title="Smaller text">${icon('minus', { size: 16 })}<span class="a">A</span></button>
              <button class="setu-btn" data-act="font-up" aria-label="Larger text" title="Larger text">${icon('plus', { size: 16 })}<span class="a">A</span></button>
              <button class="setu-btn" data-act="theme">${icon('palette', { size: 16 })}Theme</button>
              <button class="setu-btn" data-act="tts" aria-label="Read this article aloud">${icon('speaker-high', { size: 16 })}Read aloud</button>
              <button class="setu-btn" data-variant="danger" data-act="close" aria-label="Close Focus Mode">${icon('x', { size: 16 })}Close</button>
            </div>
          </header>
          <main class="surface" tabindex="0">
            <article class="doc" data-setu-content="article"><h1 class="doc-title"></h1></article>
          </main>
        </div>
      `;
      root.appendChild(scope);

      this.scope = scope;
      this.reader = scope.querySelector('.reader');
      this.surface = scope.querySelector('.surface');

      scope.querySelector('.doc-title').textContent = title;
      scope.querySelector('.doc').appendChild(body);
      this.applyFontScale();

      scope.querySelector('[data-act="close"]').onclick = () => window.setuLens?.toggle('focus', false);
      scope.querySelector('[data-act="font-up"]').onclick = () => this.scaleFont(0.1);
      scope.querySelector('[data-act="font-down"]').onclick = () => this.scaleFont(-0.1);
      scope.querySelector('[data-act="theme"]').onclick = () => this.cycleTheme();
      scope.querySelector('[data-act="tts"]').onclick = () => {
        window.setuLens?.speak(this.scope.querySelector('.doc').innerText);
      };

      // Escape is bound on the document — the old version bound it to a
      // non-focusable div, where it could never fire.
      this.listen(document, 'keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          window.setuLens?.toggle('focus', false);
        }
      });

      this.listen(this.surface, 'scroll', () => {
        const max = this.surface.scrollHeight - this.surface.clientHeight;
        const pct = max > 0 ? (this.surface.scrollTop / max) * 100 : 0;
        scope.querySelector('.progress-fill').style.width = `${Math.min(100, pct)}%`;
      });

      // The reader is its own scroll container, so `window.scrollBy` does
      // nothing here — which used to mean turning Focus Mode on silently
      // killed Auto Scroll, Gaze Scroll, and read-aloud's follow-along. The
      // arbiter routes all three to whatever surface is actually on top.
      this.cleanup(Scroll.claim(this.surface, 10));

      this.surface.focus();
    }

    scaleFont(delta) {
      this.fontScale = Math.max(0.8, Math.min(2, this.fontScale + delta));
      this.applyFontScale();
      Store.set({ settings: { fontScale: this.fontScale } });
    }

    applyFontScale() {
      this.scope?.querySelector('.doc')?.style.setProperty('--scale', this.fontScale);
    }

    cycleTheme() {
      this.themeIndex = (this.themeIndex + 1) % THEMES.length;
      this.reader.dataset.theme = THEMES[this.themeIndex];
    }

    styleSheet() {
      const style = document.createElement('style');
      style.textContent = `
        .reader {
          position: fixed; inset: 0;
          display: flex; flex-direction: column;
          background: var(--page); color: var(--ink);
          font-family: "Source Serif 4", Georgia, serif;
        }
        .reader[data-theme="calm"]     { --page:#f3f2f2; --ink:#201e1d; --muted:rgba(32,30,29,0.65); --rule:rgba(32,30,29,0.16); }
        .reader[data-theme="sepia"]    { --page:#f6ecd9; --ink:#3b3226; --muted:#7a6a53; --rule:rgba(0,0,0,.14); }
        .reader[data-theme="dark"]     { --page:#18181a; --ink:#f3f2f2; --muted:rgba(243,242,242,0.66); --rule:rgba(243,242,242,0.15); }
        .reader[data-theme="contrast"] { --page:#0d0d0d; --ink:#fff; --muted:#facc15; --rule:#fff; }

        .progress { position:absolute; top:0; left:0; right:0; height:3px; background:transparent; z-index:2; }
        .progress-fill { height:100%; width:0; background:var(--accent); transition:width .1s linear; }

        .bar {
          display:flex; align-items:center; justify-content:space-between; gap:16px;
          padding:12px 20px; border-bottom:1px solid var(--rule); flex-shrink:0; background: var(--page);
        }
        .brand { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform: uppercase; color:var(--accent-700); }
        .tools { display:flex; gap:8px; flex-wrap:wrap; }
        .tools .setu-btn { min-height:34px; padding:6px 12px; font-size:13px; gap:6px; background:transparent; border-color:var(--rule); color:var(--ink); border-radius: var(--radius); }
        .tools .setu-btn:hover { background:var(--accent-100); border-color: var(--accent); color: var(--accent-900); }
        .tools .a { font-weight: 700; }

        .surface { flex:1; overflow-y:auto; padding:48px 24px 120px; }
        .surface:focus-visible { outline:none; }

        .doc {
          --scale:1;
          max-width:min(70ch, 92vw); margin:0 auto;
          font-size:calc(18.5px * var(--scale));
          line-height:1.75; letter-spacing:.006em;
        }
        .doc-title { font-size:calc(32px * var(--scale)); line-height:1.22; margin-bottom:28px; font-weight:700; color: var(--ink); }
        .doc :where(p, ul, ol, blockquote, figure, table, dl) { margin-bottom:1.15em; }
        .doc :where(h1,h2,h3,h4) { margin:1.6em 0 .5em; line-height:1.3; font-weight:700; color: var(--ink); }
        .doc h2 { font-size:calc(24px * var(--scale)); }
        .doc h3 { font-size:calc(20px * var(--scale)); }
        .doc :where(ul,ol) { padding-left:1.4em; }
        .doc li { margin-bottom:.45em; }
        .doc a { color:var(--accent); text-underline-offset:3px; }
        .doc img { max-width:100%; height:auto; border-radius:var(--radius); margin:1.2em 0; border: 1px solid var(--rule); }
        .doc blockquote { border-left:3.5px solid var(--accent); padding-left:1em; color:var(--muted); font-style:italic; }
        .doc pre { background:rgba(32,30,29,0.06); padding:14px; border-radius:var(--radius); overflow-x:auto; font-size:.88em; border: 1px solid var(--rule); }
        .doc code { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:.9em; }
        .doc table { width:100%; border-collapse:collapse; display:block; overflow-x:auto; }
        .doc :where(th,td) { border:1px solid var(--rule); padding:8px 11px; text-align:left; }
        .doc hr { border:none; border-top:1px solid var(--rule); margin:2em 0; }
      `;
      return style;
    }
  }

  window.SETU.features.set('focus', FocusMode);
})();
