/**
 * SETU Mobile — Runtime configuration.
 *
 * Where the app looks for the SETU engine, resolved once at import time.
 *
 * The order below exists because the same binary has to work in four places
 * that disagree about what "localhost" means: an Android emulator (where the
 * host machine is 10.0.2.2), a physical phone in Expo Go on the same Wi-Fi
 * (where it is the laptop's LAN address), a release APK on a stranger's phone
 * (where there is no laptop at all), and a judge's device pointed at a tunnel
 * URL typed into Settings. Guessing wrong in the release case is the difference
 * between an app that works and one that shows "engine offline" forever, so the
 * production default is a real deployed URL rather than a loopback address.
 */

import Constants from 'expo-constants';

/** The deployed engine. Used by any build that has no better answer. */
export const PRODUCTION_API_URL = 'https://setu-37hl.onrender.com';

/** Port the Express backend listens on locally (`npm start` in /backend). */
const DEV_API_PORT = 3000;

/**
 * The Metro host this bundle was served from, e.g. `192.168.1.7:8081`.
 *
 * Present in Expo Go and dev clients, absent in release builds — which is
 * exactly the signal we want, since it is only ever used for dev fallbacks.
 */
function metroHost(): string | null {
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    null;

  if (!hostUri) return null;
  const host = String(hostUri).split('/')[0].split(':')[0].trim();
  return host || null;
}

/**
 * Best guess at the dev backend when nothing was configured explicitly.
 *
 * A phone running Expo Go already knows the laptop's LAN address — it just
 * downloaded a JS bundle from it — so reusing that host means a physical-device
 * demo needs no manual IP entry. Only the emulator case, where Metro reports
 * `localhost`, needs the 10.0.2.2 translation.
 */
function devApiUrl(): string {
  const host = metroHost();
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return `http://10.0.2.2:${DEV_API_PORT}`;
  }
  return `http://${host}:${DEV_API_PORT}`;
}

function normalise(url: string | undefined | null): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * The compiled-in default, before any user override from Settings.
 *
 * `EXPO_PUBLIC_API_URL` is inlined at build time by Expo, so an EAS profile can
 * point a build at staging without touching source.
 */
export const DEFAULT_API_URL: string =
  normalise(process.env.EXPO_PUBLIC_API_URL) ||
  normalise((Constants.expoConfig?.extra as any)?.apiUrl) ||
  (__DEV__ ? devApiUrl() : PRODUCTION_API_URL);

/**
 * Resolve a stored preference against the default.
 *
 * An empty stored value means "follow the build", which is what we want the
 * common case to be — a pinned URL in storage is how an app ends up talking to
 * a laptop that went home for the weekend.
 */
export function resolveApiUrl(storedUrl?: string | null): string {
  const stored = normalise(storedUrl);
  if (!stored) return DEFAULT_API_URL;

  // Stored values from before this resolver existed hard-coded the emulator
  // bridge. Honour it in development, ignore it anywhere it cannot possibly
  // work rather than leaving the user stranded on a dead address.
  if (!__DEV__ && /^https?:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)(:|\/|$)/.test(stored)) {
    return DEFAULT_API_URL;
  }
  return stored;
}

/** Whether a stored preference is currently overriding the build default. */
export function isCustomApiUrl(storedUrl?: string | null): boolean {
  const stored = normalise(storedUrl);
  return Boolean(stored) && stored !== DEFAULT_API_URL;
}

export const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
