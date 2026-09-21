/**
 * SETU Broadsheet Storage & Preferences Module
 * --------------------------------------------
 * Resilient Multi-Tier Storage Engine:
 *  1. Safe LocalStorage Detection (respects browser Tracking Prevention, private mode, and sandboxed iframes)
 *  2. In-Memory Resilient Fallback (ensures smooth UI operations without throwing Tracking Prevention errors)
 *  3. Seamless MongoDB Cloud/Local Synchronization
 *
 * Writes are local-first: the browser copy is the source of truth for the UI and
 * the MongoDB mirror is best-effort, so the app stays fully usable with the
 * engine offline.
 */

import { syncInBackground } from './api';
import { SEED_MAPS } from './seedData';
import { resolveLanguage, langAttr, langDir } from './languages';

const MAPS_KEY = 'setu.maps.v1';
const PREFS_KEY = 'setu.prefs.v1';
const SEEDED_KEY = 'setu.seeded.v1';
const MAX_MAPS = 40;

export { DEFAULT_WORKED_MAP } from './seedData';

/* -------------------------------------------------------------------------- */
/* Safe Storage Adapter (Tracking Prevention & Private Mode Resilient)        */
/* -------------------------------------------------------------------------- */

let storageSupported = null;
const inMemoryStore = new Map();

/**
 * Checks if browser storage is accessible without triggering repeated Tracking Prevention errors.
 */
function isStorageAvailable() {
  if (storageSupported !== null) return storageSupported;

  try {
    if (typeof window === 'undefined') {
      storageSupported = false;
      return false;
    }
    const testKey = '__setu_storage_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    storageSupported = true;
    return true;
  } catch (_) {
    // Tracking Prevention, 3rd-party cookie blocking, sandboxed iframe, or quota reached
    storageSupported = false;
    return false;
  }
}

function read(key, fallback) {
  if (isStorageAvailable()) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      // Fallback to memory
    }
  }

  if (inMemoryStore.has(key)) {
    return inMemoryStore.get(key);
  }
  return fallback;
}

function write(key, value) {
  // Always update in-memory store for instant sync
  inMemoryStore.set(key, value);

  if (isStorageAvailable()) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return true; // Still preserved in-memory
    }
  }
  return true;
}

function remove(key) {
  inMemoryStore.delete(key);
  if (isStorageAvailable()) {
    try {
      window.localStorage.removeItem(key);
    } catch (_) {}
  }
}

/* ----------------------------- Maps ----------------------------- */

/**
 * All maps for this browser, newest first.
 *
 * On first run the library is seeded with the reference maps in seedData so the
 * app never opens on an empty shelf. Seeding is recorded separately from the map
 * list, so deleting every map genuinely leaves it empty rather than silently
 * restoring the seeds on the next read.
 */
export function listMaps() {
  const maps = read(MAPS_KEY, null);

  if (Array.isArray(maps)) return maps;

  if (read(SEEDED_KEY, false)) {
    // Seeded before, then emptied — respect that.
    write(MAPS_KEY, []);
    return [];
  }

  const seeds = SEED_MAPS.map((map) => ({ ...map }));
  write(MAPS_KEY, seeds);
  write(SEEDED_KEY, true);
  return seeds;
}

/**
 * Persist a map locally and mirror it to MongoDB in the background.
 *
 * Always returns the stored record — callers must use the returned `id` rather
 * than the id they passed in, because a map arriving straight from the engine
 * may carry no id at all and one is minted here.
 */
export function saveMap(map) {
  if (!map?.title || !map?.root) return null;

  const maps = listMaps();
  const record = {
    id: map.id || `map_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: map.title,
    topic: map.topic || map.title,
    summary: map.summary || '',
    keyFacts: map.keyFacts || [],
    followUps: map.followUps || [],
    sources: map.sources || [],
    grounded: Boolean(map.grounded),
    root: map.root,
    isLensHandoff: Boolean(map.isLensHandoff),
    isSeed: Boolean(map.isSeed),
    createdAt: map.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const existing = maps.findIndex((m) => m.id === record.id || m.title === record.title);
  if (existing !== -1) {
    record.id = maps[existing].id;
    record.createdAt = maps[existing].createdAt;
    maps.splice(existing, 1);
  }

  const updatedMaps = [record, ...maps].slice(0, MAX_MAPS);
  write(MAPS_KEY, updatedMaps);

  syncInBackground('POST', '/api/mindmaps', record);

  return record;
}

export function getMap(id) {
  return listMaps().find((map) => map.id === id) || null;
}

export function deleteMap(id) {
  const filtered = listMaps().filter((map) => map.id !== id);
  write(MAPS_KEY, filtered);
  syncInBackground('DELETE', `/api/mindmaps/${encodeURIComponent(id)}`);
}

export function clearAllMaps() {
  write(MAPS_KEY, []);
  syncInBackground('DELETE', '/api/mindmaps');
}

/**
 * Put the reference library back without touching the user's own maps.
 * Exposed in Settings so a cleared demo can be reset before a walkthrough.
 */
export function restoreSeedMaps() {
  const existing = listMaps();
  const own = existing.filter((map) => !map.isSeed);
  const missing = SEED_MAPS.filter((seed) => !existing.some((map) => map.id === seed.id));

  const merged = [...own, ...missing.map((map) => ({ ...map }))]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, MAX_MAPS);

  write(MAPS_KEY, merged);
  write(SEEDED_KEY, true);

  for (const seed of missing) syncInBackground('POST', '/api/mindmaps', seed);

  return merged;
}

/* --------------------------- Preferences --------------------------- */

export const FONT_STACKS = {
  serif: '"Source Serif 4", Georgia, serif',
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  hyper: '"Atkinson Hyperlegible", Verdana, sans-serif',
  lexend: '"Lexend", system-ui, sans-serif',
  dyslexic: '"Lexend", "Atkinson Hyperlegible", sans-serif'
};

export const SIZE_SCALE = {
  normal: 1,
  comfortable: 1.1,
  large: 1.22
};

export const THEMES = {
  broadsheet: 'Broadsheet Light',
  cream: 'Warm Parchment (Anti-Glare)',
  pastel: 'Calming Blue (ADHD Focus)',
  sage: 'Muted Sage Green',
  velvet: 'Velvet Dark',
  contrast: 'High-Contrast Yellow/Black'
};

export const DEFAULT_PREFS = {
  profile: [],
  theme: 'broadsheet', // 'broadsheet' | 'cream' | 'pastel' | 'sage' | 'velvet' | 'contrast'
  font: 'serif', // 'serif' | 'system' | 'hyper' | 'lexend' | 'dyslexic'
  textSize: 'normal', // 'normal' | 'comfortable' | 'large'
  /**
   * Letter and word spacing.
   *
   * Defaults to 'relaxed', not 'normal'. Extra letter spacing is the only
   * typographic lever here with a controlled result behind it — Zorzi et al.
   * (PNAS 2012) found ~20% faster reading and roughly half the errors in
   * dyslexic children, with no training — and shipping it off by default meant
   * almost nobody ever received the one intervention the evidence supports.
   * 'normal' remains available for readers who prefer tight text.
   */
  spacing: 'relaxed', // 'normal' | 'relaxed' | 'spacious'
  motion: 'move', // 'move' | 'still'
  readingRuler: false,
  bionicReading: false,
  onboardingDone: false,

  /**
   * Speak a mind-map node when the cursor or keyboard focus lands on it.
   *
   * On by default. A map whose branches are silent text is, for a reader whose
   * difficulty is decoding rather than eyesight, just a differently-shaped wall
   * of words — pairing each node with audio on interaction is what makes the
   * diagram readable at all.
   */
  speakOnHover: true,

  /**
   * Draw nodes as a symbol with a short label instead of a text block.
   *
   * Pairs with speakOnHover: the picture carries the structure, the voice
   * carries the detail, and neither depends on sustained reading.
   */
  pictureMode: false,

  /** MindMap Canvas & Layout Customization Preferences */
  mapColorTheme: 'broadsheet', // 'broadsheet' | 'cyberpunk' | 'nature' | 'sunset' | 'monochrome' | 'pastel'
  mapEdgeStyle: 'bezier', // 'bezier' | 'straight' | 'orthogonal' | 'arc'
  mapGridPattern: 'dots', // 'dots' | 'grid' | 'isometric' | 'crosses' | 'clean'
  mapNodeStyle: 'comfortable', // 'comfortable' | 'compact' | 'glass' | 'pill'
  mapEdgeWidth: 2.2, // 1.4 | 2.2 | 3.2
  mapTextScale: 1.0, // 0.85 | 1.0 | 1.15 | 1.3
  chatPanelWidth: 392,
  chatPanelSide: 'left', // 'left' | 'right'
  zenMode: false,
  colorOverlay: 'none', // 'none' | 'peach' | 'rose' | 'mint' | 'aqua' | 'lavender' | 'yellow'
  colorOverlayOpacity: 0.12,

  /** Show points, streaks, and milestones. Counting continues either way. */
  rewards: true,

  /**
   * Sarvam AI speaker id for read-aloud, e.g. 'priya'.
   *
   * Null follows whatever the engine is configured to use, so a deployment can
   * change the house voice without every existing browser pinning the old one.
   */
  voice: null,

  /** Speaking pace, 0.5–2.0. Maps to Sarvam `pace` and browser `rate`. */
  speechRate: 1,

  /**
   * Conversation language, e.g. 'hi-IN'.
   *
   * Drives both halves at once: the language the AI answers in, and the language
   * the audio is synthesised in. Setting only one of those gives you a Hindi
   * voice reading English sentences, which helps nobody.
   */
  language: 'en-IN'
};

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...read(PREFS_KEY, {}) };
}

export function savePrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  write(PREFS_KEY, next);
  applyPrefs(next);

  syncInBackground('POST', '/api/settings', next);

  return next;
}

/** Reflect reading preferences onto <html> so CSS variables, themes, and fonts act globally. */
export function applyPrefs(prefs = getPrefs()) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  /*
   * Declare the document's language, and its direction.
   *
   * index.html hardcodes lang="en" and nothing used to change it, so when SETU
   * did the thing it is proudest of — explaining a branch in Hindi, or Tamil, or
   * Odia — a screen reader received Devanagari or Tamil script inside an
   * English-declared document and pronounced it with an English voice engine.
   * The output is not merely accented, it is unintelligible. That is a WCAG 2.1
   * 3.1.2 (Language of Parts, AA) failure, and it broke the headline feature for
   * exactly the users who most need it.
   *
   * `langAttr` rather than the raw code: SETU's internal code for Odia is
   * 'od-IN', which is what Sarvam wants but is not a valid BCP-47 tag. Setting
   * it here would leave assistive technology with nothing usable and it would
   * fall back to the document default — the same bug, one layer down.
   *
   * Per-element `lang` is still set on generated content, because a mixed page
   * needs both: this establishes the default, and the panels override it.
   */
  const language = resolveLanguage(prefs.language);
  root.setAttribute('lang', langAttr(language.code));
  root.setAttribute('dir', langDir(language.code));

  // Theme classes
  root.classList.remove(
    'theme-broadsheet',
    'theme-cream',
    'theme-pastel',
    'theme-sage',
    'theme-velvet',
    'theme-contrast'
  );
  if (prefs.theme && prefs.theme !== 'broadsheet') {
    root.classList.add(`theme-${prefs.theme}`);
  }

  // Font classes
  root.classList.remove('font-serif', 'font-system', 'font-hyper', 'font-lexend', 'font-dyslexic');
  if (prefs.font === 'system') root.classList.add('font-system');
  else if (prefs.font === 'hyper') root.classList.add('font-hyper');
  else if (prefs.font === 'lexend') root.classList.add('font-lexend');
  else if (prefs.font === 'dyslexic') root.classList.add('font-dyslexic');
  else root.classList.add('font-serif');

  // Text size classes
  root.classList.remove('text-normal', 'text-comfortable', 'text-large');
  if (prefs.textSize === 'comfortable') root.classList.add('text-comfortable');
  else if (prefs.textSize === 'large') root.classList.add('text-large');
  else root.classList.add('text-normal');

  // Spacing classes
  root.classList.remove('spacing-normal', 'spacing-relaxed', 'spacing-spacious');
  if (prefs.spacing === 'relaxed') root.classList.add('spacing-relaxed');
  else if (prefs.spacing === 'spacious') root.classList.add('spacing-spacious');

  // Color tint overlay for Irlen / visual stress
  if (prefs.colorOverlay && prefs.colorOverlay !== 'none') {
    root.setAttribute('data-color-overlay', prefs.colorOverlay);
    root.style.setProperty('--overlay-opacity', String(prefs.colorOverlayOpacity || 0.12));
  } else {
    root.removeAttribute('data-color-overlay');
    root.style.removeProperty('--overlay-opacity');
  }

  // Motion class
  try {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefs.motion === 'still' || prefersReduced) {
      root.classList.add('motion-still');
      root.style.setProperty('scroll-behavior', 'auto');
    } else {
      root.classList.remove('motion-still');
      root.style.removeProperty('scroll-behavior');
    }
  } catch (_) {}
}
