/**
 * SETU Backend — Cognitive Operating System API
 * ---------------------------------------------
 * Shared AI orchestration, MongoDB persistence, and document processing for
 * both the Sanctuary web app and the Lens browser extension.
 *
 * The process is designed to start and stay useful in a degraded state: with no
 * AI key it falls back to the deterministic offline engine, and with no database
 * it serves clients that keep their own local copy. Missing configuration is
 * reported at boot rather than treated as fatal.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { connectDB, whenReady, closeDB } = require('./config/db');
const apiRoutes = require('./routes/apiRoutes');
const { warmup } = require('./services/aiService');
const errorHandler = require('./middleware/errorHandler');
const { securityHeaders, createRateLimiter } = require('./middleware/security');

const app = express();

app.disable('x-powered-by');
// Behind Vercel, Render, or any reverse proxy, req.ip must come from
// X-Forwarded-For or every client shares the proxy's address in the rate limiter.
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(cors(config.corsOptions));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Request logger — skipped in tests to keep output clean.
if (config.nodeEnv !== 'test') {
  app.use((req, _res, next) => {
    if (req.path !== '/api/health') {
      console.log(`[SETU] ${req.method} ${req.path}`);
    }
    next();
  });
}

// Connect to MongoDB in the background; the API serves requests either way.
connectDB();

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

const generalLimiter = createRateLimiter({
  windowMs: config.rateLimit.generalWindowMs,
  max: config.rateLimit.generalMax,
  keyPrefix: 'general'
});

const aiLimiter = createRateLimiter({
  windowMs: config.rateLimit.aiWindowMs,
  max: config.rateLimit.aiMax,
  keyPrefix: 'ai',
  message:
    'You are researching faster than the AI quota allows. Give it a minute and try again.'
});

/** Routes that cost a model call, and so are worth protecting from a hot loop. */
const AI_ROUTES = [
  '/api/chat',
  '/api/research/mindmap',
  '/api/research/expand',
  '/api/start',
  '/api/simplify',
  '/api/learn',
  '/api/meet',
  '/api/practice',
  '/api/write',
  '/api/guide',
  '/api/numbers',
  '/api/listen',
  '/api/summarize',
  '/api/explain',
  '/api/agent/plan',
  '/api/agent/navigate',
  '/api/agent/explain',
  '/api/agent/explain/stream',
  '/api/agent/visualize',
  '/api/agent/chunk',
  '/api/agent/describe-image',
  '/api/files/upload'
];

/**
 * Read-aloud gets its own, much larger bucket.
 *
 * Hovering across a mind map legitimately fires a request per branch, and long
 * passages are split into several clips that are fetched back to back — traffic
 * patterns that would trip the AI limiter within seconds even though each call
 * is cheap and most are served from the clip cache.
 */
const speechLimiter = createRateLimiter({
  windowMs: config.rateLimit.speechWindowMs,
  max: config.rateLimit.speechMax,
  keyPrefix: 'speech',
  message: 'Read-aloud is being requested very fast. Give it a few seconds.'
});

// Speech is metered by its own bucket only. Leaving it under the general
// limiter too would make that the real ceiling and throttle read-aloud long
// before the speech budget was touched.
app.use('/api', (req, res, next) =>
  req.path.startsWith('/speech') ? next() : generalLimiter(req, res, next)
);
app.use('/api/speech', speechLimiter);
app.use(AI_ROUTES, aiLimiter);
// Mind maps built from a document also run the full research pipeline.
app.use('/api/files/:id/mindmap', aiLimiter);
app.use('/api/files/:id/query', aiLimiter);

// Hold API requests until the startup connection attempt has settled, so a
// client loading during those first seconds reads the database rather than an
// empty result set. No-op once connected, and never waits when there is no
// database to wait for.
app.use('/api', (req, _res, next) => {
  if (req.path === '/health') return next();
  whenReady().then(() => next(), () => next());
});

app.use('/api', apiRoutes);

app.get('/api', (_req, res) => {
  res.json({
    product: 'SETU API',
    version: '3.0.0',
    primaryProvider: config.primaryProvider,
    database: 'MongoDB',
    docs: '/api/health'
  });
});

// Anything under /api that reached here has no route.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

/* -------------------------------------------------------------------------- */
/* Static SPA (single-service deploy)                                         */
/* -------------------------------------------------------------------------- */

const distDir = path.resolve(__dirname, '../frontend/dist');
const hasBuiltFrontend = config.serveStatic && fs.existsSync(path.join(distDir, 'index.html'));

if (hasBuiltFrontend) {
  // Hashed assets are immutable; index.html must never be cached or a deploy
  // leaves clients pointing at asset filenames that no longer exist.
  app.use(
    express.static(distDir, {
      index: false,
      maxAge: '1y',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store');
        }
      }
    })
  );

  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      product: 'SETU API',
      version: '3.0.0',
      primaryProvider: config.primaryProvider,
      database: 'MongoDB',
      docs: '/api/health',
      note: 'No built frontend found. Run "npm run build" in /frontend to serve the web app from here.'
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });
}

app.use(errorHandler);

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

// Vercel imports the app; only bind a port when run directly.
if (require.main === module) {
  const aiProviderInfo = config.geminiApiKey
    ? `Google Gemini — ${config.geminiModel} (+${config.geminiModelChain.length - 1} in the fallback chain)`
    : config.openAiApiKey
      ? `OpenAI Direct (${config.openAiModel})`
      : 'Deterministic L0 offline rule engine';

  const server = app.listen(config.port, () => {
    console.log('\n  ======================================================');
    console.log(`  SETU API Server → http://localhost:${config.port}`);
    const dbInfo = process.env.MONGODB_DISABLED === 'true'
      ? 'disabled by MONGODB_DISABLED — using local fallback storage'
      : config.safeMongoUri || 'not configured — using local fallback storage';
    console.log(`  Database        : MongoDB (${dbInfo})`);
    console.log(`  AI Engine       : ${aiProviderInfo}`);
    console.log(`  Deep chain      : ${config.geminiApiKey ? config.geminiProModelChain[0] : 'n/a'}`);
    console.log(`  Web app         : ${hasBuiltFrontend ? 'served from /frontend/dist' : 'run separately (npm run dev)'}`);
    console.log(`  Health Check    : http://localhost:${config.port}/api/health`);
    console.log('  ======================================================\n');

    for (const warning of config.warnings()) {
      console.warn(`  [SETU config] ${warning}`);
    }

    // Resolve the live model list in the background, so the first user request
    // does not pay for discovery and an unreachable chain shows up here rather
    // than in whoever clicks first.
    warmup().catch((err) => {
      console.warn('[SETU] AI warmup failed:', err.message);
    });
  });

  // --- Production hardening: explicit server-level timeouts ---
  // Without these, network partitions and stalled clients can leave dangling
  // sockets open indefinitely, exhausting the file-descriptor budget.
  server.keepAliveTimeout = 72000;   // 72 s — safely above typical proxy idle (60 s)
  server.headersTimeout = 75000;     // must exceed keepAliveTimeout per Node docs
  server.setTimeout(120000);         // 2 min absolute ceiling on any single request

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `\n  Port ${config.port} is already in use. Stop the other process or set PORT to a free port.\n`
      );
      process.exit(1);
    }
    throw error;
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received, shutting down gracefully.`);

    // Force exit if connections refuse to drain, so a container restart is not blocked.
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref?.();

    server.close(async () => {
      await closeDB();
      process.exit(0);
    });
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => shutdown(signal));
  }

  // An unhandled rejection signals corrupted in-process state. Log it with full
  // context and then exit so the container orchestrator can restart cleanly.
  // Staying alive risks serving stale or broken responses from poisoned state.
  process.on('unhandledRejection', (reason) => {
    console.error('[SETU] Unhandled promise rejection — exiting to avoid corrupted state:', reason);
    process.exit(1);
  });
}

module.exports = app;
