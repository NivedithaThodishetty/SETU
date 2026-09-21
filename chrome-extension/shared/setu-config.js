/**
 * SETU — Deployment Configuration.
 * ================================
 *
 * THIS IS THE ONE FILE TO EDIT WHEN THE BACKEND OR WEB APP MOVES.
 *
 * It is loaded by the service worker (via importScripts), the popup, the
 * options page, and every content script, so there is a single source of truth
 * instead of four copies of a URL drifting apart.
 *
 * These are only the values a fresh install starts with. Users can override
 * both URLs at runtime from the options page, and doing so does not touch this
 * file — so a change here only reaches people who install fresh or who have
 * never edited their own settings. Ship a new version when you change it.
 */

(() => {
  const DEFAULTS = {
    /**
     * SETU engine (backend) base URL. No trailing slash.
     * Change this and `sanctuaryUrl` below when either service is redeployed.
     */
    apiHost: 'https://setu-37hl.onrender.com',

    /** SETU Sanctuary web app base URL. No trailing slash. */
    sanctuaryUrl: 'https://setu-amber.vercel.app',

    /**
     * How long to wait on an engine call before giving up.
     *
     * Deliberately generous. Two things stack here: the planner runs on
     * free-tier models that routinely take 30-45 seconds on a cold call, and
     * the engine itself sleeps after inactivity on a free hosting tier, which
     * adds up to a minute to the first request that wakes it. A timeout
     * shorter than that is just a guaranteed failure. The UI shows elapsed
     * time and a cancel button so the wait is legible rather than silent.
     */
    requestTimeoutMs: 120000,

    /**
     * Budget for calls that must feel interactive.
     *
     * The generous budget above exists for the planner, which genuinely needs
     * it. Applying the same budget to a one-paragraph explanation means a
     * wedged provider holds the panel hostage for two minutes before anything
     * else is tried. Interactive calls give up sooner and fall back — to the
     * streaming path, to the cache, or to the in-page engine — which is always
     * better than a longer silence.
     */
    fastTimeoutMs: 25000,

    /**
     * How often the service worker pokes the engine to keep it from
     * hibernating, in minutes.
     *
     * The free host sleeps after ~15 minutes idle and takes 30-60 seconds to
     * come back — a cost paid by the user's *first* request, which is the one
     * that most needs to be fast. A cheap GET every ten minutes while the
     * browser is open removes that cost entirely.
     */
    keepWarmMinutes: 10,

    /**
     * Budget for the status probe when the engine is expected to be awake.
     * Short, because this one runs on every popup open and must feel instant.
     */
    healthTimeoutMs: 6000,

    /**
     * Budget for the second probe, after the quick one fails.
     *
     * A sleeping free-tier instance takes roughly 30-60 seconds to come back.
     * Without this the popup would report "offline" for a service that is
     * merely asleep, and the user would go looking for a fault that is not
     * there.
     */
    wakeTimeoutMs: 75000
  };

  /**
   * The languages SETU explains and speaks in.
   *
   * Lives here, next to the other deployment constants, because every context
   * already loads this file: the service worker, the popup, the options page,
   * and every content script. That matters more than it sounds.
   *
   * Every language picker in the product used to be populated from
   * `/api/speech/voices`. So whenever the engine was asleep, offline, or
   * simply had no Sarvam key, all eleven options collapsed to a single
   * "English" — and a reader who wanted an explanation in Hindi was told, by
   * the dropdown itself, that SETU does not speak Hindi. The language of an
   * *explanation* is a model decision, not a voice-service one, so it must
   * never depend on the voice service answering.
   *
   * Kept in step with `backend/config/languages.js`, which is the source of
   * truth. The table is split in two: Sarvam Bulbul voices the eleven Indian
   * languages, ElevenLabs voices the international ones, and neither covers the
   * other's half — Bulbul rejects a Japanese request outright rather than
   * degrading. A language whose provider has no key still works for *text*, and
   * read-aloud falls back to the browser's own synthesiser.
   */
  const LANGUAGES = [
    // Indian languages — Sarvam Bulbul / Saaras.
    { code: 'en-IN', bcp47: 'en-IN', name: 'English',   native: 'English',   dir: 'ltr', region: 'india' },
    { code: 'hi-IN', bcp47: 'hi-IN', name: 'Hindi',     native: 'हिन्दी', dir: 'ltr', region: 'india' },
    { code: 'bn-IN', bcp47: 'bn-IN', name: 'Bengali',   native: 'বাংলা', dir: 'ltr', region: 'india' },
    { code: 'gu-IN', bcp47: 'gu-IN', name: 'Gujarati',  native: 'ગુજરાતી', dir: 'ltr', region: 'india' },
    { code: 'kn-IN', bcp47: 'kn-IN', name: 'Kannada',   native: 'ಕನ್ನಡ', dir: 'ltr', region: 'india' },
    { code: 'ml-IN', bcp47: 'ml-IN', name: 'Malayalam', native: 'മലയാളം', dir: 'ltr', region: 'india' },
    { code: 'mr-IN', bcp47: 'mr-IN', name: 'Marathi',   native: 'मराठी', dir: 'ltr', region: 'india' },
    // Sarvam spells Odia 'od-IN'; the tag browsers and screen readers accept is
    // 'or-IN'. Both are carried — see `bcp47` usage in text-to-speech.js.
    { code: 'od-IN', bcp47: 'or-IN', name: 'Odia',      native: 'ଓଡ଼ିଆ', dir: 'ltr', region: 'india' },
    { code: 'pa-IN', bcp47: 'pa-IN', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ', dir: 'ltr', region: 'india' },
    { code: 'ta-IN', bcp47: 'ta-IN', name: 'Tamil',     native: 'தமிழ்', dir: 'ltr', region: 'india' },
    { code: 'te-IN', bcp47: 'te-IN', name: 'Telugu',    native: 'తెలుగు', dir: 'ltr', region: 'india' },

    // International — ElevenLabs Multilingual v2 / Scribe. Sarvam cannot voice
    // any of these at all, so a deployment without an ElevenLabs key falls back
    // to the browser's own synthesiser for this half of the table.
    { code: 'es-ES', bcp47: 'es-ES', name: 'Spanish',    native: 'Español',  dir: 'ltr', region: 'international' },
    { code: 'fr-FR', bcp47: 'fr-FR', name: 'French',     native: 'Français', dir: 'ltr', region: 'international' },
    { code: 'de-DE', bcp47: 'de-DE', name: 'German',     native: 'Deutsch',    dir: 'ltr', region: 'international' },
    { code: 'pt-BR', bcp47: 'pt-BR', name: 'Portuguese', native: 'Português', dir: 'ltr', region: 'international' },
    { code: 'it-IT', bcp47: 'it-IT', name: 'Italian',    native: 'Italiano',   dir: 'ltr', region: 'international' },
    { code: 'ar-SA', bcp47: 'ar-SA', name: 'Arabic',     native: 'العربية', dir: 'rtl', region: 'international' },
    { code: 'zh-CN', bcp47: 'zh-CN', name: 'Chinese',    native: '中文', dir: 'ltr', region: 'international' },
    { code: 'ja-JP', bcp47: 'ja-JP', name: 'Japanese',   native: '日本語', dir: 'ltr', region: 'international' },
    { code: 'ko-KR', bcp47: 'ko-KR', name: 'Korean',     native: '한국어', dir: 'ltr', region: 'international' },
    { code: 'ru-RU', bcp47: 'ru-RU', name: 'Russian',    native: 'Русский', dir: 'ltr', region: 'international' },
    { code: 'id-ID', bcp47: 'id-ID', name: 'Indonesian', native: 'Bahasa Indonesia', dir: 'ltr', region: 'international' },
    { code: 'tr-TR', bcp47: 'tr-TR', name: 'Turkish',    native: 'Türkçe', dir: 'ltr', region: 'international' }
  ];

  // Works in a service worker (self), a page (window), and a content script.
  const scope = typeof self !== 'undefined' ? self : globalThis;
  /**
   * Which files each feature needs, for on-demand injection.
   *
   * WHY THIS EXISTS
   * ---------------
   * All nineteen content scripts used to be declared in the manifest matching
   * every http and https URL, so roughly 473 KB of JavaScript was fetched,
   * parsed and executed on every navigation to every site — whether or not the
   * user had a single feature turned on. On a mid-range Android phone on 3G,
   * which is the stated audience, that is a measurable delay added to every
   * page by an accessibility tool. The manifest now declares only
   * `setu-config`, `setu-core` and `main` (~113 KB), and everything below is
   * injected the first time it is actually needed.
   *
   * ORDER IS LOAD-BEARING within each array. Two dependencies bind at load
   * time and break silently or loudly if the order is wrong:
   *
   *   shared/setu-icons.js   must precede any feature that draws an icon.
   *   shared/gaze-detector.js must precede eye-tracker.js, which destructures
   *                           `self.SETU_GAZE` at the top of its IIFE and
   *                           throws immediately if it is absent.
   *
   * Files already present are skipped by the injector, so listing a shared
   * dependency against several features costs nothing.
   */
  const FEATURE_MODULES = {
    bionic: ['content/bionic-reading.js'],
    focus: ['shared/setu-icons.js', 'content/focus-mode.js'],
    lineFocus: ['shared/setu-icons.js', 'content/line-focus.js'],
    highlight: ['content/word-highlight.js'],
    scroll: ['shared/setu-icons.js', 'content/auto-scroll.js'],
    tts: ['shared/setu-icons.js', 'content/text-to-speech.js'],
    eye: ['shared/setu-icons.js', 'shared/gaze-detector.js', 'content/eye-tracker.js'],
    theme: ['content/dyslexia-theme.js'],
    breathe: ['content/breathe-protocol.js'],
    chunking: ['shared/setu-icons.js', 'content/task-chunker.js'],
    visual: ['shared/setu-icons.js', 'content/visual-breakdown.js'],
    sanctuary: ['content/sanctuary-bridge.js'],
    // The agent is the only thing that reads the profile, so it belongs here
    // rather than in the eager set. `setu-profile.js` must precede
    // agent-copilot.js, which reads `window.SETU_PROFILE` as it initialises.
    commander: ['shared/setu-icons.js', 'shared/setu-profile.js', 'content/agent-copilot.js']
  };

  scope.SETU_DEFAULTS = DEFAULTS;
  scope.SETU_LANGUAGES = LANGUAGES;
  scope.SETU_FEATURE_MODULES = FEATURE_MODULES;

  /**
   * Normalise anything language-shaped to one entry in the table.
   *
   * Accepts a full code ('hi-IN'), a bare tag ('hi'), or an English name
   * ('Hindi'). All three occur in practice, because the read-aloud setting
   * stores a code while the older AI-language setting stores a name, and both
   * feed the same requests. Anything unrecognised resolves to English rather
   * than being passed through to a service that would reject it outright.
   */
  scope.setuResolveLanguage = function setuResolveLanguage(requested) {
    const raw = String(requested || '').trim();
    if (!raw) return LANGUAGES[0];

    const lower = raw.toLowerCase();
    return (
      LANGUAGES.find((entry) => entry.code.toLowerCase() === lower) ||
      LANGUAGES.find((entry) => entry.bcp47.toLowerCase() === lower) ||
      LANGUAGES.find((entry) => entry.name.toLowerCase() === lower) ||
      LANGUAGES.find((entry) => entry.native.toLowerCase() === lower) ||
      LANGUAGES.find((entry) => entry.code.split('-')[0] === lower.split(/[-_]/)[0]) ||
      LANGUAGES.find((entry) => entry.bcp47.split('-')[0] === lower.split(/[-_]/)[0]) ||
      LANGUAGES[0]
    );
  };

  /** A label a speaker of the language recognises first, then its English name. */
  scope.setuLanguageLabel = function setuLanguageLabel(entry) {
    if (!entry) return '';
    return entry.native && entry.native !== entry.name
      ? `${entry.native} — ${entry.name}`
      : entry.name;
  };

  /**
   * Paint the popup / options page in the chosen palette.
   *
   * `auto` is resolved here rather than with a CSS media query, so each
   * stylesheet needs one dark block instead of two and there is a single place
   * that decides. Light is the default — the Sanctuary web app is light unless
   * someone picks the velvet theme, and a dark OS must not silently override
   * the reading surface the user actually chose.
   *
   * Returns the resolved value, and keeps following the OS while set to `auto`.
   */
  scope.setuApplyAppearance = function setuApplyAppearance(chosen) {
    const root = document.documentElement;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');

    const resolve = () =>
      chosen === 'dark' ? 'dark' : chosen === 'auto' && media?.matches ? 'dark' : 'light';

    const paint = () => {
      root.dataset.appearance = resolve();
    };

    paint();

    // Re-bind rather than stack: the setting can change several times a session.
    if (media && scope.__setuAppearanceListener) {
      media.removeEventListener?.('change', scope.__setuAppearanceListener);
    }
    if (media && chosen === 'auto') {
      scope.__setuAppearanceListener = paint;
      media.addEventListener?.('change', paint);
    }

    return root.dataset.appearance;
  };
})();
