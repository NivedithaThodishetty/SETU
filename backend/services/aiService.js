/**
 * SETU Shared AI Orchestration Engine
 * -----------------------------------
 * Primary Provider:  Google Gemini (multi-model fallback chain)
 * Optional Fallback: OpenAI Direct
 * Offline Fallback:  Deterministic L0 Cognitive Rule Engine
 *
 * Design notes:
 *  - Two chains, one purpose each. `fast` is Flash-tier and serves everything a
 *    human is waiting on; `pro` is used for research and map structuring, where
 *    quality matters more than the extra few seconds.
 *  - Native structured output. Gemini enforces a response schema server-side,
 *    which is what makes mode responses reliable rather than hopeful. When a
 *    model rejects a schema the call degrades to JSON-mode with the schema in
 *    the prompt instead of failing.
 *  - Every logical request is bounded by a wall-clock deadline, not just a
 *    per-call timeout, so a chain walk can never outlive the person waiting.
 *  - Every model call is version-aware: Gemini 3 and Gemini 2.5 take different
 *    reasoning parameters and want different temperatures, and sending the
 *    wrong one is a 400 rather than a degraded answer.
 */

const crypto = require('crypto');
const config = require('../config');

const GEMINI_BASE = config.geminiBaseUrl;
const OPENAI_BASE = config.openAiBaseUrl;

/** In-memory response cache (TTL 1 hour, max 500 entries). */
const aiCache = new Map();
const MAX_CACHE_SIZE = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCacheKey(prefix, payload) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
  return `${prefix}:${hash}`;
}

function getFromCache(key) {
  const entry = aiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    aiCache.delete(key);
    return null;
  }
  return entry.value;
}

function setToCache(key, value, ttl = CACHE_TTL_MS) {
  if (aiCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = aiCache.keys().next().value;
    aiCache.delete(oldestKey);
  }
  aiCache.set(key, { value, expiresAt: Date.now() + ttl });
}

/* -------------------------------------------------------------------------- */
/* Model chains, stickiness, and cooldowns                                    */
/* -------------------------------------------------------------------------- */

/** Last model that worked, per tier — tried first next time. */
const resolvedModel = { fast: null, pro: null };

/** Model name -> epoch ms until which it is known to be unusable. */
const exhaustedUntil = new Map();

/**
 * Per-model structured-output capability, learned at runtime.
 *
 * 'native'  — the model accepted a server-enforced response schema.
 * 'prompt'  — it rejected one, so the schema goes in the prompt and the reply
 *             is recovered from JSON mode instead.
 *
 * Learned rather than declared because schema support varies by model version
 * and by which keywords a particular schema happens to use, and a table in this
 * file would be wrong within a release.
 */
const schemaSupport = new Map();

/**
 * Models this API key can actually reach, from ListModels. Null until the first
 * discovery call resolves; a failed discovery leaves it null, which means "do
 * not filter" rather than "nothing is available".
 */
let reachableModels = null;
let discoveryPromise = null;

function baseChain(tier) {
  return tier === 'pro' ? config.geminiProModelChain : config.geminiModelChain;
}

/**
 * Models to try, in order: last known-good first, then the configured chain,
 * with anything on cooldown or known-unreachable filtered out.
 *
 * If filtering would empty the chain we return it unfiltered. A stale cooldown
 * must never turn into "SETU has no models" — better a call that probably fails
 * than a feature that certainly does.
 */
function geminiChain(tier = 'fast') {
  const now = Date.now();
  const sticky = resolvedModel[tier];
  const configured = baseChain(tier);

  const ordered = sticky ? [sticky, ...configured.filter((m) => m !== sticky)] : [...configured];

  const usable = ordered.filter(
    (model) =>
      (exhaustedUntil.get(model) || 0) <= now &&
      (!reachableModels || reachableModels.has(model))
  );

  if (usable.length) return usable;

  // Nothing is both cool and known-reachable. Prefer dropping the reachability
  // filter (discovery may simply be stale) before dropping the cooldowns.
  const coolOnly = ordered.filter((model) => (exhaustedUntil.get(model) || 0) <= now);
  return coolOnly.length ? coolOnly : ordered;
}

function rememberModel(tier, model) {
  if (resolvedModel[tier] !== model) {
    resolvedModel[tier] = model;
    console.log(`[SETU AI] Gemini ${tier} model locked in: ${model}`);
  }
}

function cooldown(tier, model, ms) {
  exhaustedUntil.set(model, Date.now() + ms);
  if (resolvedModel[tier] === model) resolvedModel[tier] = null;
}

/**
 * Ask Gemini which models this key can call.
 *
 * Model IDs move on Google's schedule, not ours. A chain hard-coded in a config
 * file drifts, and the symptom is a 404 on the first hop of every request —
 * invisible in aggregate, and pure latency for the user. One ListModels call
 * prunes those before they are ever attempted. Failure is non-fatal by design.
 */
async function discoverModels() {
  if (!config.geminiApiKey || !config.geminiDiscoverModels) return null;
  if (discoveryPromise) return discoveryPromise;

  discoveryPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${GEMINI_BASE}/models?pageSize=1000`, {
        headers: { 'x-goog-api-key': config.geminiApiKey },
        signal: controller.signal
      }).finally(() => clearTimeout(timer));

      if (!response.ok) {
        console.warn(`[SETU AI] Model discovery returned HTTP ${response.status}; using the configured chain as-is.`);
        return null;
      }

      const payload = await response.json();
      const ids = new Set(
        (payload?.models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => String(m.name || '').replace(/^models\//, ''))
          .filter(Boolean)
      );

      if (!ids.size) return null;
      reachableModels = ids;

      for (const tier of ['fast', 'pro']) {
        const missing = baseChain(tier).filter((model) => !ids.has(model));
        if (missing.length) {
          console.warn(
            `[SETU AI] These ${tier}-chain models are not available to this API key and will be skipped: ${missing.join(', ')}`
          );
        }
      }

      const live = geminiChain('fast');
      console.log(`[SETU AI] Gemini models available: ${live.slice(0, 4).join(', ')}${live.length > 4 ? '…' : ''}`);
      return ids;
    } catch (error) {
      console.warn(`[SETU AI] Model discovery failed (${error.message}); using the configured chain as-is.`);
      return null;
    }
  })();

  return discoveryPromise;
}

/* -------------------------------------------------------------------------- */
/* Deadlines                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A wall-clock budget for one logical request.
 *
 * Per-request timeouts are not a budget, and treating them as one was the worst
 * latency bug this service has had. `timeoutMs` bounds one HTTP call — but a
 * structured request walks a model chain and retries. At 45 seconds each, a
 * request nobody would describe as slow could legitimately run for minutes with
 * a human watching a panel the whole time.
 *
 * This is the ceiling on the whole operation. Every chain walk checks it before
 * starting another model, and every individual call is capped at whatever is
 * left, so the caller's stated budget is the budget.
 */
/**
 * The smallest slice of time worth spending a model call on.
 *
 * "Not expired" and "enough time to succeed" are different questions, and
 * conflating them produced a real and expensive failure. A plan request would
 * spend 12 seconds timing out on one model and ~11 more on a model returning
 * 503, then start a *third* call with 2.1 seconds left — which of course timed
 * out, because no cold structured generation completes in two seconds. That
 * attempt could never have worked. It cost a request against a metered daily
 * quota, added two seconds to a wait the user was already sitting through, and
 * logged `model "gemini-3.5-flash" failed (timed out after 2111ms)`, which
 * blames the model for a budget we set.
 *
 * Below this, stop walking the chain and report honestly instead.
 */
const MIN_VIABLE_CALL_MS = 5000;

function makeDeadline(ms) {
  const at = Number.isFinite(ms) && ms > 0 ? Date.now() + ms : Number.POSITIVE_INFINITY;
  return {
    at,
    totalMs: ms,
    remaining: () => at - Date.now(),
    expired: () => Date.now() >= at,

    /**
     * Is there room for another attempt that could plausibly finish?
     *
     * Three quarters of the slice the caller intended, capped at the viable
     * floor. Both halves of that matter. Demanding the *whole* intended slice
     * would refuse an attempt with 1.8 of its 2 seconds left, which is very
     * nearly what it asked for and would almost certainly have worked. Not
     * scaling at all would hold a caller that deliberately wants two-second
     * calls to a five-second floor it never asked for, and it would never
     * attempt anything.
     */
    hasRoomFor(timeoutMs) {
      if (!Number.isFinite(at)) return true;
      const asked = Number(timeoutMs) || config.aiTimeoutMs;
      const need = Math.min(asked * 0.75, MIN_VIABLE_CALL_MS);
      return at - Date.now() >= need;
    }
  };
}

/** The timeout for one call: the smaller of what was asked for and what is left. */
function budgetFor(timeoutMs, deadline) {
  const asked = Number(timeoutMs) || config.aiTimeoutMs;
  if (!deadline || !Number.isFinite(deadline.at)) return asked;
  return Math.max(1500, Math.min(asked, deadline.remaining()));
}

class AIError extends Error {
  constructor(message, { provider, status, model, retryable = false, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'AIError';
    this.provider = provider;
    this.status = status;
    this.model = model;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

/* -------------------------------------------------------------------------- */
/* Schema translation & JSON recovery                                         */
/* -------------------------------------------------------------------------- */

/**
 * Keywords Gemini's response schema does not accept.
 *
 * Sending one is a 400 that takes down the whole call, so they are stripped
 * rather than passed through and hoped for. The schemas in this codebase use
 * `additionalProperties: false` throughout — meaningful to a JSON Schema
 * validator, meaningless to a generator that is being constrained anyway.
 */
const UNSUPPORTED_SCHEMA_KEYS = new Set([
  'additionalProperties',
  'strict',
  '$schema',
  '$id',
  'definitions',
  '$defs',
  'default',
  'examples'
]);

function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);

  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;

    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, toGeminiSchema(v)])
      );
    } else if (key === 'items') {
      out.items = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }

  // Field order is a quality lever, not a formatting one: a model that fills
  // `summary` before `branches` writes better branches than one that does it
  // the other way round, because it has already committed to a thesis.
  if (out.type === 'object' && out.properties && !out.propertyOrdering) {
    out.propertyOrdering = Object.keys(out.properties);
  }
  return out;
}

/**
 * Render a JSON schema as an instruction block.
 *
 * Only used on the degraded path — a model that rejected a server-enforced
 * schema, or a vision call, where the schema cannot be attached to the request.
 * Native schema enforcement is always preferred: it is the difference between
 * a guarantee and a strong suggestion.
 */
function schemaInstruction(schema, name, example = null) {
  const required = Array.isArray(schema?.required) ? schema.required : [];

  const arrayKeys = Object.entries(schema?.properties || {})
    .filter(([, spec]) => spec?.type === 'array')
    .map(([key]) => key);

  return [
    '',
    'You must reply with a single raw JSON object and nothing else.',
    'No markdown, no code fence, no commentary before or after.',
    '',
    `It must match this JSON Schema exactly${name ? ` (${name})` : ''}:`,
    JSON.stringify(schema, null, 2),
    '',
    'Use these exact key names and nesting. Do not rename, add, or omit keys.',
    required.length ? `Every one of these keys is required: ${required.join(', ')}.` : '',
    'Where a property lists an "enum", the value must be one of those strings verbatim.',
    // A schema-valid reply carrying nothing but empty arrays is the classic
    // failure here — naming the arrays explicitly is what stops it.
    arrayKeys.length
      ? `Populate every array. Returning an empty [] for ${arrayKeys.join(', ')} is a failed reply — ` +
        'fill each one with real entries drawn from the input.'
      : '',
    // And an example beats every rule above it. A model that ignores prose
    // instructions about nesting will still copy the shape it was shown.
    example
      ? ['', 'A correctly shaped reply looks exactly like this:', JSON.stringify(example)].join('\n')
      : ''
  ]
    .filter(Boolean)
    .join('\n');
}

/** Models sometimes wrap JSON in prose or a ```json fence. Recover it cleanly. */
function parseJsonLoose(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new AIError('Model returned an empty response.', { retryable: true });
  }
  const text = raw.trim();

  try {
    return JSON.parse(text);
  } catch (_) {
    /* fall through to recovery */
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) {
      /* keep trying */
    }
  }

  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (_) {
      /* give up below */
    }
  }

  throw new AIError('Model response was not valid JSON.', { retryable: true });
}

/* -------------------------------------------------------------------------- */
/* HTTP transport                                                             */
/* -------------------------------------------------------------------------- */

/**
 * POST JSON with a timeout that actually covers the whole response.
 *
 * @param {boolean} [options.parse] resolve to the parsed body rather than the
 *   Response. Use this for everything that is not a stream.
 *
 * The distinction matters more than it looks. `fetch` resolves as soon as the
 * *headers* arrive, and a model sends those immediately and then takes as long
 * as it likes to generate the body. Clearing the abort timer when `postJson`
 * returned meant the timeout only ever bounded time-to-first-byte: a model that
 * answered in 0.3s and then spent fourteen seconds writing was completely
 * unbounded, and no per-call or overall budget could see it. Parsing inside the
 * timed region is what makes `timeoutMs` mean what it says.
 *
 * Streaming callers get the live Response and own the abort controller through
 * `onAbort`, because for them the body arriving slowly is the point.
 */
async function postJson(
  url,
  body,
  { headers = {}, timeoutMs = config.aiTimeoutMs, provider, model, parse = false, onAbort } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  onAbort?.(() => controller.abort());

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      let message = detail.slice(0, 400);
      let retryAfterMs = null;

      try {
        const parsed = JSON.parse(detail);
        message = parsed?.error?.message || parsed?.message || message;

        const retryInfo = (parsed?.error?.details || []).find((d) =>
          String(d['@type'] || '').includes('RetryInfo')
        );
        const seconds = parseFloat(
          retryInfo?.retryDelay || response.headers.get('retry-after') || ''
        );
        if (Number.isFinite(seconds)) retryAfterMs = seconds * 1000;
      } catch (_) {
        const header = parseFloat(response.headers.get('retry-after') || '');
        if (Number.isFinite(header)) retryAfterMs = header * 1000;
      }

      if (response.status === 429) {
        const wait = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : null;
        throw new AIError(
          `Rate limit or quota reached on ${provider}${model ? ` (${model})` : ''}${wait ? ` — retry in ${wait}s` : ''}`,
          { provider, model, status: 429, retryable: true, retryAfterMs }
        );
      }

      if (response.status === 401 || response.status === 403) {
        // Not retryable and not a model problem: the key is wrong, missing a
        // permission, or restricted. Retrying it just delays the real message.
        throw new AIError(
          `${provider} rejected the API key (HTTP ${response.status}): ${message}`,
          { provider, model, status: response.status, retryable: false }
        );
      }

      throw new AIError(`${provider}${model ? ` (${model})` : ''} HTTP ${response.status}: ${message}`, {
        provider,
        model,
        status: response.status,
        retryable: response.status >= 500 || response.status === 429,
        retryAfterMs
      });
    }

    return parse ? await response.json() : response;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeout = new AIError(
        `${provider}${model ? ` (${model})` : ''} request timed out after ${timeoutMs}ms.`,
        { provider, model, retryable: true }
      );
      // Flagged so the chain walk can tell "this model is too slow, try the
      // next one" apart from "this request failed". Without it, a slow model is
      // retried into the same timeout instead of being stepped over.
      timeout.timedOut = true;
      throw timeout;
    }
    throw error;
  } finally {
    if (parse || !onAbort) clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Gemini transport                                                           */
/* -------------------------------------------------------------------------- */

const geminiHeaders = () => ({ 'x-goog-api-key': config.geminiApiKey });

const isGemini3 = (model) => /^gemini-3/.test(model);

/**
 * How much reasoning to ask for, in whichever dialect this model speaks.
 *
 * Gemini 3 takes `thinkingLevel` (minimal | low | medium | high); Gemini 2.5
 * takes a numeric `thinkingBudget`. Sending both in one request is a 400, and
 * sending the wrong one for the model family is a 400 too — so this is not a
 * cosmetic normalisation, it is the difference between a working call and a
 * failing one.
 *
 * Returns null when the model has no usable knob, which leaves Google's default
 * in place. Gemini 2.5 Pro in particular cannot have thinking disabled.
 */
function thinkingConfigFor(model, level) {
  if (!level) return null;

  if (isGemini3(model)) {
    // "minimal" exists only on Flash-tier Gemini 3 models.
    const resolved = level === 'minimal' && !/flash/.test(model) ? 'low' : level;
    return { thinkingLevel: resolved };
  }

  if (/^gemini-2\.5-pro/.test(model)) return null;

  if (/^gemini-2\.5/.test(model)) {
    const budget = { minimal: 0, low: 0, medium: 4096, high: 12288 }[level];
    return Number.isFinite(budget) ? { thinkingBudget: budget } : null;
  }

  return null;
}

/**
 * Gemini 3 is documented as degrading below its default temperature of 1.0 —
 * looping and weaker reasoning, particularly on structured tasks. That is the
 * reverse of the 2.5-era advice this codebase was originally written against,
 * where 0.2-0.4 was the right choice for extraction. Both are honoured here so
 * a single call site can target either family without knowing which it got.
 */
function temperatureFor(model, requested) {
  if (isGemini3(model)) return 1;
  return typeof requested === 'number' ? requested : 0.7;
}

function buildGeminiBody({
  model,
  system,
  messages,
  schema,
  schemaMode,
  name,
  example,
  temperature,
  thinkingLevel,
  grounded,
  maxOutputTokens
}) {
  const generationConfig = { temperature: temperatureFor(model, temperature) };

  if (Number.isFinite(maxOutputTokens)) generationConfig.maxOutputTokens = maxOutputTokens;

  const thinking = thinkingConfigFor(model, thinkingLevel);
  if (thinking) generationConfig.thinkingConfig = thinking;

  let systemText = system || '';

  if (schema && !grounded) {
    generationConfig.responseMimeType = 'application/json';

    if (schemaMode === 'native') {
      generationConfig.responseSchema = toGeminiSchema(schema);
    } else {
      // Degraded path: JSON mode is still on, but the shape has to be carried
      // by the prompt because this model would not accept the schema itself.
      systemText = `${systemText}\n${schemaInstruction(schema, name, example)}`.trim();
    }
  }

  const body = {
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    generationConfig
  };

  // Grounding and a response schema are mutually exclusive: the search tool
  // needs to answer in prose with citations attached.
  if (grounded) body.tools = [{ google_search: {} }];

  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  return body;
}

/**
 * Pull the answer text out of a Gemini response.
 *
 * Thought parts are excluded explicitly. They only appear when thought
 * summaries are requested, but if one ever arrives it is the model's private
 * reasoning, and showing that to a reader who asked for a plain-language
 * explanation would be worse than showing nothing.
 */
function readGeminiText(payload) {
  const candidate = payload?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts
    .filter((part) => part && part.thought !== true)
    .map((part) => part.text || '')
    .join('');

  if (text) return text;

  const blocked = payload?.promptFeedback?.blockReason;
  if (blocked) {
    throw new AIError(`Gemini declined the prompt (${blocked}).`, { provider: 'gemini' });
  }

  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new AIError('Gemini blocked the response for safety reasons.', { provider: 'gemini' });
  }

  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new AIError('Gemini hit the output limit before writing anything usable.', {
      provider: 'gemini',
      retryable: true
    });
  }

  return '';
}

function readGeminiSources(payload) {
  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set();

  return chunks
    .map((chunk) => chunk.web)
    .filter(Boolean)
    .map((web) => ({ title: web.title || web.uri, url: web.uri }))
    .filter((source) => {
      if (!source.url || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .slice(0, 12);
}

/** A 400 that is specifically about the response schema, not the prompt. */
function isSchemaRejection(error) {
  if (error.status !== 400) return false;
  return /schema|responseSchema|response_schema|propertyOrdering|json/i.test(error.message || '');
}

/** A 400 that is specifically about the thinking parameters. */
function isThinkingRejection(error) {
  if (error.status !== 400) return false;
  return /thinking|thought/i.test(error.message || '');
}

/**
 * Call Gemini, walking the chain until one model answers.
 *
 * Each model gets up to two shapes of the same request: the native
 * server-enforced schema, and — only if that is rejected — JSON mode with the
 * schema in the prompt. Anything else (rate limit, timeout, 5xx) moves straight
 * to the next model, because those do not get better on a second attempt
 * against the same endpoint.
 */
async function callGemini({
  system,
  messages,
  schema,
  name,
  example,
  temperature,
  timeoutMs,
  deadline,
  tier = 'fast',
  thinkingLevel,
  grounded = false,
  withSources = false,
  maxOutputTokens
}) {
  if (!config.geminiApiKey) {
    throw new AIError(
      'No Gemini API key configured. Set GEMINI_API_KEY — create one at https://aistudio.google.com/apikey',
      { provider: 'gemini' }
    );
  }

  // Non-blocking: the first request does not wait for discovery, it just
  // benefits from it once it has landed.
  discoverModels();

  const chain = geminiChain(tier);
  const level = thinkingLevel || (tier === 'pro' ? config.geminiProThinkingLevel : config.geminiThinkingLevel);
  let lastError;

  for (const model of chain) {
    // Starting another model call with a sliver of budget left is not caution,
    // it is a guaranteed failure that still costs a request. Stop instead, and
    // say plainly that we ran out of room rather than blaming the model we
    // never really tried.
    if (deadline && !deadline.hasRoomFor(timeoutMs)) {
      if (!deadline.expired()) {
        console.warn(
          `[SETU AI] Not attempting "${model}" — only ${Math.max(0, Math.round(deadline.remaining()))}ms of the budget is left.`
        );
      }
      throw (
        lastError ||
        new AIError('Ran out of time before any model answered.', { provider: 'gemini', retryable: false })
      );
    }

    let mode = schema ? schemaSupport.get(model) || 'native' : 'none';
    let allowThinking = true;

    // At most two shapes per model: the preferred one, then the degraded one.
    for (let shape = 0; shape < 2; shape += 1) {
      if (deadline && !deadline.hasRoomFor(timeoutMs)) break;

      try {
        const body = buildGeminiBody({
          model,
          system,
          messages,
          schema,
          schemaMode: mode,
          name,
          example,
          temperature,
          thinkingLevel: allowThinking ? level : null,
          grounded,
          maxOutputTokens
        });

        const payload = await postJson(`${GEMINI_BASE}/models/${model}:generateContent`, body, {
          provider: 'gemini',
          model,
          timeoutMs: budgetFor(timeoutMs, deadline),
          parse: true,
          headers: geminiHeaders()
        });

        const text = readGeminiText(payload);
        if (!text) {
          throw new AIError(`Gemini model ${model} returned no text.`, {
            provider: 'gemini',
            model,
            retryable: true
          });
        }

        if (schema) schemaSupport.set(model, mode);
        rememberModel(tier, model);

        return withSources ? { text, sources: readGeminiSources(payload), model } : text;
      } catch (error) {
        lastError = error;

        // Rejected the schema: retry this same model with the schema in the
        // prompt instead. Worth one extra round trip — a working model on a
        // degraded path beats stepping down the chain.
        if (schema && mode === 'native' && isSchemaRejection(error)) {
          schemaSupport.set(model, 'prompt');
          mode = 'prompt';
          console.warn(
            `[SETU AI] ${model} rejected the response schema — falling back to prompt-carried JSON for this model.`
          );
          continue;
        }

        // Rejected the reasoning parameters: retry once without them.
        if (allowThinking && isThinkingRejection(error)) {
          allowThinking = false;
          console.warn(`[SETU AI] ${model} rejected thinking config — retrying with provider defaults.`);
          continue;
        }

        break;
      }
    }

    const error = lastError;

    // A bad key is not a model problem and no other model will fix it.
    if (error?.status === 401 || error?.status === 403) throw error;

    // Rate limited, missing, unavailable, or simply too slow: cool this model
    // down and move on. Timeouts belong in this list — a model that cannot
    // answer inside the budget will not answer inside it on a second attempt
    // either, and retrying burns the whole deadline on one bad endpoint.
    if (
      error?.timedOut ||
      error?.status === 429 ||
      error?.status === 404 ||
      error?.status === 400 ||
      error?.status >= 500 ||
      error?.retryable
    ) {
      const wait =
        error.status === 429
          ? Math.max(error.retryAfterMs || 0, 60000)
          : 45000;
      cooldown(tier, model, wait);
      console.warn(
        `[SETU AI] Gemini model "${model}" failed (${error.status || error.message}) — trying the next model in the chain.`
      );
      continue;
    }

    throw error;
  }

  throw lastError || new AIError('No usable Gemini model found.', { provider: 'gemini' });
}

/**
 * Streamed Gemini generation.
 *
 * The stream carries its own idle watchdog rather than relying on the request
 * timeout: `postJson` can only bound time-to-first-byte for a stream, so a
 * connection that opens and then stalls would otherwise hang until the client
 * gave up.
 */
async function* streamGemini({ system, messages, temperature, tier = 'fast', thinkingLevel, idleMs = 30000 }) {
  if (!config.geminiApiKey) {
    throw new AIError('No Gemini API key configured.', { provider: 'gemini' });
  }

  const chain = geminiChain(tier);
  const level = thinkingLevel || config.geminiThinkingLevel;
  let lastError;

  for (const model of chain) {
    let response;
    let abort = () => {};

    try {
      response = await postJson(
        `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse`,
        buildGeminiBody({ model, system, messages, temperature, thinkingLevel: level }),
        {
          provider: 'gemini',
          model,
          headers: geminiHeaders(),
          onAbort: (fn) => {
            abort = fn;
          }
        }
      );
    } catch (error) {
      lastError = error;
      if (error.status === 401 || error.status === 403) throw error;
      cooldown(tier, model, error.status === 429 ? Math.max(error.retryAfterMs || 0, 60000) : 45000);
      console.warn(`[SETU AI] Gemini streaming model "${model}" failed — trying the next model.`);
      continue;
    }

    rememberModel(tier, model);

    const watchdog = setTimeout(abort, idleMs);
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for await (const chunk of response.body) {
        watchdog.refresh();
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const frame = line.slice(5).trim();
          if (!frame || frame === '[DONE]') continue;
          try {
            const text = readGeminiText(JSON.parse(frame));
            if (text) yield text;
          } catch (_) {
            /* partial frame, or a safety stop mid-stream */
          }
        }
      }
    } finally {
      clearTimeout(watchdog);
    }
    return;
  }

  throw lastError || new AIError('No usable Gemini model found.', { provider: 'gemini' });
}

/* -------------------------------------------------------------------------- */
/* OpenAI transport (optional fallback)                                       */
/* -------------------------------------------------------------------------- */

async function callOpenAI({ system, messages, schema, name, temperature, timeoutMs, deadline }) {
  if (!config.openAiApiKey) throw new AIError('No OpenAI API key configured.', { provider: 'openai' });

  const body = {
    model: config.openAiModel,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    temperature: temperature ?? 0.7
  };

  if (schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: name || 'setu_response', strict: true, schema }
    };
  }

  const payload = await postJson(`${OPENAI_BASE}/chat/completions`, body, {
    provider: 'openai',
    model: config.openAiModel,
    timeoutMs: budgetFor(timeoutMs, deadline),
    parse: true,
    headers: { Authorization: `Bearer ${config.openAiApiKey}` }
  });

  const text = payload?.choices?.[0]?.message?.content;
  if (!text) throw new AIError('OpenAI returned no content.', { provider: 'openai', retryable: true });
  return text;
}

async function* streamOpenAI({ system, messages, temperature, idleMs = 30000 }) {
  let abort = () => {};

  const response = await postJson(
    `${OPENAI_BASE}/chat/completions`,
    {
      model: config.openAiModel,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      temperature: temperature ?? 0.7,
      stream: true
    },
    {
      provider: 'openai',
      model: config.openAiModel,
      headers: { Authorization: `Bearer ${config.openAiApiKey}` },
      onAbort: (fn) => {
        abort = fn;
      }
    }
  );

  const watchdog = setTimeout(abort, idleMs);
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for await (const chunk of response.body) {
      watchdog.refresh();
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const frame = line.slice(5).trim();
        if (!frame || frame === '[DONE]') continue;
        try {
          const delta = JSON.parse(frame)?.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch (_) {
          /* partial frame */
        }
      }
    }
  } finally {
    clearTimeout(watchdog);
  }
}

/* -------------------------------------------------------------------------- */
/* Public multi-provider orchestrator                                         */
/* -------------------------------------------------------------------------- */

/**
 * Normalise chat input.
 *
 * The `input`/`messages` split exists because callers have both shapes, and the
 * fallback to `input` matters: a `messages` array whose entries are all blank
 * would otherwise produce an empty `contents`, which Gemini rejects with a 400
 * that reads like a server fault rather than an empty prompt.
 */
function normalizeMessages(input, messages) {
  if (Array.isArray(messages) && messages.length) {
    const usable = messages
      .filter((m) => m && typeof m.content === 'string' && m.content.trim())
      .map((m) => ({
        role: m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user',
        content: m.content
      }));

    if (usable.length) return usable;
  }

  const text = String(input ?? '').trim();
  if (!text) {
    throw new AIError('Nothing to send to the model — the prompt was empty.', { retryable: false });
  }
  return [{ role: 'user', content: text }];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Per-stage timing, behind SETU_AI_TRACE=1.
 *
 * Latency here is almost never in the place it looks like it is: the visible
 * symptom is one slow request, and the cause is a chain walk, a retry backoff,
 * or a provider that fails slowly. Timing the stages is the only way to tell
 * those apart, and guessing wasted more time than building this did.
 */
const TRACE = process.env.SETU_AI_TRACE === '1';
let traceStart = 0;

function trace(message) {
  if (!TRACE) return;
  if (!traceStart) traceStart = Date.now();
  console.log(`[ai-trace +${((Date.now() - traceStart) / 1000).toFixed(1)}s] ${message}`);
}

/**
 * Runs `attempt` across the provider hierarchy: Gemini, then OpenAI if a key
 * for it happens to be configured.
 *
 * `maxRetries` is a per-call budget rather than a global constant because the
 * two kinds of work here want opposite things. A background research pass
 * should keep trying — it has nobody waiting on it. An in-page explanation has
 * a human staring at a panel, and retrying across providers, each walking a
 * model chain, is the difference between "slow" and "the extension is broken".
 * Interactive callers pass a small budget and fall back to the in-page engine.
 */
async function withProviders(
  attempt,
  { maxRetries = config.aiMaxRetries, deadlineMs, timeoutMs = config.aiTimeoutMs } = {}
) {
  const providers = [];
  if (config.geminiApiKey) providers.push('gemini');
  if (config.openAiApiKey) providers.push('openai');

  if (!providers.length) {
    throw new AIError(
      'No AI provider configured. Set GEMINI_API_KEY (create one at https://aistudio.google.com/apikey).'
    );
  }

  const errors = [];
  const budget = Math.max(0, Number(maxRetries) || 0);
  // Every request is bounded, whether or not the caller thought about it.
  const totalMs = Number.isFinite(deadlineMs) && deadlineMs > 0 ? deadlineMs : config.aiDeadlineMs;
  const deadline = makeDeadline(totalMs);

  for (const provider of providers) {
    for (let tryIndex = 0; tryIndex <= budget; tryIndex += 1) {
      if (!deadline.hasRoomFor(timeoutMs)) {
        // Report what actually went wrong underneath, not just the elapsed
        // time. "did not answer within 25s" is true and useless; "two models
        // timed out and one was overloaded" is the thing worth knowing, and it
        // is the difference between tuning a budget and chasing a phantom.
        const because = errors.length
          ? ` Last problem: ${errors[errors.length - 1].message}`
          : '';
        throw new AIError(
          `The AI provider did not answer within ${Math.round(totalMs / 1000)}s.${because}`,
          { retryable: false, status: 504 }
        );
      }

      try {
        trace(`attempt ${provider} #${tryIndex} (deadline in ${Math.round(deadline.remaining() / 1000)}s)`);
        const value = await attempt(provider, deadline);
        trace(`attempt ${provider} #${tryIndex} succeeded`);
        return value;
      } catch (error) {
        trace(`attempt ${provider} #${tryIndex} failed: ${error.message.slice(0, 90)}`);
        errors.push(error);
        if (!error.retryable || tryIndex === budget) break;

        const wait = Math.min(
          error.retryAfterMs ? Math.min(error.retryAfterMs, config.maxRetryWaitMs) : 400 * 2 ** tryIndex,
          // Never sleep past the deadline — that time belongs to the caller.
          Math.max(0, deadline.remaining() - 500)
        );
        trace(`backing off ${wait}ms`);
        if (wait > 0) await sleep(wait);
      }
    }
  }

  // A bad key or an exhausted quota is the actionable message; surface it over
  // the generic "everything failed" summary.
  const actionable = errors.find((error) => [401, 403, 429].includes(error.status));
  if (actionable) throw actionable;

  throw new AIError(`All AI providers failed — ${errors.map((error) => error.message).join(' | ')}`);
}

/**
 * Check a parsed response against the schema's top-level contract.
 *
 * Only the shallow shape is enforced. That is the layer that actually breaks —
 * a model inventing `success_signal` where the schema said `tip` produces a
 * response the UI renders as blank — while deep validation would reject
 * otherwise-usable answers over a nested detail.
 */
function findContractViolation(value, schema) {
  if (!schema || schema.type !== 'object') return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'response was not a JSON object';
  }

  const missing = (schema.required || []).filter((key) => value[key] === undefined);
  if (missing.length) return `missing required key(s): ${missing.join(', ')}`;

  for (const [key, spec] of Object.entries(schema.properties || {})) {
    if (value[key] === undefined) continue;
    if (spec.type === 'array' && !Array.isArray(value[key])) {
      return `"${key}" should be an array`;
    }
    if (spec.type === 'object' && (typeof value[key] !== 'object' || Array.isArray(value[key]))) {
      return `"${key}" should be an object`;
    }
  }

  return null;
}

/**
 * Take the model that just answered out of rotation briefly.
 *
 * Model selection is sticky — the chain remembers whichever model last worked
 * and tries it first — which is right for latency and wrong when that model is
 * producing well-formed rubbish. This unsticks it.
 */
const OFF_CONTRACT_COOLDOWN_MS = 90000;

function penaliseCurrentModel(provider, tier) {
  if (provider !== 'gemini') return;
  const model = resolvedModel[tier];
  if (!model) return;

  console.warn(
    `[SETU AI] Gemini model "${model}" returned an unusable structure — trying the next model in the chain.`
  );
  cooldown(tier, model, OFF_CONTRACT_COOLDOWN_MS);
}

/**
 * Structured JSON generation against a schema.
 *
 * @param {(parsed: object) => (string|null)} [options.validate] caller-supplied
 *   contract check, returning a description of what is wrong or null. This
 *   belongs here rather than at the call site for two reasons: a rejected
 *   response must not be written to the cache (or every later attempt is served
 *   the same bad answer instantly), and it must count as a failure the
 *   retry-and-fallback machinery can act on.
 */
async function requestStructuredAI({
  name,
  schema,
  instructions,
  input,
  messages,
  example,
  validate,
  temperature = 0.3,
  tier = 'fast',
  thinkingLevel,
  timeoutMs,
  maxRetries,
  deadlineMs,
  maxOutputTokens,
  noCache = false
}) {
  const chat = normalizeMessages(input, messages);
  const cacheKey = getCacheKey('struct', { name, schema, instructions, chat, temperature, tier });

  if (!noCache) {
    const cached = getFromCache(cacheKey);
    if (cached) return cached;
  }

  const result = await withProviders(
    async (provider, deadline) => {
      const raw =
        provider === 'gemini'
          ? await callGemini({
              system: instructions,
              messages: chat,
              schema,
              name,
              example,
              temperature,
              tier,
              thinkingLevel,
              timeoutMs,
              deadline,
              maxOutputTokens
            })
          : await callOpenAI({
              system: instructions,
              messages: chat,
              schema,
              name,
              temperature,
              timeoutMs,
              deadline
            });

      const parsed = parseJsonLoose(raw);
      const violation = findContractViolation(parsed, schema) || validate?.(parsed) || null;

      if (violation) {
        // Skip whichever model produced this for a while. Without it, a model
        // that reliably returns the right keys and empty arrays is retried into
        // the same failure and the rest of the chain is never reached.
        penaliseCurrentModel(provider, tier);

        throw new AIError(`${provider} returned an off-contract response — ${violation}.`, {
          provider,
          retryable: true
        });
      }

      return parsed;
    },
    { maxRetries, deadlineMs, timeoutMs }
  );

  if (!noCache) setToCache(cacheKey, result);
  return result;
}

/** Free-form prose generation. */
async function requestText({
  instructions,
  input,
  messages,
  temperature = 0.7,
  tier = 'fast',
  thinkingLevel,
  timeoutMs,
  maxRetries,
  deadlineMs,
  maxOutputTokens,
  noCache = false
}) {
  const chat = normalizeMessages(input, messages);
  const cacheKey = getCacheKey('text', { instructions, chat, temperature, tier });

  if (!noCache) {
    const cached = getFromCache(cacheKey);
    if (cached) return cached;
  }

  const result = await withProviders(
    async (provider, deadline) =>
      provider === 'gemini'
        ? callGemini({
            system: instructions,
            messages: chat,
            temperature,
            tier,
            thinkingLevel,
            timeoutMs,
            deadline,
            maxOutputTokens
          })
        : callOpenAI({ system: instructions, messages: chat, temperature, timeoutMs, deadline }),
    { maxRetries, deadlineMs, timeoutMs }
  );

  if (!noCache) setToCache(cacheKey, result);
  return result;
}

/**
 * Web-grounded research pass.
 *
 * Runs on the Pro chain with Google Search grounding: this is the one place in
 * SETU where nobody is watching a spinner — the client has already drawn a
 * placeholder map — so it is worth spending the extra seconds on a better
 * source pass. Degrades to ungrounded model knowledge rather than failing,
 * with `grounded: false` so the caller can say so honestly.
 */
async function requestResearch({
  instructions,
  input,
  messages,
  temperature = 0.4,
  deadlineMs,
  timeoutMs
}) {
  const chat = normalizeMessages(input, messages);
  const cacheKey = getCacheKey('research', { instructions, chat, temperature });
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  if (config.geminiApiKey && config.geminiGroundingEnabled) {
    try {
      const { text, sources } = await callGemini({
        system: instructions,
        messages: chat,
        temperature,
        tier: 'pro',
        grounded: true,
        withSources: true,
        deadline: makeDeadline(deadlineMs || config.aiDeadlineMs),
        timeoutMs
      });

      if (text) {
        const result = { text, sources: sources || [], grounded: true };
        setToCache(cacheKey, result);
        return result;
      }
    } catch (error) {
      console.warn(
        `[SETU AI] Grounded research unavailable, falling back to model knowledge: ${error.message}`
      );
    }
  }

  const text = await requestText({
    instructions,
    messages: chat,
    temperature,
    tier: 'pro',
    deadlineMs,
    timeoutMs
  });

  const result = { text, sources: [], grounded: false };
  setToCache(cacheKey, result);
  return result;
}

/**
 * Streaming prose generation — yields text chunks.
 *
 * Falling through to another provider is only safe *before* the first chunk has
 * been handed to the caller. Once text is on the wire the client has already
 * rendered it, and starting a second provider from the top would append a whole
 * second answer to a half-written first one. After that point a failure is the
 * caller's to handle — which the SSE route does, by closing out with the
 * offline rewrite rather than restarting.
 */
async function* streamText({ instructions, input, messages, temperature = 0.7, tier = 'fast' }) {
  const chat = normalizeMessages(input, messages);
  let delivered = false;

  if (config.geminiApiKey) {
    try {
      for await (const chunk of streamGemini({ system: instructions, messages: chat, temperature, tier })) {
        delivered = true;
        yield chunk;
      }
      return;
    } catch (error) {
      if (delivered) throw error;
      console.warn(`[SETU AI] Gemini stream failed before any output, attempting next provider: ${error.message}`);
    }
  }

  if (config.openAiApiKey) {
    yield* streamOpenAI({ system: instructions, messages: chat, temperature });
    return;
  }

  throw new AIError('No AI provider available for streaming.');
}

/**
 * Describe an image — a chart, a document screenshot, a dense interface region.
 *
 * Vision is the slowest thing this service does, so the whole chain walk is
 * bounded rather than each hop.
 */
async function describeImage({
  imageBase64,
  mimeType = 'image/jpeg',
  instructions,
  prompt,
  temperature = 0.3,
  tier = 'fast',
  timeoutMs,
  deadlineMs,
  maxOutputTokens
}) {
  if (!imageBase64) {
    throw new AIError('No image supplied.', { retryable: false });
  }

  const cacheKey = getCacheKey('img', {
    mimeType,
    prompt,
    instructions,
    len: imageBase64.length,
    slice: imageBase64.slice(0, 100)
  });
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const deadline = makeDeadline(deadlineMs || config.aiDeadlineMs);
  const question = prompt || 'Describe this image clearly and extract the key information.';
  let lastError;

  if (config.geminiApiKey) {
    discoverModels();

    for (const model of geminiChain(tier)) {
      if (!deadline.hasRoomFor(timeoutMs)) break;

      try {
        const generationConfig = { temperature: temperatureFor(model, temperature) };
        if (Number.isFinite(maxOutputTokens)) generationConfig.maxOutputTokens = maxOutputTokens;

        const thinking = thinkingConfigFor(model, config.geminiThinkingLevel);
        if (thinking) generationConfig.thinkingConfig = thinking;

        const body = {
          contents: [
            {
              role: 'user',
              parts: [{ text: question }, { inlineData: { mimeType, data: imageBase64 } }]
            }
          ],
          generationConfig
        };

        // Guarded: an undefined systemInstruction serialises to {text: null},
        // which Gemini rejects with a 400 on an otherwise valid request.
        if (instructions) body.systemInstruction = { parts: [{ text: instructions }] };

        const payload = await postJson(`${GEMINI_BASE}/models/${model}:generateContent`, body, {
          provider: 'gemini',
          model,
          timeoutMs: budgetFor(timeoutMs, deadline),
          parse: true,
          headers: geminiHeaders()
        });

        const text = readGeminiText(payload);
        if (text) {
          rememberModel(tier, model);
          setToCache(cacheKey, text);
          return text;
        }
        lastError = new AIError(`Gemini model ${model} returned no description.`, {
          provider: 'gemini',
          model,
          retryable: true
        });
      } catch (error) {
        lastError = error;
        if (error.status === 401 || error.status === 403) throw error;
        cooldown(tier, model, error.status === 429 ? Math.max(error.retryAfterMs || 0, 60000) : 45000);
      }
    }
  }

  if (config.openAiApiKey && deadline.hasRoomFor(timeoutMs)) {
    try {
      const payload = await postJson(
        `${OPENAI_BASE}/chat/completions`,
        {
          model: config.openAiModel,
          messages: [
            ...(instructions ? [{ role: 'system', content: instructions }] : []),
            {
              role: 'user',
              content: [
                { type: 'text', text: question },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
              ]
            }
          ],
          temperature
        },
        {
          provider: 'openai',
          model: config.openAiModel,
          timeoutMs: budgetFor(timeoutMs, deadline),
          parse: true,
          headers: { Authorization: `Bearer ${config.openAiApiKey}` }
        }
      );

      const text = payload?.choices?.[0]?.message?.content;
      if (text) {
        setToCache(cacheKey, text);
        return text;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new AIError('No provider could describe this image.');
}

/**
 * Live provider probe used by /api/health/ai.
 *
 * `noCache` is the whole point. The previous version went through the ordinary
 * cached text path, so the first probe was real and every probe after it was a
 * cache hit — a health check that reported "ok" indefinitely after the provider
 * had stopped answering, which is worse than having no health check at all.
 */
async function checkHealth() {
  if (!config.aiEnabled) {
    return {
      ok: false,
      provider: null,
      model: null,
      reason:
        'No API key configured. Set GEMINI_API_KEY — create one at https://aistudio.google.com/apikey',
      fallbackChain: config.geminiModelChain
    };
  }

  const startedAt = Date.now();

  try {
    await requestText({
      instructions: 'Reply with the single word: ok',
      input: 'ping',
      temperature: 0,
      thinkingLevel: 'minimal',
      maxOutputTokens: 16,
      maxRetries: 0,
      deadlineMs: 20000,
      noCache: true
    });

    const provider = config.primaryProvider;

    return {
      ok: true,
      provider,
      model: provider === 'gemini' ? resolvedModel.fast || config.geminiModel : config.openAiModel,
      latencyMs: Date.now() - startedAt,
      fallbackChain: provider === 'gemini' ? geminiChain('fast') : [config.openAiModel],
      proChain: provider === 'gemini' ? config.geminiProModelChain : []
    };
  } catch (error) {
    return {
      ok: false,
      provider: config.primaryProvider,
      model: null,
      latencyMs: Date.now() - startedAt,
      reason: error.message,
      fallbackChain: config.geminiModelChain
    };
  }
}

/**
 * Resolve the live model list once at boot.
 *
 * Called from server startup so the first real user request does not pay for
 * discovery, and so an unreachable chain is reported in the boot log rather
 * than discovered by whoever clicks first.
 */
function warmup() {
  return discoverModels();
}

module.exports = {
  AIError,
  requestStructuredAI,
  requestText,
  requestResearch,
  describeImage,
  streamText,
  checkHealth,
  parseJsonLoose,
  warmup
};
