/**
 * SETU Mobile — anonymous device identity.
 *
 * One stable token per install, sent as `x-user-id` on every request. There is
 * no account, no email, and no password anywhere in SETU: the audience includes
 * people who will not disclose a disability to an employer, so the design point
 * is that nothing on the server can be tied back to a person.
 *
 * Lives in its own module rather than in storage.ts because the API client needs
 * it on every call, and routing that through the storage layer — which itself
 * calls the API to mirror writes — closes an import cycle.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Exported so a local wipe can preserve it deliberately.
 *
 * See `clearAllLocalData` — dropping this key does not delete the server copy,
 * it strands it.
 */
export const USER_ID_KEY = 'setu.mobile.user_id.v1';

let cachedUserId: string | null = null;

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 16; i += 1) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `u_mob_${Date.now().toString(36)}_${rand}`;
}

/**
 * Read the token, minting one on first run.
 *
 * Callers that cannot await — request headers, mostly — use `peekUserId` after
 * `initIdentity` has run at boot.
 */
export async function getUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  try {
    const stored = await AsyncStorage.getItem(USER_ID_KEY);
    if (stored) {
      cachedUserId = stored;
      return stored;
    }
  } catch (_) {
    /* storage unavailable — fall through and mint a session-only id */
  }

  const fresh = generateId();
  cachedUserId = fresh;
  try {
    await AsyncStorage.setItem(USER_ID_KEY, fresh);
  } catch (_) {
    /* the in-memory id still keeps this session coherent */
  }
  return fresh;
}

/** Warm the cache so synchronous callers have something real to send. */
export async function initIdentity(): Promise<string> {
  return getUserId();
}

/**
 * The cached token, or a placeholder if identity has not loaded yet.
 *
 * The placeholder is deliberately obvious rather than empty: a request that
 * slips out before boot completes should be traceable in server logs, not
 * silently attributed to whatever the backend does with a blank header.
 */
export function peekUserId(): string {
  return cachedUserId || 'u_mob_pending';
}

export async function resetUserId(): Promise<string> {
  const fresh = generateId();
  cachedUserId = fresh;
  try {
    await AsyncStorage.setItem(USER_ID_KEY, fresh);
  } catch (_) {}
  return fresh;
}
