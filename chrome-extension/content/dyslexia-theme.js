/**
 * Reading Themes — typography and colour adjustments applied to the live page.
 *
 * Implements Sanctuary's sensory palettes on arbitrary websites:
 * Sepia, Velvet Dark, Sage, Pastel, High Contrast AAA, Cream & Dyslexia.
 * Everything is scoped cleanly under [data-setu-theme] and cleanly removed on disable.
 */

(() => {
  const { Feature, UI, Store } = window.SETU;

  /**
   * Reading themes.
   *
   * `btnBg` and `btnBorder` are not decoration — see the interactive-element
   * carve-out in `apply()` below. Every pair in this table is checked by
   * `test/css.test.js`: text on `btnBg` must clear WCAG AA (4.5:1) and
   * `btnBorder` on `bg` must clear WCAG 1.4.11 Non-text Contrast (3:1), so a
   * control stays identifiable as a control on any site.
   *
   * NAMING: the `dyslexia` key is kept because it is written into stored
   * settings on every existing install and renaming it would silently reset
   * everyone's theme. The *label* changed, and that mattered. It used to read
   * "Dyslexia Friendly", which tells a user the font is the accommodation —
   * exactly the myth that keeps schools buying font licences instead of
   * teaching. A 2026 meta-analysis (15 studies, N=688) put dyslexia-specific
   * fonts at g = -0.04: indistinguishable from zero, and directionally
   * negative. What actually works in this theme is the letter spacing, which
   * has a controlled result behind it. So the label now describes what the
   * theme does, and the spacing is what it leads with.
   */
  const THEMES = {
    sepia:    { name: 'Sepia', bg: '#f6ecd9', text: '#3b3226', link: '#8a5a1f', border: 'rgba(0,0,0,.14)', btnBg: '#e6d5b4', btnBorder: '#7a6647' },
    dark:     { name: 'Velvet Dark', bg: '#18181a', text: '#f3f2f2', link: '#38bdf8', border: 'rgba(243,242,242,.15)', btnBg: '#313135', btnBorder: '#8b8b93' },
    contrast: { name: 'High Contrast AAA', bg: '#0d0d0d', text: '#ffffff', link: '#facc15', border: 'rgba(255,255,255,.25)', btnBg: '#242424', btnBorder: '#facc15' },
    dyslexia: { name: 'Calm Paper', bg: '#faf7ee', text: '#26231e', link: '#00779c', border: 'rgba(38,35,30,.15)', btnBg: '#e7dfc9', btnBorder: '#6f6550', dyslexic: true },
    calm:     { name: 'Sage Calm', bg: '#f2f6f1', text: '#1c2b1d', link: '#15803d', border: 'rgba(28,43,29,.15)', btnBg: '#d8e6d7', btnBorder: '#4a6b4c' },
    pastel:   { name: 'Pastel Blue', bg: '#f0f4f8', text: '#1e293b', link: '#0284c7', border: 'rgba(30,41,59,.14)', btnBg: '#d6e3ef', btnBorder: '#4a6584' },
    cream:    { name: 'Warm Cream', bg: '#faf7ee', text: '#26231e', link: '#00779c', border: 'rgba(38,35,30,.15)', btnBg: '#e7dfc9', btnBorder: '#6f6550' }
  };

  class ReadingTheme extends Feature {
    static key = 'theme';

    constructor() {
      super();
      this.theme = 'dyslexia';
    }

    onEnable() {
      this.apply(this.theme);
      this.cleanup(() => this.clear());
      const label = THEMES[this.theme]?.name || this.theme;
      UI.toast(`Reading theme: ${label}`, { tone: 'success' });
    }

    onDisable() {
      this.clear();
    }

    onSettings() {
      if (this.enabled) this.apply(this.theme);
    }

    /**
     * The single public entry point. `default` means "no theme", which is the
     * same thing as the feature being off.
     */
    applyTheme(name) {
      if (!name || name === 'default' || !THEMES[name]) {
        this.disable();
        return;
      }

      this.theme = name;
      if (this.enabled) this.apply(name);
      else this.enable();
    }

    clear() {
      document.getElementById('setu-theme-style')?.remove();
      document.documentElement.removeAttribute('data-setu-theme');
    }

    apply(themeName) {
      const theme = THEMES[themeName];
      if (!theme) {
        this.clear();
        return;
      }

      document.documentElement.setAttribute('data-setu-theme', themeName);

      let style = document.getElementById('setu-theme-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'setu-theme-style';
        style.setAttribute('data-setu', 'style');
      }
      (document.head || document.documentElement).appendChild(style);

      const settings = Store.get().settings;
      /**
       * Extra letter spacing — the one typographic setting with a controlled result.
       *
       * Zorzi et al. (PNAS 2012) widened letter spacing for dyslexic children and
       * measured a ~20% reading-speed gain and roughly half the errors, with no
       * training at all. It works by reducing visual crowding, which is elevated in
       * dyslexia. That is a larger effect than most reading interventions produce
       * after weeks of work, and it is free.
       *
       * The default used to be 0.02em — about a fifth of what that study tested,
       * which is a cosmetic nudge rather than the intervention. The default is now
       * 0.12em, inside the evidence-backed band, and the slider reaches 0.30em so the
       * full tested dose is actually selectable; it previously capped at 0.12em, so a
       * user could not have reached the tested magnitude even deliberately.
       *
       * This is the cheapest measurable clinical win in the product. It is also the
       * honest half of the "dyslexia theme": the font is not the accommodation, the
       * spacing is.
       */
      const letterSpacing = Number(settings.letterSpacing ?? 0.12);
      const lineHeight = Number(settings.lineHeight ?? 1.8);
      const fontStack = theme.dyslexic
        ? '"Atkinson Hyperlegible", "Lexend", "OpenDyslexic", system-ui, sans-serif'
        : '"Source Serif 4", Georgia, "Atkinson Hyperlegible", serif';

      const root = `html[data-setu-theme="${themeName}"]`;
      const notOurs = ':not([data-setu]):not([data-setu] *):not([data-setu-fix]):not([data-setu-bionic])';

      /**
       * Controls are excluded from the blanket colour override.
       *
       * The override used to set `color: {text}` and `background-color:
       * transparent` on essentially every element on the page. On a real site
       * that collapses a primary button, a destructive button and body text to
       * the same colour on the same background — a "Delete account" button
       * becomes visually identical to a paragraph. An accessibility feature
       * that removes the affordance telling you what is clickable is an
       * accessibility regression, on exactly the users least able to absorb it.
       *
       * These selectors are carved out of the blanket rule and given their own
       * checked pair below: a filled surface for affordance, and a border that
       * clears 3:1 against the page so the control has a visible boundary.
       * Typography still applies to them — spacing and font are the point of
       * the theme — only the colour collapse does not.
       */
      const controls =
        'button, [role="button"], summary, [type="button"], [type="submit"], [type="reset"]';
      const notControl =
        ':not(button):not([role="button"]):not(summary):not([type="button"]):not([type="submit"]):not([type="reset"])';

      style.textContent = `
        ${root} { background: ${theme.bg} !important; }
        ${root} body { background: ${theme.bg} !important; color: ${theme.text} !important; }

        ${root} body *${notOurs}${notControl}:not(svg):not(svg *):not(pre):not(pre *):not(code) {
          background-color: transparent !important;
          color: ${theme.text} !important;
          border-color: ${theme.border} !important;
          font-family: ${fontStack} !important;
          letter-spacing: ${letterSpacing}em !important;
          word-spacing: .08em !important;
          text-shadow: none !important;
        }

        /*
         * Controls keep the theme's typography and get a contrast-checked
         * surface of their own, so "this is a button" survives the theme.
         */
        ${root} body :where(${controls})${notOurs} {
          background-color: ${theme.btnBg} !important;
          color: ${theme.text} !important;
          border: 1px solid ${theme.btnBorder} !important;
          font-family: ${fontStack} !important;
          letter-spacing: ${letterSpacing}em !important;
          text-shadow: none !important;
        }

        /*
         * A control inside a control — an icon span in a button — must not be
         * re-filled, or the child paints over its parent's surface.
         */
        ${root} body :where(${controls})${notOurs} * {
          background-color: transparent !important;
          color: inherit !important;
        }

        /* Bionic anchors keep their weight; only the palette follows the theme. */
        ${root} body b[data-setu-fix] {
          color: ${theme.text} !important;
          font-weight: 800 !important;
          font-family: ${fontStack} !important;
        }

        ${root} body :where(p, li, dd, blockquote, td)${notOurs} {
          line-height: ${lineHeight} !important;
          max-width: 78ch;
        }
        ${root} body :where(a, a *)${notOurs} {
          color: ${theme.link} !important;
          text-decoration: underline !important;
          text-underline-offset: 3px !important;
        }
        ${root} body :where(section, article, main, div, header, aside, nav, li, table)${notOurs} {
          box-shadow: none !important;
          background-image: none !important;
        }
        ${root} body :where(input, textarea, select)${notOurs} {
          background: ${theme.bg} !important;
          color: ${theme.text} !important;
          border: 1px solid ${theme.border} !important;
        }
      `;
    }
  }

  window.SETU.features.set('theme', ReadingTheme);
})();
