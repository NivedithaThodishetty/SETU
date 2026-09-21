/**
 * SETU — Shared Content-Script Runtime
 * ====================================
 * Loaded before every feature module. Provides the subsystems that make SETU
 * work reliably, and simultaneously, on every site on the web:
 *
 *  1. UI.host()   — every overlay lives in its own Shadow DOM root, so hostile
 *                   page CSS cannot restyle us and our CSS cannot leak out.
 *                   Hosts self-anchor to the viewport even on pages whose
 *                   <html> creates a containing block (transform/filter), which
 *                   would otherwise make `position: fixed` scroll with the page.
 *  2. Store       — one state object, persisted and broadcast, so the popup,
 *                   options page, and page never disagree about what is on.
 *  3. Feature     — a base class with idempotent, async-safe enable/disable, so
 *                   running every tool at once is well-defined rather than
 *                   accidental.
 *  4. Layers      — a single z-index ladder, so composed overlays stack in a
 *                   predictable order instead of fighting.
 *  5. Dock        — one stacking manager for floating control bars, so six
 *                   simultaneous tools never pile their panels on top of each
 *                   other in the same screen corner.
 *  6. Scroll      — one arbiter for "move the reading surface". Auto Scroll,
 *                   Gaze Scroll, and read-aloud follow all go through it, so
 *                   they compose instead of fighting, and all three keep
 *                   working inside Focus Mode's own scroller.
 *  7. Page        — one shadow-DOM-aware snapshot of the live page, shared by
 *                   the agent, the 3-step path, and the visual explainer.
 *                   Control handles are held in memory rather than written on
 *                   the page, so two features can address the page at once
 *                   without erasing each other's targets.
 *  8. API         — every engine call, proxied through the service worker,
 *                   cancellable, cached, and streamable, with errors a human
 *                   can act on.
 */

(() => {
  if (window.SETU?.ready) return;

  // setu-config.js is listed before this file in the manifest, so it is always
  // present. The literal fallback only matters if a future change reorders
  // them, and it must not silently point somewhere else if it fires.
  const DEFAULTS = self.SETU_DEFAULTS || {
    apiHost: 'https://setu-37hl.onrender.com',
    sanctuaryUrl: 'https://setu-amber.vercel.app',
    requestTimeoutMs: 120000,
    fastTimeoutMs: 25000,
    healthTimeoutMs: 6000,
    wakeTimeoutMs: 75000
  };

  /* ---------------------------------------------------------------------- */
  /* Languages                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * The languages SETU explains and speaks in, and the resolver for them.
   *
   * Defined in setu-config.js so that the popup, the options page, the service
   * worker and every content script share one list. Re-exported here because
   * feature modules destructure everything they need from `window.SETU`, and a
   * second copy of this table is exactly the kind of thing that silently drifts.
   *
   * The literal fallback only matters if a future change reorders the manifest;
   * it must not point somewhere different if it ever fires.
   */
  const LANGUAGES = self.SETU_LANGUAGES || [{ code: 'en-IN', name: 'English', native: 'English' }];
  const resolveLanguage = self.setuResolveLanguage || (() => LANGUAGES[0]);
  const languageLabel =
    self.setuLanguageLabel ||
    ((entry) =>
      entry?.native && entry.native !== entry.name ? `${entry.native} — ${entry.name}` : entry?.name || '');

  /* ---------------------------------------------------------------------- */
  /* Layer ladder                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * The reader sits *below* the dimmers and the reading overlays, not above
   * them.
   *
   * That ordering is the whole reason Line Focus and the Reading Ruler can be
   * used together with Focus Mode. When the reader was the higher layer it
   * covered both of them completely, so turning Focus Mode on silently
   * cancelled every reading aid — which read to the user as "these features
   * cannot be combined". The band and the ruler are `pointer-events: none`, so
   * sitting above the reader costs nothing: clicks, selection and scrolling
   * all still reach it.
   */
  const LAYERS = {
    reader: 2147483600,   // full-page focus reader
    dim: 2147483610,      // page dimmers and masks
    reading: 2147483620,  // line band, word highlight, ruler
    panel: 2147483635,    // agent panel, commander, breakdowns
    control: 2147483645,  // floating control pills
    toast: 2147483647     // transient messages, always on top
  };

  /* ---------------------------------------------------------------------- */
  /* Shadow-root host manager                                               */
  /* ---------------------------------------------------------------------- */

  const hosts = new Map();

  /**
   * True when an ancestor of our host turns `position: fixed` into
   * "fixed relative to that ancestor" rather than to the viewport.
   *
   * `transform`, `filter`, `backdrop-filter`, `perspective`, and `contain`
   * on <html> all do this. Sites use them for page transitions and for
   * "shake"/parallax effects, and when they do, every fixed overlay silently
   * starts scrolling with the document — the panel wanders off screen and the
   * reading ruler lands in the wrong place. Cheap to detect, and the fix below
   * costs nothing on the overwhelming majority of pages where it is false.
   */
  function viewportIsHijacked() {
    const root = document.documentElement;
    if (!root) return false;
    let style;
    try {
      style = getComputedStyle(root);
    } catch (_) {
      return false;
    }
    return (
      (style.transform && style.transform !== 'none') ||
      (style.filter && style.filter !== 'none') ||
      (style.backdropFilter && style.backdropFilter !== 'none') ||
      (style.perspective && style.perspective !== 'none') ||
      /paint|layout|strict|content/.test(style.contain || '')
    );
  }

  /**
   * Re-anchor every host so its children's `position: fixed` really means the
   * viewport. Only does work on pages that need it.
   */
  let anchorFrame = 0;
  function anchorHosts() {
    const hijacked = viewportIsHijacked();

    for (const entry of hosts.values()) {
      const el = entry.el;
      if (!el.isConnected) continue;

      if (!hijacked) {
        if (entry.anchored) {
          entry.anchored = false;
          el.style.width = '0';
          el.style.height = '0';
          el.style.transform = '';
          el.removeAttribute('data-setu-anchored');
        }
        continue;
      }

      // Give the host a box that exactly overlays the viewport, then keep it
      // pinned there as the document scrolls. Fixed children resolve against
      // this box, so they behave exactly as they would on a normal page.
      entry.anchored = true;
      el.setAttribute('data-setu-anchored', 'true');
      el.style.width = `${window.innerWidth}px`;
      el.style.height = `${window.innerHeight}px`;
      el.style.transform = `translate(${window.scrollX}px, ${window.scrollY}px)`;
    }
  }

  function scheduleAnchor() {
    if (anchorFrame) return;
    anchorFrame = requestAnimationFrame(() => {
      anchorFrame = 0;
      anchorHosts();
    });
  }

  window.addEventListener('scroll', scheduleAnchor, { passive: true, capture: true });
  window.addEventListener('resize', scheduleAnchor, { passive: true });

  /**
   * Return (creating if needed) an isolated shadow root for `id`.
   * Mounted on documentElement rather than body: some sites replace <body>
   * wholesale during hydration, which would silently destroy our overlays.
   */
  /**
   * @param {object} [options]
   * @param {string} [options.layer]
   * @param {boolean} [options.readable] mark this host as carrying *page
   *   content* rather than chrome. Focus Mode is the only one: its reader is
   *   a real article the user is reading, so Bionic Reading, read-aloud and
   *   the ruler must be able to see inside it, while every other overlay
   *   stays invisible to them.
   */
  function host(id, { layer = 'panel', readable = false } = {}) {
    const existing = hosts.get(id);
    // A single-page app that swapped out the document can orphan our host.
    if (existing && existing.el.isConnected) return existing.root;
    if (existing) hosts.delete(id);

    const el = document.createElement('div');
    el.id = `setu-host-${id}`;
    el.setAttribute('data-setu', 'host');
    if (readable) el.setAttribute('data-setu-readable', 'true');
    // The palette is selected by an attribute on the host, so every overlay
    // switches together without any feature module knowing about theming.
    el.dataset.appearance = appearance();
    // `all: initial` stops inherited page styles at the boundary.
    //
    // The host itself never takes pointer events: `.setu-scope > *` re-enables
    // them for the panels that need them (see baseStyle). That way an
    // interactive overlay can be viewport-sized without swallowing clicks
    // meant for the page underneath.
    el.style.cssText =
      'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; ' +
      `z-index: ${LAYERS[layer]}; pointer-events: none;`;

    (document.documentElement || document.body).appendChild(el);

    const root = el.attachShadow({ mode: 'open' });
    root.appendChild(baseStyle());
    hosts.set(id, { el, root, anchored: false });
    anchorHosts();
    return root;
  }

  function destroyHost(id) {
    const entry = hosts.get(id);
    if (entry) {
      entry.el.remove();
      hosts.delete(id);
    }
  }

  function destroyAllHosts() {
    for (const id of [...hosts.keys()]) destroyHost(id);
  }

  /**
   * The palette to actually paint: 'light' or 'dark'.
   *
   * `auto` is resolved here rather than in CSS, so every stylesheet needs one
   * dark block instead of two, and there is a single place that decides.
   */
  function appearance() {
    const chosen = state?.settings?.appearance;
    if (chosen === 'dark') return 'dark';
    if (chosen === 'auto') {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    // Light unless asked otherwise — matching the Sanctuary web app, which is
    // light by default and only darkens when someone picks the velvet theme.
    return 'light';
  }

  /** Repaint every open overlay after the setting or the OS theme changes. */
  function applyAppearance() {
    const next = appearance();
    for (const { el } of hosts.values()) el.dataset.appearance = next;
    return next;
  }

  // Only meaningful while the setting is 'auto'; harmless otherwise, because
  // applyAppearance recomputes from the setting either way.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyAppearance);

  /**
   * Design tokens + reset, injected into every shadow root.
   *
   * These are the Broadsheet tokens the Sanctuary web app is built on
   * (`frontend/src/index.css`), so the extension and the workspace read as one
   * product rather than two. Newsprint: near-black Source Serif 4 on paper
   * white, with the process inks — cyan, magenta, print yellow — used small and
   * deliberately, like spot colour. There is no sans-serif in this system; the
   * serif is the chrome.
   *
   * The dark palette is the web app's own `theme-velvet`, not an invention.
   * It follows the viewer's preference rather than the host page's, because a
   * blinding panel over a dark site at night is a real accessibility problem
   * for exactly the readers this is built for.
   */
  function baseStyle() {
    const style = document.createElement('style');
    style.textContent = [
      ':host { all: initial; }',
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      ':where(button, input, select, textarea) { font: inherit; color: inherit; }',
      '',
      '.setu-scope {',
      '  /* Broadsheet — ground and ink */',
      '  --bg:          #f3f2f2;',
      '  --bg-soft:     #eae9e9;',
      '  --surface:     #ffffff;',
      '  --text:        #201e1d;',
      '  --text-dim:    rgba(32, 30, 29, 0.62);',
      '  --border:      rgba(32, 30, 29, 0.16);',
      '',
      '  /* Cyan — every interactive element */',
      '  --accent:      #0088b0;',
      '  --accent-100:  #e0f4fa;',
      '  --accent-300:  #8cd3eb;',
      '  --accent-600:  #007599;',
      '  --accent-700:  #00607d;',
      '  --accent-900:  #003648;',
      '  --on-accent:   #f3f2f2;',
      '',
      '  /* Magenta — the rare second spot, and print yellow */',
      '  --accent-2:    #d6006c;',
      '  --accent-2-100:#fce4ef;',
      '  --accent-2-700:#a30052;',
      '  --yellow:      #edbb00;',
      '  --warn:        #a97a00;',
      '  --danger:      #d6006c;',
      '  --ok:          #0f7a4d;',
      '',
      '  /* Spacing 1.25x — do not tighten */',
      '  --space-1: 5px;  --space-2: 10px; --space-3: 15px; --space-4: 20px;',
      '  --space-5: 25px; --space-6: 30px; --space-7: 35px; --space-8: 40px;',
      '',
      '  /* Near-square. Nothing is pill-shaped except tags. */',
      '  --radius-sm: 2px;',
      '  --radius:    3px;',
      '  --radius-lg: 5px;',
      '',
      '  --shadow-sm: 0 1px 2px rgba(32, 30, 29, 0.06);',
      '  --shadow-md: 0 2px 6px rgba(32, 30, 29, 0.08);',
      '  --shadow:    0 8px 24px rgba(32, 30, 29, 0.10);',
      '',
      '  --font: "Source Serif 4", Georgia, serif;',
      '',
      '  font-family: var(--font);',
      '  font-size: 14px;',
      '  line-height: 1.55;',
      '  color: var(--text);',
      '  -webkit-font-smoothing: antialiased;',
      '}',
      '',
      '/* The host is click-through; each overlay opts itself back in. An',
      '   overlay that must not take clicks (the ruler band, the agent ring)',
      '   restores `pointer-events: none` in its own sheet, which is appended',
      '   after this one and therefore wins the tie. */',
      '.setu-scope { pointer-events: none; }',
      '.setu-scope > * { pointer-events: auto; }',
      '',
      '/* Dark is a choice, never an ambush. The Sanctuary web app is light by',
      '   default and only darkens when someone picks the velvet theme; the',
      '   extension follows the same rule, so a dark OS cannot silently',
      '   override the reading surface the user actually chose. */',
      ':host([data-appearance="dark"]) .setu-scope:not([data-contrast="high"]) {',
      '  --bg:          #18181a;',
      '  --bg-soft:     #18181a;',
      '  --surface:     #222226;',
      '  --text:        #f3f2f2;',
      '  --text-dim:    rgba(243, 242, 242, 0.66);',
      '  --border:      rgba(243, 242, 242, 0.15);',
      '  --accent:      #38bdf8;',
      '  --accent-100:  rgba(56, 189, 248, 0.15);',
      '  --accent-300:  #0284c7;',
      '  --accent-600:  #7dd3fc;',
      '  --accent-700:  #7dd3fc;',
      '  --accent-900:  #bae6fd;',
      '  --on-accent:   #18181a;',
      '  --accent-2:    #f43f5e;',
      '  --accent-2-100:rgba(244, 63, 94, 0.15);',
      '  --accent-2-700:#fb7185;',
      '  --warn:        #edbb00;',
      '  --danger:      #fb7185;',
      '  --ok:          #4ade80;',
      '  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);',
      '  --shadow-md: 0 2px 6px rgba(0, 0, 0, 0.45);',
      '  --shadow:    0 8px 28px rgba(0, 0, 0, 0.55);',
      '}',
      '',
      '.setu-scope[data-contrast="high"] {',
      '  --bg: #000; --bg-soft: #000; --surface: #0a0a0a;',
      '  --text: #fff; --text-dim: #e8e8e8;',
      '  --border: #fff; --accent: #ffe600; --accent-2: #00ff9d;',
      '  --accent-100: #1a1a00; --accent-300: #ffe600; --accent-600: #ffe600;',
      '  --accent-700: #ffe600; --accent-900: #fff8b0; --on-accent: #000;',
      '}',
      '',
      '/* Kicker — the only uppercase in the system. */',
      '.setu-kicker {',
      '  font-size: 10px; font-weight: 700; letter-spacing: .08em;',
      '  text-transform: uppercase; color: var(--accent-700);',
      '}',
      '',
      '.setu-btn {',
      '  display: inline-flex; align-items: center; justify-content: center; gap: 8px;',
      '  min-height: 36px; padding: 8px 16px;',
      '  background: transparent; color: var(--text);',
      '  border: 1px solid var(--border); border-radius: var(--radius);',
      '  font-family: var(--font); font-size: 14px; font-weight: 600; cursor: pointer;',
      '  transition: background .15s ease, border-color .15s ease, color .15s ease, transform .15s ease;',
      '}',
      '.setu-btn:hover:not([disabled])  { background: var(--accent-100); border-color: var(--accent); color: var(--accent-900); }',
      '.setu-btn:active:not([disabled]) { transform: translateY(1px); }',
      '.setu-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }',
      '.setu-btn[data-variant="primary"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }',
      '.setu-btn[data-variant="primary"]:hover:not([disabled]) { background: var(--accent-600); border-color: var(--accent-600); color: var(--on-accent); }',
      '.setu-btn[data-variant="danger"]  { background: transparent; border-color: rgba(214, 0, 108, .3); color: var(--accent-2-700); }',
      '.setu-btn[data-variant="danger"]:hover:not([disabled]) { background: var(--accent-2-100); border-color: var(--accent-2); color: var(--accent-2-700); }',
      '.setu-btn[disabled] { opacity: .45; cursor: not-allowed; }',
      '.setu-btn svg { flex-shrink: 0; }',
      '',
      '/* Tags are the one pill-shaped thing in the system. */',
      '.setu-tag {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 2px 8px; border-radius: 999px;',
      '  font-size: 11px; font-weight: 600; line-height: 1.4;',
      '  background: var(--bg); color: var(--text-dim);',
      '  border: 1px solid var(--border);',
      '}',
      '.setu-tag[data-tone="accent"] { background: var(--accent-100); color: var(--accent-900); border-color: var(--accent-300); }',
      '',
      '.setu-card {',
      '  background: var(--surface); border: 1px solid var(--border);',
      '  border-radius: var(--radius-lg); box-shadow: var(--shadow);',
      '}',
      '',
      '@media (prefers-reduced-motion: reduce) {',
      '  * { animation-duration: .01ms !important; transition-duration: .01ms !important; }',
      '}'
    ].join('\n');
    return style;
  }

  /* ---------------------------------------------------------------------- */
  /* Dock — one stacking manager for floating control bars                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Every tool that floats a control bar registers it here instead of pinning
   * itself to a screen corner.
   *
   * Read Aloud, Auto Scroll, Gaze Scroll, the 3-step path, the visual
   * explainer, and the Commander can all be on at once — which used to mean
   * four panels stacked in the same 20px of the bottom-right corner, with
   * whichever mounted last covering the rest. The dock lays them out in
   * registration order along each edge and re-flows whenever one appears,
   * disappears, or changes size.
   */
  const DOCK_INSET = 20;
  const DOCK_GAP = 12;

  const Dock = {
    entries: new Map(),

    /**
     * @param {string} id       stable per feature
     * @param {string} corner   'bottom-left' | 'bottom-right' | 'top-right' | 'top-left'
     * @param {HTMLElement} el  the positioned element; Dock owns its inset properties
     * @returns {() => void}    release
     */
    register(id, corner, el) {
      Dock.entries.set(id, { corner, el });
      Dock.layout();
      return () => Dock.release(id);
    },

    release(id) {
      Dock.entries.delete(id);
      Dock.layout();
    },

    /** Re-measure and re-place. Cheap, and only called on real changes. */
    layout() {
      const stacks = new Map();

      for (const [id, entry] of Dock.entries) {
        if (!entry.el?.isConnected) {
          Dock.entries.delete(id);
          continue;
        }
        if (!stacks.has(entry.corner)) stacks.set(entry.corner, []);
        stacks.get(entry.corner).push(entry);
      }

      // Budget the vertical space *per edge*, not per corner. Stacking within
      // a corner is not enough on its own: the 3-step path grows from the top
      // right and the agent grows from the bottom right, and a tall plan meant
      // the two met in the middle and the agent's composer ended up underneath
      // a checklist. Panels carry their own internal scrolling, so a height cap
      // costs nothing but the scrollbar it creates.
      for (const edge of ['left', 'right']) {
        const onEdge = [...(stacks.get(`top-${edge}`) || []), ...(stacks.get(`bottom-${edge}`) || [])];
        if (onEdge.length < 2) {
          for (const entry of onEdge) entry.el.style.maxHeight = '';
          continue;
        }

        const available = window.innerHeight - DOCK_INSET * 2 - DOCK_GAP * (onEdge.length - 1);
        const natural = onEdge.map((entry) => {
          entry.el.style.maxHeight = '';
          return { entry, height: entry.el.offsetHeight || 0 };
        });

        const total = natural.reduce((sum, item) => sum + item.height, 0);
        if (total <= available) continue;

        // Water-filling: shrink only what is over its fair share, so a 54px
        // control bar is never squeezed to make room for a panel that could
        // have given up the space itself.
        let remaining = available;
        let sharers = natural.length;
        const sorted = [...natural].sort((a, b) => a.height - b.height);

        for (const item of sorted) {
          const share = remaining / sharers;
          if (item.height <= share) {
            remaining -= item.height;
          } else {
            item.entry.el.style.maxHeight = `${Math.max(120, Math.floor(share))}px`;
            remaining -= share;
          }
          sharers -= 1;
        }
      }

      for (const [corner, entries] of stacks) {
        const [edgeY, edgeX] = corner.split('-');
        let offset = DOCK_INSET;

        for (const { el } of entries) {
          const height = el.offsetHeight || 0;
          el.style.position = 'fixed';
          el.style[edgeY] = `${offset}px`;
          el.style[edgeY === 'top' ? 'bottom' : 'top'] = 'auto';
          el.style[edgeX] = `${DOCK_INSET}px`;
          el.style[edgeX === 'left' ? 'right' : 'left'] = 'auto';
          offset += height + DOCK_GAP;
        }
      }
    }
  };

  // A panel's height changes when it is collapsed, when a plan grows, or when
  // the window narrows and a bar wraps. Re-flow rather than leave a gap.
  if (typeof ResizeObserver !== 'undefined') {
    const dockObserver = new ResizeObserver(() => Dock.layout());
    Dock.observe = (el) => {
      try {
        dockObserver.observe(el);
      } catch (_) {
        /* detached */
      }
    };
  } else {
    Dock.observe = () => {};
  }
  window.addEventListener('resize', () => Dock.layout(), { passive: true });

  /* ---------------------------------------------------------------------- */
  /* Scroll arbiter                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * The single place that moves the reading surface.
   *
   * Two things made hands-free scrolling unreliable. First, `window.scrollBy`
   * does nothing inside Focus Mode, whose reader is its own scroll container
   * in a shadow root — so turning on Focus Mode silently killed both Auto
   * Scroll and Gaze Scroll. Second, sub-pixel velocities were dropped on the
   * floor: `scrollBy(0, 0.4)` moves nothing, so slow paces simply never
   * scrolled. The carry accumulator fixes that, and the claim stack fixes the
   * first.
   */
  const Scroll = {
    _claims: [],
    _carry: 0,

    /** A feature with its own scroll container claims it while it is open. */
    claim(el, priority = 0) {
      const entry = { el, priority };
      Scroll._claims.push(entry);
      Scroll._claims.sort((a, b) => a.priority - b.priority);
      return () => {
        const index = Scroll._claims.indexOf(entry);
        if (index !== -1) Scroll._claims.splice(index, 1);
      };
    },

    /** The element that should scroll, or null for the document itself. */
    surface() {
      for (let i = Scroll._claims.length - 1; i >= 0; i -= 1) {
        const el = Scroll._claims[i].el;
        if (el?.isConnected) return el;
      }
      return null;
    },

    /** The element to actually move — a claimed container, else the document. */
    target() {
      return Scroll.surface() || document.scrollingElement || document.documentElement;
    },

    position() {
      const el = Scroll.target();
      return el ? el.scrollTop : window.scrollY;
    },

    max() {
      const el = Scroll.target();
      if (!el) return 0;
      return Math.max(0, el.scrollHeight - el.clientHeight);
    },

    /**
     * Move by `dy` pixels, accumulating the fractional remainder.
     * @returns {number} pixels actually moved — 0 means we are at the end.
     *
     * Two things here are load-bearing on the real web.
     *
     * The move is computed against the clamped target position rather than by
     * re-reading the scroll offset afterwards. A great many sites set
     * `scroll-behavior: smooth` on the root, which makes a programmatic scroll
     * *animate* — so the offset has not changed by the time the next line
     * reads it. Auto Scroll and Gaze Scroll both took that to mean "the page
     * will not move, we must be at the bottom" and stopped dead on the first
     * frame. Every site with smooth scrolling enabled was silently broken.
     *
     * And `behavior: 'instant'` overrides that CSS explicitly, so a hands-free
     * scroll glides at the pace we are integrating rather than fighting an
     * animation curve the page chose for its own anchor links.
     */
    by(dy) {
      if (!Number.isFinite(dy) || dy === 0) return 0;

      Scroll._carry += dy;
      const whole = Math.trunc(Scroll._carry);
      if (whole === 0) return 0;
      Scroll._carry -= whole;

      const el = Scroll.target();
      if (!el) return 0;

      const before = el.scrollTop;
      const limit = Math.max(0, el.scrollHeight - el.clientHeight);
      const next = Math.max(0, Math.min(limit, before + whole));
      if (next === before) return 0;

      try {
        el.scrollTo({ top: next, behavior: 'instant' });
      } catch (_) {
        // Older engines reject an unknown behavior value.
        el.scrollTop = next;
      }

      return next - before;
    },

    /** Drop any accumulated fraction — call when a run stops. */
    reset() {
      Scroll._carry = 0;
    },

    /**
     * Bring `el` into comfortable view on whichever surface owns it.
     * `scrollIntoView` walks real ancestors, so it already handles the Focus
     * Mode reader; this wrapper exists so callers do not have to think about
     * smooth-vs-instant or about pages that override scroll behaviour.
     */
    into(el, { block = 'center', smooth = true } = {}) {
      if (!el?.isConnected) return;
      try {
        el.scrollIntoView({
          block,
          inline: 'nearest',
          behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'instant'
        });
      } catch (_) {
        el.scrollIntoView();
      }
    }
  };

  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------------------------------------------------------------------- */
  /* State store                                                            */
  /* ---------------------------------------------------------------------- */

  const DEFAULT_STATE = {
    bionic: false,
    focus: false,
    lineFocus: false,
    highlight: false,
    scroll: false,
    tts: false,
    eye: false,
    breathe: false,
    theme: 'default',
    settings: {
      bionicIntensity: 0.45,
      lineFocusHeight: 1,
      highlightColor: '#0088b0',
      scrollWpm: 220,
      ttsRate: 1,
      ttsPitch: 1,
      ttsVoice: '',
      /** Sarvam speaker id. Empty means "whatever the engine defaults to". */
      ttsSpeaker: '',
      /** Sarvam language code for synthesis and for AI explanations. */
      ttsLanguage: 'en-IN',
      /**
       * Explain rather than recite.
       *
       * On by default: the feature is called Explain This, and for the readers
       * it is built for, hearing the same hard sentence read back is not the
       * accommodation they came for.
       */
      ttsExplain: true,
      /** Head-tracking sensitivity, 0.4 (calm) .. 2.5 (twitchy). */
      gazeSensitivity: 1,
      /** Flip the head-to-scroll mapping for users who prefer it inverted. */
      gazeInvert: false,
      fontScale: 1,
      appearance: 'light',
      letterSpacing: 0.12,
      lineHeight: 1.8,
      language: 'English'
    }
  };

  /**
   * Keys persisted by older builds that must not be resurrected.
   *
   * `dyslexia` used to be both a toggle and a theme, and it fought itself:
   * writing a theme echoed back through storage as "the dyslexia feature is
   * off", and the reconciler stripped the theme again a frame later, so no
   * theme could ever stay applied. `chunking` was persisted too, which meant a
   * user who tried it once fired a model call on every page load afterwards.
   */
  const RETIRED_KEYS = ['dyslexia', 'chunking', 'commander', 'visual'];

  const listeners = new Set();
  let state = structuredClone(DEFAULT_STATE);

  /**
   * Serialised copies of our own recent writes, so we can ignore their echoes.
   *
   * A short ring rather than a single slot: storage events arrive a beat after
   * the write, so two quick changes (toggling a tool, then another) can have
   * the first echo land after the second write. With one slot that first echo
   * looks foreign, and reconciling against it undoes the second change.
   */
  const recentWrites = [];
  const RECENT_WRITE_MEMORY = 6;

  function normalise(raw) {
    const next = {
      ...structuredClone(DEFAULT_STATE),
      ...(raw || {}),
      settings: { ...DEFAULT_STATE.settings, ...((raw || {}).settings || {}) }
    };
    for (const key of RETIRED_KEYS) delete next[key];
    return next;
  }

  const Store = {
    get: () => state,
    getSetting: (key) => state.settings[key],

    /**
     * The one language SETU is currently working in.
     *
     * There are two stored settings for historical reasons — `ttsLanguage`
     * holds a Sarvam code and `language` holds an English name — and when they
     * disagreed the result was the single most confusing failure in the
     * product: an explanation written in English, read aloud by a Hindi voice.
     * The code is authoritative because it is the one a picker sets, and the
     * name is derived from it.
     *
     * @returns {{code: string, name: string, native: string}}
     */
    language() {
      return resolveLanguage(state.settings.ttsLanguage || state.settings.language);
    },

    /** Set both halves at once, so they can never drift apart again. */
    async setLanguage(requested) {
      const language = resolveLanguage(requested);
      await Store.set({ settings: { ttsLanguage: language.code, language: language.name } });
      return language;
    },

    /** Shallow-merge a patch, persist it, and notify every subscriber. */
    async set(patch, { persist = true } = {}) {
      const settings = patch.settings ? { ...state.settings, ...patch.settings } : state.settings;
      state = { ...state, ...patch, settings };
      for (const key of RETIRED_KEYS) delete state[key];

      listeners.forEach((fn) => {
        try {
          fn(state);
        } catch (error) {
          console.warn('[SETU] store listener failed:', error);
        }
      });

      if (persist) {
        try {
          recentWrites.push(JSON.stringify(state));
          if (recentWrites.length > RECENT_WRITE_MEMORY) recentWrites.shift();
          await chrome.storage.sync.set({ setuState: state });
        } catch (_) {
          /* storage unavailable (private mode / quota) — stay in-memory */
        }
      }
    },

    async load() {
      try {
        const { setuState } = await chrome.storage.sync.get('setuState');
        if (setuState) state = normalise(setuState);
      } catch (_) {
        /* keep defaults */
      }
      return state;
    },

    /**
     * True when `incoming` is the storage echo of our own most recent write.
     * Without this, saving a theme looked — to this very tab — like a remote
     * change, and the reconciler immediately undid it.
     */
    isOwnEcho(incoming) {
      return recentWrites.includes(JSON.stringify(normalise(incoming)));
    },

    /** Adopt state written by another tab or the options page. */
    adopt(incoming) {
      state = normalise(incoming);
      listeners.forEach((fn) => {
        try {
          fn(state);
        } catch (_) {
          /* ignore */
        }
      });
      return state;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    DEFAULT_STATE,
    normalise
  };

  /* ---------------------------------------------------------------------- */
  /* Feature base class                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Base for every Lens feature.
   *
   * enable()/disable() are idempotent, async-safe, and callable in any order,
   * which is what lets several features run simultaneously without corrupting
   * each other's DOM. Subclasses implement onEnable/onDisable only.
   *
   * enable() returns a promise so a feature that must await a permission
   * prompt (Gaze Scroll waits on getUserMedia) reports failure to its caller
   * instead of silently leaving a half-built panel stranded on the page.
   */
  class Feature {
    static key = 'feature';

    constructor() {
      this.enabled = false;
      this.starting = false;
      this._cleanups = [];
      this._timers = new Map();
    }

    get key() {
      return this.constructor.key;
    }

    /**
     * @param {object} [options] passed straight to onEnable. Lets a caller
     *   start a feature *about something* — "map this selection" rather than
     *   "open the picker" — without a second round trip through the store.
     */
    async enable(options = {}) {
      if (this.enabled || this.starting) return this.enabled;

      this.starting = true;
      this.enabled = true;
      try {
        await this.onEnable(options);
        return true;
      } catch (error) {
        // Roll all the way back: a feature that could not start must leave no
        // listeners, timers, overlays, or camera streams behind.
        this.enabled = false;
        try {
          this.onDisable();
        } catch (_) {
          /* teardown of a failed start is best-effort */
        }
        this.runCleanups();
        console.error(`[SETU:${this.key}] failed to enable:`, error);
        throw error;
      } finally {
        this.starting = false;
      }
    }

    /**
     * Tear down. Runs even when `enabled` is already false, because a failed
     * or partial start leaves cleanups pending — the case that used to strand
     * an unclosable camera panel on the page.
     */
    disable() {
      const hadWork = this.enabled || this._cleanups.length > 0;
      this.enabled = false;
      if (!hadWork) return false;

      try {
        this.onDisable();
      } catch (error) {
        console.error(`[SETU:${this.key}] failed to disable cleanly:`, error);
      }
      this.runCleanups();
      return false;
    }

    async toggle(next, options = {}) {
      const target = typeof next === 'boolean' ? next : !this.enabled;
      if (target) await this.enable(options);
      else this.disable();
      return this.enabled;
    }

    /** Called when a setting this feature cares about changes. */
    onSettings() {}

    /**
     * Called when a single-page app navigated without a document load.
     * Features that read the page (bionic, reader, chunker) re-read here;
     * the default is to do nothing.
     */
    onNavigate() {}

    onEnable() {}
    onDisable() {}

    /* -- helpers that guarantee teardown -- */

    /** addEventListener that is automatically removed on disable(). */
    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      this._cleanups.push(() => target.removeEventListener(type, handler, options));
      return handler;
    }

    /** requestAnimationFrame loop that stops itself on disable(). */
    loop(fn) {
      let id = null;
      const tick = (now) => {
        if (!this.enabled) return;
        fn(now);
        id = requestAnimationFrame(tick);
      };
      id = requestAnimationFrame(tick);
      this._cleanups.push(() => id && cancelAnimationFrame(id));
    }

    /**
     * A named setInterval that replaces any previous interval of the same
     * name and is cleared on disable. Registering a fresh raw cleanup per plan
     * step is how the old agent leaked one timer per step it executed.
     */
    every(name, ms, fn) {
      this.clearEvery(name);
      const id = setInterval(fn, ms);
      this._timers.set(name, id);
      return id;
    }

    clearEvery(name) {
      const id = this._timers.get(name);
      if (id) {
        clearInterval(id);
        this._timers.delete(name);
      }
    }

    /** Register arbitrary teardown. */
    cleanup(fn) {
      this._cleanups.push(fn);
    }

    runCleanups() {
      for (const id of this._timers.values()) clearInterval(id);
      this._timers.clear();

      const pending = this._cleanups.splice(0);
      for (const fn of pending) {
        try {
          fn();
        } catch (error) {
          console.warn(`[SETU:${this.key}] cleanup error:`, error);
        }
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Shadow-DOM-aware traversal                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Every document tree on the page, including open shadow roots.
   *
   * `document.querySelectorAll` stops at a shadow boundary, and a large share
   * of the modern web — YouTube, Salesforce, most design-system sites, every
   * page built on Lit or Stencil — puts its real buttons and its real prose
   * inside one. Without this, the agent reported "no controls found" and read
   * aloud fell silent on pages that are visibly full of both.
   *
   * Bounded on purpose: a component-heavy app can have thousands of roots, and
   * an unbounded walk on every snapshot would cost more than it returns.
   */
  const MAX_ROOTS = 250;
  const MAX_ELEMENTS_PER_ROOT = 15000;

  function allRoots(from = document) {
    const roots = [from];
    const queue = [from];

    while (queue.length && roots.length < MAX_ROOTS) {
      const current = queue.shift();
      let walker;
      try {
        walker = document.createTreeWalker(current, NodeFilter.SHOW_ELEMENT);
      } catch (_) {
        continue;
      }

      let el;
      let seen = 0;
      while ((el = walker.nextNode()) && seen < MAX_ELEMENTS_PER_ROOT) {
        seen += 1;
        const shadow = el.shadowRoot;
        if (!shadow) continue;
        // Never walk into our own chrome — but a *readable* host (the Focus
        // Mode reader) holds the article the user is actually reading, and
        // skipping it is what made Bionic Reading and read-aloud find nothing
        // while Focus Mode was open.
        if (el.hasAttribute?.('data-setu') && !el.hasAttribute?.('data-setu-readable')) continue;
        roots.push(shadow);
        queue.push(shadow);
        if (roots.length >= MAX_ROOTS) break;
      }
    }

    return roots;
  }

  /**
   * The shadow roots of hosts that carry page content rather than chrome.
   *
   * Only Focus Mode registers one. The caret APIs stop at a shadow boundary
   * unless they are handed the roots to look inside, and `elementFromPoint`
   * needs the same help — so this list is what lets the reading ruler, the
   * line band, and word-level highlighting track text inside the reader.
   */
  function readableRoots() {
    const roots = [];
    for (const { el } of hosts.values()) {
      if (!el.isConnected || !el.hasAttribute('data-setu-readable')) continue;
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }
    return roots;
  }

  /**
   * The element the reader is actually reading from.
   *
   * `document.body` on a normal page; the Focus Mode article when that is
   * open. Everything that processes prose — Bionic Reading, read-aloud, the
   * page text sent to the engine — asks for this rather than assuming the
   * document, which is what used to make all of them silently no-ops the
   * moment Focus Mode covered the page.
   */
  const Reading = {
    /** @returns {Element|null} */
    surface() {
      for (const root of readableRoots()) {
        const content = root.querySelector('[data-setu-content]');
        if (content?.isConnected) return content;
      }
      return null;
    },

    /** The surface, or the document body — never null on a real page. */
    root() {
      return Reading.surface() || document.body;
    },

    /** True while page content is being displayed by one of our own overlays. */
    get hosted() {
      return Boolean(Reading.surface());
    }
  };

  /**
   * A one-line event bus for cross-feature notifications.
   *
   * Exactly one thing uses it today and it earns its keep: when Focus Mode
   * opens or closes, the text every other reading feature works on is replaced
   * wholesale, and they have no other way to hear about it.
   */
  const Bus = {
    _listeners: new Map(),

    on(event, fn) {
      if (!Bus._listeners.has(event)) Bus._listeners.set(event, new Set());
      Bus._listeners.get(event).add(fn);
      return () => Bus._listeners.get(event)?.delete(fn);
    },

    emit(event, detail) {
      for (const fn of Bus._listeners.get(event) || []) {
        try {
          fn(detail);
        } catch (error) {
          console.warn(`[SETU] listener for "${event}" failed:`, error);
        }
      }
    }
  };

  /** querySelectorAll that descends open shadow roots. */
  function deepQueryAll(selector, { from = document, limit = 4000 } = {}) {
    const out = [];
    for (const root of allRoots(from)) {
      let found;
      try {
        found = root.querySelectorAll(selector);
      } catch (_) {
        continue;
      }
      for (const el of found) {
        out.push(el);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* Text-node utilities (shared by bionic, highlight, TTS, reader)         */
  /* ---------------------------------------------------------------------- */

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'CANVAS', 'SVG', 'MATH',
    'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'
  ]);

  const Text = {
    /** True when a node belongs to SETU's own UI and must never be processed. */
    isOurs(node) {
      const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!el) return false;
      // Page content we are hosting (the Focus Mode article) is not "ours" in
      // the sense that matters here: it is the text the reader came for, and
      // every reading aid must be allowed to work on it.
      if (el.closest?.('[data-setu-content]')) return false;
      if (el.closest?.('[data-setu]')) return true;
      // Inside one of our shadow roots the page-level closest() finds nothing,
      // so walk out through the host chain as well.
      let root = el.getRootNode?.();
      while (root && root !== document) {
        const hostEl = root.host;
        if (!hostEl) return false;
        if (hostEl.hasAttribute?.('data-setu')) return true;
        root = hostEl.getRootNode?.();
      }
      return false;
    },

    /**
     * Collect visible, meaningful text nodes under `root`.
     * Skips code, form controls, hidden elements, and SETU's own UI.
     * Descends open shadow roots, so component-based sites are readable.
     */
    collect(root = document.body, { minLength = 2, limit = 20000, deep = true } = {}) {
      if (!root) return [];

      const accept = (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (Text.isOurs(node)) return NodeFilter.FILTER_REJECT;
        if (node.textContent.trim().length < minLength) return NodeFilter.FILTER_REJECT;

        // getClientRects() is the cheapest reliable "is it actually rendered"
        // check — it covers display:none, visibility:hidden, and zero-size.
        if (!parent.getClientRects().length) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      };

      const nodes = [];
      const scan = (from) => {
        let walker;
        try {
          walker = document.createTreeWalker(from, NodeFilter.SHOW_TEXT, { acceptNode: accept });
        } catch (_) {
          return;
        }
        let node;
        // Bounded, so a pathological page (a 200k-node log viewer) cannot hang
        // the tab inside one synchronous walk.
        while (nodes.length < limit && (node = walker.nextNode())) nodes.push(node);
      };

      if (!deep) {
        scan(root);
        return nodes;
      }

      for (const tree of allRoots(root === document.body ? document : root)) {
        if (nodes.length >= limit) break;
        // The document tree is walked from `root` so callers can still scope it.
        scan(tree === document ? root : tree);
      }
      return nodes;
    },

    /** The user's current selection, when it is real page text. */
    selection() {
      const selected = String(window.getSelection?.() || '').trim();
      return selected.length > 1 ? selected : '';
    },

    /** Best-effort main article text, for summarise / simplify / send-to-Sanctuary. */
    pageText(limit = 12000) {
      // Focus Mode has already decided what the article is and stripped the
      // navigation out of it. Re-deriving it from the page underneath would be
      // both slower and worse, and on a page whose body is hidden behind the
      // reader it used to come back nearly empty.
      const hosted = Reading.surface();
      if (hosted) {
        const text = (hosted.innerText || hosted.textContent || '').trim();
        if (text.length > 200) return text.replace(/\n{3,}/g, '\n\n').slice(0, limit);
      }

      const candidates = [
        document.querySelector('article'),
        document.querySelector('main'),
        document.querySelector('[role="main"]'),
        document.querySelector('#content, .content, .post-content, .entry-content')
      ].filter(Boolean);

      let best = candidates.find((el) => el.innerText?.trim().length > 400);

      if (!best) {
        // Fall back to whichever block element holds the most paragraph text.
        let bestScore = 0;
        for (const el of document.querySelectorAll('div, section, td')) {
          if (Text.isOurs(el)) continue;
          const paragraphs = el.querySelectorAll(':scope > p');
          if (paragraphs.length < 2) continue;
          const score = [...paragraphs].reduce((sum, p) => sum + p.innerText.length, 0);
          if (score > bestScore) {
            bestScore = score;
            best = el;
          }
        }
      }

      let text = (best || document.body)?.innerText || '';

      // Shadow-DOM sites often have an almost empty light-DOM innerText.
      // Rebuild from collected text nodes rather than sending the model a
      // blank page and calling it "no readable content".
      if (text.trim().length < 200) {
        const deepText = Text.collect(document.body, { minLength: 3, limit: 4000 })
          .map((node) => node.textContent.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' ');
        if (deepText.length > text.trim().length) text = deepText;
      }

      return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, limit);
    },

    /**
     * The page's readable content as ordered blocks, with the element each one
     * came from.
     *
     * Read-aloud needs this to highlight what it is saying, and the visual
     * explainer needs it to build a structure map without a model call.
     */
    blocks({ limit = 400, minLength = 24 } = {}) {
      const out = [];
      const selector = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, dd, dt, figcaption, td, th';

      for (const el of deepQueryAll(selector, { limit: limit * 6 })) {
        if (out.length >= limit) break;
        if (Text.isOurs(el)) continue;
        if (!el.getClientRects?.().length) continue;
        // Skip a container whose text is entirely inside a nested block we
        // will also visit — otherwise every paragraph is read twice.
        if (el.querySelector(selector)) continue;

        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length < minLength) continue;

        out.push({
          el,
          text,
          tag: el.tagName.toLowerCase(),
          heading: /^H[1-6]$/.test(el.tagName)
        });
      }

      return out;
    },

    /**
     * Viewport rect of the actual rendered text line under (x, y), or null.
     *
     * This is the primitive the line-focus band and reading ruler both need.
     * The obvious approach — caretRangeFromPoint().getBoundingClientRect() —
     * returns a *collapsed* range, whose rect is zero-width, which is why the
     * previous ruler was invisible. Instead we select the whole text node and
     * read getClientRects(), which returns one rect per wrapped line box, then
     * pick the box that vertically contains y.
     */
    lineBoxAt(x, y) {
      const node = Text.caretNodeAt(x, y);
      if (!node) return null;

      const range = document.createRange();
      try {
        range.selectNodeContents(node);
      } catch (_) {
        return null;
      }

      const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
      if (!rects.length) return null;

      // The line box containing y, else the vertically nearest one.
      const containing = rects.find((r) => y >= r.top && y <= r.bottom);
      if (containing) return containing;

      return rects.reduce((best, r) =>
        Math.abs((r.top + r.bottom) / 2 - y) < Math.abs((best.top + best.bottom) / 2 - y) ? r : best
      );
    },

    /**
     * The text node under a viewport point, across browser caret APIs.
     *
     * The caret APIs stop dead at a shadow boundary unless they are given the
     * roots to look inside, and older builds do not accept the option at all.
     * So there are two paths: hand `caretPositionFromPoint` our readable roots
     * where that is supported, and hit-test manually where it is not. Without
     * one of the two, every reading aid goes blind the moment Focus Mode is
     * open — which was exactly the reported behaviour.
     */
    caretNodeAt(x, y) {
      const node = Text.caretAt(x, y)?.node || null;
      if (node?.nodeType !== Node.TEXT_NODE) return null;
      if (Text.isOurs(node)) return null;
      if (!node.textContent.trim()) return null;
      return node;
    },

    /** Both halves of a caret hit: the text node and the offset within it. */
    caretAt(x, y) {
      const roots = readableRoots();

      if (document.caretPositionFromPoint) {
        let position = null;
        if (roots.length) {
          try {
            // Chrome 128+ takes the roots to descend into; older builds throw
            // or ignore the second argument, which the fallback below covers.
            position = document.caretPositionFromPoint(x, y, { shadowRoots: roots });
          } catch (_) {
            position = null;
          }
        }
        if (!position) position = document.caretPositionFromPoint(x, y);
        if (position?.offsetNode?.nodeType === Node.TEXT_NODE) {
          return { node: position.offsetNode, offset: position.offset };
        }
      } else if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range?.startContainer?.nodeType === Node.TEXT_NODE) {
          return { node: range.startContainer, offset: range.startOffset };
        }
      }

      if (!roots.length) return null;
      return Text.hitTestText(x, y);
    },

    /**
     * Find the text node under a point without the caret API.
     *
     * Walks from the deepest element at the point and measures the real client
     * rects of each of its text nodes, which is the only approach that works
     * uniformly across shadow boundaries. Deliberately narrow — it only runs
     * when a readable overlay is open and the caret API came back empty.
     */
    hitTestText(x, y) {
      let el = document.elementFromPoint(x, y);
      for (let depth = 0; el && depth < 12; depth += 1) {
        const inner = el.shadowRoot?.elementFromPoint?.(x, y);
        if (!inner || inner === el) break;
        el = inner;
      }
      if (!el || Text.isOurs(el)) return null;

      let walker;
      try {
        walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      } catch (_) {
        return null;
      }

      const range = document.createRange();
      let node;
      let scanned = 0;
      while ((node = walker.nextNode()) && scanned < 400) {
        scanned += 1;
        if (!node.textContent.trim()) continue;

        // Per-character rects would be exact and far too slow; per-node rects
        // give one box per wrapped line, which is all the caller needs.
        try {
          range.selectNodeContents(node);
        } catch (_) {
          continue;
        }

        for (const rect of range.getClientRects()) {
          if (rect.width < 1 || rect.height < 1) continue;
          if (y < rect.top || y > rect.bottom) continue;
          if (x < rect.left - 2 || x > rect.right + 2) continue;

          // Approximate the offset by where along the box the point sits.
          const ratio = Math.max(0, Math.min(1, (x - rect.left) / Math.max(1, rect.width)));
          return { node, offset: Math.round(ratio * node.textContent.length) };
        }
      }

      return null;
    },

    /**
     * Scan horizontally for a line box when the exact point sits in a gutter,
     * margin, or image. Returns the first hit, or null.
     */
    findLineBoxNear(y, { samples = 9 } = {}) {
      const width = window.innerWidth;
      for (let i = 1; i <= samples; i += 1) {
        // Sweep out from the centre: 50%, 35%, 65%, 20%, 80% ...
        const ratio = 0.5 + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 0.15;
        if (ratio <= 0.02 || ratio >= 0.98) continue;
        const box = Text.lineBoxAt(width * ratio, y);
        if (box) return box;
      }
      return null;
    },

    escape(value) {
      return String(value).replace(/[&<>"']/g, (ch) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
      );
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Page snapshot — one shared description of the live page                */
  /* ---------------------------------------------------------------------- */

  /**
   * Describe the page to the model as a list of addressable controls.
   *
   * Handles are kept in an in-memory map rather than written onto the page as
   * attributes. Two reasons, both of which were live bugs:
   *
   *  - Two features could not address the page at the same time. Opening the
   *    3-step path while the agent had a plan running wiped every
   *    `data-setu-ref`, and the agent's next step reported that its button had
   *    vanished.
   *  - Writing unexpected attributes into a third-party DOM is not free.
   *    Frameworks with attribute-level MutationObservers re-render on it, and
   *    a few sites' CSS selects on unknown attributes.
   *
   * A WeakRef map also survives exactly as long as the element does, so a
   * re-rendered SPA simply falls through to the label-matching path.
   */
  /**
   * The most refs we keep alive at once.
   *
   * Each entry is a WeakRef plus a short label, so the memory cost is trivial;
   * the cap exists only so a long agent session cannot grow the map without
   * bound. Oldest entries are dropped first, and a dropped ref still resolves
   * through label matching.
   */
  const MAX_REFS = 600;

  const Page = {
    refs: new Map(),

    /**
     * Snapshots are numbered so their handles cannot collide.
     *
     * Every snapshot used to hand out `r0`, `r1`, `r2`… from a map that was
     * cleared first. That made the documented promise — that the agent and the
     * 3-step path can address the page at the same time — false in exactly the
     * way it claimed to have fixed: taking a second snapshot both erased the
     * agent's handles and reissued the same names for different elements, so a
     * running plan would either lose its target or click the wrong control.
     */
    seq: 0,

    /**
     * The text of a wrapping `<label>`, minus the control's own text.
     *
     * `<label><span>Father's Name</span><input name="father_name"></label>` is
     * one of the two most common ways a field is labelled on the web, and
     * nothing in the old lookup saw it — there is no `for` attribute to follow
     * and an `<input>` has no `innerText` of its own. Every such field fell all
     * the way through to its `name` attribute, so the model was reading
     * `father_name` where the page plainly said "Father's Name", and an
     * unnamed one described itself as nothing at all.
     *
     * The subtraction matters for `<select>`, whose own `innerText` is the list
     * of its options: without it, a labelled dropdown reports itself as
     * "Category Select General OBC SC ST" instead of "Category".
     */
    wrappingLabel(el) {
      const label = el.closest?.('label');
      if (!label || label === el) return '';

      let text = '';

      const walk = (node) => {
        if (node === el) return;
        if (node.nodeType === 3) {
          text += node.nodeValue;
          return;
        }
        if (node.nodeType !== 1) return;
        // Descend only where we have to, so the control's own subtree is the
        // only thing skipped and everything else is taken whole.
        if (node.contains?.(el)) {
          for (const child of node.childNodes) walk(child);
          return;
        }
        text += node.innerText ?? node.textContent ?? '';
      };

      for (const child of label.childNodes) walk(child);
      return text;
    },

    /**
     * Best human-visible name for a control.
     *
     * Ordered by how deliberately each source describes the field. The
     * accessible name comes first, then the two kinds of `<label>`, then the
     * element's own text (which is the whole story for a button and empty for
     * an input), then the attributes a developer wrote for themselves.
     *
     * `value` is last, and was fourth. A text input arriving with something
     * already in it was being described by its *contents* rather than by its
     * purpose — a Nationality box holding "Indian" reported itself as
     * "Indian" — which is the one thing a label must never do.
     */
    labelOf(el) {
      if (!el) return '';
      const labelled = el.getAttribute?.('aria-labelledby');
      let fromLabelledBy = '';
      if (labelled) {
        fromLabelledBy = labelled
          .split(/\s+/)
          .map((id) => el.getRootNode?.()?.getElementById?.(id)?.innerText || '')
          .join(' ');
      }

      const forLabel = el.id
        ? el.getRootNode?.()?.querySelector?.(`label[for="${CSS.escape(el.id)}"]`)?.innerText
        : '';

      return String(
        el.getAttribute?.('aria-label') ||
          fromLabelledBy ||
          forLabel ||
          Page.wrappingLabel(el) ||
          el.innerText ||
          el.placeholder ||
          el.title ||
          el.getAttribute?.('alt') ||
          el.name ||
          el.value ||
          ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 70);
    },

    isVisible(el) {
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 2 || rect.height < 2) return false;
      let style;
      try {
        style = getComputedStyle(el);
      } catch (_) {
        return false;
      }
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) > 0.05
      );
    },

    /**
     * @param {object} options
     * @param {number} options.maxControls
     * @param {number} options.maxText
     * @param {boolean} options.viewportFirst  order controls by how close they
     *   are to what the user is actually looking at, so a 4000-control app
     *   still shows the model the right 60.
     */
    snapshot({ maxControls = 60, maxText = 3000, viewportFirst = true } = {}) {
      const scope = `s${(Page.seq += 1)}`;

      const nodes = deepQueryAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, ' +
          '[role="button"], [role="link"], [role="tab"], [role="checkbox"], ' +
          '[role="menuitem"], [role="option"], [contenteditable="true"], summary',
        { limit: 1200 }
      );

      const seen = new Set();
      const candidates = [];

      for (const el of nodes) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (Text.isOurs(el) || el.disabled || !Page.isVisible(el)) continue;

        const label = Page.labelOf(el);
        if (!label) continue;

        const rect = el.getBoundingClientRect();
        // Distance from the vertical middle of the viewport, in screens.
        const distance = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2) /
          Math.max(1, window.innerHeight);

        candidates.push({ el, label, rect, distance });
      }

      if (viewportFirst) candidates.sort((a, b) => a.distance - b.distance);

      const controls = [];
      for (const candidate of candidates.slice(0, maxControls)) {
        const { el, label } = candidate;
        const ref = `${scope}r${controls.length}`;

        // Evict oldest-first rather than wiping the map, so another feature's
        // in-flight plan keeps the handles it was given.
        if (Page.refs.size >= MAX_REFS) {
          Page.refs.delete(Page.refs.keys().next().value);
        }
        Page.refs.set(ref, { ref: new WeakRef(el), label });

        const isField = ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase());

        controls.push({
          ref,
          tag: el.tagName.toLowerCase(),
          type: el.type || el.getAttribute?.('role') || '',
          label,
          onScreen: candidate.distance < 0.6,
          // The attributes that say what a field is *for*.
          //
          // A very large share of real forms label their inputs badly or not at
          // all, and carry the whole meaning in `name="dateOfBirth"`,
          // `id="pin_code"`, a placeholder, or an `autocomplete` token. Without
          // these the label is all there is to go on, and "Enter here" is not a
          // label. They are cheap — four short strings per field — and they are
          // what lets the profile matcher fill an unlabelled form correctly.
          //
          // Read only for actual fields: a link's `name` is an anchor target and
          // would be noise in the snapshot the model reads.
          name: isField ? String(el.getAttribute?.('name') || '').slice(0, 60) : '',
          fieldId: isField ? String(el.id || '').slice(0, 60) : '',
          placeholder: isField ? String(el.getAttribute?.('placeholder') || '').slice(0, 70) : '',
          autocomplete: isField ? String(el.getAttribute?.('autocomplete') || '').slice(0, 40) : '',
          required: isField ? Boolean(el.required || el.getAttribute?.('aria-required') === 'true') : false,
          // Every option a <select> offers, so a caller can pick the one that
          // matches a stored value instead of guessing at its wording.
          options:
            el.tagName === 'SELECT'
              ? [...el.options].slice(0, 40).map((option) => String(option.text || '').trim().slice(0, 40))
              : undefined,
          // A password's current value is never described to the model.
          value:
            el.tagName === 'INPUT' && el.type !== 'password'
              ? String(el.value || '').slice(0, 40)
              : ''
        });
      }

      const headings = deepQueryAll('h1, h2, h3', { limit: 120 })
        .filter((el) => !Text.isOurs(el) && el.getClientRects?.().length)
        .map((el) => (el.innerText || '').trim())
        .filter(Boolean)
        .slice(0, 14);

      return {
        url: location.href,
        title: document.title,
        headings,
        controls,
        text: Text.pageText(maxText)
      };
    },

    /**
     * Find the element a plan step points at.
     *
     * The live handle from the snapshot that produced the step is used when it
     * is still attached. Everything below it exists so a plan survives a page
     * re-render, a reload, or a navigation, when every handle is gone.
     *
     * The fallback is scored rather than first-match. A plain
     * `label.includes(needle)` picked whichever element happened to come first
     * in document order, which on a real site is almost always a navigation
     * link rather than the button the step meant — so the agent would
     * confidently click the wrong thing and report success. Scoring lets an
     * exact match beat a prefix, a prefix beat a substring, and a control of
     * the expected kind that is actually on screen beat one that is neither.
     */
    resolve(step) {
      if (!step) return null;

      const held = step.targetRef ? Page.refs.get(step.targetRef) : null;
      const direct = held?.ref?.deref?.();
      if (direct?.isConnected && Page.isVisible(direct)) return direct;

      const needle = String(step.targetText || held?.label || '').trim().toLowerCase();
      if (!needle) return null;

      const candidates = deepQueryAll(
        'a, button, input, select, textarea, [role="button"], [role="link"], ' +
          '[role="tab"], [role="menuitem"], summary',
        { limit: 1500 }
      ).filter((el) => !Text.isOurs(el) && el.getClientRects?.().length);

      const wantTag = String(step.tag || '').toLowerCase();
      const fillish = step.actionType === 'fill' || step.actionType === 'select';

      let best = null;
      let bestScore = 0;

      for (const el of candidates) {
        const label = Page.labelOf(el).toLowerCase();
        if (!label) continue;

        let score = 0;
        if (label === needle) score = 100;
        else if (label.startsWith(needle) || needle.startsWith(label)) score = 70;
        else if (label.includes(needle)) score = 50;
        else if (needle.includes(label) && label.length > 3) score = 35;
        else continue;

        // Length agreement: "Search" matching "Search" beats "Search our
        // 40,000 product catalogue by name, brand or code".
        score -= Math.min(20, Math.abs(label.length - needle.length) / 4);

        const tag = el.tagName.toLowerCase();
        if (wantTag && tag === wantTag) score += 12;

        // A step that fills something wants a field, and a step that clicks
        // something usually does not.
        const isField = tag === 'input' || tag === 'textarea' || tag === 'select';
        if (fillish === isField) score += 10;

        // Prefer what the reader can actually see, and what is nearest the
        // middle of the viewport.
        if (Page.isVisible(el)) {
          score += 8;
          const rect = el.getBoundingClientRect();
          const distance =
            Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2) /
            Math.max(1, window.innerHeight);
          score += Math.max(0, 6 - distance * 6);
        }

        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }

      return best;
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Spotlight — "the thing I mean is here"                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Draw a ring around a real page element and keep it there while it moves.
   *
   * Three features need to point at a control — the agent's current step, the
   * 3-step path's "show me", the visual explainer's source element — and all
   * three previously drew their own, in their own layer, with their own timer.
   * One implementation in our own shadow layer means page CSS cannot hide it,
   * and a single tracked interval means it cannot be left running.
   *
   * @returns {() => void} stop tracking and remove the ring.
   */
  let spotlightTimer = null;

  function spotlight(el, { duration = 0, tone = 'accent-2' } = {}) {
    if (!el?.isConnected) return () => {};

    const root = host('spotlight', { layer: 'reading' });
    let ring = root.querySelector('.setu-ring');

    if (!ring) {
      const style = document.createElement('style');
      style.textContent = [
        '.setu-ring {',
        '  position: fixed; border-radius: var(--radius-lg);',
        '  pointer-events: none; border: 2.5px solid var(--accent-2);',
        '  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-2) 22%, transparent);',
        '  animation: setu-throb 1.7s ease-in-out infinite;',
        '  transition: top .18s ease, left .18s ease, width .18s ease, height .18s ease;',
        '}',
        '.setu-ring[data-tone="accent"] {',
        '  border-color: var(--accent);',
        '  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);',
        '}',
        '@keyframes setu-throb { 0%,100%{opacity:1} 50%{opacity:.55} }'
      ].join('\n');
      root.appendChild(style);

      const scope = document.createElement('div');
      scope.className = 'setu-scope';
      ring = document.createElement('div');
      ring.className = 'setu-ring';
      scope.appendChild(ring);
      root.appendChild(scope);
    }

    ring.dataset.tone = tone;

    const paint = () => {
      if (!el.isConnected) return stop();
      const rect = el.getBoundingClientRect();
      Object.assign(ring.style, {
        top: `${rect.top - 4}px`,
        left: `${rect.left - 4}px`,
        width: `${rect.width + 8}px`,
        height: `${rect.height + 8}px`,
        display: rect.width ? 'block' : 'none'
      });
    };

    const stop = () => {
      clearInterval(spotlightTimer);
      spotlightTimer = null;
      destroyHost('spotlight');
    };

    paint();
    clearInterval(spotlightTimer);
    // Poll rather than observe: the element can move because of a page
    // animation, a sticky header collapsing, or a layout shift the page never
    // tells anyone about, and none of those fire a mutation.
    spotlightTimer = setInterval(paint, 220);

    if (duration > 0) setTimeout(stop, duration);
    return stop;
  }

  /* ---------------------------------------------------------------------- */
  /* Toast                                                                  */
  /* ---------------------------------------------------------------------- */

  let toastTimer = null;

  function toast(message, { tone = 'info', duration = 2400, action = null } = {}) {
    const root = host('toast', { layer: 'toast' });

    let box = root.querySelector('.setu-toast');
    if (!box) {
      const style = document.createElement('style');
      style.textContent = [
        '.setu-toast {',
        '  position: fixed; bottom: 24px; left: 50%;',
        '  transform: translateX(-50%) translateY(8px);',
        '  display: flex; align-items: center; gap: 12px;',
        '  max-width: min(460px, 90vw); padding: 10px 16px;',
        '  background: var(--surface); border: 1px solid var(--border);',
        '  border-left: 3.5px solid var(--accent);',
        '  border-radius: var(--radius); box-shadow: var(--shadow);',
        '  font-size: 13px; font-weight: 600; color: var(--text); font-family: var(--font);',
        '  opacity: 0; transition: opacity .2s ease, transform .2s ease;',
        '  pointer-events: none;',
        '}',
        '.setu-toast[data-show="true"] { opacity: 1; transform: translateX(-50%) translateY(0); }',
        '.setu-toast[data-tone="success"] { border-left-color: var(--accent); background: var(--accent-100); color: var(--accent-700); }',
        '.setu-toast[data-tone="warn"]    { border-left-color: var(--warn); }',
        '.setu-toast[data-tone="error"]   { border-left-color: var(--danger); color: var(--danger); }',
        '.setu-toast .msg { flex: 1; min-width: 0; }',
        '.setu-toast button {',
        '  flex-shrink: 0; pointer-events: auto;',
        '  background: transparent; border: 1px solid currentColor;',
        '  border-radius: var(--radius); color: inherit;',
        '  padding: 4px 10px; font-size: 12px; font-weight: 700; cursor: pointer;',
        '}'
      ].join('\n');
      root.appendChild(style);

      const scope = document.createElement('div');
      scope.className = 'setu-scope';
      box = document.createElement('div');
      box.className = 'setu-toast';
      // Announce politely so screen readers pick up feature changes.
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.innerHTML = '<span class="msg"></span>';
      scope.appendChild(box);
      root.appendChild(scope);
    }

    box.querySelector('.msg').textContent = message;
    box.querySelector('button')?.remove();

    if (action?.label && typeof action.onClick === 'function') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.onclick = () => {
        box.dataset.show = 'false';
        action.onClick();
      };
      box.appendChild(button);
    }

    box.dataset.tone = tone;
    box.dataset.show = 'true';

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      box.dataset.show = 'false';
    }, duration);
  }

  /* ---------------------------------------------------------------------- */
  /* API client                                                             */
  /* ---------------------------------------------------------------------- */

  let requestSeq = 0;

  /**
   * Answers we have already paid for, kept for the tab's lifetime.
   *
   * Free-tier models are the dominant cost in every interaction here — 20-40
   * seconds each, on a daily quota. Re-asking the same question about the same
   * paragraph is common (the user closes the panel and reopens it, or a plan
   * step is repeated), and answering it from memory is the difference between
   * instant and unusable.
   */
  const memoryCache = new Map();
  const MEMORY_CACHE_MAX = 120;

  /** Requests currently in the air, keyed exactly as the cache is. */
  const inFlightRequests = new Map();

  function cacheKeyFor(path, body) {
    let hash = 5381;
    const source = `${path}|${JSON.stringify(body ?? {})}`;
    for (let i = 0; i < source.length; i += 1) {
      hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
    }
    return `setu_cache_${path.replace(/\W+/g, '_')}_${(hash >>> 0).toString(36)}`;
  }

  const API = {
    base: DEFAULTS.apiHost,

    async init() {
      try {
        const { apiHost } = await chrome.storage.sync.get('apiHost');
        if (apiHost) API.base = String(apiHost).replace(/\/+$/, '');
      } catch (_) {
        /* default stays */
      }
    },

    /**
     * POST JSON to the SETU engine.
     *
     * Routed through the service worker: content scripts inherit the page's
     * CORS context, and many sites' Content-Security-Policy blocks a direct
     * fetch to another origin outright. The worker's origin is the extension's
     * own, which the engine allow-lists.
     *
     * Pass an AbortSignal and the in-flight fetch is aborted inside the
     * worker, which is what makes the agent's Cancel button real rather than
     * cosmetic.
     */
    async post(path, body, { timeoutMs = DEFAULTS.requestTimeoutMs, signal = null } = {}) {
      const requestId = `req_${Date.now()}_${(requestSeq += 1)}`;

      const onAbort = () => {
        try {
          chrome.runtime.sendMessage({ action: 'cancelRequest', requestId })?.catch?.(() => {});
        } catch (_) {
          /* worker already gone */
        }
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        if (signal?.aborted) {
          const cancelled = new Error('Cancelled.');
          cancelled.name = 'AbortError';
          throw cancelled;
        }

        const response = await chrome.runtime.sendMessage({
          action: 'apiFetch',
          method: 'POST',
          path,
          body,
          timeoutMs,
          requestId
        });

        if (!response?.ok) {
          const error = new Error(response?.error || 'Could not reach the SETU engine.');
          error.code = response?.code || 'unknown';
          error.status = response?.status || 0;
          if (error.code === 'cancelled') error.name = 'AbortError';
          throw error;
        }
        return response.data;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },

    /**
     * POST, but answer from cache when we have asked this exact question
     * before. `ttlMs` bounds staleness for anything page-derived.
     */
    async cached(path, body, { ttlMs = 30 * 60 * 1000, ...options } = {}) {
      const key = cacheKeyFor(path, body);

      const local = memoryCache.get(key);
      if (local && Date.now() < local.expiresAt) return local.value;

      // Share a request that is already in the air.
      //
      // Two callers asking the same question at the same time is not
      // hypothetical here: hovering a mind-map node starts fetching its
      // explanation, and clicking it a moment later asks for the same one. On
      // a metered free tier the duplicate is not merely slow, it is a second
      // charge against a daily quota — and the second caller waits the full
      // 20-40 seconds again for an answer that was already coming.
      const flight = inFlightRequests.get(key);
      if (flight) return flight;

      try {
        const stored = await chrome.storage.session?.get?.(key);
        const entry = stored?.[key];
        if (entry && Date.now() < entry.expiresAt) {
          memoryCache.set(key, entry);
          return entry.value;
        }
      } catch (_) {
        /* session storage unavailable — memory cache still works */
      }

      // A shared request must not be abortable by whoever happens to hold the
      // first signal, so the caller's signal is deliberately not passed on
      // when more than one party could be waiting on the result.
      const request = API.post(path, body, options)
        .then((value) => {
          const entry = { value, expiresAt: Date.now() + ttlMs };

          if (memoryCache.size >= MEMORY_CACHE_MAX) {
            memoryCache.delete(memoryCache.keys().next().value);
          }
          memoryCache.set(key, entry);
          try {
            chrome.storage.session?.set?.({ [key]: entry });
          } catch (_) {
            /* best effort */
          }
          return value;
        })
        .finally(() => {
          inFlightRequests.delete(key);
        });

      inFlightRequests.set(key, request);
      return request;
    },

    /**
     * Fetch and cache without waiting for, or caring about, the result.
     *
     * Used to start work the moment we believe it is about to be needed — the
     * explanation for the mind-map node the cursor is resting on. A failure
     * here is deliberately silent: nothing has been asked for yet, so there is
     * nothing to report, and the real request will surface any problem with a
     * message the reader can act on.
     */
    prefetch(path, body, options = {}) {
      try {
        API.cached(path, body, options).catch(() => {});
      } catch (_) {
        /* never let a speculative call reach the caller */
      }
    },

    /** GET from the engine (health probes, voice lists). */
    async get(path, { timeoutMs = DEFAULTS.healthTimeoutMs } = {}) {
      const response = await chrome.runtime.sendMessage({
        action: 'apiFetch',
        method: 'GET',
        path,
        timeoutMs
      });
      if (!response?.ok) {
        const error = new Error(response?.error || 'Could not reach the SETU engine.');
        error.code = response?.code || 'unknown';
        throw error;
      }
      return response.data;
    },

    /**
     * Stream a server-sent-events endpoint through the service worker.
     *
     * This is the single biggest latency win available to us. The engine runs
     * on free models that take 20-40 seconds to finish a paragraph, but emit
     * their first token in about a second. Waiting for the whole response
     * before showing anything turned a one-second answer into a forty-second
     * stare at a spinner.
     *
     * @returns {Promise<string>} the full text, once the stream closes.
     */
    stream(path, body, { onChunk, signal = null, timeoutMs = DEFAULTS.requestTimeoutMs } = {}) {
      return new Promise((resolve, reject) => {
        let port;
        try {
          port = chrome.runtime.connect({ name: 'setu-stream' });
        } catch (error) {
          reject(new Error('The SETU background service is not running. Reload the page.'));
          return;
        }

        let text = '';
        let settled = false;

        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          try {
            port.disconnect();
          } catch (_) {
            /* already gone */
          }
          fn(value);
        };

        const onAbort = () => {
          const cancelled = new Error('Cancelled.');
          cancelled.name = 'AbortError';
          finish(reject, cancelled);
        };

        if (signal?.aborted) return onAbort();
        signal?.addEventListener('abort', onAbort, { once: true });

        port.onMessage.addListener((message) => {
          if (message.type === 'chunk') {
            text += message.text;
            try {
              onChunk?.(message.text, text);
            } catch (_) {
              /* a rendering error must not kill the stream */
            }
          } else if (message.type === 'done') {
            finish(resolve, text || message.text || '');
          } else if (message.type === 'error') {
            const error = new Error(message.error || 'The engine stopped mid-answer.');
            error.code = message.code || 'stream';
            finish(reject, error);
          }
        });

        port.onDisconnect.addListener(() => {
          if (settled) return;
          if (text) return finish(resolve, text);
          finish(reject, new Error('The connection to the SETU engine dropped.'));
        });

        port.postMessage({ action: 'apiStream', path, body, timeoutMs });
      });
    },

    /**
     * Nudge a sleeping engine awake without blocking anything.
     *
     * The engine hibernates on its free host after ~15 minutes idle and needs
     * up to a minute to come back. Firing this the moment a panel opens means
     * the wake-up overlaps the time the user spends typing, instead of being
     * charged to their first request.
     */
    warm() {
      try {
        chrome.runtime.sendMessage({ action: 'warmEngine' })?.catch?.(() => {});
      } catch (_) {
        /* worker asleep — it will wake on the real request */
      }
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Export                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Phosphor duotone markup, from the generated set in setu-icons.js.
   *
   * The design system mandates Phosphor and forbids hand-drawn SVG. Falls back
   * to an empty string if the set failed to load: an icon is decoration, and a
   * missing one must never take its control with it.
   *
   * Resolved on every CALL rather than captured once at load.
   *
   * That distinction became load-bearing when the content scripts moved to
   * on-demand injection. `setu-icons.js` is no longer in the manifest's eager
   * set — it arrives with the first feature that needs it, which is strictly
   * after this file has run. The previous form,
   * `const icon = self.SETU_ICONS?.icon || (() => '')`, bound the empty-string
   * fallback permanently at that moment, so every icon in the product would
   * have rendered as nothing, forever, with no error anywhere. Looking the set
   * up per call costs an optional-chain and removes the ordering trap.
   */
  const icon = (...args) => (self.SETU_ICONS?.icon || (() => ''))(...args);

  /**
   * Storage key for the agent's session mirror, scoped to this tab.
   *
   * sessionStorage is already per-tab, but some sites block it, so the agent
   * also mirrors into chrome.storage.local — which is shared by every tab in
   * the profile. Keyed globally, opening the agent on one page would restore
   * that page's plan onto every other tab. Starts unscoped and is narrowed as
   * soon as the worker tells us which tab we are; `persist()` runs on
   * beforeunload and cannot await anything, so this has to be readable
   * synchronously.
   */
  const Session = {
    key: 'setu_agent_session',
    tabId: null,

    async resolve() {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'whoAmI' });
        if (response?.ok && response.tabId != null) {
          Session.tabId = response.tabId;
          Session.key = `setu_agent_session:${response.tabId}`;
        }
      } catch (_) {
        /* worker asleep — the unscoped key still works, just less precisely */
      }
      return Session.key;
    },

    /** A stable key for per-page state (3-step progress, cached plans). */
    pageKey(prefix) {
      const path = `${location.origin}${location.pathname}`;
      return `${prefix}:${Session.tabId ?? 'x'}:${path}`;
    }
  };

  window.SETU = {
    ready: true,
    VERSION: '3.4.0',
    DEFAULTS,
    LAYERS,
    icon,
    UI: { host, destroyHost, destroyAllHosts, toast, icon, applyAppearance, anchorHosts, spotlight },
    Dock,
    Scroll,
    Page,
    Store,
    Feature,
    Text,
    API,
    Session,
    Reading,
    Bus,
    LANGUAGES,
    resolveLanguage,
    languageLabel,
    deepQueryAll,
    readableRoots,
    prefersReducedMotion,
    features: new Map()
  };

  API.init();
})();
