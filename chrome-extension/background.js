/**
 * SETU — Service Worker.
 *
 * Owns everything a content script cannot safely do itself:
 *  - Network calls to the SETU engine. Content scripts inherit the page's
 *    origin and CSP, so a direct fetch to the engine is blocked outright on
 *    many sites. Routing through here is what makes the AI features work
 *    everywhere, and it is also the only place a request can be cancelled.
 *  - Tab capture for the visual breakdown.
 *  - Injecting content scripts into tabs that were already open when the
 *    extension was installed, updated, or reloaded.
 */

importScripts('shared/setu-config.js');

const DEFAULTS = self.SETU_DEFAULTS;

/**
 * Feature -> module files, shared with the content script through setu-config.
 *
 * Used here only as an allow-list for `injectModules`: it is the set of paths a
 * page-world caller may ask the worker to inject.
 */
const FEATURE_MODULES = self.SETU_FEATURE_MODULES || {};

/** In-flight engine requests, so the agent's Cancel button can abort for real. */
const inFlight = new Map();

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureInstallId();
  await openSessionStorage();

  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      setuState: freshState(),
      apiHost: DEFAULTS.apiHost,
      sanctuaryUrl: DEFAULTS.sanctuaryUrl
    });
    chrome.runtime.openOptionsPage?.();
  }

  if (details.reason === 'update') {
    await migrateState();
  }

  buildMenus();
  scheduleKeepWarm();
  // Content scripts are not retroactive — inject into already-open tabs.
  reinjectOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  ensureInstallId();
  openSessionStorage();
  buildMenus();
  scheduleKeepWarm();
  sweepAgentSessions();
});

/**
 * Let content scripts read and write `chrome.storage.session`.
 *
 * It defaults to trusted contexts only, which means the page-side response
 * cache silently no-ops — every repeated question pays full model latency
 * again. Session storage is the right home for it: per-browser-session, never
 * written to disk, and cleared when the browser closes.
 */
async function openSessionStorage() {
  try {
    await chrome.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
    });
  } catch (error) {
    console.debug('[SETU worker] session storage stays worker-only:', error.message);
  }
}

/* -------------------------------------------------------------------------- */
/* Keeping the engine awake                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The engine hibernates on its free host after about fifteen minutes idle and
 * needs 30-60 seconds to come back. That cost lands on the user's very first
 * request of a session — the one where a delay is least explicable and most
 * likely to be read as "this extension is broken".
 *
 * One cheap GET every ten minutes removes it. The probe is deliberately the
 * `/api/health` route, which does no model work and is excluded from the
 * engine's own request log.
 */
const KEEP_WARM_ALARM = 'setu-keep-warm';

function scheduleKeepWarm() {
  const minutes = Number(DEFAULTS.keepWarmMinutes) || 10;
  chrome.alarms.create(KEEP_WARM_ALARM, { periodInMinutes: minutes, delayInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_WARM_ALARM) warmEngine();
});

/** Last time we successfully touched the engine, to avoid redundant probes. */
let lastWarmAt = 0;

async function warmEngine() {
  if (Date.now() - lastWarmAt < 60000) return { ok: true, skipped: true };
  lastWarmAt = Date.now();

  const base = await engineBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULTS.wakeTimeoutMs);

  try {
    const response = await fetch(`${base}/api/health`, { signal: controller.signal });
    return { ok: response.ok };
  } catch (_) {
    // A failed warm-up is not worth reporting: the real request will surface
    // the problem with a message the user can act on.
    lastWarmAt = 0;
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drop the agent session mirror for a tab that has gone away.
 *
 * Each open agent writes one `setu_agent_session:<tabId>` entry so its state
 * survives a reload. Nothing else would ever remove them, so without this they
 * accumulate in local storage for the life of the profile.
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`setu_agent_session:${tabId}`).catch((err) => {
    console.debug('[SETU worker] Failed to clean agent session for tab', tabId, err.message);
  });
});

/** Clear every agent session at browser start — none of those tabs still exist. */
async function sweepAgentSessions() {
  try {
    const all = await chrome.storage.local.get(null);
    const stale = Object.keys(all).filter((key) => key.startsWith('setu_agent_session'));
    if (stale.length) await chrome.storage.local.remove(stale);
  } catch (_) {
    /* nothing to sweep */
  }
}

function freshState() {
  return {
    bionic: false,
    focus: false,
    lineFocus: false,
    highlight: false,
    scroll: false,
    tts: false,
    eye: false,
    breathe: true,
    theme: 'default',
    settings: {
      bionicIntensity: 0.45,
      lineFocusHeight: 1,
      highlightColor: '#0088b0',
      scrollWpm: 220,
      ttsRate: 1,
      ttsPitch: 1,
      ttsVoice: '',
      ttsSpeaker: '',
      ttsLanguage: 'en-IN',
      ttsExplain: true,
      gazeSensitivity: 1,
      gazeInvert: false,
      fontScale: 1,
      appearance: 'light',
      letterSpacing: 0.12,
      lineHeight: 1.8,
      language: 'English'
    }
  };
}

/**
 * Bring stored state forward across versions.
 *
 * Two migrations, both of which exist because a stale key is invisible to the
 * user but changes what the extension does.
 */
async function migrateState() {
  try {
    const { setuState } = await chrome.storage.sync.get('setuState');
    if (!setuState) return;

    let changed = false;

    // Keys retired in 3.1. `chunking` in particular fired an AI request on
    // every page load for anyone who had ever tried it once.
    for (const key of ['chunking', 'dyslexia', 'commander', 'visual']) {
      if (key in setuState) {
        delete setuState[key];
        changed = true;
      }
    }

    // 3.3 folded the two language settings into one, with the voice code as
    // the authority. Someone who typed "Hindi" into the old free-text box but
    // never opened the voice picker has `language: 'Hindi'` and the default
    // `ttsLanguage: 'en-IN'` — and reading the code first would silently put
    // them back into English. Their stated choice wins.
    const settings = setuState.settings;
    if (settings) {
      const named = self.setuResolveLanguage(settings.language);
      const voiced = self.setuResolveLanguage(settings.ttsLanguage);

      if (named.code !== 'en-IN' && voiced.code === 'en-IN' && settings.ttsLanguage === 'en-IN') {
        settings.ttsLanguage = named.code;
        settings.language = named.name;
        changed = true;
      } else if (settings.language !== voiced.name) {
        // Otherwise the code is authoritative, and the name follows it, so the
        // two can never disagree again.
        settings.language = voiced.name;
        settings.ttsLanguage = voiced.code;
        changed = true;
      }
    }

    if (changed) await chrome.storage.sync.set({ setuState });
  } catch (error) {
    console.warn('[SETU worker] state migration skipped:', error.message);
  }
}

/**
 * A stable per-install identifier, sent as `x-user-id`.
 */
async function ensureInstallId() {
  const { installId } = await chrome.storage.local.get('installId');
  if (installId) return installId;

  const fresh = `setu_${crypto.randomUUID()}`;
  await chrome.storage.local.set({ installId: fresh });
  return fresh;
}

/**
 * On install/update, existing tabs have no content script until reloaded.
 * Injecting manually means the extension works immediately.
 */
async function reinjectOpenTabs() {
  const { js } = chrome.runtime.getManifest().content_scripts[0];
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });

  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        files: js
      });
    } catch (_) {
      // Restricted pages (Web Store, other extensions) reject injection.
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Context menus                                                              */
/* -------------------------------------------------------------------------- */

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    const add = (id, title, contexts = ['all']) =>
      chrome.contextMenus.create({ id, title, contexts, parentId: 'setu' });

    chrome.contextMenus.create({ id: 'setu', title: 'SETU', contexts: ['all'] });

    add('cmd-commander', 'Ask SETU to do something…');
    add('cmd-explain-selection', 'Explain this in plain language', ['selection']);
    add('cmd-map-selection', 'Turn this into a mind map', ['selection']);
    add('cmd-speak', 'Explain this out loud', ['selection']);
    add('cmd-visual', 'Map this chart, image or section');
    add('cmd-chunk', 'Break this page into 3 steps');
    add('cmd-sanctuary', 'Send page to my Sanctuary');
    chrome.contextMenus.create({ id: 'sep', type: 'separator', parentId: 'setu', contexts: ['all'] });
    add('cmd-bionic', 'Toggle Bionic Reading');
    add('cmd-focus', 'Toggle Focus Mode');
    add('cmd-linefocus', 'Toggle Line Focus');
    add('cmd-reset', 'Turn everything off');

    // Surfaces a create() failure instead of leaving a half-built menu.
    if (chrome.runtime.lastError) {
      console.warn('[SETU worker] context menu:', chrome.runtime.lastError.message);
    }
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'cmd-explain-selection') {
    await send(tab.id, {
      action: 'openCommander',
      task: `Explain this in plain language: "${String(info.selectionText || '').slice(0, 1200)}"`
    });
    return;
  }

  if (info.menuItemId === 'cmd-map-selection') {
    await send(tab.id, { action: 'explainVisual', selection: String(info.selectionText || '') });
    return;
  }

  const routes = {
    'cmd-commander': { action: 'openCommander' },
    'cmd-speak': { action: 'explainAloud', text: info.selectionText },
    'cmd-visual': { action: 'explainVisual' },
    'cmd-chunk': { action: 'toggleFeature', feature: 'chunking', enabled: true },
    'cmd-sanctuary': { action: 'sendToSanctuary' },
    'cmd-bionic': { action: 'toggleFeature', feature: 'bionic' },
    'cmd-focus': { action: 'toggleFeature', feature: 'focus' },
    'cmd-linefocus': { action: 'toggleFeature', feature: 'lineFocus' },
    'cmd-reset': { action: 'resetAll' }
  };

  const message = routes[info.menuItemId];
  if (message) await send(tab.id, message);
});

/* -------------------------------------------------------------------------- */
/* Keyboard commands                                                          */
/* -------------------------------------------------------------------------- */

chrome.commands.onCommand.addListener(async (command, tab) => {
  const tabId = tab?.id || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!tabId) return;

  const routes = {
    'toggle-bionic': { action: 'toggleFeature', feature: 'bionic' },
    'toggle-focus': { action: 'toggleFeature', feature: 'focus' },
    'toggle-linefocus': { action: 'toggleFeature', feature: 'lineFocus' },
    'toggle-tts': { action: 'toggleFeature', feature: 'tts' },
    'toggle-ruler': { action: 'toggleFeature', feature: 'highlight' },
    'explain-visual': { action: 'explainVisual' },
    'chunk-page': { action: 'toggleFeature', feature: 'chunking', enabled: true },
    'reset-all': { action: 'resetAll' },
    'open-commander': { action: 'openCommander' }
  };

  // Tagged so the page can drop a duplicate if the same physical key press
  // also reached its own keydown handler.
  if (routes[command]) await send(tabId, { ...routes[command], source: 'command' });
});

/** Send a message to a tab, injecting the content script if it isn't there. */
async function send(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    const injected = await injectInto(tabId);
    if (!injected) return null;
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      console.debug('[SETU] tab unreachable:', error.message);
      return null;
    }
  }
}

/** Inject the content scripts into `tabId` and wait for the boot to finish. */
async function injectInto(tabId) {
  try {
    const { js } = chrome.runtime.getManifest().content_scripts[0];
    await chrome.scripting.executeScript({ target: { tabId }, files: js });
  } catch (error) {
    console.debug('[SETU] cannot inject into tab:', error.message);
    return false;
  }

  // Poll for readiness rather than guessing a delay: boot does storage reads,
  // and a fixed sleep is either wasted time or a race depending on the machine.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const pong = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (pong?.ok) return true;
    } catch (_) {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Message hub                                                                */
/* -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'apiFetch':
          return sendResponse(await apiFetch(request));

        case 'cancelRequest': {
          inFlight.get(request.requestId)?.abort();
          return sendResponse({ ok: true });
        }

        /**
         * Inject a feature's modules into the tab that asked for them.
         *
         * The content script cannot call `chrome.scripting` itself — that API
         * exists only in the worker — so on-demand loading has to round-trip
         * through here. `main.js` decides *what* to load and this decides
         * *whether it is allowed*.
         *
         * The file list is validated against the manifest's own module table
         * rather than trusted. A content script runs in a page's world and a
         * compromised or hostile page that reached this channel could otherwise
         * name any path in the extension bundle; restricting it to files the
         * extension already ships as feature modules keeps the blast radius at
         * "load a feature the user could have loaded anyway".
         */
        case 'injectModules': {
          const tabId = sender.tab?.id;
          if (!tabId) return sendResponse({ ok: false, error: 'No tab to inject into.' });

          const allowed = new Set(Object.values(FEATURE_MODULES).flat());
          const files = (request.files || []).filter((file) => allowed.has(file));

          if (!files.length) {
            return sendResponse({ ok: false, error: 'No injectable modules named.' });
          }

          try {
            await chrome.scripting.executeScript({
              target: { tabId, allFrames: false },
              files
            });
            return sendResponse({ ok: true, files });
          } catch (error) {
            // Restricted pages (the Web Store, other extensions, some PDFs)
            // reject injection. The caller degrades rather than throwing.
            return sendResponse({ ok: false, error: error.message });
          }
        }

        case 'captureTab': {
          const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
          return sendResponse(await captureTab(windowId));
        }

        case 'ensureTab': {
          // Used by the popup: a tab opened before the extension was installed
          // or reloaded has no content script, and every control would appear
          // dead until the user reloaded the page by hand.
          const tabId = request.tabId ?? sender.tab?.id;
          if (!tabId) return sendResponse({ ok: false, error: 'No tab.' });
          try {
            const pong = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            if (pong?.ok) return sendResponse({ ok: true, injected: false });
          } catch (_) {
            /* fall through to injection */
          }
          const injected = await injectInto(tabId);
          return sendResponse({
            ok: injected,
            injected,
            error: injected ? '' : 'SETU cannot run on this page.'
          });
        }

        case 'sendToSanctuary':
          return sendResponse(await stashForSanctuary(request.payload));

        case 'openSanctuary': {
          const base = await sanctuaryBase();
          await chrome.tabs.create({ url: request.path ? `${base}${request.path}` : base });
          return sendResponse({ ok: true });
        }

        case 'whoAmI':
          // A content script cannot learn its own tab id, and the agent needs
          // it: its session mirror lives in chrome.storage.local, which is
          // shared by every tab. Without a per-tab key, opening the agent on
          // one page would restore that page's plan onto every other tab.
          return sendResponse({ ok: true, tabId: sender.tab?.id ?? null });

        case 'warmEngine':
          // Fire and forget: the caller does not wait, it just wants the
          // wake-up to start overlapping whatever the user is doing next.
          warmEngine();
          return sendResponse({ ok: true });

        case 'openOptions':
          chrome.runtime.openOptionsPage();
          return sendResponse({ ok: true });

        case 'openCameraPermission': {
          // The grant has to be made from an extension page for it to hold on
          // every site — see camera/permission.js.
          const url = chrome.runtime.getURL('camera/permission.html');

          // Re-use an open one where we can. Matching a chrome-extension URL
          // needs the broad "tabs" permission, which is not worth requesting
          // for a tidiness win, so a failure here just opens a second tab.
          try {
            const [existing] = await chrome.tabs.query({ url });
            if (existing?.id) {
              await chrome.tabs.update(existing.id, { active: true });
              return sendResponse({ ok: true });
            }
          } catch (_) {
            /* no permission to look — open a fresh one below */
          }

          await chrome.tabs.create({ url });
          return sendResponse({ ok: true });
        }

        default:
          return sendResponse({ ok: false, error: `Unknown action "${request.action}"` });
      }
    } catch (error) {
      console.error('[SETU worker]', error);
      sendResponse({ ok: false, success: false, error: error.message });
    }
  })();

  return true;
});

/* -------------------------------------------------------------------------- */
/* Engine proxy                                                               */
/* -------------------------------------------------------------------------- */

async function engineBase() {
  const { apiHost } = await chrome.storage.sync.get('apiHost');
  return String(apiHost || DEFAULTS.apiHost).replace(/\/+$/, '');
}

async function sanctuaryBase() {
  const { sanctuaryUrl } = await chrome.storage.sync.get('sanctuaryUrl');
  return String(sanctuaryUrl || DEFAULTS.sanctuaryUrl).replace(/\/+$/, '');
}

/**
 * Proxy a JSON request to the SETU engine.
 *
 * Runs here rather than in the page so the request carries the extension's
 * origin (which the engine allow-lists) and is not subject to the host page's
 * Content-Security-Policy.
 *
 * Every failure returns a `code` alongside the message so callers can react —
 * offering the options page for a bad host, a retry for a timeout — instead of
 * printing one undifferentiated "something went wrong".
 */
async function apiFetch({ method = 'POST', path, body, timeoutMs, requestId }) {
  const base = await engineBase();
  const installId = await ensureInstallId();
  const budget = Number(timeoutMs) || DEFAULTS.requestTimeoutMs;

  const controller = new AbortController();
  if (requestId) inFlight.set(requestId, controller);

  // One flag, set before the abort, so an abort is never ambiguous: a timeout
  // and a user cancellation both surface as AbortError but need very different
  // messages.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, budget);

  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': installId
      },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      let message = `The engine returned ${response.status}.`;
      let retryAfter = 0;
      try {
        const parsed = JSON.parse(detail);
        message = parsed.error || message;
        retryAfter = Number(parsed.retryAfterSeconds) || 0;
      } catch (_) {
        /* keep the status line */
      }

      return {
        ok: false,
        status: response.status,
        retryAfter,
        code:
          response.status === 429
            ? 'rate-limited'
            : response.status === 503
              ? 'unavailable'
              : response.status >= 500
                ? 'server'
                : 'request',
        error: message
      };
    }

    return { ok: true, data: await response.json() };
  } catch (error) {
    if (error.name === 'AbortError') {
      return timedOut
        ? {
            ok: false,
            code: 'timeout',
            error: 'The SETU engine took too long to answer. Free AI models can be slow — try again.'
          }
        : { ok: false, code: 'cancelled', error: 'Cancelled.' };
    }
    return {
      ok: false,
      code: 'offline',
      error: `Cannot reach the SETU engine at ${base}. Check the engine URL in SETU settings, or start the backend.`
    };
  } finally {
    clearTimeout(timer);
    if (requestId) inFlight.delete(requestId);
  }
}

/* -------------------------------------------------------------------------- */
/* Tab capture                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Screenshot the visible tab, respecting Chrome's rate limit.
 *
 * `captureVisibleTab` allows roughly two calls a second and rejects the rest
 * outright. The visual explainer can legitimately ask twice in quick
 * succession — once to size a crop, once after scrolling the target into view
 * — and the second call used to fail with a raw quota error that surfaced to
 * the user as "there isn't enough here to describe". Re-using a capture taken
 * moments ago is both correct and faster.
 */
const CAPTURE_REUSE_MS = 400;
let lastCapture = { windowId: null, dataUrl: '', at: 0 };

async function captureTab(windowId) {
  if (
    lastCapture.dataUrl &&
    lastCapture.windowId === windowId &&
    Date.now() - lastCapture.at < CAPTURE_REUSE_MS
  ) {
    return { success: true, ok: true, dataUrl: lastCapture.dataUrl, reused: true };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: 'jpeg',
        quality: 85
      });
      lastCapture = { windowId, dataUrl, at: Date.now() };
      return { success: true, ok: true, dataUrl };
    } catch (error) {
      const quota = /quota|too many/i.test(error.message || '');
      if (!quota || attempt === 2) {
        return { success: false, ok: false, error: error.message };
      }
      await new Promise((resolve) => setTimeout(resolve, 550));
    }
  }

  return { success: false, ok: false, error: 'Could not capture this tab.' };
}

/* -------------------------------------------------------------------------- */
/* Streaming proxy                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Relay a server-sent-events endpoint to a content script over a port.
 *
 * `chrome.runtime.sendMessage` is request/response only, so a streamed answer
 * had nowhere to go and every AI reply appeared all at once, at the end. On the
 * free models SETU runs on, that is a 20-40 second wait for a paragraph whose
 * first sentence was ready in about a second.
 *
 * A port also gives us real cancellation for free: when the panel closes, the
 * content script disconnects, `onDisconnect` fires here, and the upstream fetch
 * is aborted instead of running on to completion against a dead listener.
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'setu-stream') return;

  const controller = new AbortController();
  let closed = false;

  port.onDisconnect.addListener(() => {
    closed = true;
    controller.abort();
  });

  const post = (message) => {
    if (closed) return;
    try {
      port.postMessage(message);
    } catch (_) {
      closed = true;
      controller.abort();
    }
  };

  port.onMessage.addListener(async (request) => {
    if (request?.action !== 'apiStream') return;

    const base = await engineBase();
    const installId = await ensureInstallId();
    const budget = Number(request.timeoutMs) || DEFAULTS.requestTimeoutMs;
    const timer = setTimeout(() => controller.abort(), budget);

    try {
      const response = await fetch(`${base}${request.path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'x-user-id': installId
        },
        body: JSON.stringify(request.body ?? {}),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '');
        let message = `The engine returned ${response.status}.`;
        try {
          message = JSON.parse(detail).error || message;
        } catch (_) {
          /* keep the status line */
        }
        post({
          type: 'error',
          code: response.status === 429 ? 'rate-limited' : response.status >= 500 ? 'server' : 'request',
          error: message
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (closed) {
          controller.abort();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';

        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload);
              if (parsed.error) {
                post({ type: 'error', error: parsed.error, code: parsed.code || 'stream' });
                return;
              }
              if (parsed.text) post({ type: 'chunk', text: parsed.text });
            } catch (_) {
              // Not JSON — treat the payload as raw text, which is what a
              // plain SSE endpoint sends.
              post({ type: 'chunk', text: payload });
            }
          }
        }
      }

      post({ type: 'done' });
    } catch (error) {
      if (closed) return;
      post({
        type: 'error',
        code: error.name === 'AbortError' ? 'timeout' : 'offline',
        error:
          error.name === 'AbortError'
            ? 'The SETU engine took too long to answer.'
            : `Cannot reach the SETU engine at ${base}.`
      });
    } finally {
      clearTimeout(timer);
      if (!closed) {
        try {
          port.disconnect();
        } catch (_) {
          /* already gone */
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Sanctuary handoff                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Park captured page content where the Sanctuary can pick it up, then open it.
 *
 * The text goes in the URL *fragment*, which never reaches a server and does
 * not land in history the way a query string does. Fragments are still capped:
 * a 100k-character article produced a URL long enough for Chrome to truncate,
 * and the receiving app then parsed a broken JSON payload. Anything larger is
 * left in extension storage for the web app to request.
 */
const HANDOFF_LIMIT = 16000;

async function stashForSanctuary(payload) {
  if (!payload?.text) return { ok: false, error: 'Nothing to send.' };

  const base = await sanctuaryBase();

  const { sanctuaryInbox = [] } = await chrome.storage.local.get('sanctuaryInbox');
  const entry = { id: `cap_${Date.now()}`, ...payload };
  const inbox = [entry, ...sanctuaryInbox].slice(0, 25);
  await chrome.storage.local.set({ sanctuaryInbox: inbox });

  const handoff = encodeURIComponent(
    JSON.stringify({
      id: entry.id,
      title: payload.title,
      url: payload.url,
      text: payload.text.slice(0, HANDOFF_LIMIT),
      truncated: payload.text.length > HANDOFF_LIMIT
    })
  );

  await chrome.tabs.create({ url: `${base}/#/mindmap?import=${handoff}` });
  return { ok: true };
}

console.log('[SETU] service worker ready');
