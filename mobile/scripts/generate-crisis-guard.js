#!/usr/bin/env node
/**
 * Generate the mobile offline crisis guard from the backend detector.
 *
 * WHY THIS IS GENERATED AND NOT WRITTEN BY HAND
 * ---------------------------------------------
 * `backend/services/crisisDetector.js` carries several hundred regular
 * expressions across 23 languages, in native script and romanised form. Two
 * properties of that file make hand-mirroring it the wrong move:
 *
 *  1. The patterns are subtle. `\b` is ASCII-only in JavaScript, so a leading
 *     word boundary silently makes a Devanagari or Tamil pattern unmatchable —
 *     the exact bug the backend suite exists to catch. A hand-copied mirror
 *     reintroduces that class of error with no test watching it.
 *  2. They will change. A mirror that drifts is worse than no mirror, because
 *     the team believes the guard is in place. Regenerating is one command, and
 *     `scripts/mobile-test.js` fails if the checked-in file is stale.
 *
 * Regex is serialised through `source` and `flags` rather than through a
 * template literal, so no escape sequence is ever re-parsed on the way out.
 *
 *   node scripts/generate-crisis-guard.js          # write the file
 *   node scripts/generate-crisis-guard.js --check  # exit 1 if it is stale
 */

const fs = require('fs');
const path = require('path');

const detector = require('../../backend/services/crisisDetector.js');

const OUT = path.join(__dirname, '..', 'src', 'services', 'crisisGuard.generated.ts');

/** `/foo/i` -> `new RegExp("foo", "i")`, with every backslash preserved verbatim. */
const re = (pattern) => `new RegExp(${JSON.stringify(pattern.source)}, ${JSON.stringify(pattern.flags)})`;

const block = (table) =>
  Object.entries(table)
    .map(([language, patterns]) => {
      const body = patterns.map((p) => `    ${re(p)},`).join('\n');
      return `  ${JSON.stringify(language)}: [\n${body}\n  ],`;
    })
    .join('\n');

const english = detector.CRISIS_SCRIPTS['en-IN'];

/*
 * The one deliberate divergence from the server copy.
 *
 * `stayingHere` on the server says "nothing you wrote leaves your browser" —
 * true on the web, and false on a phone, where the sentence has to name the
 * device instead. The claim itself still holds: a crisis turn handled offline
 * never leaves the handset, because there is by definition no engine to send it
 * to. Everything else is passed through unaltered.
 */
const STAYING_HERE_MOBILE =
  'You can keep this open as long as you like. What you wrote is on this phone only — with the engine unreachable there is nowhere for it to go.';

const source = `/**
 * Offline crisis guard — GENERATED FILE, DO NOT EDIT.
 *
 * Regenerate with:  node scripts/generate-crisis-guard.js
 * Source of truth:  backend/services/crisisDetector.js
 *
 * WHAT THIS IS FOR
 * ----------------
 * Crisis detection is a server responsibility and stays one: the engine runs
 * all three layers, including the classifier second pass that catches the
 * paraphrase no pattern list can. This file exists for the case the server
 * cannot cover — a phone with no signal, or an engine that is down.
 *
 * Without it, someone typing "I want to die" into the check-in on a train with
 * no bars receives "Cannot reach the SETU engine." That is the worst possible
 * reply to that sentence, and it is the reply the app gave before this file
 * existed. The whole point of detection running before any model call is that
 * the guarantee does not depend on a network, and on mobile the network is the
 * thing most likely to be absent.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * Layer 3 — the classifier — is not here and cannot be: it is a model call, and
 * this path runs precisely when model calls are impossible. So the offline
 * guard is strictly less sensitive than the online one. It is a floor under the
 * failure case, not a replacement for the server, and the online path is always
 * preferred when it is reachable.
 *
 * The response is fixed reviewed text with real helpline numbers, exactly as on
 * the server. Nothing here is generated, and nothing here is translated —
 * a machine-translated suicide script is the one error in this codebase that
 * costs most, so non-English users get the reviewed English wording plus the
 * numbers, which need no translation and are answered by people who speak
 * their language.
 */

export interface CrisisHelplineEntry {
  region: string;
  name: string;
  contact: string;
  hours: string;
}

export interface OfflineCrisisResponse {
  crisis: true;
  offline: true;
  language: string;
  requestedLanguage: string;
  languageNote: string | null;
  message: string;
  helplines: CrisisHelplineEntry[];
  immediateStep: string;
  stayingHere: string;
}

/* -------------------------------------------------------------------------- */
/* Layer 1 — first-person intent. Never suppressed.                           */
/* -------------------------------------------------------------------------- */

const INTENT_PATTERNS: Record<string, RegExp[]> = {
${block(detector.INTENT_PATTERNS)}
};

/* -------------------------------------------------------------------------- */
/* Layer 2 — bare keywords, suppressed by academic context.                    */
/* -------------------------------------------------------------------------- */

const KEYWORD_PATTERNS: Record<string, RegExp[]> = {
${block(detector.KEYWORD_PATTERNS)}
};

const ACADEMIC_CONTEXT = ${re(detector.ACADEMIC_CONTEXT)};

/** Languages carrying patterns. Exported so the suite can assert coverage. */
export const COVERED_LANGUAGES: string[] = ${JSON.stringify(detector.COVERED_LANGUAGES)};

const ALL_INTENT = Object.values(INTENT_PATTERNS).flat();
const ALL_KEYWORD = Object.values(KEYWORD_PATTERNS).flat();

/**
 * Pattern-only detection. Synchronous, deterministic, no key and no network.
 *
 * Every language's patterns are tested regardless of the language the user
 * picked: the picker says Hindi but a user typing English at 2am is common, and
 * a guard that only watches the selected language would miss them.
 */
export function detectCrisisOffline(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;

  if (ALL_INTENT.some((pattern) => pattern.test(value))) return true;
  if (ALL_KEYWORD.some((pattern) => pattern.test(value))) return !ACADEMIC_CONTEXT.test(value);
  return false;
}

/** Detection with provenance, for the suite. The message itself is never logged. */
export function inspectCrisisOffline(text: string): {
  matched: boolean;
  layer: 'intent' | 'keyword' | null;
  language: string | null;
} {
  const value = String(text || '');
  const miss = { matched: false, layer: null, language: null } as const;
  if (!value.trim()) return { ...miss };

  for (const [language, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(value))) {
      return { matched: true, layer: 'intent', language };
    }
  }

  if (ACADEMIC_CONTEXT.test(value)) return { ...miss };

  for (const [language, patterns] of Object.entries(KEYWORD_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(value))) {
      return { matched: true, layer: 'keyword', language };
    }
  }

  return { ...miss };
}

/* -------------------------------------------------------------------------- */
/* The fixed response                                                          */
/* -------------------------------------------------------------------------- */

const HELPLINES: CrisisHelplineEntry[] = ${JSON.stringify(
  [...detector.HELPLINES.india, ...detector.HELPLINES.international],
  null,
  2
)
  .split('\n')
  .join('\n')};

const REVIEWED_LANGUAGES = ${JSON.stringify(
  Object.entries(detector.CRISIS_SCRIPTS)
    .filter(([, script]) => script.reviewed)
    .map(([code]) => code)
)};

const ENGLISH_SCRIPT = {
  message: ${JSON.stringify(english.message)},
  immediateStep: ${JSON.stringify(english.immediateStep)},
  stayingHere: ${JSON.stringify(STAYING_HERE_MOBILE)},
};

const LANGUAGE_NOTE = ${JSON.stringify(
  'This message is shown in English so its wording stays exact — a mistranslated safety message is worse than an untranslated one. The helplines below answer in your language: Tele-MANAS covers 20+ Indian languages and KIRAN 13.'
)};

/**
 * Build the offline crisis reply.
 *
 * Only reviewed scripts are ever served, which today means English alone. A
 * non-English user receives the reviewed English wording, the note explaining
 * why, and the numbers — which are the part that actually helps and the part
 * that needs no translation.
 */
export function buildOfflineCrisisResponse(language: string = 'en-IN'): OfflineCrisisResponse {
  const requested = language || 'en-IN';
  const servedInEnglish = !REVIEWED_LANGUAGES.includes(requested);

  return {
    crisis: true,
    offline: true,
    language: servedInEnglish ? 'en-IN' : requested,
    requestedLanguage: requested,
    languageNote: servedInEnglish ? LANGUAGE_NOTE : null,
    message: ENGLISH_SCRIPT.message,
    helplines: HELPLINES,
    immediateStep: ENGLISH_SCRIPT.immediateStep,
    stayingHere: ENGLISH_SCRIPT.stayingHere,
  };
}
`;

const check = process.argv.includes('--check');
const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

if (check) {
  if (existing === source) {
    console.log('crisisGuard.generated.ts is up to date.');
    process.exit(0);
  }
  console.error(
    'crisisGuard.generated.ts is STALE.\n' +
      'The backend crisis detector has changed since it was generated.\n' +
      'Run: node scripts/generate-crisis-guard.js'
  );
  process.exit(1);
}

fs.writeFileSync(OUT, source, 'utf8');
const intents = Object.values(detector.INTENT_PATTERNS).flat().length;
const keywords = Object.values(detector.KEYWORD_PATTERNS).flat().length;
console.log(
  `Wrote ${path.relative(process.cwd(), OUT)} — ` +
    `${detector.COVERED_LANGUAGES.length} languages, ${intents} intent + ${keywords} keyword patterns.`
);
