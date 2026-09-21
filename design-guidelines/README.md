# SETU — Design Guidelines

Everything an engineer or an AI agent needs to build the redesigned SETU Sanctuary web
app. This document is self-contained: it states the decisions, the tokens, the component
specs, the screen-by-screen layouts, the copy, and the interaction behaviour. Where a
value came from the existing codebase, the source file is named.

---

## 0. What is in this folder

| File | What it is |
|---|---|
| `SETU Sanctuary.dc.html` | **The deliverable.** One clickable file: landing → 3-step onboarding → the full app (Mind Map, Library, Modes, Settings, command palette, focus session, break dialog, extension handoff). |
| `SETU Current recreation.dc.html` | The **existing** dark UI, rebuilt faithfully from source. The "before" for any comparison. Do not build from this — it documents what is being replaced. |
| `landing-b.dc.html` | The landing direction that was **chosen**. Product-forward: headline left, live map artifact right. Its hero is the one carried into `SETU Sanctuary.dc.html`. |
| `landing-a.dc.html` | The landing direction that was **rejected**. Broadsheet front page, argument-first. Kept for reference only — do not build from it. |

All four are Design Components (`.dc.html`). They open directly in a browser. They
reference the design system at `../_ds/broadsheet-48ee9ab4-2e6d-4d5a-b957-4e57fc9b52d8/`
and the runtime at `../support.js`, both one level up from this folder.

---

## 1. The product, in one paragraph

SETU is a cognitive accessibility tool for neurodivergent readers, built for Capgemini
Hack4Positive 2026. It has three surfaces: **Lens** (a Chrome extension that reshapes any
page in real time — bionic text, line focus, reader view, read-aloud), **Sanctuary** (the
React web workspace that turns any topic into an interactive mind map), and **Engine**
(the shared AI orchestration layer both call). This redesign covers **Sanctuary** and the
public landing page that leads into it.

---

## 2. Decisions already made — do not relitigate these

These were settled with the product owner over six rounds of questions. An agent
extending this work should treat them as fixed constraints.

| Decision | Value | Why |
|---|---|---|
| Scope of first delivery | Landing → onboarding → first map, as one continuous walkthrough | Chosen over "all four screens" and "mind map alone" |
| Audience | Real neurodivergent users in daily use — **not** hackathon judges | Changes every trade-off: no demo theatre, no vanity metrics |
| Buildability | "Mostly reusable" — stay close to the existing React + Tailwind structure | Do not introduce a new framework |
| Reading surface | **Light by default** | The previous app was dark-only; light is the safer default for this audience |
| Onboarding length | **Exactly three steps** | Five was rejected as a chore |
| Onboarding content | Reading profile · typeface + size on a live sample · motion sensitivity | "What you'll use it for" and "install the extension" were cut from onboarding; the extension became an in-app banner instead |
| First map | A **pre-drawn worked example**, not a blank canvas | The payoff has to land before anyone types |
| Example topic | *How a transformer neural network works* | Chosen over vaccines, rent deposits, compound interest |
| Copy voice | **Warm and encouraging** | Not clinical, not cute |
| Navigation | **Left sidebar** (the existing shape), not a top rail or chrome-free | Chosen from three wireframes |
| Landing direction | **B — the artifact.** Product doing its job, not an argument | Chosen from two built candidates |
| Additions in scope | First-run onboarding · command palette · focus/session state · better empty + loading states · extension↔Sanctuary handoff moment | All five were explicitly approved |

---

## 3. Visual system — Broadsheet

The project is bound to the **Broadsheet** design system at
`../_ds/broadsheet-48ee9ab4-2e6d-4d5a-b957-4e57fc9b52d8/`. It is newsprint set for the
web: near-black Source Serif 4 on paper white, with the process inks — cyan and magenta,
completed by a print yellow — used small and deliberately, like spot colour.

**Every page must load both of these in `<helmet>`:**

```html
<link rel="stylesheet" href="../_ds/broadsheet-48ee9ab4-2e6d-4d5a-b957-4e57fc9b52d8/styles.css">
<script src="../_ds/broadsheet-48ee9ab4-2e6d-4d5a-b957-4e57fc9b52d8/_ds_bundle.js"></script>
```

### 3.1 Tokens — never hard-code these values, use the variables

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#f3f2f2` | The paper. Page ground, node fills, input-on-surface. |
| `--color-surface` | `#eae9e9` | Sidebar, cards, canvas ground, sample panels. |
| `--color-text` | `#201e1d` | All body copy and headings. |
| `--color-accent` | `#0088b0` (cyan) | **Every interactive element.** Primary buttons, links, active nav, focus ring, selection ring. |
| `--color-accent-2` | `#d6006c` (magenta) | The rarer second spot colour. Destructive actions, one kicker. |
| `--color-process-yellow` | `#edbb00` | Print treatment only — used here as the third mind-map branch plate. |
| `--color-divider` | `color-mix(--color-text 16%)` | Hairlines. Use sparingly. |
| `--font-heading` / `--font-body` | Source Serif 4, weight 600 / 400 | Both. There is no sans-serif in this system. |
| `--space-1…8` | 5 / 10 / 15 / 20 / 30 / 40px | Density 1.25×. Do not tighten. |
| `--radius-sm/md/lg` | 1 / 2 / 4px | Near-square. Nothing is pill-shaped except `.tag`. |
| `--shadow-sm/md/lg` | tuned to the light ground | Use these, never ad-hoc box-shadows. |

Ramps exist for every role (`--color-accent-100` … `--color-accent-900`, same for
neutral and accent-2), generated in OKLCH on one shared lightness scale. Use 100–300 for
tinted fills and hovers, 500 as base, 700–900 for text on tinted fills and pressed
states. **For paragraph-size text in the accent, use `--color-accent-700`** — the base
accent only clears 3:1 against the ground, which is enough for icons and chrome but not
for body copy.

### 3.2 Rules of the system

**Do**
- Separate sections with whitespace, not dividers or cards.
- Set everything in the serif. Size, weight and measure do the organising.
- Cyan for interactive; magenta as the rare second spot.
- Left-aligned, asymmetric layouts. Content hugs the left edge; whitespace on the right.

**Don't**
- Do not structure the page with rules, borders or boxes. `.card` is reserved for
  genuinely discrete items — library listings — never for layout.
- Do not use both accents in the same small component.
- Do not tighten the spacing scale.
- Do not introduce a sans-serif for UI chrome. The serif *is* the chrome.

### 3.3 Icons

**Phosphor, duotone weight, throughout.** Loaded from
`https://unpkg.com/@phosphor-icons/web@2.1.1/src/duotone/style.css` and used as
`<i class="ph-duotone ph-graph"></i>`.

Never hand-draw an icon as SVG. The icons in use:

| Where | Icon |
|---|---|
| Nav — Mind Map / Library / Modes / Settings | `ph-graph` / `ph-books` / `ph-squares-four` / `ph-gear` |
| Command palette trigger + field | `ph-magnifying-glass` |
| Focus session | `ph-play` / `ph-pause` / `ph-arrow-counter-clockwise` / `ph-timer` |
| Map controls | `ph-plus` / `ph-minus` / `ph-arrows-out` / `ph-tree-structure` |
| Chat send | `ph-arrow-up` |
| Export | `ph-export` |
| Extension handoff | `ph-arrow-square-in` · dismiss `ph-x` |
| Onboarding profile | `ph-lightning` (ADHD) · `ph-text-aa` (dyslexia) · `ph-circles-three` (autistic) · `ph-waves` (overwhelmed) · `ph-dots-three` (rather not say) |
| Onboarding motion | `ph-wind` / `ph-pause-circle` |
| Loading stages | `ph-book-open` / `ph-tree-structure` / `ph-pen-nib` |
| Modes | `ph-play-circle` · `ph-waves` · `ph-graduation-cap` · `ph-users-three` · `ph-chats-circle` · `ph-pencil-simple` · `ph-path` |

### 3.4 Typography, applied

| Role | Size | Notes |
|---|---|---|
| Landing H1 | 66px / 1.0 / -0.02em | Serif 600 |
| Onboarding H1 | 42px / 1.1 | |
| Screen H1 (Library, Settings) | 34px | |
| Map title / Mode title | 22px / 30px | |
| Section kicker (`h6`) | 10px, uppercase, 0.08em tracking, accent | The only uppercase in the system |
| Body | 15–17px / 1.55 | Max measure 52–62ch |
| Node label | 17 / 15 / 13.5px by depth | Serif 600 |
| Node detail, meta | 10.5–12px, `--color-text` at 55% | |

---

## 4. Reading preferences — the accessibility core

Three preferences are collected in onboarding, changeable in Settings, and applied to the
whole app shell. They are the product's reason to exist; do not treat them as cosmetic.

```js
const FONT_STACKS = {
  serif:  '"Source Serif 4", Georgia, serif',        // default
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  hyper:  '"Atkinson Hyperlegible", Verdana, sans-serif'
};
const SIZE_SCALE = { normal: 1, comfortable: 1.1, large: 1.22 };
```

- **Typeface.** Source Serif (default) · System sans · **Atkinson Hyperlegible**. The
  original app offered OpenDyslexic; Atkinson Hyperlegible was substituted because it
  loads reliably from Google Fonts and is drawn specifically so similar letterforms do
  not collapse into each other. If OpenDyslexic can be self-hosted, add it as a fourth
  option rather than replacing this one.
- **Text size.** Normal / Comfortable / Large, applied as a multiplier on the shell's
  base `font-size` so everything scales together.
- **Motion.** "Let things move" / "Keep it still". When still, no `animation` runs
  anywhere. Honour `prefers-reduced-motion` as well, and let it win.

Applied on the app shell root:

```js
appShellStyle = `display: flex; height: 100vh; overflow: hidden;
  background: var(--color-bg); color: var(--color-text);
  font-family: ${FONT_STACKS[font]}; font-size: ${16 * SIZE_SCALE[size]}px;`
```

Other accessibility commitments carried over from the existing app and kept:
WCAG 2.1 AA+ contrast, full keyboard navigation including the map canvas, focus never
removed only restyled (`:focus-visible { outline: 2px solid var(--color-accent);
outline-offset: 2px; }`), every control has an accessible name, live regions announce
state changes.

---

## 5. Screens

### 5.1 Landing

Full-height scroll on `--color-bg`.

**Head.** `.nav` bar, max-width 1280, padding 20/40. `.nav-brand` "SETU", then links
Sanctuary · Lens · Modes, then a `.btn-secondary` "Add to Chrome" with `ph-puzzle-piece`.

**Hero.** Two columns, `minmax(0, 0.85fr) minmax(0, 1.15fr)`, gap 56px, vertically
centred.

*Left column:*
- Kicker, magenta-700: `One question in. One map out.`
- H1 66px: `Understand it in one look.`
- Body 19px, max 40ch: *"Ask about anything in plain language. SETU researches it and
  lays it out as a map you open one branch at a time — instead of a wall of text you
  have to survive."*
- Input + primary button row. Placeholder: `How does a transformer neural network work?`
  Button: `Draw it` + `ph-arrow-right`. **This button starts onboarding.**
- Reassurance, 13px muted: `Free, no account. Your maps stay in this browser.`
- Stat row above a hairline — `8` reading tools, on any site · `7` cognitive modes ·
  `1` common AI agent · `0` bytes uploaded. Figures 30px serif.

*Right column:* a `<figure>` holding the map preview on `--color-surface`, radius-lg,
shadow-lg, padding 18. Inside: a title row (map title 17px, summary 12px muted,
`14 topics` tag), then the canvas.

> **Critical implementation note.** The preview canvas is
> `aspect-ratio: 620 / 392` and every node is positioned in **percentages** of that box
> (`left: 43.2%`, `top: 32.1%`, `width: 26.1%`, padding in %). The connector `<svg>` uses
> `viewBox="0 0 620 392"` at `width/height: 100%`. Nodes and edges must share one
> coordinate space — an earlier version used fixed pixel offsets for nodes against a
> scaling SVG and the whole third column overflowed the box at any width below ~1420px.

Caption: *A real map, drawn in about twelve seconds.*

**Three-column bed** below a hairline, gap 44:
- *The problem* — "Density is a disability barrier". A benefits portal, a tenancy
  agreement, a lecture handout. The information is there. The shape of it is what keeps
  people out.
- *The move* — "Reshape, don't summarise". Nothing is thrown away. The same words,
  re-laid so your eye can hold a line and your attention can hold a branch.
- *The promise* (magenta kicker) — "It stays yours". Maps are saved in your browser. No
  account, no upload, no model trained on the thing you were struggling to read.

### 5.2 Onboarding — three steps

Single column, max-width 760, centred. Header row: "SETU" wordmark left; right, `Step N
of 3` plus three 34×3px pips (filled = `--color-accent`, empty = `--color-divider`).
Each step animates in with `setu-rise` (6px, 0.35s) unless motion is reduced.

**Step 1 — "What tends to get in your way?"**
Sub: *"Pick anything that fits — or none of it. It only changes which tools SETU puts in
front of you first, and you can change it whenever you like."*
Multi-select, wrapping row, each option `flex: 1 1 210px` with icon + label + hint:

| Option | Hint |
|---|---|
| ADHD | Attention slides off dense pages |
| Dyslexia | Letters move or swap |
| Autistic | Ambiguity and clutter cost energy |
| Just overwhelmed | Too much, too fast, too often |
| Rather not say | Show me everything |

Actions: `Continue` (primary) · `Skip all this` (ghost → straight to app).

**Step 2 — "Make this paragraph easy to read."**
Sub: *"Change the settings until the sample below feels comfortable. Whatever you land on
is what the whole app uses."*
A live sample paragraph on `--color-surface`, padding 26/28, that **re-renders with the
current typeface and size** as the user changes them:

> *Attention is the part that changed everything. Instead of reading a sentence word by
> word and hoping to remember the start by the time it reaches the end, the model looks
> at every word at once and decides, for each one, which of the others actually matter to
> it.*

Two columns below it: Typeface (Source Serif / System sans / Atkinson Hyperlegible) and
Text size (Normal / Comfortable / Large), each option a stacked label + hint button.
Actions: `Continue` · `Back`.

**Step 3 — "Should things move?"**
Sub: *"Maps can grow into place, or simply appear. If motion makes you queasy or pulls
your attention away, turn it off — nothing is lost either way."*
Two options: *Let things move* (Branches grow into place as they arrive) · *Keep it
still* (Everything appears at once, no animation).
Actions: `Draw my first map` (primary, → app with the example map already drawn) · `Back`.

**Selected-option style** (used in all three steps and Settings):
`background: var(--color-accent-100); border: 1px solid var(--color-accent); color: var(--color-accent-900)`.
Unselected: transparent with a `--color-divider` border. Hover: `border-color: var(--color-accent)`.

### 5.3 App shell

`display: flex; height: 100vh; overflow: hidden`.

**Sidebar — 236px, `--color-surface`, no border.**
1. Brand: "SETU" 20px serif + "Sanctuary" 11px uppercase muted.
2. Four nav items. Each: icon 20px, label 14.5px 600, hint 11.5px at 60%. Active item
   gets `background: var(--color-bg)` and a **3px cyan left border**, radius on the right
   only. Inactive text sits at 72%.
3. Spacer.
4. **Command palette trigger** — a full-width outlined button: `ph-magnifying-glass`,
   the words "Do anything", and a `⌘K` kbd right-aligned. Hover turns it cyan.
5. **Focus session block**, above a hairline: label "FOCUS SESSION" + a 20px tabular
   clock (cyan while running, 45% muted when idle); a one-line note that changes with
   state; then `Start`/`Pause` and a reset icon button.
6. **Engine status**: a 6px cyan dot with a 2.4s breathe animation + "Engine ready".

**Main** — `flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden`.

### 5.4 Mind Map screen

Two panes.

**Conversation pane — 392px fixed**, padding 22/24/18, right hairline.

- Header row: H1 "Ask anything" 24px serif · ghost button "New map".
- **Extension handoff banner** (dismissible, `--color-accent-100`): `ph-arrow-square-in`,
  title *"Sent over from Lens"*, body *"The page you were reading — Attention Is All You
  Need — came across and became the map on the right."*, `ph-x` to dismiss. This is the
  designed moment for the Lens → Sanctuary handoff; it appears when the app is opened
  with an `?import=` payload.
- Transcript, `role="log" aria-live="polite"`. **User messages** are cyan-filled bubbles
  with `--color-bg` text, radius `lg lg 2px lg`. **Assistant messages are not bubbles** —
  they are plain 15px text at 84% ink. This is deliberate: the assistant is the page
  talking, not a chat partner.
- **Loading state — never a spinner and never a dead panel.** Three staged lines, the
  active one in cyan and the rest at 40%:
  `ph-book-open` Reading around the topic → `ph-tree-structure` Finding the branches →
  `ph-pen-nib` Drawing your map.
- Follow-up suggestions as `.tag-outline` buttons.
- Composer: `.input` (min-height 44) + primary icon button `ph-arrow-up`.

**Map pane — flexible.**

- Header, **`flex-wrap: wrap`**. Title wrapper is `flex: 1 1 260px; min-width: 0` with an
  ellipsised 22px title and a 13px summary. Right cluster (`flex: none`): `N topics`
  neutral tag, `model knowledge` accent tag, `Export` secondary button with `ph-export`.
  *The wrap and the `1 1 260px` basis are required — with `flex: none` on the cluster and
  only `min-width: 0` on the title, the title computes to width 0 below ~1100px.*
- Canvas: **`flex: 1 1 300px; min-height: 300px`** — the floor is required, or the canvas
  collapses to height 0 and the nodes spill over the rest of the UI. Margin 0/20/20,
  radius-lg, `--color-surface` with a 24px dot grid.
- Controls, top-right: a `--color-bg` stack with `ph-plus`, a tabular zoom %, `ph-minus`,
  a hairline, `ph-arrows-out`.
- Hint, bottom-left, 11.5px muted: *Click a topic to read it · double-click to research
  deeper · arrow keys work too*
- **Detail panel** below the canvas when a node is selected: `flex: none; max-height:
  32vh; overflow-y: auto`. Kicker "Selected topic", 19px title, body at 78% ink max 76ch,
  `ph-x` close, then `Ask about this` and `Go one level deeper` (`ph-tree-structure`).

#### Map layout algorithm

A simplified Reingold–Tilford pass — measure each subtree's height bottom-up, then centre
each parent against its children. Sibling subtrees never overlap because a parent's slot
is exactly the sum of its children's slots.

| Constant | Redesign | Original (`frontend/src/lib/layout.js`) |
|---|---|---|
| Column x | `[16, 268, 528]` | computed from width + `H_GAP` 78 |
| Node width by depth | `[186, 200, 168]` | `[268, 236, 214]` |
| Node height by depth | `[64, 56, 46]` | derived from text length, min 56 |
| Vertical gap | 14 | 18 |

Edges are cubic beziers from the parent's right-middle to the child's left-middle:

```
M{px+pw} {pcy} C {px+pw+40} {pcy}, {cx-40} {ccy}, {cx} {ccy}
```

Depth-1 edges are 2.2px at 0.6 opacity; deeper edges 1.4px at 0.4.

#### Branch colour = the four process plates

```js
const PLATE = ['#0088b0', '#d6006c', '#edbb00', '#201e1d'];  // cyan, magenta, yellow, ink
```

Branch index is assigned at depth 1 and inherited by the whole thread, so the eye can
follow one colour down a branch. This replaces the original six-colour periwinkle palette
and is the one place the print-yellow appears in the interface — the map is literally a
four-plate print.

**Node**: `--color-bg` fill, **no border except a 3px left border in the branch colour**,
radius-md, `--shadow-sm`. Selected gets `box-shadow: 0 0 0 2px var(--color-accent)`.
Root's left border is ink. Label is serif 600 at 17/15/13.5px by depth; detail 11.5px at
55%. A 22px circular toggle sits at `right: -11px` showing the child count when collapsed
and `−` when open.

Nodes must remain real `<button>` elements so the map stays keyboard navigable and
screen-reader legible; only the edges are SVG. Arrow keys move through the tree in
reading order; `←` collapses, `→` expands or researches deeper.

### 5.5 Library

Scrolling page, padding 30/34/44. H1 "Your library" 34px. Sub: *"Every map you've made,
saved on this device. Nothing is uploaded — clearing your browser data is the only thing
that removes them."* Search `.input` capped at 380px.

Grid: `repeat(auto-fill, minmax(280px, 1fr))`, gap 16. Each map is a `.card .elev-sm` —
**this is the one legitimate use of `.card` in the app**, because saved maps are
genuinely discrete items. Structure: `.card-kicker` (relative date, or "Sent from Lens"),
`.card-title`, `.card-body` summary, `.card-meta` with topic count and a ghost "Open"
button.

### 5.6 Modes

Two panes — a change from the original horizontal tab strip, which forced seven items
into a scrolling row.

**Left, 268px:** H1 "Modes", sub *"Seven tools. Pick whatever is in your way right now."*,
then a vertical list. Each row: duotone icon tinted with that mode's plate colour, name
14.5px 600, tagline 11.5px at 62%. Active row gets `--color-surface`.

**Right:** the active mode's name (30px), blurb (16px, 60ch), a `.field` label +
textarea, `Run {Mode}` primary + `Clear` secondary, a hairline, then **`Last result`** —
chips plus a series of titled blocks (prose or an ordered list).

Every mode ships a **worked example result**. An empty right-hand panel was one of the
specific complaints about the current app; a mode should never show a blank box.

| Mode | Icon · tint | Tagline | Blurb |
|---|---|---|---|
| Start | `ph-play-circle` · yellow | Break task freeze | Turns something you have been avoiding into one ten-minute action small enough to actually begin. |
| Simplify | `ph-waves` · cyan | Plain language | Rewrites dense or legal text at a Grade 6 reading level without dropping a single fact. |
| Learn | `ph-graduation-cap` · magenta | Study material | A summary, a branching outline, and a self-quiz, built from whatever you paste in. |
| Meet | `ph-users-three` · cyan | Meeting rescue | Pulls the decisions, owners and deadlines out of a transcript, and decodes the jargon along the way. |
| Practice | `ph-chats-circle` · magenta | Rehearse it first | Scripts for a hard conversation, in a few different tones, before you have to have it for real. |
| Write | `ph-pencil-simple` · yellow | Accessible writing | Checks your draft for reading level, passive voice, and the sentences that lose people. |
| Guide | `ph-path` · ink | Step by step | Turns any workflow into numbered steps, each with a clear signal that it worked. |

### 5.7 Settings

Scrolling page, max-width 660, sections separated by 34px of **whitespace — no cards, no
rules**.

- **Reading** — Typeface, Text size, Motion, each a row of chip buttons. Selected chip is
  a solid cyan fill with `--color-bg` text.
- **Engine** — a `.table` with Status / AI key / Live test, then a secondary
  "Test the AI connection".
- **Extension shortcuts** — a two-column list of action + `<kbd>`, from
  `frontend/src/pages/Settings.jsx`: Alt+B Bionic Reading · Alt+F Focus Mode · Alt+L Line
  Focus · Alt+H Reading Ruler · Alt+T Read Aloud · Alt+S Auto Scroll · Alt+⇧+C SETU
  Commander · Alt+X Turn everything off.
- **Your data** (magenta kicker) — count of stored maps, the no-upload promise, and a
  destructive "Delete all saved maps" in accent-2.

---

## 6. Cross-cutting features

### 6.1 Command palette

Opens on **⌘K / Ctrl+K**, closes on **Esc** or backdrop click. `.dialog-backdrop` with
`align-items: flex-start; padding-top: 14vh`; the `.dialog` is 560px, padding 0.

A search field (18px, borderless, autofocused, `ph-magnifying-glass` leading, `esc` kbd
trailing) over a scrolling result list capped at 6. Each row: cyan duotone icon, label
14.5px 600, hint 12px at 60%, group name right-aligned at 50%. Hover is a 10% accent
tint.

Actions, grouped **Go** / **Do** / **Reading**:
New mind map · Library · Modes · Settings · Start a focus session · Simplify some text ·
Break task freeze · Export this map to Markdown · Switch to Atkinson Hyperlegible.

Filtering matches against label + hint, case-insensitive.

### 6.2 Focus session

A 25-minute countdown owned by the sidebar. `setInterval` at 1s, only decrements while
running. Clock is tabular-nums, cyan while running.

At zero it stops and raises a **break dialog** — deliberately warm, not a nag:

> **That's twenty-five minutes.**
> You've done the hard part. Look away from the screen for a few minutes — the map will
> be exactly where you left it, and so will your place in it.
>
> `Keep going` (secondary) · `Take five` (primary)

Both actions reset the clock to 25:00. This is the design response to the "Breathe
Protocol" idea in the extension: a calm, ignorable prompt, never a modal you cannot
dismiss.

### 6.3 Extension ↔ Sanctuary handoff

The extension hands off to `/#/mindmap?import=…`. HashRouter is deliberate — it works
from a `file://` build and any static host without rewrite rules. **Keep it.**

The redesign gives the arrival a visible moment: the accent-tinted banner at the top of
the conversation pane naming the page that came across, and the map already drawn from
it. Library items that arrived this way carry the kicker "Sent from Lens".

### 6.4 Animation

Three keyframes only, all suppressed when motion is reduced:

```css
@keyframes setu-rise    { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes setu-breathe { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
@keyframes setu-draw    { from { stroke-dashoffset: 300 } to { stroke-dashoffset: 0 } }
```

`setu-rise` for panels arriving, `setu-breathe` for the engine dot, `setu-draw` for edges
growing into place.

---

## 7. Copy voice

Warm and encouraging, in plain words, second person. Short sentences. The reader is
capable and busy, not fragile.

- Say what a thing does, then what it costs them. *"Twenty-five minutes, then a real
  break."*
- Never blame the reader for finding something hard. The page is the problem, not them:
  *"The information is there. The shape of it is what keeps people out."*
- Give permission to skip. *"Pick anything that fits — or none of it."*
- Empty and loading states are copy problems, not layout problems. Name what is
  happening: *"Reading around the topic."*
- No exclamation marks. No emoji. No "Oops!". No "Let's get started!".

---

## 8. Mapping to the existing codebase

`frontend/` is React 18 + Vite + Tailwind with a HashRouter shell.

| Source file | What the redesign changes |
|---|---|
| `src/App.jsx` | Shell keeps its four-route sidebar shape and `EngineBadge`. Add the command palette, the focus session block, and the palette trigger. Nav labels and hints are unchanged — they were already good. |
| `src/index.css` | Replace the dark `@layer base`/`components` wholesale. `body` becomes `--color-bg`; delete the two radial gradients; `.card` `.btn*` `.input` `.chip` `.label` are all superseded by Broadsheet classes. Keep the `prefers-reduced-motion` block and the focusable skip link. |
| `tailwind.config.js` | The `ink`/`iris`/`mint`/`sun`/`rose`/`branch` palettes and the Inter stack are all retired. Either point Tailwind at the Broadsheet CSS variables or drop the custom theme and use the design-system classes directly. |
| `src/pages/MindMapChat.jsx` | Keep the streaming/abort logic and the `?import=` handoff effect verbatim. Replace `Welcome`, `Bubble`, `Dots`, `MapHeader`, `NodeDetail`, `EmptyCanvas` — `Dots` becomes the three staged progress lines. |
| `src/components/MindMap.jsx` | Keep pan/zoom, collapse, keyboard nav, and the "fit once per map, not on every expansion" rule. Swap `BRANCH_COLORS` for the four-plate array and restyle `Node` and `Controls`. |
| `src/lib/layout.js` | Algorithm unchanged. Retune `WIDTH`, `H_GAP`, `V_GAP` and `heightFor` to the redesign's tighter nodes. |
| `src/pages/Modes.jsx` | The seven-mode data table and all its copy survive. The tab strip becomes a list + detail; add a canned `result` per mode so the panel is never empty. |
| `src/pages/Library.jsx` | Same grid and search; cards become Broadsheet `.card`. |
| `src/pages/Settings.jsx` | Same four sections. Add the reading preferences set in onboarding; keep the shortcut table as-is. |
| `src/lib/storage.js` | Extend the prefs object with `profile`, `font`, `size`, `motion`. Maps stay in `localStorage` under `setu.maps.v1` — **nothing is ever uploaded**. |
| *(new)* `src/pages/Landing.jsx`, `src/pages/Onboarding.jsx` | New routes. Onboarding runs once, gated on a stored flag, and is skippable. |

Backend, extension and the compute ladder (L0 local / L1 engine / L2 research) are
untouched by this redesign.

---

## 9. Known gaps

- The **Chrome extension popup and in-page overlays** have not been redesigned. They are
  in scope for the product but out of scope for this delivery.
- The mind map is **interactive but not yet pannable by drag** in the design file; the
  original's pointer-drag panning and ctrl+wheel zoom should be kept when this is built
  in React.
- Modes show canned results rather than live engine calls.
- `landing-a.dc.html` is a rejected candidate kept only for reference.
