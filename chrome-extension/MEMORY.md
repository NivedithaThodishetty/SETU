# SETU Extension — Working Memory

Everything worth knowing before changing this extension, and in particular the
things that are **not** visible from reading a single file. If you only read one
section, read [Traps](#traps-bugs-that-keep-coming-back).

MV3, no build step, no dependencies, no bundler. Plain files loaded in manifest
order. `node build.js` verifies and zips; `node test/run.js` runs the suites.

- **Version:** 3.4.0 (`manifest.json` and `SETU.VERSION` in `shared/setu-core.js` — keep in step)
- **Minimum Chrome:** 116
- **Permissions:** `activeTab`, `storage`, `scripting`, `contextMenus`, `alarms`
- **Host access:** `http://*/*`, `https://*/*` — deliberately *not* the broad `tabs` permission
- **Web-accessible:** `icons/*`, `camera/frame.html` (only that one page; its subresources load from the extension origin and must stay off the list)

---

## Load order — three eager files, everything else on demand

The manifest declares **only three** content scripts. All nineteen used to be
declared against every http/https URL, so ~473 KB was fetched, parsed and
executed on every navigation to every site whether or not a single feature was
switched on — a measurable delay added to every page, by an accessibility tool,
on the low-end Android hardware this product targets. The eager set is now
**~118 KB**, and a feature's code arrives the first time it is actually used.

```
shared/setu-config.js     deployment constants, LANGUAGES, FEATURE_MODULES
shared/setu-profile.js    the saved-details catalogue, store, and field matcher
shared/setu-icons.js      generated Phosphor duotone set
shared/gaze-detector.js   head-tracking maths (no DOM, no permissions)
shared/setu-core.js       the runtime — everything below depends on it
content/main.js           orchestrator: registry, messages, shortcuts, state
```

Everything else is listed in **`FEATURE_MODULES`** in `setu-config.js`, keyed by
feature. `main.js` calls `ensureFeature(key)`, which asks the worker
(`injectModules`) to `chrome.scripting.executeScript` the files, waits for the
feature to self-register, then constructs it. In-flight loads are de-duplicated,
so a keyboard shortcut racing a popup toggle injects once.

**Array order inside `FEATURE_MODULES` is load-bearing**, for the same reasons
manifest order used to be:

- `shared/gaze-detector.js` defines `SETU_GAZE`, and `eye-tracker.js`
  destructures it at the top of its IIFE — it throws immediately if absent.
- `shared/setu-icons.js` must precede any feature that draws an icon.

`memory.test.js` asserts both, against the table rather than the manifest.

**Shared files are sent once per document, and the de-duplication is per FILE,
not per feature.** Six features list `shared/setu-icons.js`; restoring stored
state enables them in the same tick, so all six read `injectedFiles` before any
had finished and all six asked for the icon set — 41 KB six times. `injectFiles`
in `main.js` registers an in-flight promise **per file, synchronously before its
first await**, and a caller that needs a file another caller is already fetching
waits for that injection rather than sending its own. The wait also preserves
ordering: without it `eye-tracker.js` could run before `gaze-detector.js` had
defined `SETU_GAZE`. `parallel.test.js` covers this.

**`setu-core.js` resolves `icon()` per call, not at load.** It used to capture
`self.SETU_ICONS?.icon || (() => '')` once. With the icon set no longer eager,
that would have bound the empty-string fallback permanently and blanked every
icon in the product, silently.

The service worker loads `shared/setu-config.js` via `importScripts` — it needs
`FEATURE_MODULES` as the allow-list for `injectModules`, so a page-world caller
cannot name arbitrary bundle paths. The popup and options page load
`setu-config.js` + `setu-icons.js` as ordinary scripts, and the options page
loads `setu-profile.js` as well, because it hosts the details editor.

They do **not** get `setu-core.js`, so they use `self.setuResolveLanguage(...)`
and `self.SETU_LANGUAGES` directly rather than the `SETU.*` namespace.

---

## The runtime (`shared/setu-core.js`)

Exports on `window.SETU`: `LAYERS`, `UI`, `Dock`, `Scroll`, `Page`, `Store`,
`Feature`, `Text`, `API`, `Session`, `Reading`, `Bus`, `LANGUAGES`,
`resolveLanguage`, `languageLabel`, `deepQueryAll`, `readableRoots`,
`prefersReducedMotion`, `icon`, `features`.

`test/imports.test.js` derives its list from this object, so a new export is
covered automatically — but if it is used as a bare value rather than
`Name.thing`, add it to that file's `VALUE_LIKE` set.

### Six invariants that make features composable

Every feature can run simultaneously with every other. That is enforced, not
hoped for:

1. **One shadow root per feature**, via `UI.host(id, { layer })`. Page CSS
   cannot reach in; our CSS cannot leak out. Hosts mount on `documentElement`,
   not `body`, because some sites replace `<body>` during hydration.
2. **Floating bars register with `Dock`**, never pin themselves to a corner.
   The dock stacks per edge and water-fills height when several are open.
3. **Anything that scrolls goes through `Scroll`.** It carries the sub-pixel
   remainder and targets whatever surface is claimed — which is why Auto
   Scroll, Gaze Scroll and read-aloud follow all keep working inside Focus
   Mode's own scroller. Never call `window.scrollBy` in a feature.
4. **Anything addressing page controls goes through `Page.snapshot()`**, which
   hands out in-memory handles rather than writing attributes onto the page.
5. **`Reading.root()` is the surface that holds the article** — `document.body`
   normally, the Focus Mode reader when that is open.
6. **`Bus.emit('reading-surface')`** announces that the article moved. Only
   Focus Mode emits; Bionic Reading listens and re-anchors.

### The layer ladder — the reader is at the *bottom*

```js
reader:  2147483600   // Focus Mode's full-page reader
dim:     2147483610   // Line Focus masks
reading: 2147483620   // line band, ruler, spoken-word mark, source highlight
panel:   2147483635   // commander, 3-step path, visual map
control: 2147483645   // floating control pills
toast:   2147483647   // always on top
```

**Do not "fix" this by putting the reader on top.** It sits below the dimmers
and reading overlays deliberately: when it was above them it covered Line Focus
and the Reading Ruler completely, so those features ran correctly and were
simply invisible — which read to users as "these cannot be combined". They are
`pointer-events: none`, so sitting above the reader costs nothing.
`test/core.test.js` asserts this ordering.

### Readable hosts

`UI.host(id, { readable: true })` marks a host as carrying *page content*
rather than chrome. Only Focus Mode uses it, and its article carries
`data-setu-content`. Two consequences:

- `allRoots()` descends into it, so `Text.collect` and `deepQueryAll` see the
  article inside the reader.
- `Text.isOurs()` returns **false** for anything inside `[data-setu-content]`,
  so reading aids may process it — while the reader's own toolbar, which is in
  the same shadow root but outside that element, is still protected.

`readableRoots()` feeds `document.caretPositionFromPoint(x, y, { shadowRoots })`
so the ruler and line band can track text inside the reader. `Text.hitTestText`
is the manual fallback for engines that do not accept that option.

### Store

One state object, persisted to `chrome.storage.sync` under `setuState`,
broadcast to every tab.

- `Store.isOwnEcho()` suppresses our own write bouncing back. Without it, saving
  a theme looked like a remote change and the reconciler undid it a frame later.
  It keeps a **ring** of recent writes, not one slot, because two quick changes
  can land out of order.
- `RETIRED_KEYS = ['dyslexia', 'chunking', 'commander', 'visual']` are stripped
  on every read. `chunking` in particular used to be persisted, which fired an
  AI request on every page load for anyone who tried it once.
- **`Store.language()` / `Store.setLanguage()` are the only correct way to
  touch language.** See below.

Persisted toggles (`TOGGLES` in `main.js`): `bionic`, `focus`, `lineFocus`,
`highlight`, `scroll`, `tts`, `eye`, `breathe`. Anything costing a model call to
start is deliberately absent.

---

## Feature registry

| Key | Class | File | Shortcut | Persisted |
|---|---|---|---|---|
| `bionic` | BionicReading | `content/bionic-reading.js` | `Alt+B` (manifest) | yes |
| `focus` | FocusMode | `content/focus-mode.js` | `Alt+F` (manifest) | yes |
| `lineFocus` | LineFocus | `content/line-focus.js` | `Alt+L` (manifest) | yes |
| `highlight` | ReadingRuler | `content/word-highlight.js` | `Alt+H` (local) | yes |
| `tts` | TextToSpeech ("Explain This") | `content/text-to-speech.js` | `Alt+T` (local) | yes |
| `scroll` | AutoScroll | `content/auto-scroll.js` | `Alt+S` (local) | yes |
| `eye` | GazeScroll | `content/eye-tracker.js` | `Alt+E` (local) | yes |
| `breathe` | BreatheProtocol | `content/breathe-protocol.js` | — | yes |
| `theme` | ReadingTheme | `content/dyslexia-theme.js` | popup | via `state.theme` |
| `visual` | VisualBreakdown ("Map This") | `content/visual-breakdown.js` | `Alt+M` (local) | no |
| `chunking` | TaskChunker (3-step path) | `content/task-chunker.js` | `Alt+3` (local) | no |
| `commander` | Commander (AI agent) | `content/agent-copilot.js` | `Alt+Shift+C` (manifest) / `Alt+C` (local) | no |
| `sanctuary` | SanctuaryBridge | `content/sanctuary-bridge.js` | popup | no |

**Shortcuts are declared in exactly one place.** `Alt+B/F/L/Shift+C` are manifest
`commands`; the rest are page keydown handlers in `main.js` `LOCAL_SHORTCUTS`.
Binding one in both fires the toggle twice per press. `toggle()` de-duplicates
by `source` within 150ms as a second line of defence.

Chrome honours at most **four** `suggested_key` bindings — `build.js` fails the
build on a fifth.

`theme` is driven purely by `state.theme`, never by a boolean toggle. It used to
be both, and they fought: saving a theme echoed back as "the theme feature is
off" and the reconciler stripped it a frame later.

---

## Languages — one setting, two stored fields

Eleven Indian languages on Sarvam plus twelve international ones on ElevenLabs (23 total).
Defined **once** in `shared/setu-config.js` as `SETU_LANGUAGES`, mirrored in
`backend/config/languages.js`, which is the source of truth.

The two halves are **disjoint, not redundant**. Sarvam Bulbul voices the eleven
Indian codes and rejects anything else with a hard 400; ElevenLabs Multilingual
v2 voices the international set. So substitution runs one way only: an Indian
language can fall back to ElevenLabs when no Sarvam key is set, but an
international language can never fall back to Sarvam. `pickTtsProvider` in
`backend/services/speechService.js` encodes exactly that.

Every entry carries `bcp47` alongside `code`, and they differ for Odia: Sarvam
spells it `od-IN`, which is not a valid language tag. Anything that reaches a
`lang=` attribute must use `bcp47` — emitting `od-IN` makes a screen reader fall
back to the document language and read Odia with an English voice engine.
Entries also carry `dir`, which is `rtl` for Arabic.

Two fields exist for historical reasons and **must never be written
separately**:

- `settings.ttsLanguage` — a Sarvam code (`hi-IN`). Authoritative.
- `settings.language` — an English name (`Hindi`). Derived.

When they disagreed the result was the worst failure in the product: an
explanation written in English, read aloud by a Hindi voice. Use
`Store.language()` to read and `Store.setLanguage(code)` to write. Pages without
`setu-core` use `self.setuResolveLanguage()`. `background.js` `migrateState()`
folds legacy installs forward, preserving anyone who typed "Hindi" into the old
free-text box.

**The list ships with the extension and is never fetched to populate a picker.**
It used to come from `/api/speech/voices`, so a sleeping or key-less engine
collapsed every dropdown to English — the UI telling a Hindi speaker that SETU
has no Hindi. The engine's list is preferred *when non-empty*, never allowed to
replace a working list with an empty one.

---

## Your details — form filling (`shared/setu-profile.js`)

The Copilot fills forms from a profile the user saves once. ~70 stored fields
across nine groups (identity, contact, current address, permanent address,
family, education/work, official IDs, access needs, emergency contact), plus 12
values derived from them — `fullName`, `age`, `dobDay/Month/Year`, `dobDMY`,
`addressLine1/2`, `fullAddress`, `permanentFullAddress`, `mobileFull`,
`initials`.

Three rules, and everything else follows from them:

1. **`chrome.storage.local`, key `setuProfile` — never `chrome.storage.sync`.**
   Reading preferences sync; a home address and a date of birth do not. Do not
   merge the two stores. `resetAll` on the options page clears sync only and
   deliberately leaves the profile alone.
2. **Values never reach the engine.** `describeForModel()` sends
   `{key, label, filled}` and nothing else; the planner answers with
   `{{profile.pincode}}`; `resolveTokens()` substitutes in the page. The
   controller re-derives the list field by field in `sanitiseProfileFields` so a
   future client that started attaching values still could not get one into a
   prompt. `profile.test.js` asserts both halves.
3. **`sensitive: true` fields are never written automatically.** Every
   government ID and bank detail carries it, and they ship **empty** — a
   fabricated Aadhaar in a real portal is worse than an unfilled form. The
   autofill turns them into steps flagged `requiresConfirmation`, and
   `gateProfileSteps` in the Copilot applies the same flag to any AI plan whose
   `valueToFill` names one.

`matchControl(control, values)` scores a page control against the catalogue:
`autocomplete` token +120, longest label/`name`/`id`/`placeholder` pattern hit
+45..80, declared input type ±25/−55 (with `typeFallback` letting a bare
`type="email"` stand alone), sensitive-but-empty loses to filled. `MIN_SCORE`
is 45. `avoid` and `require` are what keep it safe — "Name" appears in Father's
Name, Bank Name, Company Name and Username, and every collision that would put
the right value in the wrong box has a case in `profile.test.js`.

"Fill this form with my details" is matched by `AUTOFILL_INTENT` in
`agent-copilot.js` and routed **away from the planner** to the local matcher:
instant, exhaustive (up to `MAX_AUTOFILL_STEPS` = 40, not the planner's six),
and works with the engine asleep. It builds an ordinary plan so it reuses the
step list, highlight, Skip and confirmation gate rather than growing a second
execution path. `plan.autoRunLimit` is what lets a 30-field form auto-run past
the 24-step click guard.

`Page.snapshot` carries `name`, `fieldId`, `placeholder`, `autocomplete`,
`required` and a `<select>`'s `options` for form controls — the matcher and the
planner both need them, because a large share of real forms label their inputs
badly or not at all.

---

## Camera / Gaze Scroll

`getUserMedia` from a content script asks for the **host page's** camera
permission: per-site, re-prompted on every domain, permanently refused wherever
a site's Permissions-Policy withholds it. That produced a stream of
`NotAllowedError`s.

The camera is now opened from `camera/frame.html`, an extension-origin page
embedded in the panel with `allow="camera"`. A grant belongs to SETU and holds
everywhere, once. `camera/permission.html` is the one-time grant flow, opened by
the worker's `openCameraPermission`. The in-page path survives as a fallback for
pages whose CSP blocks the frame.

- **Only a head offset crosses the frame boundary.** No pixels, ever. It is
  *not* hidden from the page — a `postMessage` to `parent` reaches the page's
  listeners regardless of target origin. Acceptable, because the page can
  already observe the resulting scroll.
- **`FRAME_LOAD_TIMEOUT_MS` covers loading only** and is cleared on the frame's
  `loaded` message. It once covered the permission prompt too, so pausing to
  *read* the dialog killed the frame and triggered a second, per-site prompt.
- **Two silences:** `SAMPLE_STALE_MS` (400ms) stops motion quietly;
  `SAMPLE_LOST_MS` (3000ms) reports the camera gone. A reading is a *held*
  value — without this, a revoked camera left the last "head is down" sample
  true and the page scrolled forever.
- **Calibration re-arms on failure** (`RECALIBRATE_RETRY_MS`). It used to fire
  once, find no face because the camera was still adjusting, clear its own
  timer and never try again — live camera, visible panel, permanently
  uncalibrated.
- **The row threshold adapts to the frame** (`busiestRow * 0.35`). A fixed
  10%-of-width bar never found a dim, backlit or distant face.

Technique: head *position*, not pupil gaze. 80×60 canvas, YCbCr chroma per row,
longest contiguous run of populated rows = the head. One-euro filter, squared
response, dwell before starting, neutral re-centres as posture drifts.

---

## API layer

Every engine call is proxied through the service worker. Content scripts inherit
the page's CORS context and many sites' CSP blocks a cross-origin fetch outright;
the worker's origin is the extension's, which the engine allow-lists.

- `API.post` / `API.get` → worker `apiFetch`. Cancellable via `cancelRequest`.
- `API.stream` → a `setu-stream` port. Used for `/api/agent/explain/stream`.
  Disconnecting the port aborts the upstream fetch.
- `API.cached` → memory + `chrome.storage.session`, **plus in-flight dedupe**.
  Two callers asking the same question share one call — on a metered daily quota
  a duplicate is a second charge, not just a slow answer.
- `API.prefetch` → fire-and-forget `cached`, failures silent.
- `API.warm` → nudges the sleeping free-tier host; the worker also pings
  `/api/health` every 10 minutes via an alarm.

`chrome.storage.session` needs
`setAccessLevel('TRUSTED_AND_UNTRUSTED_CONTEXTS')` from the worker or the
page-side cache silently no-ops.

### Endpoints used

`/api/health`, `/api/speech`, `/api/speech/voices`, `/api/agent/plan`,
`/api/agent/explain`, `/api/agent/explain/stream`, `/api/agent/visualize`,
`/api/agent/chunk`.

### Worker message actions

`apiFetch`, `cancelRequest`, `captureTab`, `ensureTab`, `sendToSanctuary`,
`openSanctuary`, `openOptions`, `openCameraPermission`, `warmEngine`, `whoAmI`.

### Content-script message actions

`ping`, `getState`, `toggleFeature`/`toggleMode`, `setTheme`, `setSetting`,
`openCommander`, `explainVisual`, `explainAloud`, `speakText`, `getPageContent`,
`sendToSanctuary`, `resetAll`.

---

## Backend contract (`../backend`)

Budgets in `services/agentService.js` — these are wall-clock ceilings on a whole
operation, not per-call timeouts:

| Budget | Per call | Deadline | Used by |
|---|---|---|---|
| `INTERACTIVE` | 12s | 25s | explanations, chunking |
| `INTERACTIVE_MAP` | 20s | 40s | visual map |
| `PLANNING` | 20s | **48s** | the agent's planner |
| `INTERACTIVE_VISION` | 25s | 45s | image description |

**Planning has its own budget because it is the heaviest structured generation
in the product** — six steps × seven fields under a strict schema. It ran on
`INTERACTIVE` (sized for one paragraph of prose) while the *lighter* map got
nearly twice as long, so any single slow model guaranteed the keyword fallback.

`deadline.hasRoomFor(timeoutMs)` in `services/aiService.js` refuses to start a
call that cannot plausibly finish — three quarters of the intended slice, capped
at `MIN_VIABLE_CALL_MS` (5s). Before it, a chain walk would hand the third model
2.1 seconds and log `model "gemini-3.5-flash" failed (timed out after 2111ms)`,
blaming the model for a budget we set, and spending a quota unit to do it.

Failing models get a 45s cooldown (60s+ on 429), so the *next* request skips
them. A one-off full chain walk in the logs is expected; a repeated one is not.

---

## Traps: bugs that keep coming back

Each of these has been fixed at least once. Most have a test guarding them now.

1. **A backtick inside a CSS template literal** terminates the string and breaks
   the entire content script. Never write `` `word` `` inside `style.textContent = \`…\``.
2. **A mis-escaped regex** can land as a raw control byte. `\b` was once written
   as a literal backspace (0x08) — the file parsed, the extension loaded, and
   `ACTION_INTENT` matched nothing at all, so the agent silently stopped
   recognising action requests. `build.js` now refuses any source containing C0
   control characters. Prefer the Write tool over shell heredocs for patches
   with escapes.
3. **`el.value = x` does not reach React/Vue.** The framework interposes a
   `value` accessor; a write through it is recorded as one it already knew, so
   the `input` event is a no-op and the value is discarded on re-render. Use
   `setNativeValue` (walks to the deepest prototype defining `value`). Checkboxes
   use `.click()`, never `.checked =`.
4. **`Page.snapshot()` must not clear `Page.refs`.** It used to, which both
   erased the agent's live handles and reissued `r0`, `r1` for different
   elements. Refs are now namespaced per snapshot (`s3r12`) with oldest-first
   eviction at `MAX_REFS`.
5. **Fuzzy label matching must be scored**, not first-match. A bare
   `label.includes(needle)` picks whichever element comes first in document
   order — on a real site, almost always a nav link rather than the button meant.
6. **Features that end in a terminal state must reset it in `onEnable`.** Auto
   Scroll left `running = false` after reaching a page bottom, so the next
   enable mounted a bar that never moved.
7. **Scroll and wheel listeners need `capture: true`** to hear events inside the
   Focus Mode reader — shadow-DOM scroll does not bubble to `window`.
8. **`Text.selection()` at click time is too late.** Clicking anything, including
   our own play button, collapses the selection. Track it on `selectionchange`
   (`heldSelection` in the agent, `captureSelection` in Explain This) and keep
   the live `Range`, not just the string, or there is nothing to highlight.
9. **Never populate a language picker from the network.** See Languages above.
10. **`getClientRects()` per line box, not `getBoundingClientRect()`.** A caret
    range is collapsed and its rect is zero-width — that is why an early ruler
    was invisible.
11. **Bionic must re-anchor on `reading-surface`** and observe the hosted
    surface separately; a `MutationObserver` on `document.body` never sees
    inside a shadow root.
12. **Free-tier quota is capped per *day*.** Do not add speculative prefetching
    on hover. Map-node explanations prefetch on `pointerdown` (button 0 only),
    which never wastes a request because every pointerdown precedes a click.

---

## Tests and gates

`node test/run.js` — 220-odd assertions across eight offline suites, plus an
engine end-to-end suite that skips cleanly with no backend.

| Suite | Covers |
|---|---|
| `imports.test.js` | every `SETU.*` export is destructured before use; list derived from `setu-core` |
| `dom.test.js` | every `#id` the popup/options scripts reach for exists in their markup |
| `icons.test.js` | icon names resolve |
| `css.test.js` | classes used in shadow templates have rules |
| `core.test.js` | Store echo suppression, Feature lifecycle, Scroll arbiter, Dock, languages, layer ordering, `isOurs` |
| `gaze.test.js` | control law, detector under dim/small/absent faces, calibration retry, camera-silence watchdog |
| `agent.test.js` | goal routing, `setNativeValue` against a framework-controlled input |
| `modules.test.js` | on-demand loading: every feature reachable through `FEATURE_MODULES`, no eager/lazy overlap, eager set under 150 KB, worker allow-list, per-call `icon()` |
| `parallel.test.js` | several features at once: per-feature and per-FILE de-duplication, shared dependencies sent once, a refused injection not poisoning the rest, retry after failure |
| `profile.test.js` | field matching (every "right value in the wrong box" collision), derivation, token substitution, and that no stored value can reach the engine |
| `memory.test.js` | verifies MEMORY.md accuracy against manifest, runtime, and backend budgets |

Backend: `npm test` in `../backend` → `scripts/test-ai-service.js` (30 cases,
including a replay of the three-model budget exhaustion) then
`scripts/test-agent-profile.js` (25 cases: that no profile *value* can reach a
prompt through `/api/agent/plan`, and that a placeholder naming a detail the
user has not saved is stripped rather than filled with an empty string). No
network or key needed for either.

`node build.js` verifies before zipping and **fails** on: a missing manifest
reference (including `web_accessible_resources`), a description over 132 chars,
a bad version, a fifth `suggested_key`, a raw control character in source, or an
`http://` default host.

---

## Deploy checklist

1. `node test/run.js` and `(cd ../backend && npm test)` both green.
2. Bump `version` in `manifest.json` **and** `VERSION` in `shared/setu-core.js`.
3. Check `shared/setu-config.js` `apiHost` / `sanctuaryUrl` point at production.
4. `node build.js` → `dist/setu-<version>.zip`.
5. If permissions, data flow or the camera changed, update `PRIVACY.md` — it is
   what store review reads, and it must match the manifest exactly.
6. `STORE_LISTING.md` carries the reviewer note explaining the camera frame.
