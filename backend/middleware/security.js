/**
 * Security middleware.
 *
 * Deliberately dependency-free: SETU has to be deployable from a clone with no
 * network access to a registry, so the handful of headers and the rate limiter
 * we actually need are implemented here rather than pulling in helmet and
 * express-rate-limit.
 */

const config = require('../config');

/**
 * Baseline response headers.
 *
 * No CSP is set here. The API serves JSON to a separate origin and, in the
 * single-service deploy, the built SPA — a CSP tight enough to matter would
 * have to be authored against the actual bundle, and a loose one is theatre.
 */
function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');

  // Only meaningful over TLS; harmless otherwise, and correct once deployed.
  if (config.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}

/**
 * Fixed-window in-memory rate limiter.
 *
 * Scoped per process, which is the right shape for a single-instance deploy.
 * Behind multiple instances this becomes per-instance rather than global —
 * acceptable, because its job is to stop one client burning the AI quota, not
 * to enforce billing.
 *
 * Two buckets are counted on every request:
 *
 *  - Per `x-user-id`, so one heavy browser cannot lock out everyone else behind
 *    the same office NAT or mobile carrier gateway.
 *  - Per source address, at `ipMultiplier` times the allowance.
 *
 * The second bucket is the one that actually protects the AI budget. `x-user-id`
 * is a plain client-supplied header with nothing to verify it, so a caller that
 * mints a fresh id per request would otherwise get an unlimited quota — which is
 * precisely the traffic the AI limiter exists to stop. The address ceiling is
 * deliberately loose so ordinary shared-IP use never reaches it.
 */
function createRateLimiter({ windowMs, max, message, keyPrefix = '', ipMultiplier = 6 }) {
  const hits = new Map();

  // Drop expired buckets periodically so the map cannot grow without bound.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.max(windowMs, 60000));
  sweep.unref?.();

  /** Count one hit against `key` and report the bucket's state. */
  const bump = (key, limit, now) => {
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt, limit, exceeded: entry.count > limit };
  };

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const address = req.ip || req.socket?.remoteAddress || 'unknown';
    const userId = req.headers['x-user-id'];

    const buckets = [bump(`${keyPrefix}:ip:${address}`, max * ipMultiplier, now)];
    if (userId) buckets.push(bump(`${keyPrefix}:user:${userId}`, max, now));

    // Report against whichever bucket the caller is closest to filling, so the
    // advertised headers never promise more room than actually remains.
    const tightest = buckets.reduce((worst, bucket) =>
      bucket.limit - bucket.count < worst.limit - worst.count ? bucket : worst
    );
    const retryAfter = Math.ceil((tightest.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', String(tightest.limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, tightest.limit - tightest.count)));
    res.setHeader('RateLimit-Reset', String(retryAfter));

    if (buckets.some((bucket) => bucket.exceeded)) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || `Too many requests. Try again in ${retryAfter} seconds.`,
        retryAfterSeconds: retryAfter
      });
    }

    return next();
  };
}

module.exports = { securityHeaders, createRateLimiter };
