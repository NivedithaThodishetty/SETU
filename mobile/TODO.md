# SETU Mobile — status

Living tracker for the Android/iOS client. See `README.md` for how to run and
build it.

---

## Done

### Foundation
- [x] Expo SDK 57 + React Native 0.86 + TypeScript project, Android package
      `com.setu.sanctuary`.
- [x] Broadsheet design tokens, typography scale, spacing, plate colours.
- [x] Engine address resolution — Settings override, then `EXPO_PUBLIC_API_URL`,
      then the Metro host in dev, then the deployed engine. Stored `10.0.2.2`
      values from older builds are migrated away, so an upgraded install on a
      real phone is not left pointing at a dead address.
- [x] Error boundary above the provider tree, so a render failure shows a
      readable screen instead of a white one.
- [x] `app.config.js` so cleartext HTTP is enabled for development and preview
      builds and blocked in production.
- [x] EAS profiles for development / preview APK / production bundle.

### State and services
- [x] Anonymous device identity in its own module, warmed at boot.
- [x] API client with central language stamping, soft reads, timeouts, abort
      forwarding, and background mirroring for local-first writes.
- [x] SSE chat streaming over XHR, since RN `fetch` has no readable body.
- [x] Offline-first storage for maps, summaries, conversations, preferences.
- [x] Device-only stores for the parking lot and the check-in journal.

### Accessibility
- [x] Sarvam Bulbul read-aloud with sentence chunking and a pipelined fetch, so
      audio starts in about a second; falls back to the device synthesiser
      mid-passage rather than stopping.
- [x] Sarvam Saaras dictation with real recording, a 60-second cap, and an
      honest message when the engine has no speech key.
- [x] Eleven languages driving the model, the voice and the dictation together,
      chosen during onboarding in native script.
- [x] Six page colours, seven tints at four strengths, five typefaces, three
      text sizes, three spacing densities, reduced motion, reading ruler.
- [x] Speak-on-tap for mind map branches, on by default.
- [x] Screen-reader labels and 44pt minimum targets across new surfaces.

### Features
- [x] Eight cognitive modes, including Numbers with countable-object rendering.
- [x] Listen: mood check-in, local journal, and the server's fixed crisis
      response rendered verbatim with dialable helplines.
- [x] Momentum: points, streaks, ranks, milestones, reward toasts, and a switch
      that silences the display without stopping the count.
- [x] Parking lot for working-memory offload.
- [x] Focus sessions on a wall-clock deadline, surviving backgrounding, with a
      working "take five" break.
- [x] Library documents tab — pick any file, upload, then simplify, map, study
      or hear it.
- [x] Copy and share to Markdown, plain outline, or JSON.

### Honesty
- [x] Removed the invented OCR paragraph that appeared when scanning failed.
- [x] Removed the invented mind map and the placeholder "Deep Dive" branch that
      appeared when research failed.
- [x] Removed the silent fall back to a worked example when a mode call failed.
- [x] Mode results now show when the engine answered from its offline rule
      engine, including when that means English instead of the chosen language.
- [x] Fixed the mind map research reader — it read `result.map`, which the
      engine never returns, so every researched map had no tree.

---

### Safety, honesty and measurement (2026-09-06)

- [x] **Offline crisis guard.** Risk detection now runs on the device before the
      request, not only server-side. Previously, someone typing "I want to die"
      with no signal received "Cannot reach the SETU engine." — the guarantee
      that detection precedes any model call evaporated exactly when the network
      did. `src/services/crisisGuard.generated.ts` is generated from
      `backend/services/crisisDetector.js` (`npm run generate:crisis`), so the
      172 patterns across 23 languages cannot drift; the suite fails if the
      checked-in copy is stale. Running before the request also means helplines
      appear immediately rather than after a two-minute AI timeout, and the entry
      is never transmitted — so the panel's promise that it stayed on the phone
      is literally true. The classifier second pass is deliberately absent: it is
      a model call, and this path exists for when model calls are impossible.
- [x] **Reading Check.** The akshara screener now has a mobile surface — grade
      and optional learner label, a passage from the engine, a timed one-minute
      recording, Sarvam transcription, server-side scoring, the band with its
      copy and the disclaimer verbatim, missed words, and a progress chart. The
      passage is deliberately rendered outside the themed `Text` component: the
      probe measures unaided reading, and scoring someone on widened text against
      norms collected on ordinary text produces a flattering number that means
      nothing. The chart carries a spoken summary and a readable table, because
      an SVG line is invisible to a screen reader.
- [x] **The typefaces are real.** Atkinson Hyperlegible, Lexend and Source Serif 4
      are bundled (OFL, ~640 KB). `hyper` used to resolve to the platform sans and
      `lexend` fell through to the *serif* default — so picking the rounded sans
      built for reading fluency gave you newsprint. Each weight is registered as
      its own family, because Android does not synthesise bold from a single
      custom face and headings would otherwise flatten silently.
- [x] **"Delete all data" no longer overclaims.** It cleared AsyncStorage only,
      while maps, summaries, settings and progress are mirrored to the engine —
      and it discarded the anonymous ID those copies are filed under, so pressing
      it left the data on the server *and* made it unreachable. The ID is now
      preserved, and the dialog says what stays behind.
- [x] Settings and onboarding say where data actually goes. The old line — "a
      local anonymous token shared transparently across local engine requests" —
      read as though nothing left the phone.
- [x] Home's camera hero used the statically imported palette inside a themed
      style factory, so it stayed cyan on the high-contrast ground. The suite now
      catches that class of bug across every screen and component.
- [x] Removed `services/networkMonitor.ts` — dead code, and it hard-coded the
      emulator bridge the config layer deliberately migrates away from.

---

## Verified

```bash
npx tsc --noEmit                     # clean
node scripts/mobile-test.js          # 56 assertions, static
node scripts/feature-check.js        # 48 assertions, live against an engine
npx expo-doctor                      # 20/21 — see below
npx expo export --platform android   # 5.8 MB Hermes bundle, six faces bundled
```

`feature-check.js` is the half `mobile-test.js` cannot do. Static checks caught
every regression the shell merge introduced, but they never send a request, so
a screen wired correctly to an endpoint whose response shape has moved reads as
passing right up until a spinner hangs on a judge's phone. It sends the request
each screen sends — same path, body, headers and `language` stamp — and asserts
the exact fields that screen destructures. **48/48 in both `en-IN` and
`hi-IN`**: mind map, all eight cognitive modes, Listen, Reading Check, progress,
settings, the voice catalogue and summarise.

It deliberately does not assert item counts. The engine runs on free model
tiers that return three steps one minute and five the next, and a suite that
fails for reasons nobody can fix is a suite everyone learns to ignore.

`expo-doctor` is 20/21 on one patch mismatch — `expo` is 57.0.20, the SDK wants
57.0.21. Left alone on purpose: the app bundles, typechecks and passes
everything on the tree as it stands, and re-resolving dependencies to gain a
patch would invalidate exactly that evidence. `npx expo install --check` fixes
it when there is time to re-verify afterwards.

The crisis guard is verified behaviourally, not just structurally: it detects
all 176 risk phrases in the backend's own fixture corpus with no network, raises
no false alarm on 29 ordinary ones, and agrees with the engine on all 205.

Structural sweeps that found nothing, recorded so they are not redone blindly:
every `styles.X` reference resolves to a defined key (React Native renders an
undefined key as no style, silently); no module-scope `StyleSheet.create`
captures a palette value, which would freeze one theme in place; all 13
`navigate()` targets resolve to a registered route; all 14 screens are routed;
all nine modes dispatch and render.

Reading Check verified end to end against a running engine through mobile's own
request shapes — stimuli, submit and history, in English and Devanagari. A clean
full reading scored 59 wcpm / 100% → *worth watching*; a reading that stopped a
third of the way in scored 18 wcpm / 95% → *worth a professional assessment*,
with the unread tail correctly reported separately rather than counted as errors.

---

## Not done

- [ ] **A cold mind map took 87s, against a 120s client ceiling.** Measured
      against a local engine with grounding on (`GEMINI_WEB_SEARCH=true`); the
      same topic came back in 0.1s once cached. `TIMEOUTS.ai` in
      `services/api.ts` is 120000, so a cold map on a slower day — or a
      throttled key — lands the user on "the engine took too long to answer"
      for the app's headline feature. `StagedLoader` at least names the stage
      rather than spinning blankly. Before a demo, either warm the exact topic
      being shown, or turn grounding off for the session.
- [ ] **Run on a physical device.** Everything above is typechecked, bundled and
      verified against the real backend, but no build has been installed on
      hardware in this pass. Microphone recording, audio playback and the
      camera all cross the native boundary and want a real device before
      anyone relies on them.
- [ ] **The hosted engine is suspended.** `https://setu-37hl.onrender.com`
      returns 503 "This service has been suspended by its owner" — not a cold
      start. It is the compiled-in default in `constants/config.ts` and the
      `EXPO_PUBLIC_API_URL` on both the preview and production EAS profiles, and
      a release build blocks cleartext HTTP, so it cannot fall back to a laptop.
      **A build shipped today reaches nothing.** Resume the Render service or
      point those three places at a live HTTPS engine before building.
- [ ] **`eas init`** to attach a project id, needed before the first cloud build.
      There is no `extra.eas.projectId` in the config; this needs an Expo account
      and cannot be done for you.
- [ ] Offline queue for writes made while the engine is unreachable; today they
      are kept locally and mirrored only on the next successful call.
- [ ] Push notifications for focus session completion when the app is closed.
- [ ] Localised interface chrome. The twenty-three languages cover what the model
      says and what the voice reads; the buttons and labels are still English.
- [ ] A crisis script reviewed in any language other than English. The structure
      is there and gated on `reviewed: true` per language — detection is already
      multilingual, only the wording is not.
- [ ] The RAN, nonword and phoneme-deletion tasks. The engine serves all four;
      mobile administers oral reading only.
