#!/usr/bin/env node
/**
 * AI service contract tests — no network, no API key required.
 *
 * Every assertion here is about the *shape of the request we send Google* and
 * how we react to the shapes Google sends back. That is exactly the surface
 * that cannot be checked by reading the code: a `thinkingBudget` sent to a
 * Gemini 3 model, a `?key=` that should have been a header, an
 * `additionalProperties` left in a response schema — each is a 400 in
 * production and a silent success in review.
 *
 * The live smoke test (`npm run smoke`) covers the other half: that a real key
 * against real models actually answers. Run both.
 *
 *   node scripts/test-ai-service.js
 */

const assert = require('assert');

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

const TEST_KEY = 'test-key-not-a-real-credential';

/** Minimal stand-in for the parts of `Response` the service touches. */
function mockResponse({ status = 200, body = {}, headers = {} } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => JSON.parse(text),
    text: async () => text
  };
}

/** A normal Gemini success payload. */
const geminiText = (text) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }]
});

/** A Gemini error payload in the shape the real API returns. */
const geminiError = (message) => ({ error: { message, status: 'INVALID_ARGUMENT' } });

/**
 * Load a pristine copy of config + aiService under a given environment.
 *
 * Both modules capture configuration at require time, which is the right design
 * for a server and the wrong one for a test, so the cache is cleared per case.
 */
function loadService(env = {}) {
  for (const key of Object.keys(require.cache)) {
    if (/[\\/](config|services)[\\/]/.test(key) && key.includes('setu')) delete require.cache[key];
  }
  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../services/aiService')];

  const saved = { ...process.env };

  // A clean slate: leftover real keys in the developer's shell must not reach
  // a test that is asserting on which providers were tried.
  for (const key of Object.keys(process.env)) {
    if (/^(GEMINI|GOOGLE|OPENAI|OPENROUTER|AI_|SETU_)/.test(key)) delete process.env[key];
  }

  process.env.GEMINI_API_KEY = TEST_KEY;
  process.env.GEMINI_DISCOVER_MODELS = 'false';
  process.env.MONGODB_DISABLED = 'true';
  Object.assign(process.env, env);

  const config = require('../config');
  const ai = require('../services/aiService');

  return { config, ai, restore: () => { process.env = saved; } };
}

/**
 * Install a fetch stub that records every call.
 *
 * `handler` receives ({ url, method, body, headers, callIndex }) and returns a
 * mock response — or throws, to simulate a transport failure.
 */
function installFetch(handler) {
  const calls = [];
  const original = global.fetch;

  global.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: init.method || 'GET',
      headers: init.headers || {},
      body: init.body ? JSON.parse(init.body) : null,
      signal: init.signal
    };
    calls.push(call);
    return handler({ ...call, callIndex: calls.length - 1 });
  };

  return { calls, restore: () => { global.fetch = original; } };
}

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message.split('\n')[0]}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Cases                                                                      */
/* -------------------------------------------------------------------------- */

async function run() {
  console.log('\nSETU AI service — request contract\n');

  await test('authenticates with the x-goog-api-key header, never a URL query', async () => {
    const { ai, restore } = loadService();
    const fetchMock = installFetch(() => mockResponse({ body: geminiText('ok') }));

    await ai.requestText({ input: 'hello', noCache: true, maxRetries: 0 });

    const call = fetchMock.calls[0];
    assert.strictEqual(call.headers['x-goog-api-key'], TEST_KEY, 'API key header missing');
    assert.ok(!call.url.includes('key='), `key leaked into the URL: ${call.url}`);
    assert.ok(call.url.includes(':generateContent'), 'wrong endpoint');

    fetchMock.restore();
    restore();
  });

  await test('sends thinkingLevel to Gemini 3 and never thinkingBudget', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-3.7-flash' });
    const fetchMock = installFetch(() => mockResponse({ body: geminiText('ok') }));

    await ai.requestText({ input: 'hello', noCache: true, maxRetries: 0 });

    const thinking = fetchMock.calls[0].body.generationConfig.thinkingConfig;
    assert.deepStrictEqual(thinking, { thinkingLevel: 'low' });
    assert.ok(!('thinkingBudget' in thinking), 'mixing the two parameters is a 400');

    fetchMock.restore();
    restore();
  });

  await test('sends thinkingBudget to Gemini 2.5 Flash and never thinkingLevel', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-2.5-flash' });
    const fetchMock = installFetch(() => mockResponse({ body: geminiText('ok') }));

    await ai.requestText({ input: 'hello', noCache: true, maxRetries: 0 });

    const thinking = fetchMock.calls[0].body.generationConfig.thinkingConfig;
    assert.deepStrictEqual(thinking, { thinkingBudget: 0 });

    fetchMock.restore();
    restore();
  });

  await test('omits thinking config entirely for Gemini 2.5 Pro, which cannot disable it', async () => {
    const { ai, restore } = loadService({ GEMINI_PRO_MODEL_CHAIN: 'gemini-2.5-pro' });
    const fetchMock = installFetch(() => mockResponse({ body: geminiText('ok') }));

    await ai.requestText({ input: 'hello', tier: 'pro', noCache: true, maxRetries: 0 });

    const cfg = fetchMock.calls[0].body.generationConfig;
    assert.ok(!('thinkingConfig' in cfg), 'sending a budget 2.5 Pro rejects is a 400');

    fetchMock.restore();
    restore();
  });

  await test('holds Gemini 3 at temperature 1.0 even when the caller asks for less', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-3.7-flash' });
    const fetchMock = installFetch(() => mockResponse({ body: geminiText('ok') }));

    await ai.requestText({ input: 'hi', temperature: 0.25, noCache: true, maxRetries: 0 });

    assert.strictEqual(fetchMock.calls[0].body.generationConfig.temperature, 1);

    fetchMock.restore();
    restore();
  });

  await test('honours a low temperature on Gemini 2.5, where it is still correct', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-2.5-flash' });
    const fetchMock = installFetch(() => mockResponse({ body: geminiText('ok') }));

    await ai.requestText({ input: 'hi', temperature: 0.25, noCache: true, maxRetries: 0 });

    assert.strictEqual(fetchMock.calls[0].body.generationConfig.temperature, 0.25);

    fetchMock.restore();
    restore();
  });

  await test('attaches a server-enforced response schema, stripped of unsupported keywords', async () => {
    const { ai, restore } = loadService();
    const fetchMock = installFetch(() =>
      mockResponse({ body: geminiText('{"title":"T","points":["a"]}') })
    );

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        points: { type: 'array', items: { type: 'string' } }
      },
      required: ['title', 'points']
    };

    const out = await ai.requestStructuredAI({ name: 't', schema, input: 'x', noCache: true, maxRetries: 0 });
    assert.deepStrictEqual(out, { title: 'T', points: ['a'] });

    const cfg = fetchMock.calls[0].body.generationConfig;
    assert.strictEqual(cfg.responseMimeType, 'application/json');
    assert.ok(cfg.responseSchema, 'no schema was attached');
    assert.ok(
      !('additionalProperties' in cfg.responseSchema),
      'additionalProperties reaches Gemini as a 400'
    );
    assert.deepStrictEqual(cfg.responseSchema.required, ['title', 'points']);

    fetchMock.restore();
    restore();
  });

  await test('degrades to prompt-carried JSON when a model rejects the schema', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-3.7-flash,gemini-2.5-flash' });

    const fetchMock = installFetch(({ callIndex }) =>
      callIndex === 0
        ? mockResponse({ status: 400, body: geminiError('Invalid JSON payload: responseSchema not supported') })
        : mockResponse({ body: geminiText('{"title":"T","points":["a"]}') })
    );

    const schema = {
      type: 'object',
      properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } },
      required: ['title', 'points']
    };

    const out = await ai.requestStructuredAI({ name: 't', schema, input: 'x', noCache: true, maxRetries: 0 });
    assert.deepStrictEqual(out, { title: 'T', points: ['a'] });

    assert.strictEqual(fetchMock.calls.length, 2, 'should retry the same model, not skip it');

    const retry = fetchMock.calls[1];
    assert.ok(retry.url.includes('gemini-3.7-flash'), 'the retry must stay on the same model');
    assert.ok(!retry.body.generationConfig.responseSchema, 'schema should be dropped on the retry');
    assert.strictEqual(retry.body.generationConfig.responseMimeType, 'application/json');
    assert.ok(
      /JSON Schema/i.test(retry.body.systemInstruction.parts[0].text),
      'the schema must move into the prompt'
    );

    fetchMock.restore();
    restore();
  });

  await test('retries without thinking config when a model rejects it', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-3.7-flash' });

    const fetchMock = installFetch(({ callIndex }) =>
      callIndex === 0
        ? mockResponse({ status: 400, body: geminiError('thinking_level is not supported for this model') })
        : mockResponse({ body: geminiText('ok') })
    );

    const out = await ai.requestText({ input: 'x', noCache: true, maxRetries: 0 });
    assert.strictEqual(out, 'ok');
    assert.ok(!fetchMock.calls[1].body.generationConfig.thinkingConfig);

    fetchMock.restore();
    restore();
  });

  await test('walks to the next model on 404 (a retired or unavailable ID)', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-9-nonexistent,gemini-2.5-flash' });

    const fetchMock = installFetch(({ url }) =>
      url.includes('gemini-9-nonexistent')
        ? mockResponse({ status: 404, body: geminiError('models/gemini-9-nonexistent is not found') })
        : mockResponse({ body: geminiText('recovered') })
    );

    const out = await ai.requestText({ input: 'x', noCache: true, maxRetries: 0 });
    assert.strictEqual(out, 'recovered');
    assert.ok(fetchMock.calls[1].url.includes('gemini-2.5-flash'));

    fetchMock.restore();
    restore();
  });

  await test('walks to the next model on 429 rather than burning retries on it', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-3.7-flash,gemini-2.5-flash' });

    const fetchMock = installFetch(({ url }) =>
      url.includes('gemini-3.7-flash')
        ? mockResponse({
            status: 429,
            body: geminiError('Quota exceeded'),
            headers: { 'retry-after': '30' }
          })
        : mockResponse({ body: geminiText('second model answered') })
    );

    const out = await ai.requestText({ input: 'x', noCache: true, maxRetries: 0 });
    assert.strictEqual(out, 'second model answered');
    assert.strictEqual(fetchMock.calls.length, 2);

    fetchMock.restore();
    restore();
  });

  await test('stops immediately on 401/403 instead of walking the whole chain', async () => {
    const { ai, restore } = loadService();
    const fetchMock = installFetch(() =>
      mockResponse({ status: 403, body: geminiError('API key not valid') })
    );

    await assert.rejects(
      ai.requestText({ input: 'x', noCache: true, maxRetries: 0 }),
      /rejected the API key/i
    );
    assert.strictEqual(fetchMock.calls.length, 1, 'a bad key is not a per-model problem');

    fetchMock.restore();
    restore();
  });

  await test('grounded research sends google_search and no response schema', async () => {
    const { ai, restore } = loadService();
    const fetchMock = installFetch(() =>
      mockResponse({
        body: {
          candidates: [
            {
              content: { parts: [{ text: 'grounded answer' }] },
              groundingMetadata: {
                groundingChunks: [{ web: { uri: 'https://example.org/a', title: 'A' } }]
              }
            }
          ]
        }
      })
    );

    const out = await ai.requestResearch({ instructions: 'research', input: 'topic' });

    assert.strictEqual(out.grounded, true);
    assert.deepStrictEqual(out.sources, [{ title: 'A', url: 'https://example.org/a' }]);

    const body = fetchMock.calls[0].body;
    assert.deepStrictEqual(body.tools, [{ google_search: {} }]);
    assert.ok(!body.generationConfig.responseSchema, 'grounding and a schema are mutually exclusive');

    fetchMock.restore();
    restore();
  });

  await test('rejects an off-contract reply and tries another model', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-3.7-flash,gemini-2.5-flash' });

    const fetchMock = installFetch(({ callIndex }) =>
      callIndex === 0
        ? // Valid JSON, invented field names — the failure mode that renders as a blank panel.
          mockResponse({ body: geminiText('{"heading":"T","bullets":[]}') })
        : mockResponse({ body: geminiText('{"title":"T","points":["a"]}') })
    );

    const schema = {
      type: 'object',
      properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } },
      required: ['title', 'points']
    };

    const out = await ai.requestStructuredAI({ name: 't', schema, input: 'x', noCache: true, maxRetries: 1 });
    assert.deepStrictEqual(out, { title: 'T', points: ['a'] });

    fetchMock.restore();
    restore();
  });

  await test('model discovery prunes IDs this key cannot reach', async () => {
    const { ai, restore } = loadService({
      GEMINI_DISCOVER_MODELS: 'true',
      GEMINI_MODEL_CHAIN: 'gemini-not-available,gemini-2.5-flash'
    });

    const fetchMock = installFetch(({ url }) => {
      if (url.includes('/models?')) {
        return mockResponse({
          body: {
            models: [
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] }
            ]
          }
        });
      }
      return mockResponse({ body: geminiText('ok') });
    });

    await ai.warmup();
    await ai.requestText({ input: 'x', noCache: true, maxRetries: 0 });

    const generate = fetchMock.calls.filter((c) => c.url.includes(':generateContent'));
    assert.strictEqual(generate.length, 1, 'the unavailable model should never be attempted');
    assert.ok(generate[0].url.includes('gemini-2.5-flash'));

    fetchMock.restore();
    restore();
  });

  await test('a failed discovery leaves the configured chain intact', async () => {
    const { ai, restore } = loadService({ GEMINI_DISCOVER_MODELS: 'true' });

    const fetchMock = installFetch(({ url }) => {
      if (url.includes('/models?')) throw new Error('network down');
      return mockResponse({ body: geminiText('ok') });
    });

    await ai.warmup();
    const out = await ai.requestText({ input: 'x', noCache: true, maxRetries: 0 });
    assert.strictEqual(out, 'ok', 'discovery is an optimisation, never a gate');

    fetchMock.restore();
    restore();
  });

  await test('health probe bypasses the cache so it cannot report a stale "ok"', async () => {
    const { ai, restore } = loadService();
    let calls = 0;
    const fetchMock = installFetch(() => {
      calls += 1;
      return calls === 1
        ? mockResponse({ body: geminiText('ok') })
        : mockResponse({ status: 500, body: geminiError('backend unavailable') });
    });

    const first = await ai.checkHealth();
    assert.strictEqual(first.ok, true);

    const second = await ai.checkHealth();
    assert.strictEqual(second.ok, false, 'a cached probe would still say ok after the provider died');

    fetchMock.restore();
    restore();
  });

  await test('health probe reports the setup path when no key is configured', async () => {
    const { ai, restore } = loadService({ GEMINI_API_KEY: '' });
    const health = await ai.checkHealth();

    assert.strictEqual(health.ok, false);
    assert.match(health.reason, /GEMINI_API_KEY/);
    assert.match(health.reason, /aistudio\.google\.com/);

    restore();
  });

  await test('an empty prompt fails fast instead of reaching the API', async () => {
    const { ai, restore } = loadService();
    const fetchMock = installFetch(() => mockResponse({ body: geminiText('ok') }));

    await assert.rejects(
      ai.requestText({ messages: [{ role: 'user', content: '   ' }], input: '' }),
      /prompt was empty/i
    );
    assert.strictEqual(fetchMock.calls.length, 0, 'Gemini would 400 on empty contents');

    fetchMock.restore();
    restore();
  });

  await test('excludes thought parts from the answer text', async () => {
    const { ai, restore } = loadService();
    const fetchMock = installFetch(() =>
      mockResponse({
        body: {
          candidates: [
            {
              content: {
                parts: [
                  { text: 'internal reasoning the reader must never see', thought: true },
                  { text: 'the actual answer' }
                ]
              }
            }
          ]
        }
      })
    );

    const out = await ai.requestText({ input: 'x', noCache: true, maxRetries: 0 });
    assert.strictEqual(out, 'the actual answer');

    fetchMock.restore();
    restore();
  });

  await test('surfaces a safety block as a clear error rather than an empty string', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'gemini-2.5-flash' });
    const fetchMock = installFetch(() =>
      mockResponse({ body: { candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] } })
    );

    await assert.rejects(ai.requestText({ input: 'x', noCache: true, maxRetries: 0 }), /safety/i);

    fetchMock.restore();
    restore();
  });

  await test('streams text chunks from the SSE endpoint', async () => {
    const { ai, restore } = loadService();

    const frames = [
      `data: ${JSON.stringify(geminiText('Hello '))}\n\n`,
      `data: ${JSON.stringify(geminiText('world'))}\n\n`
    ];

    const fetchMock = installFetch(({ url }) => {
      assert.ok(url.includes(':streamGenerateContent'), 'wrong streaming endpoint');
      assert.ok(url.includes('alt=sse'), 'SSE framing must be requested explicitly');
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: (async function* () {
          for (const frame of frames) yield Buffer.from(frame, 'utf8');
        })()
      };
    });

    const chunks = [];
    for await (const chunk of ai.streamText({ input: 'hi' })) chunks.push(chunk);
    assert.strictEqual(chunks.join(''), 'Hello world');

    fetchMock.restore();
    restore();
  });

  await test('vision calls omit systemInstruction when there are no instructions', async () => {
    const { ai, restore } = loadService();
    const fetchMock = installFetch(() => mockResponse({ body: geminiText('a bar chart') }));

    await ai.describeImage({ imageBase64: 'AAAA', mimeType: 'image/png', prompt: 'what is this' });

    const body = fetchMock.calls[0].body;
    assert.ok(!('systemInstruction' in body), 'an undefined systemInstruction is a 400');
    assert.strictEqual(body.contents[0].parts[1].inlineData.mimeType, 'image/png');

    fetchMock.restore();
    restore();
  });

  await test('one logical request cannot outlive its deadline', async () => {
    const { ai, restore } = loadService({
      GEMINI_MODEL_CHAIN: 'a,b,c,d,e,f,g,h'
    });

    const fetchMock = installFetch(
      async () => new Promise((_, reject) => {
        setTimeout(() => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, 50);
      })
    );

    const startedAt = Date.now();
    await assert.rejects(
      ai.requestText({ input: 'x', noCache: true, maxRetries: 1, timeoutMs: 40, deadlineMs: 1200 })
    );

    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed < 4000, `chain walk ran ${elapsed}ms past a 1.2s deadline`);

    fetchMock.restore();
    restore();
  });

  await test('offline mode: no key means no provider call and an actionable message', async () => {
    const { ai, restore } = loadService({ GEMINI_API_KEY: '', OPENAI_API_KEY: '' });
    const fetchMock = installFetch(() => mockResponse({ body: geminiText('ok') }));

    await assert.rejects(ai.requestText({ input: 'x', noCache: true }), /GEMINI_API_KEY/);
    assert.strictEqual(fetchMock.calls.length, 0);

    fetchMock.restore();
    restore();
  });

  /* -- budget arithmetic --------------------------------------------------- */

  await test('a model is never given a slice of time it cannot finish in', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'model-a,model-b,model-c' });

    // Reproduces exactly what was observed in production: the first model eats
    // its whole per-call timeout, the second is overloaded, and the third is
    // then left with a couple of seconds. That third call could never have
    // succeeded — it cost a request against a daily quota and two seconds of
    // the user's wait to fail in a way that read as the model's fault.
    let now = Date.now();
    const realNow = Date.now;
    Date.now = () => now;

    const attempted = [];
    const fetchMock = installFetch(({ url }) => {
      const model = url.match(/models\/([^:]+):/)?.[1] || '?';
      attempted.push(model);

      if (model === 'model-a') {
        now += 12000; // times out against its own 12s budget
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        throw error;
      }
      if (model === 'model-b') {
        now += 10900; // an overloaded endpoint, answering slowly
        return mockResponse({ status: 503, body: { error: { message: 'overloaded' } } });
      }
      return mockResponse({ body: geminiText('should never be reached') });
    });

    try {
      await assert.rejects(
        ai.requestText({
          input: 'plan something',
          noCache: true,
          maxRetries: 0,
          timeoutMs: 12000,
          deadlineMs: 25000
        })
      );

      assert.deepStrictEqual(
        attempted,
        ['model-a', 'model-b'],
        `the third model was attempted with no time left: ${attempted.join(', ')}`
      );
    } finally {
      Date.now = realNow;
      fetchMock.restore();
      restore();
    }
  });

  await test('a caller asking for short calls is not held to the viable floor', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'model-a,model-b' });

    let now = Date.now();
    const realNow = Date.now;
    Date.now = () => now;

    const attempted = [];
    const fetchMock = installFetch(({ url }) => {
      attempted.push(url.match(/models\/([^:]+):/)?.[1] || '?');
      if (attempted.length === 1) {
        now += 1200;
        return mockResponse({ status: 503, body: { error: { message: 'overloaded' } } });
      }
      return mockResponse({ body: geminiText('ok') });
    });

    try {
      // 2s per call: the second attempt has 1.8s left, which is short in
      // absolute terms but is everything this caller ever wanted per call.
      const text = await ai.requestText({
        input: 'quick',
        noCache: true,
        maxRetries: 0,
        timeoutMs: 2000,
        deadlineMs: 3000
      });
      assert.strictEqual(text.trim(), 'ok');
      assert.strictEqual(attempted.length, 2, 'the second model should still have been tried');
    } finally {
      Date.now = realNow;
      fetchMock.restore();
      restore();
    }
  });

  await test('the timeout error says what actually went wrong underneath', async () => {
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'model-a' });

    let now = Date.now();
    const realNow = Date.now;
    Date.now = () => now;

    const fetchMock = installFetch(() => {
      now += 12000;
      return mockResponse({ status: 503, body: { error: { message: 'model is overloaded' } } });
    });

    try {
      await assert.rejects(
        ai.requestText({
          input: 'x',
          noCache: true,
          maxRetries: 0,
          timeoutMs: 12000,
          deadlineMs: 14000
        }),
        // Not merely "did not answer within 14s", which is true and useless.
        (error) => /overloaded|503/i.test(error.message)
      );
    } finally {
      Date.now = realNow;
      fetchMock.restore();
      restore();
    }
  });

  await test('planning gets a budget that fits two whole attempts', async () => {
    // The planner is the heaviest structured generation in the product and was
    // running on the budget sized for one paragraph of prose, while the lighter
    // structure map got nearly twice as long.
    const agent = require('../services/agentService');
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'services', 'agentService.js'),
      'utf8'
    );

    const planning = source.match(/const PLANNING = \{([^}]+)\}/);
    assert.ok(planning, 'planning has no budget of its own');

    const timeoutMs = Number(planning[1].match(/timeoutMs:\s*(\d+)/)[1]);
    const deadlineMs = Number(planning[1].match(/deadlineMs:\s*(\d+)/)[1]);

    assert.ok(
      deadlineMs >= timeoutMs * 2 + 5000,
      `deadline ${deadlineMs}ms leaves no room for a second ${timeoutMs}ms attempt`
    );
    assert.ok(agent.planPageTask, 'planPageTask is no longer exported');
  });

  await test('a plan survives one slow model and lands on the next', async () => {
    // The reported failure, end to end through the planner itself: the first
    // model burns its whole per-call budget, and the plan must still come back
    // from the second rather than collapsing to the keyword fallback.
    const { ai, restore } = loadService({ GEMINI_MODEL_CHAIN: 'slow-model,good-model' });
    delete require.cache[require.resolve('../services/agentService')];
    const agent = require('../services/agentService');

    let now = Date.now();
    const realNow = Date.now;
    Date.now = () => now;

    const plan = {
      goal: 'log in',
      understanding: 'You want to sign in.',
      feasible: true,
      blockedReason: '',
      steps: [
        {
          stepNumber: 1,
          instruction: 'Go to the Sign in button.',
          actionType: 'click',
          targetRef: 's1r0',
          targetText: 'Sign in',
          valueToFill: '',
          tip: 'It is at the top right.'
        }
      ],
      supportiveMessage: 'One step, and you are through.'
    };

    const attempted = [];
    const fetchMock = installFetch(({ url }) => {
      const model = url.match(/models\/([^:]+):/)?.[1] || '?';
      attempted.push(model);

      if (model === 'slow-model') {
        now += 20000; // the whole per-call budget, as observed
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        throw error;
      }
      return mockResponse({ body: geminiText(JSON.stringify(plan)) });
    });

    try {
      const result = await agent.planPageTask({
        task: 'log in',
        pageContext: {
          url: 'https://example.com',
          title: 'Example',
          headings: ['Welcome'],
          controls: [{ ref: 's1r0', tag: 'button', type: '', label: 'Sign in', onScreen: true, value: '' }],
          text: 'Some page text'
        }
      });

      assert.deepStrictEqual(attempted, ['slow-model', 'good-model'], 'wrong chain walk');
      assert.strictEqual(result.feasible, true);
      assert.strictEqual(result.steps.length, 1);
      assert.strictEqual(result.steps[0].targetRef, 's1r0');
    } finally {
      Date.now = realNow;
      fetchMock.restore();
      restore();
    }
  });

  /* ------------------------------------------------------------------------ */

  const failed = results.filter((r) => !r.ok);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);

  if (failed.length) {
    for (const { name, error } of failed) {
      console.log(`  ${name}\n${String(error.stack || error).split('\n').slice(0, 6).map((l) => `    ${l}`).join('\n')}\n`);
    }
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
