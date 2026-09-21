# SETU — Audit Response & Handover

Working record of the response to `SETU-Clinical-Engineering-Audit.pdf` (45 pages, 5 Sept 2026).
Written to be picked up cold — by you, or by a new Claude session.

**Audit score: 67/100. Projected 86 after the fix plan.**
Three blocking defects named: English-only crisis detection, health data with no consent,
accessibility failures in an accessibility product.

Scope: **extension + web app + backend**. Mobile was deferred, then picked up — see §4g.

---

## 1. Decisions already made — do not re-litigate

| Question | Decision | Why it matters |
|---|---|---|
| Health data storage | **Everything in MongoDB. No auth, no consent enforcement, no encryption.** | Your call: "it is just a hackathon demo". Leaves audit Finding S2 open — see §6. |
| Reading Check results | **Sync to MongoDB automatically**, like everything else | You reversed an earlier browser-first choice: you want results retrievable to show judges live. It also enables the WPM-over-time chart. |
| International speech | **ElevenLabs**, not Whisper — both TTS (Multilingual v2) and STT (Scribe) | Sarvam stays primary for the 11 Indian languages: better on Indic audio and Hinglish code-mixing. |
| Scope | **All phases, including the akshara screener** | The audit calls the screener the single feature most likely to win a national hackathon. |
| Consent screen + delete button | **Still in scope** | Pure UI, ~3h, no security machinery. You didn't ask for these to be dropped. |

**Terminology note:** "on-device" means *in the browser on the phone or laptop they already have*.
The screener needs **no hardware** — screen plus built-in mic. Webcam eye-tracking is deliberately
**excluded from scoring** (published accuracy comes from research-grade trackers on 70 Czech children).

---

## 2. What is DONE

### Crisis detection — audit's #1, "the only defect that could hurt a real person"

- `backend/services/crisisDetector.js` — own module, three layers
- `backend/scripts/crisis-test.js` — 41 assertions, **no key/network/DB needed**

**Layer 1 — intent patterns.** First-person, per language, native script *and* romanised.
`मुझे मरना है`, `mujhe marna hai`, `enakku saaganum` (the exact miss the audit named),
`죽고 싶다`, `لا أريد العيش`. 23 languages.

**Layer 2 — keyword patterns.** Bare nouns (`suicide`, `आत्महत्या`) split out separately, because
they're indispensable ("I have been thinking about suicide for weeks" has no other marker) but fire
on "my essay is about suicide rates". Suppressed by `ACADEMIC_CONTEXT`. Intent patterns never are.

**Layer 3 — classifier second pass.** One yes/no, temp 0, 2.5s deadline, runs only when patterns
miss. Decides *whether* to show the fixed script, never writes a word of it — so "a crisis reply is
never sampled" still holds.

**Crisis script is NOT translated, deliberately.** Gated on `reviewed: true` per language; English is
the only reviewed entry. Non-English users get the English wording plus helpline *numbers*, which
need no translation and are staffed by people who speak their language. Machine-translating a
suicide script is the one place the audit says an error costs most.
**Viva answer:** "Detection in 23 languages, script pending professional review."

### Reading probe + akshara screener foundation

- `backend/services/readingAssessment.js` — scoring, banding, regulatory copy
- `backend/config/readingStimuli.js` — RAN grids, passages, nonwords, deletion items per script
- `backend/models/ReadingCheck.js`, `backend/controllers/readingCheckController.js`
- `backend/scripts/reading-test.js` — 58 assertions

Endpoints (all live, verified against MongoDB):

```
GET  /api/reading-check/stimuli?language=hi-IN&grade=3&task=oral-reading|ran|nonword|deletion
POST /api/reading-check          score + store
GET  /api/reading-check          history + precomputed chart series
GET  /api/reading-check/class    teacher roster, sorted by urgency
```

**The akshara claim is a test, not a slogan.** Naive normalisation folds कि and का both to क, so a
matra substitution — a characteristic error of a struggling Devanagari reader — would score as
*correct*:

```
naive strip:  कि -> "क"   का -> "क"    equal? true
ours:         कि -> "कि"  का -> "का"   equal? false
```

**Regulatory guardrails are asserted as tests.** No `dyslexia`, no percentage, no "test", no score
out of anything. Vocabulary is `band` — three values. Keeps it an educational screener rather than
regulated Medical Device Software under CDSCO's function-based guidance.

### Languages 11 → 23, ElevenLabs routing

- `backend/config/languages.js` is the source of truth; mirrored in
  `frontend/src/lib/languages.js` and `chrome-extension/shared/setu-config.js`
- `backend/services/elevenLabsService.js` — TTS + Scribe STT

**One asymmetry, and it is load-bearing:**

```
Indian language, no Sarvam key     -> ElevenLabs is a valid stand-in
International language, no EL key  -> nothing on the server can speak it
```

Sarvam rejects `ja-JP` outright rather than degrading, so it is never offered as an international
fallback. `pickTtsProvider` / `pickSttProvider` in `speechService.js` encode this.

### Accessibility — verified in a real browser, not just built

- `frontend/src/lib/useDialog.js` — focus trap, Escape, focus restore, scroll lock
- Retrofitted to all 5 dialogs **plus CommandPalette**, which had no dialog role at all
- Dynamic `<html lang>` + `dir`; `aria-live` + `aria-busy` on all three streaming surfaces

Verified live: forward wrap, backward wrap, stray-focus recapture, Escape close, scroll-lock
release, focus restored to the exact trigger button.

### Clinical — letter spacing and theme honesty

- Default `0.02em` → **`0.12em`** across extension and web (Zorzi et al., PNAS 2012: ~20% faster
  reading, roughly half the errors, no training)
- Extension slider was capped at `0.12em` — the tested dose was **not reachable even deliberately**.
  Now reaches `0.30em`
- Web default moved `normal` → `relaxed`
- "Dyslexia Friendly" → **"Calm Paper"**. The old name tells users the font is the accommodation,
  which is the myth that keeps schools buying font licences. Key stays `dyslexia` so nobody's stored
  setting resets
- Theme no longer collapses buttons into body text. `css.test.js` has **21 contrast assertions**
  (AA 4.5:1 text, WCAG 1.4.11 3:1 control borders)

### Extension on-demand loading — audit's "highest-leverage engineering change"

**473 KB -> 118 KB injected on every page.** The manifest now declares only
`setu-config`, `setu-core` and `main`; the other 15 files (363 KB) load the first
time a feature is actually used.

- `FEATURE_MODULES` in `shared/setu-config.js` — feature -> files, **order is
  load-bearing** (see below)
- `ensureFeature(key)` in `content/main.js` — de-duplicates concurrent loads,
  returns null rather than throwing on a refused injection
- `injectModules` in `background.js` — content scripts cannot call
  `chrome.scripting`, so it round-trips through the worker, which validates the
  requested paths against `FEATURE_MODULES` rather than trusting a page-world caller
- `test/modules.test.js` — 48 assertions on the contract

**Two binding hazards this exposed, both silent:**

1. `setu-core.js` captured `const icon = self.SETU_ICONS?.icon || (() => '')`
   **once at load**. With the icon set no longer eager, that would have bound the
   empty-string fallback permanently and blanked every icon in the product, with
   no error anywhere. Now resolved per call.
2. `eye-tracker.js` destructures `self.SETU_GAZE` at the top of its IIFE and
   throws if absent — so `gaze-detector.js` must precede it in the `eye` array.
   `memory.test.js` asserts this against the table now that the manifest no
   longer enforces it.

### Infrastructure

- Lockfiles committed (`.gitignore` line removed, all three generated)
- `.gitattributes` added — normalises to LF
- `ELEVENLABS_*` documented in `backend/.env.example`

---

## 3. Bugs found that were NOT in the audit

| Bug | Impact |
|---|---|
| **Alignment tie-breaking in the reading scorer** | A child who stopped a third of the way in scored **29%** accuracy instead of 79%, and would have been banded "worth a professional assessment" for reading slowly but carefully. Exactly the false alarm that makes a teacher stop trusting the tool. Found by live API testing — my unit test used a perfect prefix and was too weak to catch it. |
| **`missedWords` included the unread tail** | Handed a teacher 24 words "missed" by a child who ran out of time, burying the 3 real misreads. |
| **Extension test suite was red before any of this** | `agent.test.js:68` threw. `core.autocrlf=true` + no `.gitattributes` → CRLF checkout → regex anchored on `;\n` matched nothing. Green on CI, broken on every Windows clone. |
| **`<html lang>` was being clobbered** | `App.jsx` and `Settings.jsx` overwrote it with the raw code, so Odia emitted `lang="od-IN"` — not a valid tag, so a screen reader falls back to English and reads Odia unintelligibly. |
| **`requestAnimationFrame` for dialog focus** | rAF is *paused* in a backgrounded tab, so a dialog opened there never received focus. |
| **`/\bkms\b/` matched "500 kms"** | Kilometres, not self-harm slang — and this audience writes that constantly. |

**Audit claims that were already stale:** `.env`/`*.pem` are **clean in git history** (no key
rotation needed), 4 modals already had `role="dialog"`, ARIA count was 143 not 21, injected JS is
~478 KB not 536 KB.

---

## 4. What is LEFT

**Phase 4 remainder**
- [ ] Reading Check UI (record → transcribe → score → band)
- [ ] Progress chart page (the WPM-over-time demo beat)
- [ ] Dictate-first Write mode — `stt.js` and `VoiceInputButton` exist but are not assembled into
      the dysgraphia accommodation (audit Finding C3)

**Phase 2 — Mongo as system of record**
- [ ] Maps, prefs, progress, parking lot move server-first
- [ ] IndexedDB write-through cache for offline
- [ ] Migration for existing local data

**Phase 5 — Extension performance** — DONE, see §2.

**Phase 7 — Infrastructure**
- [ ] GitHub Actions CI (extension + backend + frontend build + axe-core)
- [ ] Self-hosted WOFF2 font subsets (Latin + Indic)
- [ ] PWA service worker + manifest
- [ ] Root LICENSE (three inconsistent answers today)
- [ ] Vitest on the frontend

**Phase 8 remainder**
- [ ] Teacher dashboard UI + printable referral note
- [ ] Akshara deletion, nonword, letter-sound task UIs
- [ ] Session flow combining tasks into one band

**Legal/UI (agreed, still pending)**
- [ ] Consent screen before onboarding step 1
- [ ] Working `DELETE /api/user` purging every collection, wired to Settings
- [ ] Privacy policy for the web app
- [ ] Accessibility statement

**Not started**
- [ ] Mind map accessible tree (`role="tree"` mirror) — audit Finding A4
- [ ] Reading-level-adaptive Simplify (needs the probe, which now exists)
- [ ] Exam accommodation pack (RPwD Act) — audit ranks this #3 of the unbuilt features

---

## 4b. Demo data (seeded, live in Atlas)

`npm run seed` in `backend/` fills MongoDB with everything a walkthrough needs.
Idempotent — re-running upserts rather than duplicating. `npm run seed:reset` wipes and re-seeds,
`npm run seed:clean` removes it. Everything is under `demo_user`.

To view it in the browser:
```js
localStorage.setItem('setu.user.v1', 'demo_user'); location.reload();
```

| Collection | Rows |
|---|---|
| readingchecks | 52 (44 class + 8 weekly sittings), 45 distinct learners |
| mindmaps | 6 |
| conversations / messages | 4 / 16 |
| documentfiles | 3 |
| savedsummaries | 4 |

**The class roster** — `GET /api/reading-check/class`

```
CLASS OF 45 — 4 worth assessment | 10 worth watching | 31 no concerns
```

That 4-of-45 is the pitch line verbatim, and it is close to the epidemiology the audit cites
(8% pooled SLD prevalence, ~80% of it dyslexia). Languages: 20 Hindi, 15 English, 6 Gujarati,
3 Tamil, 1 Kannada.

**The progress chart** — `GET /api/reading-check?type=probe`, learner `Aarav Patel (Class 2)`

```
week 1   24 wcpm  acc  77%   worth-assessment
week 2   29 wcpm  acc  93%   worth-assessment
week 3   33 wcpm  acc  88%   worth-assessment
week 4   38 wcpm  acc  90%   worth-assessment
week 5   42 wcpm  acc 100%   worth-watching
week 6   46 wcpm  acc 100%   worth-watching
week 7   51 wcpm  acc 100%   worth-watching
week 8   55 wcpm  acc 100%   worth-watching
```

He ends in "worth watching", NOT "no concerns" — deliberately. A chart showing a struggling reader
become a typical one in eight weeks is a claim nothing in this product can support, and
overclaiming there spends exactly the credibility the evidence slide is built on.

**Nothing is fabricated.** Every row is a generated transcript — a child misreading particular
words, or stopping partway — run through the real `scoreOralReading`. So every wcpm, accuracy, band
and missed-word list is internally consistent, and a judge who clicks into a row finds data that
holds up. Devanagari/Gujarati/Tamil/Kannada errors are **matra substitutions**, the characteristic
error of a struggling Indian reader, not random word swaps.

Seeding is deterministic (seeded PRNG), so the roster you rehearse on is the roster on stage.

---

## 4c. Agent autofill demo data

`chrome-extension/demo/` — one invented applicant, **Meera Rakeshbhai Solanki**, a 20-year-old
OBC student in Valsad. Chosen so PAN (Form 49A), an income certificate and a caste certificate
are all plausible applications for her, and so she is also the product's target user: a dyslexic
student entitled to RPwD exam accommodations.

```bash
node demo/seed-profile.js        # validates against the real catalogue, prints a paste snippet
```

The profile lives in `chrome.storage.local` (key `setuProfile`) **inside the browser** — not
MongoDB, not `chrome.storage.sync`. Nothing outside the browser can write it, so the script
validates and emits a snippet for the extension's service-worker console.

**Requires the autofill branch to be merged.** The script detects the missing module and says so.

Verified by round-tripping through the real module: 87% complete, **13 sensitive fields / 0
filled**, and 16 of 17 real government-form labels matched — with Aadhaar and PAN identified then
deliberately held back.

Government IDs ship empty by design. `--with-placeholders` adds stand-ins that are invalid by
construction (Aadhaar all-zeroes fails the Verhoeff checksum; `ZZZZZ0000Z` is not a valid PAN
shape) so a real portal rejects them. **The empty version is the better demo** — the agent fills
thirty-odd fields and stops at Aadhaar, which is worth saying out loud.

### Three gaps this testing found (fix after the merge — details in `demo/README.md`)

1. **No `familyIncome` field.** Income certificates, caste certificates and every scholarship ask
   for *family* income; the catalogue only has the applicant's own.
2. **`annualIncome`'s `avoid` rule is inconsistent.** It matches the literal `family income`, so
   "Annual Family Income" correctly declines but "Total Annual Income of Family" **fills personal
   income into a family-income box**. On a government form a wrong number is worse than a blank —
   it looks filled and gets submitted.
3. Smaller misses: `Sub-Caste` matches `category` (writes "OBC" into a sub-caste box), and
   `Bank Branch`, `Ration Card Number` and disability-percentage have no field at all.

---

## 4d. Final pre-deploy verification (2026-09-06)

**Backend.** All 13 GET endpoints 200. 40 concurrent mixed requests: 40 ok, 0 failed, 410ms.
**Eight AI features fired simultaneously** — simplify, start, numbers, guide, write, listen,
agent/plan, agent/explain — all 8 served by the model (not fallback), 0 failures.

**Extension — parallel feature use.** New `test/parallel.test.js`, 14 assertions. All 13 features
load simultaneously, each injected exactly once; five simultaneous requests for one feature inject
once and share an instance; a refused injection returns null without poisoning the others and can
be retried later; the worker allow-list admits only real feature modules.

**A race this found and fixed.** Shared-file de-duplication was per-feature, so six features
requested in the same tick all read `injectedFiles` before any had finished and all six asked for
`setu-icons.js` — 41 KB six times, ~205 KB wasted, undoing much of the on-demand change.
`injectFiles` now registers an in-flight promise **per file, synchronously before its first
await**, and a caller needing a file another is already fetching waits for that injection. The wait
also preserves ordering, which matters because `eye-tracker.js` throws if `gaze-detector.js` has
not run.

**Web app.** All 6 routes render, zero console errors. Every accessibility feature on at once —
high-contrast theme + Atkinson + large text + spacious spacing + motion-still + colour overlay +
Hindi + reading ruler + parking lot + focus timer — with **no horizontal scroll and nothing leaking
outside a scroller**, at both 1280px and 375px. Library renders 6 mind maps and 3 documents pulled
from Atlas.

**Agent from MongoDB** (merged state, verified in a worktree): fresh install pulls the seeded
applicant, worker-context direct fetch works, engine-unreachable falls back to the sample without
breaking, and an existing local profile is never overwritten by the network.

**Builds.** Extension 41 files -> 228.3 KB zip. Frontend builds clean.

---

## 4e. Mobile — clinical UI/UX pass (2026-09-06)

Scope corrected mid-task: "patients and doctors" means **one audience — dyslexic and ADHD users**
— designed with clinical reasoning about what actually helps them. Not a doctor-facing app.

**The dead setting.** `spacing` was stored in preferences and offered in Settings, and
`Typography.tsx` never read it — `letterSpacing` was set only on decorative kickers. A dyslexic
reader could move that control and nothing happened. The single most evidence-backed
accommodation in the product did not exist on mobile at all.

Now wired, as a fraction of font size (RN's `letterSpacing` is absolute, so a value tuned for 16pt
is invisible at 30pt): `relaxed` = 0.12em equivalent and is the new default, `spacious` = 0.18em.
Headings excluded — at 28pt+ the crowding this fixes is not present. Word spacing rises with it,
because widening letters alone makes word boundaries harder to find.

**Home leads with the camera.** The screen opened with four stat tiles — maps saved, focus
sessions, streak, points — and put the camera behind a secondary button. Backwards for both
conditions: in ADHD the deficit is task initiation, so opening onto a scoreboard asks for a choice
among thirteen things before doing any of them; for a dyslexic reader the highest-value action is
"make this page speak". A 96pt full-width target is now first on the screen, and the stats sit
below it labelled as what they are — app usage, not reading.

**Sync — all three surfaces now agree.**

| | engine | identity | languages | reading-check | profile |
|---|---|---|---|---|---|
| extension | setu-37hl | `x-user-id` | 23 | — | after merge |
| web | setu-37hl | `x-user-id` | 23 | via API | via API |
| mobile | setu-37hl | `x-user-id` | 23 | ✅ added | ✅ added |

Mobile's language table is generated from `backend/config/languages.js` — identical codes in
identical order, Odia's `bcp47` = `or-IN`, Arabic `dir: rtl`.

Verified against the live engine from mobile's own call paths: Gujarati stimuli (સૂરજ, Gujr, 29
words), 52 readings, the 61-field agent profile, 23 languages / 33 voices.

**Not done:** the wider IA restructure (tab count is still 6) and visual language pass. Mobile
cannot be run here — Expo needs a device or emulator — so this is typecheck-and-code-verified,
not visually verified.

---

## 4f. Mobile final check (2026-09-06)

```bash
cd mobile
npx expo-doctor              # 21/21
npx tsc --noEmit             # clean
node scripts/mobile-test.js  # 26 assertions
npx expo export --platform android   # 3277 modules
npx expo export --platform ios       # 3281 modules
```

**Three deployment blockers found and fixed.** `expo-doctor` was failing 3 of 21 checks:

1. **Missing peer dependencies** — `expo-asset` (required by expo-audio) and
   `react-native-worklets` (required by react-native-reanimated). The doctor's own words: *"Your
   app may crash outside of Expo Go without these dependencies."* This is the failure mode that
   survives every test in Expo Go and then dies in the release APK.
2. **`app.json` invalid for SDK 57** — the top-level `splash` key and `android.edgeToEdgeEnabled`
   are both out of the schema. Verified against the v57 docs; splash moved to the
   `expo-splash-screen` plugin (installed, it was not a dependency at all), edge-to-edge dropped
   since it is default from SDK 54.
3. **Six packages behind** — expo, expo-build-properties, expo-font, expo-image-picker,
   expo-sharing, react-native.

`expo install --fix` then pruned `babel-preset-expo` and broke the bundler; reinstalled.

**New `scripts/mobile-test.js`** — 26 assertions, no device or network. Covers the language table
against the engine (count, order, Odia's `bcp47`, Arabic `dir`, native-script voice samples), the
letter-spacing dose and its size-scaling, cross-surface defaults, one-engine/one-identity, all
three new endpoints, the themed-styles trap on all 9 screens, and navigation resolution.

**Limitation:** mobile cannot be run here — no emulator or device. A Metro bundle proves every
import resolves and nothing is syntactically broken; it does not prove the app looks right. The
spacing change touches every piece of text in the app, so run it on a phone before shipping.

---

## 4g. Mobile — safety, screener and deploy pass (2026-09-06)

Scope note: the earlier line "Mobile deliberately deferred" no longer holds. This
pass closed the gaps that mattered most and left an explicit list of what did not
get done, in `mobile/TODO.md`.

### The offline crisis guard — the defect with the highest cost

Detection ran server-side only. On a phone that means the guarantee held exactly
when the network did. Someone typing `I want to die` on a train with no bars
received **"Cannot reach the SETU engine."**

`mobile/src/services/crisisGuard.generated.ts` now runs the pattern layers on the
device, **before** the request rather than in the catch. Three things fall out of
that ordering, and all three matter:

- it works with no signal, which is what motivated it;
- helplines appear immediately instead of after a 120-second AI timeout;
- the entry is never transmitted, so the panel's claim that it stayed on the
  phone is literally true. It previously said that on *both* paths, which was
  false on the online one.

**Generated, not hand-mirrored.** `npm run generate:crisis` serialises the
patterns out of `backend/services/crisisDetector.js` through `source`/`flags`, so
no escape is ever re-parsed — the `\b`-is-ASCII-only trap cannot be reintroduced
by a copy. `--check` fails the suite if the checked-in file is stale.

Verified behaviourally against the backend's own fixtures: **176 risk phrases
detected with no network, 0 false alarms on 29 ordinary phrases, and agreement
with the engine on all 205.**

Layer 3 is deliberately absent. It is a model call, and this path exists for when
model calls are impossible — the device guard is a floor, never a ceiling.

### Reading Check reaches a surface

The akshara screener had endpoints, and mobile had the client methods, and
nothing called them. It now has a screen: grade, optional learner label, engine
passage, timed one-minute recording, Sarvam transcription, server-side scoring,
band + copy + disclaimer verbatim, missed words, progress chart.

Two decisions worth keeping:

- **The passage is rendered outside the themed `Text` component.** Every other
  string in the app goes through the reader's widened spacing and typeface. Doing
  that here would score unaided reading against text that is not unaided, and it
  would err in the flattering direction. `letterSpacing: 0`, asserted by the suite
  so nobody later "fixes the inconsistency".
- **The chart is not only a chart.** It carries a spoken summary and the same
  numbers as a readable table, and its y-axis starts at zero. An SVG line is
  invisible to a screen reader, and a cropped axis turns a four-word gain into a
  climb.

Verified end to end against a running engine through mobile's own request shapes:
a clean full reading scored 59 wcpm / 100% → *worth watching*; one that stopped a
third of the way in scored 18 wcpm / 95% → *worth a professional assessment*,
tail excluded from errors. Devanagari stimuli return in Devanagari.

### Three things that were quietly untrue

| | was | now |
|---|---|---|
| **Typefaces** | Settings offered "Atkinson Hyperlegible" and "Lexend"; `hyper` resolved to the platform sans and `lexend` fell through to the **serif** default | All three faces bundled (OFL, ~640 KB), each weight its own family — Android does not synthesise bold from one custom face |
| **"Delete all data"** | cleared AsyncStorage only, while maps/summaries/settings/progress mirror to the engine — and discarded the ID they are filed under, leaving the data **retained and unreachable** | ID preserved; the dialog names what stays on the server |
| **Privacy copy** | "a local anonymous token shared transparently across local engine requests" — reads as though nothing leaves the phone | Settings and onboarding both say what is sent, what is kept, and what never leaves the device |

The web app has loaded the genuine faces from Google Fonts since the beginning,
so mobile was the one surface of three that disagreed.

### Also found

- Home's camera hero used the statically imported `COLORS` **inside** a themed
  style factory, so it stayed cyan on the high-contrast ground — the one palette
  a low-vision reader depends on. The suite now catches this across every screen
  and component; the existing check only saw the cruder module-scope version.
- `services/networkMonitor.ts` was dead code that hard-coded `10.0.2.2`, the
  address the config layer deliberately migrates away from. Deleted.

### The blocker

**`https://setu-37hl.onrender.com` returns 503 "This service has been suspended
by its owner."** Not a cold start. It is the compiled-in default in
`constants/config.ts` and the `EXPO_PUBLIC_API_URL` on both the preview and
production EAS profiles, and a release build blocks cleartext HTTP so it cannot
fall back to a laptop. A build shipped today reaches nothing. `eas init` is also
still outstanding — there is no `extra.eas.projectId`, and it needs an Expo
account.

```bash
cd mobile
npm run typecheck                    # clean
npm test                             # 56 assertions
npx expo-doctor                      # 21/21
npx expo export --platform android   # 3,300 modules
npx expo export --platform ios       # clean
```

Still not run on hardware. Microphone, audio playback and the camera all cross
the native boundary, and the reading check depends on two of them.

---

## 5. Commands & gotchas

```bash
# Tests — none need a key, network, or database
node backend/scripts/crisis-test.js      # 41 assertions
node backend/scripts/reading-test.js     # 58 assertions
node chrome-extension/test/run.js        # all extension suites (incl. modules.test.js)
cd frontend && npm run build
```

```bash
# npm scripts (run from backend/)
npm run test:crisis
npm run test:reading
npm test                                 # both + the AI service suite
```

**MongoDB connects directly to the Atlas shards.**

`mongodb+srv://` makes the driver perform an SRV and a TXT lookup before it can reach any node, on
every connect. This machine's resolver refuses SRV (`ECONNREFUSED`), so startup paid for a failed
system lookup, a fallback lookup against 8.8.8.8, and then the driver repeating both — ~15 seconds.

`config/db.js` now derives the seed list that SRV resolves to and hands the driver *that*, so it
performs no DNS of its own. `MONGODB_DIRECT_URI` in `backend/.env` pins the shards and skips
discovery entirely.

```
mongodb+srv:// with SRV refused ......  ~15 s
derived seed list (automatic) ........   2.6 s
MONGODB_DIRECT_URI pinned ............   1.4 s
```

Same cluster, same replica set, same TLS — the seed list is what SRV resolves to. If Atlas ever
moves the shards the pinned URI goes stale, the engine degrades to local storage with a clear
error, and deleting the line makes it re-derive. A masked copy is logged at every boot.

`backend/.env.bak-before-direct-uri` is the pre-change backup — gitignored, delete when happy.

**Gotchas that have already cost time:**

- **`pkill` does not work on Windows processes here.** Use PowerShell:
  `Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
- **Bash heredocs eat backslashes.** `\b` becomes a raw 0x08 byte, `\\s` becomes `\s`. Use the
  Write/Edit tools for anything containing a regex. This has bitten three times.
- **`\b` is ASCII-only in JavaScript regex.** `/\bölmek/` and `/\bमरना/` can **never** match — no
  word boundary exists between two non-word characters. Native-script patterns must use bare
  substrings. The crisis suite asserts every pattern matches ≥1 fixture, which is what catches this.
- **CRLF.** `.gitattributes` now normalises to LF, but existing working-tree files may still be CRLF.
  Any regex anchored on `\n` should tolerate `\r?\n`.
- **`od-IN` is not a valid language tag.** Sarvam's spelling of Odia. Anything reaching a `lang=`
  attribute must go through `langAttr()`, which returns `or-IN`.
- **Sarvam v2/v3 speaker names are not interchangeable** — a mismatch 400s every request.

**Env keys needed:**

```
GEMINI_API_KEY=        # set
MONGODB_URI=           # set, connected
SARVAM_API_KEY=        # set — 11 Indian languages
ELEVENLABS_API_KEY=    # NOT SET — international languages fall back to browser voice
```

Sarvam currently returns `402 No credits available` — read-aloud falls back to browser speech,
which works but sounds markedly worse. Top it up or add an ElevenLabs key before demoing audio.

ElevenLabs free tier is ~10k credits/month total, and read-aloud is character-hungry. Clips are
cached server-side for 6 hours to keep repeated mind-map hovers off the meter. Enough for a demo,
not for a crowd.

---

## 6. The one open risk

With auth, consent and encryption off, the honest answer to the judge question
*"you're storing that a child has ADHD — where, and who consented?"* is weak. The audit lists it as
one of three questions that decide this track.

The consent screen and working delete button (still on the list in §4) are pure UI, ~3 hours, and
turn "it's in our database" into: *"we ask before we store anything, and there is one button that
deletes all of it."* That is the cheapest remaining credibility win in the project.

---

## 7. Demo material this work created

- **A real chart.** WPM over three sittings, live from MongoDB — the audit: *"a real chart with real
  children beats any architecture diagram."*
- **A teacher roster.** Class of N, sorted so flagged children are at the top.
- **The evidence slide.** Bionic reading demoted. Dyslexia fonts not claimed as treatment. Spacing
  raised to the tested magnitude with the citation. This is the differentiator against every other
  team.
- **The akshara demonstration.** कि vs का collapsing under naive normalisation — one slide, and it
  explains in ten seconds why every existing screener is wrong for an Indian child.
- **The line to say out loud:** *"We deliberately built an educational screener, not a diagnostic.
  Claiming diagnosis would make this regulated medical device software under CDSCO. What we claim is
  that a teacher can find the four children in a class of forty-five who should see someone."*
