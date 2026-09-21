/**
 * Loads the real chrome-extension/shared/setu-core.js under a minimal stub of
 * the extension environment and exercises the two classes the 3.1 fixes turn
 * on: Store (self-echo suppression) and Feature (async-safe enable/disable).
 *
 * Run: node core-test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');

/* ---- environment stub ---------------------------------------------------- */

const syncStore = {};
const storageListeners = [];

const chrome = {
  storage: {
    sync: {
      async get(key) {
        if (key == null) return { ...syncStore };
        const keys = Array.isArray(key) ? key : [key];
        const out = {};
        for (const k of keys) if (k in syncStore) out[k] = syncStore[k];
        return out;
      },
      async set(patch) {
        const changes = {};
        for (const [k, v] of Object.entries(patch)) {
          changes[k] = { oldValue: syncStore[k], newValue: v };
          syncStore[k] = JSON.parse(JSON.stringify(v));
        }
        // Chrome fires onChanged in the context that made the write too — the
        // behaviour the echo suppression exists to survive.
        storageListeners.forEach((fn) => fn(changes, 'sync'));
      }
    },
    onChanged: { addListener: (fn) => storageListeners.push(fn) }
  },
  runtime: { sendMessage: async () => ({ ok: false, error: 'no worker in test' }) }
};

/**
 * Event listeners the runtime registers at load time.
 *
 * setu-core keeps hosts anchored to the viewport on scroll and re-flows the
 * dock on resize, both wired up the moment the file runs. The stub records
 * them rather than ignoring them, so a test can fire one.
 */
const documentListeners = new Map();

const sandbox = {
  console,
  chrome,
  structuredClone,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: clearTimeout,
  DOMException: globalThis.DOMException,
  // Only the node-type constants are ever read from it in this file, and the
  // stub elements below report no nodeType at all, so they take the element
  // branch of every check.
  Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
  addEventListener(type, handler) {
    if (!documentListeners.has(type)) documentListeners.set(type, new Set());
    documentListeners.get(type).add(handler);
  },
  removeEventListener(type, handler) {
    documentListeners.get(type)?.delete(handler);
  },
  scrollX: 0,
  scrollY: 0,
  innerWidth: 1280,
  innerHeight: 800
};

/**
 * The document scroller the arbiter falls back to when nothing has claimed a
 * surface. Modelled as a real element rather than as `window.scrollBy`,
 * because that is what the arbiter drives — going through the element is how
 * it stays immune to a page's `scroll-behavior: smooth`.
 */
sandbox.document = {
  scrollingElement: {
    scrollTop: 0,
    scrollHeight: 5000,
    clientHeight: 800,
    scrollTo({ top }) {
      this.scrollTop = top;
      sandbox.scrollY = top;
    }
  },
  documentElement: null,
  addEventListener() {},
  removeEventListener() {}
};
sandbox.document.documentElement = sandbox.document.scrollingElement;
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(EXT, 'shared', 'setu-config.js'), 'utf8'), sandbox, {
  filename: 'setu-config.js'
});
vm.runInContext(fs.readFileSync(path.join(EXT, 'shared', 'setu-core.js'), 'utf8'), sandbox, {
  filename: 'setu-core.js'
});

const { Store, Feature, Text, Scroll, Dock, Page, LAYERS, LANGUAGES, resolveLanguage, languageLabel } =
  sandbox.window.SETU;

/* ---- tiny assertion harness --------------------------------------------- */

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ---- tests --------------------------------------------------------------- */

async function testStore() {
  console.log('\nStore');

  // Retired keys from an older install must not come back.
  syncStore.setuState = {
    bionic: true,
    chunking: true,
    dyslexia: true,
    theme: 'sepia',
    settings: { scrollWpm: 400 }
  };
  const loaded = await Store.load();

  check('load keeps live keys', loaded.bionic === true && loaded.theme === 'sepia');
  check('load merges missing settings defaults', loaded.settings.ttsRate === 1);
  check('load keeps stored settings', loaded.settings.scrollWpm === 400);
  check('load strips retired chunking flag', !('chunking' in loaded));
  check('load strips retired dyslexia flag', !('dyslexia' in loaded));

  // The regression that made themes unusable: our own write bounced back
  // through storage and the reconciler treated it as a remote change.
  let echoSeen = null;
  storageListeners.length = 0;
  storageListeners.push((changes, area) => {
    if (area === 'sync' && changes.setuState) {
      echoSeen = Store.isOwnEcho(changes.setuState.newValue);
    }
  });

  await Store.set({ theme: 'dyslexia' });
  check('own write is recognised as an echo', echoSeen === true);
  check('state kept the theme', Store.get().theme === 'dyslexia');

  // A genuine change from another tab must NOT be mistaken for our echo.
  const foreign = { ...Store.get(), theme: 'contrast' };
  check('foreign write is not an echo', Store.isOwnEcho(foreign) === false);

  Store.adopt(foreign);
  check('adopt applies the foreign state', Store.get().theme === 'contrast');

  // Subscribers see updates.
  let notified = 0;
  const off = Store.subscribe(() => (notified += 1));
  await Store.set({ bionic: false });
  off();
  await Store.set({ bionic: true });
  check('subscribers fire, and unsubscribe works', notified === 1, `notified=${notified}`);
}

async function testFeature() {
  console.log('\nFeature');

  class Ok extends Feature {
    static key = 'ok';
    onEnable() {
      this.built = true;
      this.cleanup(() => (this.built = false));
    }
  }

  const ok = new Ok();
  await ok.enable();
  check('sync feature enables', ok.enabled === true && ok.built === true);
  ok.disable();
  check('sync feature tears down', ok.enabled === false && ok.built === false);

  // Gaze Scroll's shape: an async start that can be rejected by the user.
  class Camera extends Feature {
    static key = 'camera';
    constructor() {
      super();
      this.panelUp = false;
      this.streamStopped = false;
    }
    async onEnable() {
      this.panelUp = true; // builds its panel first, like the real feature
      this.cleanup(() => {
        this.panelUp = false;
        this.streamStopped = true;
      });
      await new Promise((r) => setTimeout(r, 5));
      throw new Error('Camera access was blocked.');
    }
    onDisable() {
      this.disableCalls = (this.disableCalls || 0) + 1;
    }
  }

  const camera = new Camera();
  let raised = null;
  try {
    await camera.enable();
  } catch (error) {
    raised = error;
  }

  check('async failure propagates to the caller', raised?.message === 'Camera access was blocked.');
  check('failed start leaves the feature off', camera.enabled === false);
  check('failed start tears its panel down', camera.panelUp === false);
  check('failed start releases resources', camera.streamStopped === true);

  // The stranded-panel bug: disable() after a failed start must be safe.
  let threw = false;
  try {
    camera.disable();
  } catch (_) {
    threw = true;
  }
  check('disable after a failed start does not throw', threw === false);
  check('disable after teardown does not re-run onDisable', camera.disableCalls === 1, `calls=${camera.disableCalls}`);

  // Partial start: cleanups registered before the throw must still run, even
  // though `enabled` never settled true from the caller's point of view.
  class Stranded extends Feature {
    static key = 'stranded';
    onEnable() {
      this.cleanup(() => (this.torn = true));
      throw new Error('boom');
    }
  }
  const stranded = new Stranded();
  await stranded.enable().catch(() => {});
  check('cleanups registered before a throw still run', stranded.torn === true);

  // Double-enable must not build twice.
  class Counter extends Feature {
    static key = 'counter';
    constructor() {
      super();
      this.builds = 0;
    }
    async onEnable() {
      this.builds += 1;
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  const counter = new Counter();
  await Promise.all([counter.enable(), counter.enable(), counter.enable()]);
  check('concurrent enables build once', counter.builds === 1, `builds=${counter.builds}`);

  // Named intervals replace rather than stack — the agent's ring-timer leak.
  class Ticker extends Feature {
    static key = 'ticker';
    onEnable() {}
  }
  const ticker = new Ticker();
  await ticker.enable();
  for (let i = 0; i < 5; i += 1) ticker.every('ring', 1000, () => {});
  check('named interval keeps exactly one timer', ticker._timers.size === 1, `size=${ticker._timers.size}`);
  check('named interval registers no per-call cleanup', ticker._cleanups.length === 0, `cleanups=${ticker._cleanups.length}`);
  ticker.disable();
  check('disable clears named timers', ticker._timers.size === 0);

  // toggle() is async and reports the settled state.
  const toggled = new Ok();
  check('toggle on returns true', (await toggled.toggle(true)) === true);
  check('toggle off returns false', (await toggled.toggle(false)) === false);
}

/** A stand-in for a scroll container, matching what the arbiter drives. */
function makeScroller({ scrollHeight = 5000, clientHeight = 800, smooth = false } = {}) {
  return {
    isConnected: true,
    scrollTop: 0,
    scrollHeight,
    clientHeight,
    scrollTo({ top }) {
      // A page with `scroll-behavior: smooth` animates instead of jumping, so
      // the offset has NOT changed by the time the caller reads it back. The
      // arbiter must not mistake that for having reached the bottom.
      if (smooth) return;
      this.scrollTop = top;
    }
  };
}

function testScroll() {
  console.log('\nScroll arbiter');

  const doc = sandbox.document.scrollingElement;
  doc.scrollTop = 0;
  sandbox.scrollY = 0;
  Scroll.reset();

  // The bug this exists for: sub-pixel velocities were dropped on the floor,
  // so slow reading paces and gentle head movement scrolled nothing at all.
  let moved = 0;
  for (let i = 0; i < 10; i += 1) moved += Scroll.by(0.4);
  check('sub-pixel steps accumulate into real movement', moved === 4, `moved=${moved}`);
  check('document scrolled by the same amount', doc.scrollTop === 4, `top=${doc.scrollTop}`);

  Scroll.reset();
  doc.scrollTop = 0;
  check('a single sub-pixel step moves nothing yet', Scroll.by(0.4) === 0);
  check('reset drops the carry', (Scroll.reset(), Scroll.by(0.4)) === 0);

  // Focus Mode owns its own scroller; Auto Scroll and Gaze Scroll must follow
  // it there rather than silently scrolling the document behind it.
  const reader = makeScroller();
  const release = Scroll.claim(reader, 10);
  Scroll.reset();
  doc.scrollTop = 0;

  Scroll.by(120);
  check('a claimed surface receives the scroll', reader.scrollTop === 120, `top=${reader.scrollTop}`);
  check('the document is left alone while claimed', doc.scrollTop === 0, `top=${doc.scrollTop}`);
  check('max() reports the claimed surface range', Scroll.max() === 4200, `max=${Scroll.max()}`);

  // Reaching the end reports zero, and does not overshoot the content.
  Scroll.reset();
  reader.scrollTop = 4190;
  const tail = Scroll.by(100);
  check('a move past the end is clamped', reader.scrollTop === 4200, `top=${reader.scrollTop}`);
  check('the clamped move reports what it really did', tail === 10, `moved=${tail}`);
  Scroll.reset();
  check('a move at the very end reports zero', Scroll.by(100) === 0);

  release();
  Scroll.reset();
  doc.scrollTop = 0;
  Scroll.by(50);
  check('releasing hands the document back', doc.scrollTop === 50, `top=${doc.scrollTop}`);

  // A claim whose element left the DOM must not strand every scrolling tool.
  const stale = { isConnected: false, scrollTop: 0 };
  Scroll.claim(stale, 10);
  Scroll.reset();
  doc.scrollTop = 0;
  Scroll.by(30);
  check('a disconnected claim is skipped', doc.scrollTop === 30, `top=${doc.scrollTop}`);
  Scroll._claims.length = 0;

  // The regression that broke every site with `scroll-behavior: smooth`:
  // the offset does not update synchronously, and reading it back made the
  // scrollers conclude they had hit the bottom on their very first frame.
  const animated = makeScroller({ smooth: true });
  const releaseAnimated = Scroll.claim(animated, 10);
  Scroll.reset();
  const reported = Scroll.by(120);
  check(
    'a smooth-scrolling page still reports real movement',
    reported === 120,
    `moved=${reported}`
  );
  releaseAnimated();
  Scroll.reset();
}

function testDock() {
  console.log('\nDock');

  // Six tools can be on at once. Before the dock they all pinned themselves to
  // the same 20px of one corner, and whichever mounted last hid the rest.
  const bar = (height) => ({
    isConnected: true,
    offsetHeight: height,
    style: {}
  });

  const first = bar(40);
  const second = bar(60);
  const third = bar(50);

  const releaseFirst = Dock.register('a', 'bottom-left', first);
  Dock.register('b', 'bottom-left', second);
  Dock.register('c', 'bottom-right', third);

  check('first bar sits at the base inset', first.style.bottom === '20px', first.style.bottom);
  check('second bar clears the first', second.style.bottom === '72px', second.style.bottom);
  check('bars stack along the correct edge', first.style.left === '20px' && second.style.left === '20px');
  check('the opposite edge is released', first.style.right === 'auto' && first.style.top === 'auto');
  check('a different corner starts its own stack', third.style.bottom === '20px' && third.style.right === '20px');

  releaseFirst();
  check('releasing one re-flows the rest', second.style.bottom === '20px', second.style.bottom);

  // A bar torn down without releasing (a crashed teardown) must not leave a gap.
  second.isConnected = false;
  Dock.layout();
  check('a detached bar is dropped from the stack', Dock.entries.has('b') === false);

  Dock.release('c');
}

function testText() {
  console.log('\nText');
  check(
    'escape neutralises markup',
    Text.escape('<img src=x onerror="alert(1)">') ===
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
  check('escape handles apostrophes', Text.escape("it's") === 'it&#39;s');
}

/**
 * The language table and its resolver.
 *
 * These carry the fix for the bug users described as "it only speaks one
 * language". The list is shipped with the extension rather than fetched, so
 * every picker stays complete when the engine is unreachable, and the resolver
 * accepts all three shapes that reach it — because the codebase stores a
 * Sarvam code in one setting and an English name in another.
 */
function testLanguages() {
  console.log('\nLanguages');

  // Eleven Indian languages on Sarvam plus twelve international ones on
  // ElevenLabs. Asserted by region rather than as one total, so adding an
  // international language cannot silently mask the loss of an Indian one.
  const indian = LANGUAGES.filter((entry) => entry.region === 'india');
  const international = LANGUAGES.filter((entry) => entry.region === 'international');

  check('the shipped table is not a stub', LANGUAGES.length >= 23, `count=${LANGUAGES.length}`);
  check('eleven Indian languages', indian.length === 11, `count=${indian.length}`);
  check('twelve international languages', international.length === 12, `count=${international.length}`);
  check('English is first, so it is the default', LANGUAGES[0].code === 'en-IN');
  check(
    'every entry carries a code, a name and a native name',
    LANGUAGES.every((entry) => entry.code && entry.name && entry.native)
  );
  check(
    'every entry declares a region',
    LANGUAGES.every((entry) => entry.region === 'india' || entry.region === 'international')
  );

  /*
   * `bcp47` is what reaches a `lang=` attribute, and it is not always the same
   * string as `code`. Sarvam spells Odia 'od-IN', which is not a valid language
   * tag — emitting it means a screen reader ignores it and reads Odia with an
   * English voice engine, a WCAG 3.1.2 failure on the feature this product
   * leads with. The tag is asserted separately from the code for that reason.
   */
  check(
    'every entry carries a bcp47 tag and a direction',
    LANGUAGES.every((entry) => entry.bcp47 && (entry.dir === 'ltr' || entry.dir === 'rtl'))
  );
  check("Odia's bcp47 tag is 'or-IN', not Sarvam's 'od-IN'",
    LANGUAGES.find((entry) => entry.code === 'od-IN')?.bcp47 === 'or-IN');
  check('Arabic is marked right-to-left',
    LANGUAGES.find((entry) => entry.code === 'ar-SA')?.dir === 'rtl');
  check(
    'codes are unique',
    new Set(LANGUAGES.map((entry) => entry.code)).size === LANGUAGES.length
  );

  check('resolves a full code', resolveLanguage('hi-IN').name === 'Hindi');
  check('resolves a bare tag', resolveLanguage('ta').name === 'Tamil');
  check('resolves an English name', resolveLanguage('Telugu').code === 'te-IN');
  check('resolves a native name', resolveLanguage('বাংলা').code === 'bn-IN');
  check('is case-insensitive', resolveLanguage('MARATHI').code === 'mr-IN');

  check('resolves a bcp47 tag back to the internal code', resolveLanguage('or-IN').code === 'od-IN');
  check('resolves an international bare tag', resolveLanguage('ja').code === 'ja-JP');
  check('resolves an international name', resolveLanguage('Turkish').code === 'tr-TR');

  // Anything unknown has to become English rather than reach a provider, which
  // rejects a language code it does not publish.
  check('an unknown language falls back to English', resolveLanguage('Klingon').code === 'en-IN');
  check('empty falls back to English', resolveLanguage('').code === 'en-IN');
  check('null falls back to English', resolveLanguage(null).code === 'en-IN');

  check(
    'the label leads with the native name',
    languageLabel(resolveLanguage('hi-IN')) === 'हिन्दी — Hindi'
  );
  check('English is not doubled up', languageLabel(resolveLanguage('en-IN')) === 'English');
}

/**
 * One chosen language, however it was stored.
 *
 * The two settings drifting apart produced the worst failure in the product:
 * an explanation written in English and spoken by a Hindi voice. `Store.language`
 * is the single reading of both, and `Store.setLanguage` the single write.
 */
async function testStoreLanguage() {
  console.log('\nStore — language');

  await Store.set({ settings: { ttsLanguage: 'ta-IN', language: 'English' } });
  check(
    'the voice code wins over a stale name',
    Store.language().name === 'Tamil',
    `got ${Store.language().name}`
  );

  const chosen = await Store.setLanguage('kn-IN');
  check('setLanguage returns the resolved entry', chosen.name === 'Kannada');
  check('setLanguage writes the voice code', Store.getSetting('ttsLanguage') === 'kn-IN');
  check('setLanguage writes the matching name', Store.getSetting('language') === 'Kannada');
  check('both halves now agree', Store.language().code === 'kn-IN');

  // A name-only install from an older build must still resolve.
  await Store.set({ settings: { ttsLanguage: '', language: 'Punjabi' } });
  check('an older name-only setting still resolves', Store.language().code === 'pa-IN');

  await Store.setLanguage('en-IN');
}

/**
 * Reading aids have to render on top of the Focus Mode reader.
 *
 * This is the whole mechanism behind "I cannot use line focus or the ruler
 * with Focus Mode". Both draw into fixed overlays, and the reader used to be
 * the higher layer, so it covered them completely — the features were running
 * correctly and were simply invisible. An ordering test is the cheapest way to
 * stop that silently coming back.
 */
function testLayers() {
  console.log('\nLayers');

  check('the reader sits below the dimmers', LAYERS.reader < LAYERS.dim);
  check('the reader sits below the reading overlays', LAYERS.reader < LAYERS.reading);
  check('dimmers sit below the reading overlays', LAYERS.dim < LAYERS.reading);

  // Panels and controls must stay above the dimmer, or Line Focus would grey
  // out the very controls offered to turn it off.
  check('panels clear the dimmer', LAYERS.panel > LAYERS.dim);
  check('panels clear the reading overlays', LAYERS.panel > LAYERS.reading);
  check('controls clear the panels', LAYERS.control > LAYERS.panel);
  check('toasts are always on top', LAYERS.toast === Math.max(...Object.values(LAYERS)));

  check(
    'every layer is within the 32-bit z-index ceiling',
    Object.values(LAYERS).every((z) => z <= 2147483647)
  );
}

/**
 * Content SETU is hosting is not SETU's own chrome.
 *
 * `Text.isOurs` is the gate every reading feature consults before touching a
 * node. It has to say "not ours" for the article inside the Focus Mode reader
 * — otherwise Bionic Reading, read-aloud and the ruler all skip it, which is
 * exactly how those features came to look broken in Focus Mode — while still
 * saying "ours" for the reader's own toolbar.
 */
function testReadableContent() {
  console.log('\nText.isOurs');

  // Minimal stand-ins: isOurs only ever calls closest() and getRootNode().
  const el = (matches, root = null) => ({
    closest: (selector) => (matches.includes(selector) ? {} : null),
    getRootNode: () => root,
    hasAttribute: () => false
  });

  const pageParagraph = el([], sandbox.document);
  check('ordinary page content is not ours', Text.isOurs(pageParagraph) === false);

  const ourPanel = el(['[data-setu]'], sandbox.document);
  check('our own overlay is ours', Text.isOurs(ourPanel) === true);

  // Inside the reader: matches both selectors, and the content marker wins.
  const hostedArticle = el(['[data-setu-content]', '[data-setu]'], sandbox.document);
  check('an article we are hosting is not ours', Text.isOurs(hostedArticle) === false);

  // The reader's toolbar lives in the same shadow root but outside the
  // article, so it is reached through the host chain instead.
  const shadowRoot = { host: { hasAttribute: (name) => name === 'data-setu', getRootNode: () => sandbox.document } };
  const readerToolbar = el([], shadowRoot);
  check("the reader's own toolbar is still ours", Text.isOurs(readerToolbar) === true);

  check('a null node is not ours', Text.isOurs(null) === false);
}

/**
 * What a control calls itself.
 *
 * `Page.labelOf` is the single input to everything downstream — what the model
 * is shown, and what the profile matcher scores against. Get it wrong and the
 * agent reasons confidently about a field it has misread.
 *
 * Two arrangements here were live bugs. `<label><span>Text</span><input></label>`
 * is one of the two normal ways to label a field and was not handled at all, so
 * a very large share of real forms described themselves to the model by their
 * `name` attribute — `father_name` where the page said "Father's Name". And a
 * text input arriving with a value already in it was labelled by its *contents*
 * rather than its purpose, so a Nationality box holding "Indian" was described
 * to the model as a field called "Indian".
 */
function testLabelOf() {
  console.log('\nPage.labelOf');

  const TEXT = 3;
  const ELEMENT = 1;

  const text = (value) => ({ nodeType: TEXT, nodeValue: value });

  /** A stand-in element carrying only what labelOf actually touches. */
  const node = ({ tag = 'INPUT', attrs = {}, children = [], innerText = '', value = '', name = '', id = '' } = {}) => {
    const el = {
      nodeType: ELEMENT,
      tagName: tag,
      childNodes: children,
      innerText,
      value,
      name,
      id,
      // Reflected the way the real DOM reflects them: `labelOf` reads
      // `el.placeholder` as a property and `alt`/`aria-*` as attributes.
      placeholder: attrs.placeholder || '',
      title: attrs.title || '',
      getAttribute: (key) => attrs[key] ?? null,
      getRootNode: () => null,
      closest: () => null,
      contains: (other) => children.some((child) => child === other || child.contains?.(other))
    };
    for (const child of children) child.parent = el;
    return el;
  };

  /** Wrap `control` in a label containing `before` as its visible text. */
  const wrap = (before, control) => {
    const label = node({ tag: 'LABEL', children: [before, control] });
    control.closest = (selector) => (selector === 'label' ? label : null);
    return control;
  };

  const wrapped = wrap(node({ tag: 'SPAN', innerText: "Father's Name *" }), node({ name: 'father_name' }));
  check('a wrapping label is read', Page.labelOf(wrapped) === "Father's Name *", Page.labelOf(wrapped));

  // The select's own innerText is its option list. Subtracting the control's
  // own subtree is what stops "Category" coming back as
  // "Category Select General OBC SC ST".
  const select = wrap(
    node({ tag: 'SPAN', innerText: 'Category' }),
    node({ tag: 'SELECT', innerText: 'Select General OBC SC ST', name: 'category' })
  );
  check('a wrapped select does not swallow its options', Page.labelOf(select) === 'Category', Page.labelOf(select));

  const prefilled = node({ name: 'nationality', value: 'Indian' });
  check('a value is not mistaken for a label', Page.labelOf(prefilled) === 'nationality', Page.labelOf(prefilled));

  const named = node({ attrs: { placeholder: 'Enter your PIN code' }, name: 'pin', value: '560102' });
  check('a placeholder still beats the name', Page.labelOf(named) === 'Enter your PIN code', Page.labelOf(named));

  const aria = wrap(
    node({ tag: 'SPAN', innerText: 'Wrong' }),
    node({ attrs: { 'aria-label': 'Date of birth' }, name: 'dob' })
  );
  check('an explicit aria-label outranks the wrapper', Page.labelOf(aria) === 'Date of birth', Page.labelOf(aria));

  const button = node({ tag: 'BUTTON', innerText: 'Submit Application' });
  check('a button is still named by its own text', Page.labelOf(button) === 'Submit Application', Page.labelOf(button));

  const bare = node({ value: 'only a value' });
  check('a value is the last resort, not no label at all', Page.labelOf(bare) === 'only a value', Page.labelOf(bare));

  check('a null element has no label', Page.labelOf(null) === '');
}

/* ---- run ----------------------------------------------------------------- */

(async () => {
  await testStore();
  await testFeature();
  testScroll();
  testDock();
  testText();
  testLanguages();
  await testStoreLanguage();
  testLayers();
  testReadableContent();
  testLabelOf();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
})();
