# SETU — Chrome Extension

A Chrome extension that reshapes any website for how your brain actually reads:
bionic text, line focus, a reading ruler, a sensory-safe reader, spoken
explanations in eleven languages, themes, and an AI agent that reads the live
page and walks you through it.

Manifest V3. No build step, no dependencies, no bundler.

Built on the same **Broadsheet** design system as the Sanctuary web app
(`frontend/src/index.css`) — the same tokens, the same Source Serif 4, the same
Phosphor duotone icons, the same `theme-velvet` dark palette — so the extension
and the workspace read as one product rather than two.

---

## Install for development

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `chrome-extension/` folder

It starts working on tabs you already have open — the service worker injects
into them on install, so nothing needs reloading.

On first install the options page opens so you can point it at an engine.

---

## Two halves, and only one of them needs a server

**Works with no engine at all**, entirely on your machine:

| Tool | Shortcut |
| --- | --- |
| Bionic Reading | `Alt+B` |
| Focus Mode (reader view) | `Alt+F` |
| Line Focus | `Alt+L` |
| Reading Ruler | `Alt+H` |
| Explain This (browser voices) | `Alt+T` |
| Auto Scroll | `Alt+S` |
| Gaze Scroll (webcam) | `Alt+E` |
| 3-step path (read off the page) | `Alt+3` |
| Visual map (read off the page) | `Alt+M` |
| **Fill a form from your saved details** | Copilot → "Fill with my details" |
| Reading themes | popup |
| Turn everything off | `Alt+X` |

Form filling is worth calling out because it is the one AI-shaped feature that
needs no AI. You save your details once on the options page — name, date of
birth, contact, both addresses down to the door number, parents, education,
employment, emergency contact, and optionally official IDs — and the Copilot
matches them against the fields on any page **entirely on your device**. Nothing
is sent anywhere, it works with the engine asleep, and it fills a thirty-field
government form in one pass instead of six planned steps.

The safety rules are in [`shared/setu-profile.js`](shared/setu-profile.js) and
are not negotiable:

- The details live in `chrome.storage.local` and are deliberately kept off
  Chrome Sync, unlike the reading preferences.
- When the Copilot *plans* a task it tells the engine which details exist and
  never what they are: it sends `{{profile.pincode}} — PIN code`, gets a plan
  full of placeholders back, and substitutes the real values in the page.
- Aadhaar, PAN, passport, bank and the rest are marked sensitive: never
  described to the engine, never auto-filled, and Auto-run stops at each one.
- A fresh install ships an invented sample profile so the feature can be seen
  working — with the ID and bank fields left **empty on purpose**, because a
  fabricated ID number submitted to a real portal is worse than a blank form.

**Better with the SETU engine** (the backend in `../backend`):

| Feature | Endpoint | Without the engine |
| --- | --- | --- |
| Commander — plans and executes page actions | `POST /api/agent/plan` | keyword plan from visible controls |
| Commander — answers questions about the page | `POST /api/agent/explain/stream` | — |
| 3-step path | `POST /api/agent/chunk` | steps derived from the page's own fields |
| Visual map of a chart, table or section | `POST /api/agent/visualize` | map built from headings, lists and rows |
| Explaining one map node, in your language | `POST /api/agent/explain/stream` | the node's own detail line |
| Visual map of an image | `POST /api/agent/visualize` (image) | — |
| Explain This — a plain-language explanation of a selection or the page | `POST /api/agent/explain/stream` | — |
| Explain This — natural voice (Sarvam Bulbul) | `POST /api/speech` | the browser's own voices |

Every AI feature here draws something usable **before** it calls the engine, and
replaces it if a better answer arrives. That is not a nicety: the free model
tiers this runs on are rate-limited most of the day, and a tool that shows a
spinner and then an error is a tool nobody turns on twice. The 3-step path and
the visual map both render in under a second from the page itself, and quietly
upgrade in place.

Out of the box these point at the hosted deployment:

| Service | URL |
| --- | --- |
| Engine (backend) | `https://setu-37hl.onrender.com` |
| Sanctuary (web app) | `https://setu-amber.vercel.app` |

**To change either, edit [`shared/setu-config.js`](shared/setu-config.js)** — it
is the only place these are defined, and the popup, options page, service
worker and content scripts all read from it. Users can also override both at
runtime on the options page without touching the build.

To develop against a local backend instead, run `npm start` in `../backend` and
set the engine URL to `http://localhost:3000` on the options page.

> The hosted engine is on a free tier, so it sleeps when idle and takes up to a
> minute to wake. The status pill shows **waking up** rather than **offline**
> while that happens, and the first AI request after a sleep is correspondingly
> slow — request budgets allow for it.

The popup's status pill shows the connection at a glance: green with the
provider name means AI is ready, amber means the engine is up but has no AI key,
pink means it cannot be reached. Clicking it when it is pink opens the options
page.

---

## Configuration

Everything lives on the options page (right-click the toolbar icon → Options).

| Setting | What it does |
| --- | --- |
| Engine URL | Where the AI features send requests. **Test** reports what the engine actually said. |
| Sanctuary URL | Where "Send page to my Sanctuary" opens. |
| Language | The language explanations, summaries and chart descriptions come back in. |
| Reading defaults | Bionic strength, letter spacing, line height, scroll speed, speech rate. |

Ship-time defaults live in one file, [`shared/setu-config.js`](shared/setu-config.js) —
`apiHost`, `sanctuaryUrl`, and the request budgets. `node build.js` fails the
build if either URL is not `https`, because a published extension calling
`http://` is blocked as mixed content on most of the web.

---

## Tests

```bash
node test/run.js
```

Five suites, none of which need a bundler or a test framework:

| Suite | What it covers | Needs an engine |
| --- | --- | --- |
| `imports` | Every content script actually pulls the SETU runtime objects it uses out of `window.SETU` — a missing one is a `ReferenceError` that only appears when a user turns that feature on. | no |
| `dom` | Every `#id` and class the popup and options scripts reach for exists in their markup. The two halves are edited independently, and a stale selector fails silently — the control just does nothing. | no |
| `icons` | Every icon name the UI asks for exists in the generated Phosphor set. A missing name renders an empty string by design, so the failure is a blank button rather than an error. | no |
| `css` | Every CSS custom property a stylesheet references is defined somewhere it can see. A `var()` naming a property that does not exist is invalid at computed-value time, so the declaration is dropped and the element silently paints wrong. | no |
| `core.test.js` | Loads the real `setu-core.js` under a stubbed extension environment and asserts the invariants the runtime turns on: storage self-echo suppression, async enable rollback, forced teardown after a failed start, named timers replacing rather than stacking, the scroll arbiter's sub-pixel carry and smooth-scroll immunity, and the dock stacking panels without overlap. | no |
| `gaze.test.js` | Drives the Gaze Scroll control law with synthetic head positions. There is no camera in a test run and there does not need to be — the part that was broken was never the camera. Asserts that a still head scrolls nothing, that camera jitter inside the deadzone scrolls nothing, that up and down are symmetric, that sensitivity scales linearly, and that a 144Hz display travels the same distance as a 60Hz one. | no |
| `engine.test.js` | Replays the service worker's exact request path against a live engine and asserts the agent's safety properties: no step targets a control the page never reported, submit steps carry `requiresConfirmation`, no personal data is invented for form fills, and each failure maps to the error code the UI keys its guidance off. Also checks that the visual map has something in it to draw, and that the streamed explanation really streams. | yes |

The engine suite runs against `https://setu-37hl.onrender.com` by default and is
skipped with a message when no backend is reachable, so the offline suites stay
useful. Point it elsewhere with `node test/run.js http://localhost:3000`.

## Packaging

```bash
node build.js
```

Verifies before it packages, because every one of these is a hard rejection
later and a review round-trip costs days:

- name ≤ 75 and description ≤ 132 characters, a valid version, at most four
  suggested key bindings, MV3, and a CSP that permits no remote code
- every path the manifest references exists
- every shipped `.js` file parses
- every declared icon is a real PNG at the declared size
- both default URLs are `https` — an `http://` call from a published extension
  is blocked as mixed content on most of the web
- development files, the signing key, and the test directory stay out

Writes `dist/setu-<version>.zip` — this is what the Web Store wants.

To also produce a signed `.crx`:

```bash
node pack.js
```

Signs the *contents of the verified zip* (not the working folder) with a local
Chromium, writes `dist/setu-<version>.crx`, and prints the extension ID.

> **`dist/setu-signing-key.pem` is the extension's identity.** Reuse it for every
> release or the ID changes and existing installs stop recognising your updates.
> It is gitignored — keep a backup somewhere safe, and never share it.

Regenerate assets after a brand change:

```bash
node icons/generate-icons.js      # toolbar icons
node icons/generate-icon-set.js   # the inlined Phosphor UI set
```

---

## Deploying

Three routes, and they are not equivalent.

### 1. Chrome Web Store — the only route that works for ordinary users

```bash
node test/run.js && node build.js
```

Upload `dist/setu-<version>.zip` at
[chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole).
The store signs the package and issues the extension ID itself, so **no `.crx`
and no signing key are involved**. You will need a public URL hosting
[PRIVACY.md](PRIVACY.md) for the dashboard's privacy policy field.
[STORE_LISTING.md](STORE_LISTING.md) has the listing copy, the permission
justifications, and the data-use answers ready to paste.

Bump `version` in `manifest.json` before every upload — the store rejects a
re-upload of a version that already exists.

### 2. Enterprise / managed install — for a signed `.crx`

Host `dist/setu-<version>.crx` and an update manifest, then deploy by policy
(`ExtensionSettings` or `ExtensionInstallForcelist`, pointing at the update
manifest URL).

```xml
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='YOUR_EXTENSION_ID'>
    <updatecheck codebase='https://your-host/setu-3.1.0.crx' version='3.1.0' />
  </app>
</gupdate>
```

`node pack.js` prints the `appid` to use.

> **A self-hosted `.crx` cannot be installed by dragging it into
> `chrome://extensions`.** Chrome has blocked that on Windows and macOS since
> Chrome 33 for anything not from the Web Store, and the browser will disable it
> on restart. Policy-based install is the supported path; for anything else, use
> the Web Store.

### 3. Load unpacked — development and review

Point `chrome://extensions` → **Load unpacked** at this folder. This is also the
route to hand a reviewer or a teammate who just needs to try it.

The unpacked folder carries the dev tooling (`build.js`, `pack.js`, `test/`),
which Chrome ignores. Only the packaged builds are stripped.

---

## Architecture

```
manifest.json          MV3 manifest: permissions, content scripts, commands
background.js          Service worker — engine proxy, context menus, injection
shared/
  setu-config.js       Ship-time defaults (engine URL, timeouts)
  setu-core.js         Shadow-DOM hosts, Store, Feature base class, API client
content/
  main.js              Orchestrator: registry, messages, shortcuts, state sync
  agent-copilot.js     Commander — the in-page AI agent
  <feature>.js         One file per feature, each a Feature subclass
popup/                 Toolbar control deck
options/               Settings, connection test, diagnostics
```

Eight things make this work on every site on the internet, and make every tool
usable at the same time:

1. **Shadow DOM for every overlay.** Hostile page CSS cannot restyle SETU, and
   SETU's CSS cannot leak into the page. Hosts mount on `documentElement`, not
   `body`, because some sites replace `body` wholesale during hydration. They
   also re-anchor themselves on pages whose `<html>` carries a `transform` or
   `filter`, which silently turns `position: fixed` into "fixed to the
   document" and would otherwise send every panel scrolling off screen.
2. **One `Feature` base class** with idempotent, async-safe `enable`/`disable`.
   A feature that fails to start (no article, camera denied) rolls itself all
   the way back rather than stranding a panel on the page, which is what lets
   every tool run at once without corrupting each other.
3. **All network calls go through the service worker.** Content scripts inherit
   the page's origin and CSP, so many sites block a direct fetch to the engine
   outright. The worker's origin is the extension's own, which the engine
   allow-lists — and it is the only place a request can actually be cancelled.
   Streamed answers come back over a `runtime.connect` port for the same reason.
4. **One z-index ladder** in `setu-core.js`, so composed overlays stack
   predictably instead of fighting.
5. **`Dock`** places every floating panel. Tools no longer pin themselves to a
   screen corner, so six open at once stack along the edge instead of burying
   each other, and a panel too tall for its share of the edge is capped and
   scrolls internally rather than covering its neighbour.
6. **`Scroll`** is the single arbiter for moving the reading surface. Auto
   Scroll, Gaze Scroll, and Explain This's follow-along all go through it, so they
   compose — and all three keep working inside Focus Mode, which is its own
   scroll container. It carries the sub-pixel remainder (so slow paces move at
   all) and scrolls with `behavior: 'instant'` against the clamped target, which
   is what makes it immune to a page's own `scroll-behavior: smooth`.
7. **`Page`** is one shadow-DOM-aware snapshot shared by the agent, the 3-step
   path, and the visual map. It descends open shadow roots, so the large share
   of the web built from web components is legible rather than appearing empty,
   and it hands out in-memory handles instead of writing attributes onto the
   page — so two features can address the same page without erasing each
   other's targets.
8. **Navigation is observed, not assumed.** The History API is patched so a
   single-page-app route change re-reads the page instead of leaving Focus Mode
   showing the previous article.

### Adding a feature

```js
(() => {
  const { Feature, UI, Store } = window.SETU;

  class MyFeature extends Feature {
    static key = 'myFeature';

    onEnable() {
      const root = UI.host('my-feature', { layer: 'control', interactive: true });
      // ... build inside the shadow root
      this.listen(window, 'scroll', () => {});   // removed on disable
      this.every('tick', 500, () => {});         // cleared on disable
      this.cleanup(() => {});                    // anything else
    }

    onDisable() {
      UI.destroyHost('my-feature');
    }
  }

  window.SETU.features.set('myFeature', MyFeature);
})();
```

Then add the file to `content_scripts.js` in the manifest, and — if it should
survive a page reload — to `TOGGLES` in `content/main.js`.

Do **not** add a feature that costs a model call to `TOGGLES`. Persisted flags
are re-applied on every page load, so a persisted AI feature quietly fires a
request on every page the user visits.

---

## Safety model for the agent

The Commander runs on every site, including banking and government portals.

- It may only target controls that appeared in the snapshot it was given.
- Steps flagged `requiresConfirmation` — submit, pay, delete, send — never fire
  automatically, not even during Auto-Run. The run stops and waits for a
  deliberate click. The flag is applied both by the engine and, for offline
  plans, in the page, so the offline path is not a way around the gate.
- It never invents personal data. A fill step with no supplied value hands
  control back to the user instead of guessing.
- Password field values are never included in the page description sent to the
  model.

See [PRIVACY.md](PRIVACY.md) for what leaves the browser.
