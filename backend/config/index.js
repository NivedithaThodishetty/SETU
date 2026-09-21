const path = require('path');
const dotenv = require('dotenv');

// Load environment variables.
// Priority: backend/.env.local -> backend/.env -> root/.env.local -> root/.env -> process.env
// Earlier calls win: dotenv never overwrites an already-defined key.
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const clean = (value) => {
  const trimmed = (value || '').trim();
  return trimmed.length ? trimmed : null;
};

const csv = (value) =>
  (clean(value) || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/** Database used when the connection string carries no path of its own. */
const MONGO_DB_NAME = clean(process.env.MONGODB_DB) || 'setu';

/**
 * Normalise a MongoDB connection string.
 *
 * Atlas hands out URIs with no database path (`.../?appName=Cluster0`), and the
 * driver silently falls back to `test` for those — so seeded data lands in one
 * database while the app reads from another. Appending the database name here
 * means both surfaces agree regardless of which form the URI was pasted in.
 *
 * Returns null for anything that is not a usable mongodb URI, which puts the
 * process into fallback mode rather than failing at connect time.
 */
function normalizeMongoUri(raw) {
  const uri = clean(raw);
  if (!uri) return null;

  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
    console.warn(
      `  [config] MONGODB_URI must start with mongodb:// or mongodb+srv:// — got "${uri.slice(
        0,
        24
      )}…". Ignoring it.`
    );
    return null;
  }

  const queryAt = uri.indexOf('?');
  const base = queryAt === -1 ? uri : uri.slice(0, queryAt);
  const query = queryAt === -1 ? '' : uri.slice(queryAt);

  const schemeEnd = base.indexOf('://') + 3;
  const authority = base.slice(schemeEnd);

  // Look for the path separator only after the credentials, so an escaped slash
  // inside a password is not mistaken for the start of the database name.
  const credentialsEnd = authority.lastIndexOf('@') + 1;
  const pathStart = authority.indexOf('/', credentialsEnd);

  const hasDbName = pathStart !== -1 && authority.slice(pathStart + 1).length > 0;

  if (hasDbName) return uri;

  const hostPart = pathStart === -1 ? authority : authority.slice(0, pathStart);

  return `${base.slice(0, schemeEnd)}${hostPart}/${MONGO_DB_NAME}${query}`;
}

/* -------------------------------------------------------------------------- */
/* Google Gemini — the AI provider                                            */
/* -------------------------------------------------------------------------- */

/**
 * The everyday chain, newest first.
 *
 * Every call SETU makes has a human waiting on it — someone mid-form, mid-page,
 * or mid-sentence — so the default tier is Flash throughout. The chain exists
 * because a single model ID is a single point of failure: a regional outage, a
 * quota ceiling, or a retirement takes out one entry, not the product.
 *
 * Ordering is newest-to-oldest rather than cheapest-first on purpose. The newer
 * Flash models are both faster and markedly better at the structured-output
 * work most of this app depends on, so walking down the chain degrades
 * gracefully instead of starting from the weakest option.
 */
const DEFAULT_GEMINI_CHAIN = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

/**
 * The considered chain, for work nobody is watching a spinner for: the research
 * pass and the mind-map structuring that follows it. Falls through to the Flash
 * chain, so a Pro outage costs quality rather than the whole feature.
 */
const DEFAULT_GEMINI_PRO_CHAIN = ['gemini-3.1-pro-preview', 'gemini-2.5-pro'];

/**
 * Model IDs Google has switched off.
 *
 * These are dropped even when named explicitly in the environment, which is the
 * opposite of how the rest of this file treats user configuration. The reason
 * is that honouring them cannot possibly work: every request to a retired ID is
 * a guaranteed 404, and putting one at the head of the chain means every call
 * pays a wasted round trip before it can start. A loud warning at boot plus a
 * working default beats an obedient broken deployment.
 *
 * Gemini 1.0 and 1.5 were shut down through 2025; the 2.0 series followed on
 * 1 June 2026.
 */
const RETIRED_GEMINI_MODELS = [
  /^gemini-1\.0/,
  /^gemini-1\.5/,
  /^gemini-2\.0/,
  /^gemini-pro$/,
  /^gemini-pro-vision$/
];

const isRetired = (model) => RETIRED_GEMINI_MODELS.some((pattern) => pattern.test(model));

/** Retired models the environment asked for, kept for the boot warning. */
const retiredRequests = [];

/**
 * Build a model chain: explicit environment choices first, defaults behind them.
 * De-duplicated, with retired IDs dropped and recorded.
 */
function buildChain(explicit, defaults) {
  const seen = new Set();
  const chain = [];

  for (const model of [...explicit, ...defaults]) {
    if (!model || seen.has(model)) continue;
    seen.add(model);

    if (isRetired(model)) {
      if (explicit.includes(model) && !retiredRequests.includes(model)) {
        retiredRequests.push(model);
      }
      continue;
    }
    chain.push(model);
  }

  return chain;
}

const GEMINI_MODEL_CHAIN = buildChain(
  [
    ...(clean(process.env.GEMINI_MODEL) ? [clean(process.env.GEMINI_MODEL)] : []),
    ...csv(process.env.GEMINI_MODEL_CHAIN)
  ],
  DEFAULT_GEMINI_CHAIN
);

const GEMINI_PRO_MODEL_CHAIN = buildChain(
  [
    ...(clean(process.env.GEMINI_PRO_MODEL) ? [clean(process.env.GEMINI_PRO_MODEL)] : []),
    ...csv(process.env.GEMINI_PRO_MODEL_CHAIN)
  ],
  // Pro work falls through to the Flash chain rather than failing outright.
  [...DEFAULT_GEMINI_PRO_CHAIN, ...GEMINI_MODEL_CHAIN]
);

/**
 * How much the model may think before answering.
 *
 * Gemini 3 reasons by default, and that is worth several seconds of latency
 * SETU cannot spend: the whole product is an accommodation for people who lose
 * the thread while waiting. "low" keeps enough reasoning for structured
 * extraction to stay reliable while still returning promptly.
 *
 * Valid values: minimal (Flash only), low, medium, high.
 */
const GEMINI_THINKING_LEVEL = clean(process.env.GEMINI_THINKING_LEVEL) || 'low';
const GEMINI_PRO_THINKING_LEVEL = clean(process.env.GEMINI_PRO_THINKING_LEVEL) || 'high';

/** Comma-separated list of web origins permitted to call the API. */
const allowedOrigins = csv(process.env.CORS_ORIGINS).map((origin) => origin.replace(/\/+$/, ''));

module.exports = {
  port: Number(process.env.PORT || 3000),

  nodeEnv: process.env.NODE_ENV || 'development',

  // ---------------------------------------------------------------------------
  // Google Gemini — primary (and normally only) AI provider
  // ---------------------------------------------------------------------------

  geminiApiKey: clean(process.env.GEMINI_API_KEY) || clean(process.env.GOOGLE_API_KEY),

  /**
   * The Gemini REST surface. `generateContent` under v1beta is the current
   * documented endpoint and is what this service speaks.
   */
  geminiBaseUrl:
    clean(process.env.GEMINI_BASE_URL) || 'https://generativelanguage.googleapis.com/v1beta',

  /** Everyday chain — everything with a human waiting on it. */
  geminiModelChain: GEMINI_MODEL_CHAIN,

  /** Considered chain — research and map structuring. */
  geminiProModelChain: GEMINI_PRO_MODEL_CHAIN,

  /** Convenience accessor for logs and health payloads. */
  get geminiModel() {
    return GEMINI_MODEL_CHAIN[0] || null;
  },

  geminiThinkingLevel: GEMINI_THINKING_LEVEL,
  geminiProThinkingLevel: GEMINI_PRO_THINKING_LEVEL,

  /**
   * Google Search grounding for the research pass. It costs quota on every
   * grounded request, so it is a switch rather than an assumption.
   */
  geminiGroundingEnabled: process.env.GEMINI_WEB_SEARCH !== 'false',

  /**
   * Ask Gemini which models this key can actually reach, at boot.
   *
   * Model IDs move — Google ships new ones and retires old ones on its own
   * schedule, and a chain hard-coded in a file drifts out of date silently. One
   * ListModels call at startup prunes whatever this key cannot call, which
   * turns a class of production 404s into a log line nobody has to debug.
   */
  geminiDiscoverModels: process.env.GEMINI_DISCOVER_MODELS !== 'false',

  // ---------------------------------------------------------------------------
  // OpenAI — optional last-resort fallback
  // ---------------------------------------------------------------------------

  /**
   * Entirely optional, and unset in most deployments. It exists so that a
   * Gemini outage degrades to a slower answer rather than to no answer at all.
   */
  openAiApiKey: clean(process.env.OPENAI_API_KEY),

  openAiBaseUrl: clean(process.env.OPENAI_BASE_URL) || 'https://api.openai.com/v1',

  openAiModel: clean(process.env.OPENAI_MODEL) || 'gpt-4o-mini',

  // ---------------------------------------------------------------------------
  // Speech - Sarvam AI
  // ---------------------------------------------------------------------------

  /**
   * Sarvam AI powers read-aloud.
   *
   * Without a key the application silently falls back to browser speech.
   */
  sarvamApiKey: clean(process.env.SARVAM_API_KEY),

  sarvamBaseUrl: clean(process.env.SARVAM_BASE_URL) || 'https://api.sarvam.ai',

  /**
   * bulbul:v3 is the natural-prosody model.
   */
  sarvamTtsModel: clean(process.env.SARVAM_TTS_MODEL) || 'bulbul:v3',

  sarvamTtsSpeaker: clean(process.env.SARVAM_TTS_SPEAKER) || 'priya',

  sarvamTtsLanguage: clean(process.env.SARVAM_TTS_LANGUAGE) || 'en-IN',

  /**
   * saaras:v3 is the state-of-the-art speech-to-text model.
   */
  sarvamSttModel: clean(process.env.SARVAM_STT_MODEL) || 'saaras:v3',

  sarvamTimeoutMs: Number(process.env.SARVAM_TIMEOUT_MS || 30000),

  // ---------------------------------------------------------------------------
  // Speech - ElevenLabs (international languages)
  // ---------------------------------------------------------------------------

  /**
   * ElevenLabs covers the languages Sarvam cannot speak at all.
   *
   * Bulbul is bounded to eleven Indian codes, and sending it 'ja-JP' is a hard
   * 400 rather than a graceful miss — so the two providers are not alternatives
   * to each other, they are disjoint halves of one catalogue. Which half a
   * language belongs to is declared in config/languages.js, not decided here.
   *
   * Sarvam stays primary for Indian languages even though ElevenLabs nominally
   * covers several of them: Saaras is materially better on Indic audio and on
   * Hinglish code-mixing, which is how this audience actually speaks.
   *
   * Without a key the international languages degrade to browser speech, the
   * same way the Indian ones do without a Sarvam key.
   */
  elevenLabsApiKey: clean(process.env.ELEVENLABS_API_KEY),

  elevenLabsBaseUrl: clean(process.env.ELEVENLABS_BASE_URL) || 'https://api.elevenlabs.io/v1',

  /**
   * eleven_multilingual_v2 is the quality tier; eleven_flash_v2_5 is roughly
   * three times faster at some cost in prosody.
   *
   * Quality is the default because read-aloud is the best-evidenced thing SETU
   * ships and an abandoned accommodation has an effect size of zero — people
   * stop using robotic voices. Deployments that care more about latency than
   * warmth can set ELEVENLABS_TTS_MODEL=eleven_flash_v2_5.
   */
  elevenLabsTtsModel: clean(process.env.ELEVENLABS_TTS_MODEL) || 'eleven_multilingual_v2',

  /** Scribe. Handles 99 languages and returns per-word timings we do not use yet. */
  elevenLabsSttModel: clean(process.env.ELEVENLABS_STT_MODEL) || 'scribe_v1',

  /**
   * Default voice id. 'Rachel' is ElevenLabs' longest-standing public voice and
   * is stable across account tiers, which matters because a voice id that does
   * not exist on the key's plan fails the request rather than substituting.
   */
  elevenLabsVoiceId: clean(process.env.ELEVENLABS_VOICE_ID) || '21m00Tcm4TlvDq8ikWAM',

  elevenLabsTimeoutMs: Number(process.env.ELEVENLABS_TIMEOUT_MS || 30000),

  // ---------------------------------------------------------------------------
  // Request shaping & limits
  // ---------------------------------------------------------------------------

  maxTextLength: 64000,

  maxFileUploadSizeBytes: 25 * 1024 * 1024,

  /** Ceiling on a single HTTP call to a model. */
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 45000),

  /**
   * Ceiling on one logical request — the whole chain walk, retries included.
   *
   * This is the number a user actually experiences, and no caller can exceed
   * it. Callers with a person watching a panel pass something much smaller.
   */
  aiDeadlineMs: Number(process.env.AI_DEADLINE_MS || 90000),

  /**
   * Retries per provider. Deliberately small: the model chain is already the
   * redundancy, so retrying only pays for transient 429s and 5xx.
   */
  aiMaxRetries: Number(process.env.AI_MAX_RETRIES || 2),

  /** Maximum wait between retries. */
  maxRetryWaitMs: Number(process.env.AI_MAX_RETRY_WAIT_MS || 8000),

  // ---------------------------------------------------------------------------
  // MongoDB
  // ---------------------------------------------------------------------------

  /**
   * MongoDB is opt-in.
   *
   * The API can still run in degraded/offline mode when MongoDB
   * is unavailable.
   */
  /**
   * The connection string used to reach the cluster.
   *
   * `MONGODB_DIRECT_URI` wins when set. It is the seed-list form of the same
   * Atlas cluster — `mongodb://shard-00-00...,shard-00-01...,shard-00-02.../db`
   * — which is exactly what `mongodb+srv://` resolves to, minus the SRV and TXT
   * lookups the driver otherwise performs on every connect.
   *
   * That matters on networks whose resolver refuses SRV records: the failure is
   * reported as `querySrv ECONNREFUSED`, the fallback path costs several
   * seconds of startup, and both are avoidable by naming the hosts directly.
   * `config/db.js` derives and logs this URI at boot so it can be pinned here.
   */
  mongoUri: normalizeMongoUri(process.env.MONGODB_DIRECT_URI || process.env.MONGODB_URI),

  mongoDbName: MONGO_DB_NAME,

  /**
   * Resolvers used for SRV/TXT lookup required by mongodb+srv://.
   */
  dnsFallbackServers: (process.env.DNS_SERVERS === undefined
    ? '8.8.8.8,1.1.1.1'
    : process.env.DNS_SERVERS
  )
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean),

  /**
   * Credentials stripped — safe to print in logs and health payloads.
   */
  get safeMongoUri() {
    if (!this.mongoUri) return null;

    return this.mongoUri.replace(/:\/\/[^@/]+@/, '://***:***@');
  },

  // ---------------------------------------------------------------------------
  // CORS
  // ---------------------------------------------------------------------------

  /**
   * Browser origins allowed to call the API.
   *
   * Chrome and Firefox extensions are first-class clients.
   */
  corsOptions: {
    origin(origin, callback) {
      // Server-to-server / curl / extension service worker requests.
      if (!origin) {
        return callback(null, true);
      }

      // Chrome extension.
      if (origin.startsWith('chrome-extension://')) {
        return callback(null, true);
      }

      // Firefox extension.
      if (origin.startsWith('moz-extension://')) {
        return callback(null, true);
      }

      // Development mode / unrestricted configuration.
      if (!allowedOrigins.length) {
        return callback(null, true);
      }

      // Explicitly allowed website.
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },

    credentials: false,

    maxAge: 86400,

    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-conversation-id']
  },

  allowedOrigins,

  // ---------------------------------------------------------------------------
  // Static SPA
  // ---------------------------------------------------------------------------

  /**
   * Serve the built SPA from the API process.
   */
  serveStatic: clean(process.env.SERVE_STATIC) !== 'false',

  // ---------------------------------------------------------------------------
  // Rate limiting
  // ---------------------------------------------------------------------------

  rateLimit: {
    /**
     * AI calls are quota-bound.
     *
     * Raised from 30 when selecting a mind-map branch started asking for a
     * plain-language explanation of it. Exploring a map is a burst of a dozen
     * or so short streamed calls in a minute, on top of whatever else the
     * reader is doing; at 30 an ordinary session hit the limiter. The client
     * caches per branch and waits for the selection to settle before asking,
     * so this is headroom for real use rather than a licence to hammer it.
     */
    aiWindowMs: Number(process.env.RATE_LIMIT_AI_WINDOW_MS || 60000),

    aiMax: Number(process.env.RATE_LIMIT_AI_MAX || 60),

    /** General API calls. */
    generalWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),

    generalMax: Number(process.env.RATE_LIMIT_MAX || 240),

    /** Read-aloud. */
    speechWindowMs: Number(process.env.RATE_LIMIT_SPEECH_WINDOW_MS || 60000),

    speechMax: Number(process.env.RATE_LIMIT_SPEECH_MAX || 200)
  },

  // ---------------------------------------------------------------------------
  // Feature state
  // ---------------------------------------------------------------------------

  get aiEnabled() {
    return Boolean(this.geminiApiKey || this.openAiApiKey);
  },

  /**
   * Natural-voice read-aloud is available *somewhere*.
   *
   * True when either provider has a key, because the two cover disjoint halves
   * of the catalogue: a Sarvam-only deployment speaks eleven Indian languages
   * and falls back to the browser for the rest, and an ElevenLabs-only one does
   * the reverse. `speechEnabledFor(code)` is the question that actually matters
   * at request time; this one only decides whether to advertise the feature.
   */
  get speechEnabled() {
    return Boolean(this.sarvamApiKey || this.elevenLabsApiKey);
  },

  /** Speech-to-text is available somewhere. Same disjoint-halves reasoning. */
  get sttEnabled() {
    return Boolean(this.sarvamApiKey || this.elevenLabsApiKey);
  },

  get sarvamEnabled() {
    return Boolean(this.sarvamApiKey);
  },

  get elevenLabsEnabled() {
    return Boolean(this.elevenLabsApiKey);
  },

  /** Determine primary AI provider. */
  get primaryProvider() {
    if (this.geminiApiKey) return 'gemini';
    if (this.openAiApiKey) return 'openai';
    return 'offline_l0';
  },

  // ---------------------------------------------------------------------------
  // Startup warnings
  // ---------------------------------------------------------------------------

  /**
   * Configuration problems worth printing at boot.
   *
   * Never throws. SETU is designed to degrade gracefully.
   */
  warnings() {
    const notes = [];

    if (!this.geminiApiKey) {
      notes.push(
        'GEMINI_API_KEY is not set — every AI feature is answering from the deterministic ' +
          'offline engine. Create a key at https://aistudio.google.com/apikey. Note that a ' +
          'Google AI Pro subscription does not by itself grant API access: the API key is separate.'
      );
    }

    if (retiredRequests.length) {
      notes.push(
        `Ignoring retired Gemini model(s) named in the environment: ${retiredRequests.join(', ')}. ` +
          'Google has switched these off, so every request to them would 404. Using ' +
          `${this.geminiModel} instead — update GEMINI_MODEL / GEMINI_MODEL_CHAIN to silence this.`
      );
    }

    if (!this.geminiModelChain.length) {
      notes.push(
        'No usable Gemini models remain in the chain. Check GEMINI_MODEL and GEMINI_MODEL_CHAIN.'
      );
    }

    if (process.env.OPENROUTER_API_KEY) {
      notes.push(
        'OPENROUTER_API_KEY is set but SETU no longer uses OpenRouter. The variable is ' +
          'ignored and can be removed from your .env.'
      );
    }

    if (this.nodeEnv === 'production' && !allowedOrigins.length) {
      notes.push('CORS_ORIGINS is unset in production — the API will accept any web origin.');
    }

    if (!Number.isFinite(this.port) || this.port <= 0) {
      notes.push(`PORT "${process.env.PORT}" is not a valid port number.`);
    }

    return notes;
  }
};
