/**
 * Stable per-browser identity.
 *
 * SETU has no accounts by design — nothing to sign up for, nothing to remember.
 * But the engine still needs to know which library, which conversations, and
 * which settings belong to this browser, otherwise every visitor writes into one
 * shared `anonymous_user` bucket in MongoDB and sees each other's maps.
 *
 * So we mint one opaque random id, keep it in localStorage, and send it as
 * `x-user-id`. It identifies a browser, not a person: no email, no name, nothing
 * that survives clearing site data.
 */

const USER_KEY = 'setu.user.v1';

/** Storage can throw under Tracking Prevention, private mode, or sandboxed iframes. */
let storageWorks = null;
let cachedId = null;

function canUseStorage() {
  if (storageWorks !== null) return storageWorks;
  try {
    if (typeof window === 'undefined') {
      storageWorks = false;
      return false;
    }
    const probe = '__setu_id_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    storageWorks = true;
  } catch (_) {
    storageWorks = false;
  }
  return storageWorks;
}

function mintId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    }
  } catch (_) {
    /* fall through to Math.random */
  }
  return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The id for this browser. Stable across reloads whenever storage is available,
 * and stable for the lifetime of the tab when it is not.
 */
export function getUserId() {
  if (cachedId) return cachedId;

  if (canUseStorage()) {
    try {
      const existing = window.localStorage.getItem(USER_KEY);
      if (existing) {
        cachedId = existing;
        return cachedId;
      }
    } catch (_) {
      /* fall through and mint */
    }
  }

  cachedId = mintId();

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(USER_KEY, cachedId);
    } catch (_) {
      /* memory-only for this session */
    }
  }

  return cachedId;
}

/** Wipes the identity — used by "delete everything" in Settings. */
export function resetUserId() {
  cachedId = null;
  if (canUseStorage()) {
    try {
      window.localStorage.removeItem(USER_KEY);
    } catch (_) {
      /* nothing to clean up */
    }
  }
  return getUserId();
}
