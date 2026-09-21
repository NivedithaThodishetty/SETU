/**
 * SETU Lens — content script orchestrator.
 *
 * Owns the feature registry, message routing, keyboard shortcuts, navigation
 * detection, and state sync.
 *
 * Every feature is independent and isolated, and that is enforced rather than
 * hoped for. Four rules make any combination safe to run at once:
 *
 *  1. No feature touches another's DOM. Each owns exactly one shadow root, and
 *     the ones that read the page (bionic, read-aloud) never write to it.
 *  2. Floating panels are placed by the shared Dock, not pinned to a corner, so
 *     six open tools stack instead of burying each other.
 *  3. Anything that scrolls goes through the shared Scroll arbiter, so Auto
 *     Scroll, Gaze Scroll, and read-aloud's follow-along cooperate — and all
 *     three keep working inside Focus Mode's own scroller.
 *  4. Anything that addresses page controls goes through the shared Page
 *     snapshot, which hands out handles instead of writing attributes, so the
 *     agent and the 3-step path can both be live at once.
 *
 * Loaded last, after setu-core.js and every feature module.
 */

(() => {
  if (window.setuLens) return;

  const { Store, UI, Text, API, Page, Dock, features: registry } = window.SETU;

  /**
   * Feature -> files, from setu-config.js.
   *
   * Read through `self` rather than imported, because setu-config is the one
   * shared file guaranteed to be in the eager manifest set alongside this one.
   * The empty-object fallback keeps `ensureFeature` returning null with a clear
   * warning instead of throwing, if config somehow failed to load.
   */
  const MODULES = self.SETU_FEATURE_MODULES || {};

  /**
   * Features driven by a persisted on/off flag.
   *
   * Deliberately excludes anything that costs a model call to start. Task
   * chunking used to live here, which meant a user who tried it once fired an
   * AI request on every page load they made afterwards — an invisible, unasked
   * drain on a metered quota.
   */
  const TOGGLES = ['bionic', 'focus', 'lineFocus', 'highlight', 'scroll', 'tts', 'eye', 'breathe'];

  /**
   * On-demand tools that should restart when invoked while already open —
   * picking a second chart, regenerating the 3-step path. Deliberately does
   * not include the Commander: re-opening it from the popup mid-plan must not
   * throw away the conversation.
   */
  const RESTARTABLE = ['visual', 'chunking'];

  /**
   * Features that re-read the page after a single-page-app navigation.
   *
   * Bionic Reading is deliberately absent: its MutationObserver already sees
   * the swapped-in content and re-anchors it, so calling onNavigate as well
   * would re-walk the whole document for nothing. Line Focus and the ruler
   * track the cursor and have no stored view of the page to go stale.
   */
  const NAVIGATION_AWARE = ['focus', 'chunking'];

  /**
   * Shortcuts handled here.
   *
   * Alt+B / Alt+F / Alt+L / Alt+Shift+C are deliberately absent: those are
   * declared as `commands` in the manifest, and binding them in both places
   * fired the toggle twice per press, which read to the user as the shortcut
   * being broken.
   */
  const LOCAL_SHORTCUTS = {
    t: 'tts',
    h: 'highlight',
    s: 'scroll',
    e: 'eye'
  };

  /** Documents we should not touch at all. */
  function isSupportedDocument() {
    const type = (document.contentType || '').toLowerCase();
    if (type && !/^(text\/html|application\/xhtml\+xml)$/.test(type)) return false;
    // Chrome's PDF and image viewers are HTML shells with no readable content.
    if (document.querySelector('embed[type="application/pdf"]')) return false;
    return true;
  }

  class SetuLens {
    constructor() {
      this.features = new Map();
      /** In-flight `ensureFeature` promises, so a race loads a feature once. */
      this.pendingLoads = new Map();
      /**
       * Files already injected into THIS document.
       *
       * Shared dependencies would otherwise be re-sent once per feature that
       * needs them: six features list `shared/setu-icons.js`, so turning on six
       * tools shipped 41 KB of icons six times — a quarter of a megabyte of
       * waste that quietly undid a good part of the on-demand change. The
       * files guard their own re-execution, so this is about bytes on the wire
       * rather than correctness.
       */
      this.injectedFiles = new Set();
      /**
       * In-flight injections, keyed by FILE rather than by feature.
       *
       * `injectedFiles` alone is not enough. Six features requested in the same
       * tick all read it before any of them has finished, so all six pass the
       * "already have it?" filter and all six ask for the icon set — which is
       * exactly the case that matters, because restoring stored state on page
       * load enables everything at once. Registering the promise per file, and
       * doing it synchronously before the first await, is what makes the
       * de-duplication hold under that race.
       */
      this.fileLoads = new Map();
      this.booted = false;
      /** Last time each feature was toggled, to de-duplicate double sources. */
      this.lastToggleAt = new Map();
      this.lastUrl = location.href;
    }

    /**
     * Load a feature's modules, then construct it.
     *
     * The registry is populated by each feature file calling
     * `window.SETU.features.set(key, Class)` as it runs. Under the old
     * everything-in-the-manifest arrangement every file had already run before
     * boot, so the registry was complete and this method would have been
     * pointless. Now the manifest carries only config, core and this file, and
     * a feature's code arrives the first time somebody asks for it.
     *
     * Three things this has to get right:
     *
     *  - Concurrency. Two callers wanting the same feature at once (a keyboard
     *    shortcut racing a popup toggle) must produce one injection, not two.
     *    The in-flight promise is cached, not just the result.
     *  - Failure. Restricted pages reject injection outright. That returns null
     *    rather than throwing, because a feature that cannot load must not take
     *    the page's other features down with it.
     *  - Idempotence. Re-injecting an already-present file re-runs its IIFE.
     *    The files guard against that themselves, and the registry check below
     *    means we do not ask twice in the common case.
     */
    /**
     * Inject a feature's files, sending each file at most once per document.
     *
     * Shared dependencies are the reason this is not a one-liner. Six features
     * list `shared/setu-icons.js`; without de-duplication, turning on six tools
     * ships 41 KB of icons six times — a quarter of a megabyte of waste that
     * undoes much of what moving to on-demand loading bought.
     *
     * ORDER IS PRESERVED ACROSS CONCURRENT CALLERS. If one feature is already
     * fetching the icon set, a second feature that also needs it waits for that
     * injection to land before sending its own file. Skipping the wait would
     * let `eye-tracker.js` run before `gaze-detector.js` had defined
     * `SETU_GAZE`, which throws at the top of its IIFE.
     *
     * The bookkeeping is registered SYNCHRONOUSLY — before the first await —
     * because the whole point is to be correct when several callers arrive in
     * the same tick.
     */
    injectFiles(files) {
      const waitFor = [];
      const needed = [];

      for (const file of files) {
        if (this.injectedFiles.has(file)) continue;
        const inFlight = this.fileLoads.get(file);
        if (inFlight) waitFor.push(inFlight);
        else needed.push(file);
      }

      if (!needed.length) {
        return waitFor.length ? Promise.all(waitFor).then(() => true) : Promise.resolve(true);
      }

      const run = (async () => {
        // Anything we depend on must be in the document before our own files
        // run, or a load-time destructure of a shared global throws.
        if (waitFor.length) await Promise.all(waitFor);

        const response = await chrome.runtime
          .sendMessage({ action: 'injectModules', files: needed })
          .catch((error) => ({ ok: false, error: error?.message }));

        if (!response?.ok) return false;

        // Recorded only on success, so a refused injection can be retried.
        for (const file of needed) this.injectedFiles.add(file);
        return true;
      })();

      for (const file of needed) this.fileLoads.set(file, run);
      run.finally(() => {
        for (const file of needed) {
          if (this.fileLoads.get(file) === run) this.fileLoads.delete(file);
        }
      });

      return run;
    }

    async ensureFeature(key) {
      const existing = this.features.get(key);
      if (existing) return existing;

      if (this.pendingLoads.has(key)) return this.pendingLoads.get(key);

      const files = MODULES[key];
      if (!files) {
        console.warn(`[SETU] no module list for feature "${key}"`);
        return null;
      }

      const load = (async () => {
        // The registry can already hold the class without `features` holding an
        // instance — boot constructs lazily too — so check before injecting.
        if (!registry.has(key)) {
          const ok = await this.injectFiles(files);
          if (!ok) {
            console.warn(`[SETU] could not load "${key}": injection refused`);
            return null;
          }
        }

        const FeatureClass = registry.get(key);
        if (!FeatureClass) {
          console.warn(`[SETU] "${key}" loaded but did not register itself`);
          return null;
        }

        try {
          const instance = new FeatureClass();
          this.features.set(key, instance);
          return instance;
        } catch (error) {
          console.error(`[SETU] could not construct "${key}":`, error);
          return null;
        }
      })();

      this.pendingLoads.set(key, load);
      try {
        return await load;
      } finally {
        this.pendingLoads.delete(key);
      }
    }

    async boot() {
      if (this.booted) return;
      this.booted = true;

      // Anything already injected into this document — a re-injection after an
      // update, or a feature loaded before boot finished — is adopted now so
      // it is not loaded a second time.
      for (const [key, FeatureClass] of registry) {
        try {
          this.features.set(key, new FeatureClass());
        } catch (error) {
          console.error(`[SETU] could not construct "${key}":`, error);
        }
      }

      await Store.load();
      await API.init();
      // Narrow the agent's storage key to this tab before anything reads it.
      await window.SETU.Session.resolve();

      this.bindMessages();
      this.bindShortcuts();
      this.watchStorage();
      this.watchNavigation();
      await this.applyState();
      await this.resumeAgentSession();

      console.log(
        `[SETU ${window.SETU.VERSION}] ready — ${this.features.size} features, ` +
          `${[...this.features].filter(([, f]) => f.enabled).length} active`
      );
    }

    /** Sessions older than this are treated as abandoned rather than resumed. */
    static SESSION_TTL_MS = 2 * 60 * 60 * 1000;

    /**
     * Reopen the agent if it was open when the page navigated or refreshed.
     *
     * Reads sessionStorage first, then the per-tab mirror in chrome.storage.local
     * for sites that block sessionStorage. The mirror's key is scoped to this
     * tab — an unscoped key would reopen one page's plan on every other tab in
     * the browser.
     */
    async resumeAgentSession() {
      let pending = false;
      try {
        pending = Boolean(sessionStorage.getItem('setu_agent_session'));
      } catch (_) {
        /* storage blocked */
      }

      if (!pending && chrome.storage?.local) {
        try {
          const key = window.SETU.Session.key;
          const res = await new Promise((resolve) => chrome.storage.local.get(key, resolve));
          const stored = res?.[key];
          const session = typeof stored === 'string' ? JSON.parse(stored) : stored;

          if (session?.open && Date.now() - (session.savedAt || 0) < SetuLens.SESSION_TTL_MS) {
            pending = true;
          }
        } catch (_) {
          /* ignore */
        }
      }

      if (pending) {
        try {
          await this.toggle('commander', true);
        } catch (err) {
          console.warn('[SETU] could not resume commander:', err);
        }
      }
    }

    /** Turn on whatever the stored state says should be on. */
    async applyState() {
      const state = Store.get();

      for (const key of TOGGLES) {
        const shouldRun = Boolean(state[key]);

        /*
         * Only features the user actually left switched on are loaded at boot.
         * This is the whole point of the change: a browser with nothing enabled
         * fetches ~113 KB per page instead of ~473 KB, and someone who uses one
         * tool pays for that one tool.
         */
        const feature = shouldRun ? await this.ensureFeature(key) : this.features.get(key);
        if (!feature) continue;

        if (shouldRun === feature.enabled) continue;

        try {
          if (shouldRun) await feature.enable();
          else feature.disable();
        } catch (error) {
          // A feature that cannot start (no readable article, camera denied)
          // must not block the others or leave a lie in stored state.
          console.warn(`[SETU] "${key}" could not start:`, error.message);
          Store.set({ [key]: false });
        }
      }

      this.applyTheme(state.theme);
    }

    /**
     * Themes are driven purely by `state.theme`.
     *
     * They used to *also* be a persisted boolean toggle, and the two disagreed:
     * saving a theme echoed back through storage as "the theme feature is off",
     * so the reconciler stripped the theme a frame after it was applied and no
     * theme could ever stay on screen.
     */
    async applyTheme(theme) {
      // A theme of 'default' means no theme, so there is nothing to load — and
      // loading the module just to call disable() on it would defeat the point.
      if (!theme || theme === 'default') {
        this.features.get('theme')?.disable();
        return;
      }

      const feature = await this.ensureFeature('theme');
      if (!feature) return;
      feature.applyTheme(theme);
    }

    /**
     * Toggle one feature and persist the result.
     *
     * `source` lets us drop a duplicate that arrived from both a manifest
     * command and a page keydown in the same press. `options` is handed to the
     * feature's onEnable, so a caller can start it *about something*.
     */
    async toggle(key, next, { source = 'local', ...options } = {}) {
      const feature = await this.ensureFeature(key);
      if (!feature) {
        console.warn(`[SETU] unknown or unloadable feature "${key}"`);
        return false;
      }

      const now = Date.now();
      const previous = this.lastToggleAt.get(key);
      if (previous && previous.source !== source && now - previous.at < 150) {
        // Same press, two delivery paths. Honour the first, ignore the echo.
        return feature.enabled;
      }
      this.lastToggleAt.set(key, { at: now, source });

      const target = typeof next === 'boolean' ? next : !feature.enabled;

      // Re-invoking an already-open picker should restart it rather than
      // silently doing nothing (picking a second chart, for example).
      if (target && feature.enabled && RESTARTABLE.includes(key)) {
        feature.disable();
      }

      try {
        if (target) await feature.enable(options);
        else feature.disable();
      } catch (error) {
        UI.toast(error.message || `Could not start ${key}.`, { tone: 'error', duration: 4200 });
        if (TOGGLES.includes(key)) Store.set({ [key]: false });
        return false;
      }

      if (TOGGLES.includes(key)) {
        Store.set({ [key]: feature.enabled });
      }

      // A panel appeared or vanished; re-flow whatever else is on screen.
      Dock.layout();
      return feature.enabled;
    }

    setTheme(theme) {
      this.applyTheme(theme);
      Store.set({ theme });
      UI.toast(theme === 'default' ? 'Reading theme off' : `Reading theme: ${theme}`, {
        tone: 'success'
      });
    }

    /**
     * Speak some text.
     *
     * Goes straight to the shared voice rather than forcing the Read Aloud
     * transport bar open. A mind-map node speaking itself on hover, or the
     * agent reading back an answer, should not put a control bar on screen the
     * reader did not ask for.
     */
    async speak(text) {
      const words = String(text || '').trim() || Text.selection();
      if (!words) {
        UI.toast('Nothing to read there.', { tone: 'warn' });
        return;
      }
      await window.SETU.Voice?.say(words);
    }

    /** Snapshot used by the chunker, the agent, and anything needing context. */
    pageContext(options) {
      return Page.snapshot(options);
    }

    resetAll() {
      window.SETU.Voice?.stop();

      for (const [key, feature] of this.features) {
        try {
          feature.disable();
        } catch (_) {
          /* keep going — one bad teardown must not strand the rest */
        }
        if (TOGGLES.includes(key)) Store.set({ [key]: false }, { persist: false });
      }
      Store.set({ theme: 'default' });
      try {
        sessionStorage.removeItem('setu_agent_session');
      } catch (_) {
        /* ignore */
      }
      UI.toast('All SETU features turned off', { tone: 'success' });
    }

    /** Everything the popup needs to render an accurate control surface. */
    describe() {
      return {
        version: window.SETU.VERSION,
        state: Store.get(),
        active: [...this.features].filter(([, f]) => f.enabled).map(([k]) => k),
        available: [...this.features.keys()]
      };
    }

    /* ------------------------------------------------------------------ */

    bindMessages() {
      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        // Returning true keeps the channel open for async replies.
        (async () => {
          try {
            switch (request.action) {
              case 'ping':
                return sendResponse({ ok: true, version: window.SETU.VERSION });

              case 'toggleFeature':
              case 'toggleMode':
                return sendResponse({
                  ok: true,
                  enabled: await this.toggle(request.feature || request.mode, request.enabled, {
                    source: request.source || 'message'
                  })
                });

              case 'setTheme':
                this.setTheme(request.theme);
                return sendResponse({ ok: true });

              case 'setSetting':
                await Store.set({ settings: request.settings });
                UI.applyAppearance();
                for (const feature of this.features.values()) {
                  if (feature.enabled) feature.onSettings();
                }
                return sendResponse({ ok: true });

              case 'getState':
                return sendResponse({ ok: true, ...this.describe() });

              case 'openCommander':
                await this.toggle('commander', true, { source: request.source || 'message' });
                this.features.get('commander')?.open(request.task || '');
                return sendResponse({ ok: true });

              case 'explainVisual':
                await this.toggle('visual', true, {
                  source: 'message',
                  selection: request.selection || ''
                });
                return sendResponse({ ok: true });

              case 'getPageContent':
                return sendResponse({
                  ok: true,
                  title: document.title,
                  url: location.href,
                  selection: Text.selection(),
                  text: Text.pageText(request.limit || 12000)
                });

              case 'speakText':
                await this.speak(request.text || Text.selection());
                return sendResponse({ ok: true });

              case 'explainAloud': {
                // Explain rather than recite. Opens the Explain This panel so
                // the reader can see — and change — which language they are
                // hearing, instead of an explanation arriving from nowhere.
                await this.toggle('tts', true, { source: request.source || 'message' });
                const tts = this.features.get('tts');
                const text = String(request.text || '').trim() || Text.selection();
                if (!tts) return sendResponse({ ok: false, error: 'Explain This is unavailable.' });

                await tts.speakExplanation(text || Text.pageText(6000), { whole: !text });
                return sendResponse({ ok: true });
              }

              case 'sendToSanctuary': {
                // The only feature reached without a preceding `toggle`, so it
                // is the only one that has to load itself. Everything else in
                // this switch calls toggle() first, which loads on the way.
                const bridge = await this.ensureFeature('sanctuary');
                const result = await bridge?.send();
                return sendResponse({ ok: Boolean(result?.ok), error: result?.error });
              }

              case 'resetAll':
                this.resetAll();
                return sendResponse({ ok: true });

              default:
                return sendResponse({ ok: false, error: `Unknown action "${request.action}"` });
            }
          } catch (error) {
            console.error('[SETU] message handler failed:', error);
            sendResponse({ ok: false, error: error.message });
          }
        })();

        return true;
      });
    }

    bindShortcuts() {
      // Alt+key shortcuts, ignored while the user is typing.
      document.addEventListener(
        'keydown',
        (event) => {
          if (!event.altKey || event.ctrlKey || event.metaKey) return;

          const active = document.activeElement;
          if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) {
            return;
          }

          const key = (event.key || '').toLowerCase();

          if (LOCAL_SHORTCUTS[key]) {
            event.preventDefault();
            this.toggle(LOCAL_SHORTCUTS[key], undefined, { source: 'keydown' });
          } else if (key === 'm') {
            event.preventDefault();
            this.toggle('visual', true, { source: 'keydown' });
          } else if (key === '3') {
            event.preventDefault();
            this.toggle('chunking', true, { source: 'keydown' });
          } else if (key === 'c' && !event.shiftKey) {
            // Alt+Shift+C is the manifest command; Alt+C is ours.
            event.preventDefault();
            this.toggle('commander', true, { source: 'keydown' }).then(() =>
              this.features.get('commander')?.open()
            );
          } else if (key === 'x') {
            event.preventDefault();
            this.resetAll();
          }
        },
        true
      );
    }

    /**
     * Notice a single-page-app navigation.
     *
     * A great many sites — every React or Vue router, most news sites, all of
     * YouTube and GitHub — replace the entire article without ever loading a
     * document. Nothing fires that a content script can hear by default, so
     * Bionic Reading stayed applied to text that no longer existed and the
     * 3-step path kept describing the previous page. Patching the History API
     * is the only way to hear about it, and is what every extension that has
     * to survive an SPA ends up doing.
     */
    watchNavigation() {
      const announce = () => {
        if (location.href === this.lastUrl) return;
        this.lastUrl = location.href;

        // Let the new view render before anything re-reads it.
        setTimeout(() => this.onNavigated(), 350);
      };

      for (const method of ['pushState', 'replaceState']) {
        const original = history[method];
        if (typeof original !== 'function') continue;
        history[method] = function patched(...args) {
          const result = original.apply(this, args);
          try {
            window.dispatchEvent(new Event('setu:navigation'));
          } catch (_) {
            /* ignore */
          }
          return result;
        };
      }

      window.addEventListener('setu:navigation', announce);
      window.addEventListener('popstate', announce);
      window.addEventListener('hashchange', announce);
    }

    onNavigated() {
      for (const key of NAVIGATION_AWARE) {
        const feature = this.features.get(key);
        if (!feature?.enabled) continue;
        try {
          feature.onNavigate();
        } catch (error) {
          console.warn(`[SETU] "${key}" could not follow the navigation:`, error.message);
        }
      }
      Dock.layout();
    }

    /** Keep this tab in step with changes made in the popup or another tab. */
    watchStorage() {
      chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area === 'sync' && changes.apiHost) {
          await API.init();
        }

        if (area !== 'sync' || !changes.setuState) return;

        const incoming = changes.setuState.newValue;
        if (!incoming) return;

        // Our own write, bouncing back. Reconciling against it would undo the
        // change we just made — this is what used to strip themes instantly.
        if (Store.isOwnEcho(incoming)) return;

        Store.adopt(incoming);
        await this.applyState();
        // Repaint open overlays when the palette was changed elsewhere —
        // the options page, or another tab.
        UI.applyAppearance();

        for (const feature of this.features.values()) {
          if (feature.enabled) feature.onSettings();
        }
      });
    }
  }

  if (!isSupportedDocument()) {
    console.debug('[SETU] skipping unsupported document type:', document.contentType);
    return;
  }

  const setu = new SetuLens();
  window.setu = setu;
  window.setuExtension = setu;
  window.setuLens = setu;

  const start = () => setu.boot().catch((error) => console.error('[SETU] boot failed:', error));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
