/**
 * The origin every SETU network call is made against.
 *
 * Lives in its own module because three separate layers need it — the JSON API
 * client, read-aloud, and speech-to-text — and when they each computed it
 * themselves they drifted: `api.js` carried a production fallback and the two
 * speech modules did not. The result was a deploy where research worked but
 * every Sarvam voice call went to the static host, 404'd, and fell back to
 * browser speech with no error shown. One definition, imported everywhere, is
 * what stops that recurring.
 *
 * Three topologies have to resolve correctly, and only one of them can be known
 * at build time:
 *
 *  1. `VITE_API_URL` is set — always wins, whatever the mode.
 *  2. Dev server — empty, so Vite's proxy keeps requests same-origin.
 *  3. Static host (Vercel) with the engine deployed separately — there is no API
 *     on the page's own origin, so the deployed engine has to be named.
 *
 * The catch is that a production build is also what `server.js` serves in the
 * single-service deploy, where the API *is* same-origin. Baking an absolute URL
 * in unconditionally sent that build off to the remote engine — harmless once
 * deployed, since the absolute URL resolves to itself, but it means a build
 * served locally for a final check silently talks to production instead. So a
 * production build running on localhost is treated as same-origin.
 */

/** Deployed engine, used when a production build carries no VITE_API_URL. */
const PRODUCTION_FALLBACK = 'https://setu-37hl.onrender.com';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '']);

function resolveBase() {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured;

  if (!import.meta.env.PROD) return '';

  // Served by the backend itself, or previewed locally — the API is right here.
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (LOCAL_HOSTS.has(host)) return '';

  return PRODUCTION_FALLBACK;
}

export const API_BASE = resolveBase().replace(/\/+$/, '');

/** Absolute URL for an API path. Pass paths that begin with a slash. */
export const apiUrl = (path) => `${API_BASE}${path}`;
