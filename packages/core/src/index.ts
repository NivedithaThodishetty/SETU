/**
 * @setu/core — THE COGNITIVE KERNEL
 *
 *   transform(artifact, mode, dna, ctx) → Promise<Result<TransformArtifact>>
 *
 * That signature is the entire product. Everything in this package exists to
 * make it true across a browser extension, a Next.js server, and a React
 * Native app — 9 implementations plus 3 thin renderers, instead of 27.
 *
 * Constraints this package must never violate:
 *   - zero DOM access at import time (it loads inside a service worker)
 *   - zero React
 *   - zero network
 *   - zero secrets
 */

export * from './types';
export * from './errors';
export * from './schemas';
export * from './dna';
export * from './ledger';
export * from './cache';

export * from './router';
export * from './prompts';
export * from './extract';

export * from './metrics/cls';
export * from './metrics/readability-grade';

export * from './transform/bionic';
export * from './transform/sanitize';

export * from './behaviour/breathe';
export * from './dom/summarise';

export * from './vault/chunk';
export * from './vault/recall';
export * from './crypto/vault';
export * from './sync/outbox';

export const SETU_VERSION = '1.0.0';
