/**
 * SETU Mobile — Offline-First Persistent Storage Service
 * ------------------------------------------------------
 * Wraps AsyncStorage for secure local-first persistence of user preferences,
 * stable anonymous x-user-id token, researched mind maps, conversation threads,
 * and cognitive mode history.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserPreferences,
  MindMapDocument,
  ConversationThread,
  ChatMessage,
  FocusSessionState,
} from '../types';
import { SEED_MIND_MAPS } from './seedData';
import { syncInBackground } from './api';
import { DEFAULT_LANGUAGE } from '../constants/languages';

export { getUserId, resetUserId, initIdentity, peekUserId } from './identity';
import { USER_ID_KEY as IDENTITY_KEY } from './identity';

const MAX_MAPS = 40;

const KEYS = {
  PREFERENCES: 'setu.mobile.preferences.v1',
  MIND_MAPS: 'setu.mobile.mind_maps.v1',
  CONVERSATIONS: 'setu.mobile.conversations.v1',
  MESSAGES_PREFIX: 'setu.mobile.messages.v1.',
  SUMMARIES: 'setu.mobile.summaries.v1',
  FOCUS_SESSION: 'setu.mobile.focus.v1',
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  profile: ['adhd', 'dyslexia'],
  font: 'serif',
  size: 'normal',
  theme: 'broadsheet',
  /**
   * Defaults to 'relaxed', not 'normal'.
   *
   * Extra letter spacing is the only typographic lever in this product with a
   * controlled result behind it (Zorzi et al., PNAS 2012: ~20% faster reading,
   * roughly half the errors, no training). Shipping it off by default meant
   * almost nobody ever received the one intervention the evidence supports.
   * 'normal' stays available for readers who prefer tight text.
   *
   * Matches DEFAULT_PREFS in the web client and the UserSettings schema.
   */
  spacing: 'relaxed',
  motion: 'movement',
  letterSpacing: 'normal',
  bionic: false,
  readingRuler: false,
  speechRate: 1.0,
  speechPitch: 1.0,
  hasCompletedOnboarding: false,

  /** Empty means "follow the build" — see constants/config.ts for why. */
  customApiUrl: '',

  language: DEFAULT_LANGUAGE,
  voice: null,
  speakOnTap: true,
  rewards: true,

  colorOverlay: 'none',
  colorOverlayOpacity: 0.12,

  mapEdgeStyle: 'bezier',
  mapNodeStyle: 'comfortable',
  mapTextScale: 1.0,
};

/**
 * Repair preferences saved by older builds.
 *
 * Early versions shipped the Android emulator bridge as the stored default, so
 * an upgraded install would keep pointing a real phone at 10.0.2.2 forever and
 * show "engine offline" with no obvious cause. An empty value now means "follow
 * the build", which is the right answer for almost everyone.
 *
 * Preferences are the one piece of state an upgrade must never break: they are
 * the accommodations, and an install that comes back with the defaults after an
 * update has effectively reset somebody's ability to use the app.
 */
function migratePreferences(stored: Partial<UserPreferences>): Partial<UserPreferences> {
  const next = { ...stored };

  if (typeof next.customApiUrl === 'string' && /10\.0\.2\.2|localhost|127\.0\.0\.1/.test(next.customApiUrl)) {
    next.customApiUrl = '';
  }

  // Three typefaces were offered that were never bundled — Atkinson
  // Hyperlegible, Lexend and OpenDyslexic — and all three rendered as the
  // serif. Anyone who picked one wanted something other than a serif, so they
  // land on the sans rather than being silently reset to the default.
  const legacyFonts = ['hyper', 'lexend', 'dyslexic'];
  if (typeof next.font === 'string' && legacyFonts.includes(next.font)) {
    next.font = 'sans';
  }

  return next;
}

export const DEFAULT_FOCUS_STATE: FocusSessionState = {
  isActive: false,
  isPaused: false,
  secondsRemaining: 25 * 60,
  totalSessionsCompleted: 0,
  isBreakDialogOpen: false,
};

/* -------------------------------------------------------------------------- */
/* Accessibility Preferences                                                  */
/* -------------------------------------------------------------------------- */

export async function getStoredPreferences(): Promise<UserPreferences> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PREFERENCES);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...migratePreferences(JSON.parse(raw)) };
  } catch (_) {
    return DEFAULT_PREFERENCES;
  }
}

export async function saveStoredPreferences(
  prefs: Partial<UserPreferences>
): Promise<UserPreferences> {
  const current = await getStoredPreferences();
  const updated = { ...current, ...prefs };
  await AsyncStorage.setItem(KEYS.PREFERENCES, JSON.stringify(updated));
  syncInBackground('POST', '/api/settings', updated);
  return updated;
}
export const savePreferences = saveStoredPreferences;

/* -------------------------------------------------------------------------- */
/* Mind Map Storage                                                           */
/* -------------------------------------------------------------------------- */

export async function getSavedMindMaps(): Promise<MindMapDocument[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.MIND_MAPS);
    if (!raw) {
      // First run: populate seed library
      await AsyncStorage.setItem(KEYS.MIND_MAPS, JSON.stringify(SEED_MIND_MAPS));
      return SEED_MIND_MAPS;
    }
    const maps: MindMapDocument[] = JSON.parse(raw);
    return maps.length > 0 ? maps : SEED_MIND_MAPS;
  } catch (_) {
    return SEED_MIND_MAPS;
  }
}

export async function saveMindMap(map: MindMapDocument): Promise<MindMapDocument[]> {
  const current = await getSavedMindMaps();
  const mapId = map.id || map._id || `map_${Date.now()}`;
  const mapWithId = {
    ...map,
    id: mapId,
    updatedAt: new Date().toISOString(),
  };

  const filtered = current.filter((m) => (m.id || m._id) !== mapId);
  const updated = [mapWithId, ...filtered].slice(0, MAX_MAPS);
  await AsyncStorage.setItem(KEYS.MIND_MAPS, JSON.stringify(updated));
  syncInBackground('POST', '/api/mindmaps', mapWithId);
  return updated;
}
export const saveMap = saveMindMap;

export async function deleteMindMap(id: string): Promise<MindMapDocument[]> {
  const current = await getSavedMindMaps();
  const updated = current.filter((m) => m.id !== id && m._id !== id);
  await AsyncStorage.setItem(KEYS.MIND_MAPS, JSON.stringify(updated));
  syncInBackground('DELETE', `/api/mindmaps/${encodeURIComponent(id)}`);
  return updated;
}
export const deleteMap = deleteMindMap;

export async function restoreReferenceLibrary(): Promise<MindMapDocument[]> {
  const current = await getSavedMindMaps();
  const userMaps = current.filter((m) => m.sourceType !== 'seed');
  
  const existingIds = new Set(current.map(m => m.id || m._id));
  const missing = SEED_MIND_MAPS.filter(m => !existingIds.has(m.id || m._id));
  
  const combined = [...userMaps, ...SEED_MIND_MAPS];
  await AsyncStorage.setItem(KEYS.MIND_MAPS, JSON.stringify(combined));
  
  for (const seed of missing) {
    syncInBackground('POST', '/api/mindmaps', seed);
  }
  return combined;
}
export const restoreSeedMaps = restoreReferenceLibrary;

export async function clearAllMaps(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.MIND_MAPS);
  syncInBackground('DELETE', '/api/mindmaps');
}
export const clearAllMindMaps = clearAllMaps;

/* -------------------------------------------------------------------------- */
/* Summary Storage                                                            */
/* -------------------------------------------------------------------------- */

export async function getSavedSummaries(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SUMMARIES);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export async function saveSummaryAndSync(summary: any): Promise<any[]> {
  const current = await getSavedSummaries();
  const updated = [summary, ...current.filter(s => s.id !== summary.id)];
  await AsyncStorage.setItem(KEYS.SUMMARIES, JSON.stringify(updated));
  syncInBackground('POST', '/api/summaries', summary);
  return updated;
}

/* -------------------------------------------------------------------------- */
/* Conversation History Storage                                               */
/* -------------------------------------------------------------------------- */

export async function getSavedConversations(): Promise<ConversationThread[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.CONVERSATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export async function saveConversation(
  conv: ConversationThread
): Promise<ConversationThread[]> {
  const current = await getSavedConversations();
  const filtered = current.filter((c) => c.id !== conv.id);
  const updated = [conv, ...filtered];
  await AsyncStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(updated));
  return updated;
}

export async function getConversationMessages(
  convId: string
): Promise<ChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(`${KEYS.MESSAGES_PREFIX}${convId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export async function saveConversationMessage(
  convId: string,
  message: ChatMessage
): Promise<ChatMessage[]> {
  const current = await getConversationMessages(convId);
  const updated = [...current, message];
  await AsyncStorage.setItem(
    `${KEYS.MESSAGES_PREFIX}${convId}`,
    JSON.stringify(updated)
  );
  return updated;
}

/* -------------------------------------------------------------------------- */
/* Focus Session State Storage                                                */
/* -------------------------------------------------------------------------- */

export async function getFocusSession(): Promise<FocusSessionState> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.FOCUS_SESSION);
    return raw ? { ...DEFAULT_FOCUS_STATE, ...JSON.parse(raw) } : DEFAULT_FOCUS_STATE;
  } catch (_) {
    return DEFAULT_FOCUS_STATE;
  }
}

export async function saveFocusSession(
  state: Partial<FocusSessionState>
): Promise<FocusSessionState> {
  const current = await getFocusSession();
  const updated = { ...current, ...state };
  await AsyncStorage.setItem(KEYS.FOCUS_SESSION, JSON.stringify(updated));
  return updated;
}

/* -------------------------------------------------------------------------- */
/* Wipe All Data                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Wipe what this install has stored.
 *
 * Offered in Settings because for this audience "delete it all" has to be one
 * button, not a support request — several of the people this is built for will
 * not risk using a tool they cannot fully erase.
 *
 * WHY THE IDENTITY IS KEPT BY DEFAULT
 * -----------------------------------
 * Maps, summaries, settings and progress are mirrored to the engine as they are
 * written, filed under the anonymous device id. Clearing that id along with
 * everything else does not delete the server copy — it makes it unreachable,
 * which is the one outcome strictly worse than leaving it alone: the data
 * survives and can no longer be found, by the user or by anyone acting for
 * them.
 *
 * So the id survives a local wipe unless the caller explicitly asks otherwise.
 * "Reset device ID" remains a separate, deliberate action, and it says what it
 * does.
 */
export async function clearAllLocalData(
  { keepIdentity = true }: { keepIdentity?: boolean } = {}
): Promise<void> {
  if (!keepIdentity) {
    await AsyncStorage.clear();
    return;
  }

  const identity = await AsyncStorage.getItem(IDENTITY_KEY);
  await AsyncStorage.clear();
  if (identity) await AsyncStorage.setItem(IDENTITY_KEY, identity);
}
