<div align="center">

# SETU — The Cognitive Operating System

**A bridge between dense digital worlds and the neurodivergent mind.**

A browser extension that reshapes any website in real time, a redesigned Broadsheet web workspace that turns
any topic into an interactive mind map, an Android mobile application built with React Native and Expo, and one shared AI engine with MongoDB database persistence behind all three.

Built for Capgemini Hack4Positive 2026 · Disability Inclusion & Accessibility

</div>

---

## The Four Connected Surfaces

```
                                ┌───────────────────────────────────────┐
                                │   Unified SETU Backend (Express.js)   │
                                │   - Google Gemini + model fallback    │
                                │   - MongoDB & Local Rule Engine       │
                                │   - Identity via x-user-id header     │
                                └──────────────────┬────────────────────┘
                                                   │
                ┌──────────────────────────────────┼──────────────────────────────────┐
                │                                  │                                  │
  ┌─────────────▼────────────┐       ┌─────────────▼────────────┐       ┌─────────────▼────────────┐
  │     Chrome Extension     │       │     Web Application      │       │     Mobile Application   │
  │  - Content Script & DOM  │       │  - React 18 + Vite       │       │  - React Native + Expo   │
  │  - Lens Reading Tools    │       │  - Full Broadsheet Desk  │       │  - Touch Canvas & Haptics│
  │  - Handoff to Sanctuary  │       │  - SSE Streaming & Sync  │       │  - Offline-first Local DB│
  └──────────────────────────┘       └──────────────────────────┘       └──────────────────────────┘
```

| Surface | What it is | Where |
|---|---|---|
| **SETU Lens** | Chrome extension. Rewrites the page you are on — bionic text, line focus, reader view, read-aloud, and an AI agent that navigates the page for you. | `chrome-extension/` |
| **SETU Sanctuary** | Redesigned Broadsheet React workspace. Research any topic into an interactive talking mind map that explains any branch in your language, 8 cognitive tools that each look and work like the job they do, reflective support, a reward system, 3-step onboarding, command palette, and focus sessions. | `frontend/` |
| **SETU Mobile** | React Native + TypeScript Expo client. Four tabs for the places you work and a side menu for everything else, SVG touch mind maps whose branches are explained aloud on contact, all eight cognitive tools in their own workspaces, camera OCR, document Q&A, a breathing space, and ADHD focus timers. | `mobile/` |
| **SETU Engine** | The shared AI orchestration layer and MongoDB persistence service that all surfaces call transparently via `x-user-id`. | `backend/` |

---

## Clinical review — what the specialist changed

On **17 August 2026** the team reviewed SETU with **Dr. Prakhar Jain**. Several of his findings
contradicted assumptions the app was built on, so the web application was reworked against them.

| What the review established | What changed in `frontend/` |
|---|---|
| "Dyslexia" is three separate conditions — dyslexia (reading), **dyscalculia** (numbers), **dysgraphia** (writing). A person may have one, two, or all three. | Onboarding lists all three separately. A dedicated **Numbers** mode was added for dyscalculia. |
| Bigger fonts and bionic reading are **largely ineffective** — the difficulty is comprehension and decoding, not eyesight. | Bionic reading is demoted to an honestly-labelled comfort option. A new **Comprehension Support** section leads with audio and diagrams. |
| Mind maps only help if they carry **no text**, or if text is **spoken when the cursor reaches it**. | Branches speak on hover *and* on keyboard focus. **Picture mode** strips the prose and moves detail to the voice. Selecting a branch goes further and *explains* it, in the reader's own language. |
| Maths must be taught with **countable physical objects inside a story** — apples and bananas, the way special education does it. | **Numbers** mode renders the actual objects on screen, one step at a time, narrated aloud. |
| ADHD needs work made **interesting and gamified** — milestones and points, not long text reports. | A full reward engine: points, levels, streaks, and 11 milestones, summarised as one ring. |
| **Working memory** is impaired; long-term memory is not. | The **parking lot** (`Alt+P`) offloads an interrupting thought from anywhere without losing your place. |
| ~40% also experience anxiety or depression; add **AI listener support** so they can express frustration. | **Listen** — a reflective listener with a hardcoded crisis path and real helplines. |
| Design should be **calm, engaging, gamified**; no evidence for particular colours. | Rewards are quiet by default and can be switched off entirely without losing progress. |

### Read-aloud runs on Sarvam AI

Every "read to me" surface — mind map branches on hover, Numbers step narration, Listen replies,
mode results, document playback — goes through **Sarvam AI's Bulbul TTS** for a natural human
voice, defaulting to the female voice **Priya** on `bulbul:v3`. Thirteen other female voices are
selectable in Settings, each auditioning on click.

This is a functional requirement rather than polish. Audio is the primary accommodation for a
reader whose difficulty is decoding text, and a flat robotic voice is measurably harder to follow —
people simply stop using it. The key lives server-side only; the browser calls `/api/speech` and
never sees it.

Long passages are split on sentence boundaries and **pipelined** — the next clip is fetched while
the current one plays, so the first sentence starts in about a second instead of after the whole
passage has synthesised. Clips are cached on both sides, which matters because hovering across a
map re-requests the same handful of labels constantly.

**Without `SARVAM_API_KEY` everything still works** on the browser's built-in speech synthesis. The
engine says so explicitly (`fallbackToBrowser: true`) and the client switches engines rather than
leaving the user in silence — including mid-passage if Sarvam fails partway through.

### Eight modes, eight workspaces

The cognitive modes used to share one chrome: same list, same textarea, same button, same
column of headed paragraphs. They do genuinely different jobs, and printing all eight on
identical stationery made them read as one feature with a dropdown — and hid the
accommodation, because nothing on screen said that Numbers works differently from Simplify.

Each mode now carries a full identity: its own plate colour, its own CSS-drawn background
texture, the shape of its ask, the words on its button, and above all the layout of its
answer.

| Mode | Workspace | What that looks like |
|---|---|---|
| **Start** | Launch pad | One ignition card with the first ten minutes in large type and a real ten-minute clock, then a ladder whose rail fills as rungs are ticked |
| **Simplify** | Translation bench | Your text and the plain version side by side with a gutter between them, and a needle showing the reading level |
| **Learn** | Study deck | Concept cards, then a quiz dealt one card at a time — the rest are dots, so nothing has to be held in your head |
| **Meet** | The ledger | A real table: task, owner, due, priority, ticked off row by row |
| **Practice** | Rehearsal room | The conversation in the shape of a conversation — their line incoming, your reply outgoing, tone as a switch |
| **Write** | Copy desk | Ruled manuscript paper, the cut sentence struck through, the reason set in the margin |
| **Numbers** | The table | Countable objects on squared paper, one step at a time, narrated |
| **Guide** | The trail | Stations on a filling rail, with "you are here" and a success signal at each one |

Each lives in its own component under `frontend/src/components/modes/`; the identity and the
worked example live in `frontend/src/lib/modeCatalog.js`. Adding a mode means adding an
entry there and a stage component — not another branch in a shared switch.

Every mode opens on a hand-checked worked example rather than an empty state, so each one
can be understood, and demonstrated, without an API key.

### Selecting a branch explains it

Pointing at a branch reads it aloud. **Selecting** one asks the engine for a fresh
plain-language explanation of that idea — streamed into a panel beside the canvas, written
and spoken in whichever of the eleven languages is chosen, at one of three depths
(*Simplest*, *Plain*, *Deeper*).

Reading the branch's own note back was never an accommodation for someone who chose Tamil:
the note is in whatever language the map was built in, and hearing an English sentence
spoken at you is not translation. The explanation is generated per branch instead, and the
audio follows the explanation rather than the map text.

Answers are cached per branch, per depth, per language, and the request waits for the
selection to settle — clicking across a map to find the branch you meant costs one call,
not ten.

### Eleven Indian languages

SETU holds a conversation in **English, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi,
Odia, Punjabi, Tamil, and Telugu** — the full set Sarvam Bulbul can speak. One picker in Settings
switches everything at once: mind maps, mode results, the listener, chat replies, and the voice.

Changing only the voice would give you a Hindi speaker reading English sentences, so
`backend/config/languages.js` is the single source of truth for both halves — the Sarvam
`language_code` and the instruction that makes the model answer in that language. Voices are
multilingual, so language and voice stay independent choices.

Two details that matter in practice:

- **Schema enums stay English.** Effort levels, action-item priorities, and the `operation` value
  on each Numbers step are compared as literal strings by the client. A model that helpfully
  translates `"High"` would silently break priority badges and stop objects rendering. The language
  directive forbids translating enum values and JSON keys; the smoke test asserts it.
- **The chunker knows the danda.** `।` and `॥` end sentences in Devanagari, Bengali, Gujarati,
  Gurmukhi, and Odia. Without them a Hindi paragraph reads as one enormous sentence and gets cut
  mid-clause.

App chrome (buttons, menus) stays in English — this changes what SETU *writes and says*, not its
own labels. Full UI localisation is a separate piece of work.

**The crisis script is deliberately not translated.** Running a suicide-risk message through a
translation model is the worst possible place for a subtle error, and nobody here can verify eleven
versions. It stays in English, leads with phone numbers (which need no translation), and notes that
Tele-MANAS answers in 20+ Indian languages and KIRAN in 13. These strings want a professional human
translation before this ships to non-English users.

### Safety note on Listen

Crisis language is detected **server-side before any model call**, and answered from a fixed,
reviewed script carrying Tele-MANAS (14416), KIRAN, AASRA, and an international directory. A crisis
reply is never sampled from a model, never depends on the AI being reachable, and never scores
points. Journal entries are written to a local-only key and are **never** mirrored to MongoDB.

---

## Quick start

You need **Node 18+** and a **Google Gemini API key**. MongoDB is optional: without it the web
and mobile apps keep everything in local storage and the engine keeps working.

> **A Google AI Pro subscription is not an API key.** Google AI Pro (and Google One AI Premium)
> is a consumer plan for the Gemini app; it does not grant access to the Gemini API. Create a
> separate key at **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** — it has
> its own free tier, and enabling Cloud Billing on the key's Google Cloud project lifts the
> daily cap.

### 1. Configure

```bash
cp .env.example .env
```

Put your key and optional MongoDB URI in `.env`:

```env
GEMINI_API_KEY=your-gemini-api-key-here
MONGODB_URI=mongodb://127.0.0.1:27017/setu

# Natural read-aloud voice — https://dashboard.sarvam.ai/
# Optional: without it, read-aloud uses the browser's built-in voice.
SARVAM_API_KEY=your-sarvam-key-here
SARVAM_TTS_SPEAKER=priya
```

With no key at all the engine still starts and every mode degrades to the deterministic
offline rule engine, clearly labelled as such in the UI.

### Which models it uses

Two chains, picked per job rather than per request:

| Chain | Models (in order) | Used for |
|---|---|---|
| **Fast** | `gemini-3.7-flash` → `3.6-flash` → `3.5-flash` → `3.5-flash-lite` → `2.5-flash` → `2.5-flash-lite` | Everything a human is waiting on: the in-page agent, explanations, the cognitive modes, summaries |
| **Deep** | `gemini-3.1-pro-preview` → `2.5-pro` → falls through to Fast | Research and mind-map structuring, where the client has already drawn a placeholder |

Both are overridable with `GEMINI_MODEL_CHAIN` / `GEMINI_PRO_MODEL_CHAIN`. At boot SETU asks the
API which models your key can actually reach and skips the rest, so a retired or unreleased ID in
the chain costs nothing. Retired IDs (`gemini-1.5-*`, `gemini-2.0-*`) are rejected outright with a
warning even if you name them explicitly — Google has switched them off, so every request would 404.

Reasoning depth is capped at `low` on the fast chain (`GEMINI_THINKING_LEVEL`). Gemini 3 thinks by
default, and on an accessibility tool aimed at people who lose the thread while waiting, those
seconds cost more than the extra reasoning buys.

### 2. Start the Engine (Backend)

```bash
cd backend && npm install && npm start
```

Runs on `http://localhost:3000`.

### 3. Start the Web Sanctuary

```bash
cd frontend && npm install && npm run dev
```

Opens on `http://localhost:5173`.

### 4. Start the Mobile Application

```bash
cd mobile && npm install && npm start
```

- Run on Android Emulator: `npm run android`
- Run on Physical Phone: Scan QR code with the **Expo Go** app.

A phone in Expo Go finds the laptop's backend by itself — it reuses the host it
downloaded the bundle from. Leave **Settings → Engine address** empty unless you
are pointing it somewhere unusual. See [`mobile/README.md`](mobile/README.md)
for the full resolution order and the pre-build checks.

### 5. Load the Chrome Extension

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select the `chrome-extension/` folder

The extension works on every site immediately — no reload needed for tabs you
already have open. On first install it opens its options page so you can point
it at the engine (default `http://localhost:3000`); the status pill in the popup
shows whether that connection is live.

The reading tools — bionic text, line focus, reading ruler, reader view, themes,
auto-scroll, browser read-aloud — need no engine at all. Only the AI features
(Commander, the 3-step path, chart descriptions) do.

To package it for the Chrome Web Store:

```bash
cd chrome-extension && node build.js
```

That verifies the manifest's references, parses every shipped script, checks the
icons, and writes `dist/setu-lens-<version>.zip`. See
[`chrome-extension/README.md`](chrome-extension/README.md) for the architecture
and [`chrome-extension/STORE_LISTING.md`](chrome-extension/STORE_LISTING.md) for
the submission checklist.

---

## Production Deployment

### Single-Process Web & API Deploy
The engine automatically serves the built SPA from `/frontend/dist`:

```bash
cd frontend && npm run build
cd ../backend && npm start
```
The entire application is live on `http://localhost:3000`.

### Android Mobile Standalone APK / EAS Build
```bash
cd mobile
eas build -p android --profile preview
```

### Verifying a Deploy

```bash
cd backend && npm run smoke
```

Runs the 32-point automated smoke test verifying health probes, AI model round-trips, database
persistence, all 8 cognitive modes, document OCR, streaming endpoints, Sarvam voice synthesis
across all 11 languages, that Hindi and Tamil responses keep their schema enums in English,
reward-progress merge safety, and that crisis language routes to the fixed helpline script rather
than to a model.

Point it at a non-default port with `SETU_API=http://127.0.0.1:3999 npm run smoke`.

---

## License

Built for Capgemini Tech4Positive Futures 2026.
