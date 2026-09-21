#!/usr/bin/env node
/**
 * End-to-end smoke test against a running SETU engine.
 *
 *   npm start          # in one terminal
 *   npm run smoke      # in another
 *
 * Exits non-zero if any check fails, so it can gate a deploy.
 */

const BASE = process.env.SETU_API || 'http://localhost:3000';
const PACE_MS = Number(process.env.SETU_SMOKE_PACE_MS ?? 1500);

let passed = 0;
let failed = 0;

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function check(name, fn, { usesAI = true } = {}) {
  const started = Date.now();
  try {
    const note = await fn();
    passed += 1;
    console.log(`${green('PASS')} ${name} ${dim(`${Date.now() - started}ms${note ? ` — ${note}` : ''}`)}`);
  } catch (error) {
    failed += 1;
    const detail = error.message.split('\n')[0].slice(0, 180);
    console.log(`${red('FAIL')} ${name} ${dim(`${Date.now() - started}ms`)}\n     ${detail}`);
  }
  if (usesAI && PACE_MS) await sleep(PACE_MS);
}

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error || 'request failed'}`);
  return data;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const ARTICLE = `The Antikythera mechanism is an ancient Greek analogue computer used to predict
astronomical positions and eclipses decades in advance. Recovered in 1901 from a shipwreck off the
Greek island of Antikythera, it dates to roughly the 2nd century BC. It contains at least 30 bronze
gears and could track the movements of the Sun and Moon through the zodiac, predict eclipses, and
model the irregular orbit of the Moon. No comparable geared mechanism is known from the following
thousand years.`;

(async () => {
  console.log(`\nSETU Production Smoke Test → ${BASE}\n`);

  /* --------------------------- Health & Provider Probes --------------------------- */

  await check('GET /api/health', async () => {
    const response = await fetch(`${BASE}/api/health`);
    const data = await response.json();
    expect(data.status === 'healthy', 'not healthy');
    return `AI ${data.aiConfigured ? `configured (${data.primaryProvider})` : 'NOT configured'} | DB: ${data.database?.state}`;
  }, { usesAI: false });

  await check('GET /api/health/ai (live AI model round-trip)', async () => {
    const response = await fetch(`${BASE}/api/health/ai`);
    const data = await response.json();
    expect(data.ok, data.reason || 'model did not respond');
    return `${data.provider}/${data.model}`;
  });

  await check('GET /api/db/status (MongoDB database probe)', async () => {
    const response = await fetch(`${BASE}/api/db/status`);
    const data = await response.json();
    return `MongoDB: ${data.state} (configured=${data.configured})`;
  }, { usesAI: false });

  /* --------------------------- Database & Persistence --------------------------- */

  await check('GET /api/conversations', async () => {
    const response = await fetch(`${BASE}/api/conversations`);
    const data = await response.json();
    expect(Array.isArray(data.conversations), 'conversations is not an array');
    return `${data.conversations.length} conversations in DB`;
  }, { usesAI: false });

  await check('POST /api/conversations (create chat session)', async () => {
    const data = await post('/api/conversations', {
      title: 'Smoke Test Conversation',
      currentTopic: 'Photosynthesis'
    });
    expect(data.conversation?.id, 'no conversation id created');
    return `created id: ${data.conversation.id}`;
  }, { usesAI: false });

  await check('GET /api/files (list uploaded documents)', async () => {
    const response = await fetch(`${BASE}/api/files`);
    const data = await response.json();
    expect(Array.isArray(data.files), 'files is not an array');
    return `${data.files.length} documents in DB`;
  }, { usesAI: false });

  await check('GET /api/mindmaps', async () => {
    const response = await fetch(`${BASE}/api/mindmaps`);
    const data = await response.json();
    expect(Array.isArray(data.maps), 'maps is not an array');
    return `${data.maps.length} mind maps in DB`;
  }, { usesAI: false });

  /* --------------------------- Seven Cognitive Modes --------------------------- */

  await check('POST /api/start', async () => {
    const data = await post('/api/start', { task: 'clean out my inbox', isStuck: true });
    expect(data.immediateTenMinuteAction, 'no ten-minute action');
    expect(Array.isArray(data.microSteps) && data.microSteps.length >= 3, 'too few micro steps');
    expect(data.confidenceMeter?.effortLevel, 'no confidence meter');
    return data.fallback ? 'L0 fallback' : 'AI';
  });

  await check('POST /api/simplify', async () => {
    const data = await post('/api/simplify', { text: ARTICLE });
    expect(data.plainLanguageRewrite?.length > 40, 'rewrite too short');
    expect(data.keyTakeaways?.length >= 2, 'too few takeaways');
    return data.readabilityGrade;
  });

  await check('POST /api/learn', async () => {
    const data = await post('/api/learn', { text: ARTICLE });
    expect(data.mindMap?.branches?.length > 0, 'no mind map branches');
    expect(data.quiz?.length >= 2, 'too few quiz questions');
    return `${data.mindMap.branches.length} branches, ${data.quiz.length} questions`;
  });

  await check('POST /api/meet', async () => {
    const data = await post('/api/meet', {
      transcript:
        'Priya: we ship Thursday. Sam: I will finish the migration script by Wednesday. Priya: I will brief support.'
    });
    expect(data.actionItems?.length > 0, 'no action items extracted');
    return `${data.actionItems.length} action items`;
  });

  await check('POST /api/practice', async () => {
    const data = await post('/api/practice', { topic: 'asking for a deadline extension' });
    expect(data.suggestedResponses?.length >= 2, 'too few scripts');
    return `${data.suggestedResponses.length} scripts`;
  });

  await check('POST /api/write', async () => {
    const data = await post('/api/write', {
      text: 'The report was written by the team and it was subsequently reviewed by management.'
    });
    expect(data.improvedText?.length > 10, 'no improved text');
    return data.originalGradeLevel;
  });

  await check('POST /api/guide', async () => {
    const data = await post('/api/guide', { goal: 'renew a passport online' });
    expect(data.steps?.length > 0, 'no steps');
    return `${data.steps.length} steps`;
  });

  /* ------------------------- Numbers (dyscalculia) ------------------------- */

  await check('POST /api/numbers', async () => {
    const data = await post('/api/numbers', { problem: 'what is 12 times 4' });
    expect(data.objectEmoji, 'no countable object chosen');
    expect(data.steps?.length >= 2, 'too few steps');
    // The drawn quantity is the explanation, so a step without a real count
    // would render an empty table and silently teach nothing.
    expect(
      data.steps.every((step) => Number.isFinite(step.count) && Number.isFinite(step.runningTotal)),
      'a step is missing a numeric count or runningTotal'
    );
    expect(Number.isFinite(data.answerNumber), 'no numeric answer');
    return `${data.steps.length} steps with ${data.objectNamePlural}, answer ${data.answerNumber}`;
  });

  await check(
    'POST /api/numbers rejects an empty problem',
    async () => {
      const response = await fetch(`${BASE}/api/numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(response.status === 400, `expected 400, got ${response.status}`);
      return '400';
    },
    { usesAI: false }
  );

  /* --------------------------- Listen (support) --------------------------- */

  await check('POST /api/listen', async () => {
    const data = await post('/api/listen', {
      entry: 'Everything took twice as long today and I still got asked why it was not finished.',
      mood: 2
    });
    expect(!data.crisis, 'ordinary frustration was wrongly escalated to the crisis path');
    expect(data.reflection?.length > 10, 'no reflection');
    expect(data.groundingExercise?.steps?.length >= 2, 'no grounding exercise');
    return `${data.namedFeelings?.length || 0} feelings named`;
  });

  await check(
    'POST /api/listen routes crisis language to fixed helplines',
    async () => {
      const data = await post('/api/listen', { entry: 'there is no point in living anymore' });
      expect(data.crisis === true, 'crisis language was not detected');
      expect(data.helplines?.length >= 2, 'no helplines returned');
      // A crisis reply must never be model output, so none of the reflective
      // fields may be present on this path.
      expect(!data.groundingExercise && !data.reflection, 'crisis reply leaked model content');
      return `${data.helplines.length} helplines, fixed script`;
    },
    { usesAI: false }
  );

  /* ------------------------- Read-aloud (Sarvam AI) ------------------------- */

  await check(
    'GET /api/speech/voices',
    async () => {
      const response = await fetch(`${BASE}/api/speech/voices`);
      const data = await response.json();
      expect(response.ok, `expected 200, got ${response.status}`);
      expect(Array.isArray(data.voices) && data.voices.length > 0, 'no voices listed');
      // The advertised default must be one of the voices actually offered, or
      // the picker opens with nothing selected.
      expect(
        data.voices.some((v) => v.id === data.defaultSpeaker),
        `default speaker "${data.defaultSpeaker}" is not in the catalogue`
      );
      return data.enabled
        ? `${data.voices.length} voices on ${data.model}, default ${data.defaultSpeaker}`
        : 'not configured — clients use the browser voice';
    },
    { usesAI: false }
  );

  await check(
    'POST /api/speech',
    async () => {
      const response = await fetch(`${BASE}/api/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Point at any branch and I will read it to you.' })
      });
      const data = await response.json();

      // Without a key this is expected to refuse — but it must refuse in the
      // shape the client needs to switch engines, not with a bare error.
      if (response.status === 503) {
        expect(data.fallbackToBrowser === true, 'refusal did not tell the client to fall back');
        return 'no key configured — signalled browser fallback correctly';
      }

      expect(response.ok, `expected 200, got ${response.status}`);
      expect(typeof data.audio === 'string' && data.audio.length > 0, 'no audio returned');
      expect(data.mime, 'no mime type returned');
      return `${data.mime}, ${data.characters} chars, speaker ${data.speaker}`;
    },
    { usesAI: false }
  );

  /* ------------------------- Indian language support ------------------------ */

  await check(
    'GET /api/speech/voices lists every supported language',
    async () => {
      const data = await fetch(`${BASE}/api/speech/voices`).then((r) => r.json());
      expect(Array.isArray(data.languages), 'no languages exposed');

      /*
       * The catalogue is two disjoint tiers, not one list: eleven Indian
       * languages on Sarvam plus the international set on ElevenLabs. This
       * assertion used to be `/^[a-z]{2}-IN$/` on every code, which was true
       * when Bulbul bounded the whole product and became wrong the moment
       * international languages existed — it failed on es-ES and ja-JP while
       * the endpoint was working perfectly.
       */
      const indian = data.languages.filter((l) => l.region === 'india');
      const international = data.languages.filter((l) => l.region === 'international');

      expect(indian.length === 11, `expected 11 Indian languages, got ${indian.length}`);
      expect(international.length >= 1, 'no international languages exposed');
      expect(
        indian.every((l) => /^[a-z]{2}-IN$/.test(l.code)),
        'an Indian language has a non -IN code'
      );
      expect(
        data.languages.every((l) => l.code && l.name && l.native && l.bcp47),
        'a language is missing its code, name, native label, or bcp47 tag'
      );
      /*
       * bcp47 is what reaches a `lang=` attribute and it is NOT always `code`:
       * Sarvam spells Odia 'od-IN', which is not a valid language tag, so a
       * screen reader ignores it and reads Odia with an English voice engine.
       */
      expect(
        data.languages.find((l) => l.code === 'od-IN')?.bcp47 === 'or-IN',
        "Odia's bcp47 tag must be or-IN, not Sarvam's od-IN"
      );

      return `${indian.length} Indian + ${international.length} international`;
    },
    { usesAI: false }
  );

  await check('POST /api/start in Hindi keeps schema enums in English', async () => {
    const data = await post('/api/start', {
      task: 'write my quarterly report',
      isStuck: true,
      language: 'hi-IN'
    });

    if (data.fallback) return `L0 fallback (English) — ${data.fallbackReason}`;

    expect(data.language === 'hi-IN', `echoed ${data.language}`);
    // Devanagari must actually appear, or the directive was ignored.
    expect(
      /[ऀ-ॿ]/.test(data.supportiveMessage || ''),
      'no Devanagari in the response — it answered in English'
    );
    // The client compares these as literal strings, so a translated enum is a
    // silent UI break rather than a visible one.
    expect(
      ['Low', 'Medium', 'High'].includes(data.confidenceMeter?.effortLevel),
      `effortLevel was translated: ${data.confidenceMeter?.effortLevel}`
    );
    expect(
      ['Low', 'Moderate', 'High'].includes(data.confidenceMeter?.anxietyLevel),
      `anxietyLevel was translated: ${data.confidenceMeter?.anxietyLevel}`
    );
    expect(
      Number.isFinite(data.confidenceMeter?.estimatedTimeMinutes),
      'estimatedTimeMinutes is not a number'
    );
    return 'Devanagari prose, English enums, numeric time';
  });

  await check('POST /api/numbers in Tamil keeps the operation enum intact', async () => {
    const data = await post('/api/numbers', { problem: '12 times 4', language: 'ta-IN' });
    if (data.fallback) return `L0 fallback (English) — ${data.fallbackReason}`;

    expect(/[஀-௿]/.test(data.story || ''), 'no Tamil script in the story');

    // These drive how objects are drawn on screen; a translated value renders
    // nothing at all.
    const VALID = ['start', 'add', 'remove', 'group', 'split', 'compare', 'result'];
    const bad = (data.steps || []).find((step) => !VALID.includes(step.operation));
    expect(!bad, `step operation was translated: ${bad?.operation}`);
    expect(Number.isFinite(data.answerNumber), 'answerNumber is not numeric');
    return `${data.steps.length} steps, Tamil prose, enums intact`;
  });

  await check(
    'POST /api/speech accepts every supported language',
    async () => {
      const data = await fetch(`${BASE}/api/speech/voices`).then((r) => r.json());
      if (!data.enabled) return 'no key configured — language plumbing untested';

      for (const language of data.languages) {
        const clip = await fetch(`${BASE}/api/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'One two three.', language: language.code })
        }).then((r) => r.json());
        expect(clip.language === language.code, `${language.code} came back as ${clip.language}`);
      }

      // An unsupported code must be repaired, never forwarded to the provider.
      const repaired = await fetch(`${BASE}/api/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello', language: 'fr-FR' })
      }).then((r) => r.json());
      expect(repaired.language === 'en-IN', `fr-FR became ${repaired.language}`);

      return `${data.languages.length} languages synthesised, fr-FR repaired to en-IN`;
    },
    { usesAI: false }
  );

  /* ---------------------------- Reward progress ---------------------------- */

  await check(
    'POST + GET /api/progress round-trips and resists stale writes',
    async () => {
      const headers = { 'Content-Type': 'application/json', 'x-user-id': 'smoke_progress_user' };
      const put = (body) =>
        fetch(`${BASE}/api/progress`, { method: 'POST', headers, body: JSON.stringify(body) }).then(
          (r) => r.json()
        );

      await put({
        points: 250,
        counters: { modeRun: 9 },
        milestones: ['first-move'],
        streakDays: 4,
        longestStreakDays: 4,
        lastActiveDay: '2026-08-17'
      });

      // A second device syncing an older snapshot must not roll anything back.
      const stale = await put({
        points: 30,
        counters: { modeRun: 1 },
        milestones: ['mapmaker'],
        streakDays: 1,
        longestStreakDays: 1,
        lastActiveDay: '2026-08-10'
      });

      expect(stale.progress.points === 250, `points rolled back to ${stale.progress.points}`);
      expect(stale.progress.longestStreakDays === 4, 'longest streak rolled back');
      expect(stale.progress.milestones.includes('first-move'), 'earned milestone was lost');
      expect(stale.progress.milestones.includes('mapmaker'), 'new milestone was not merged');

      const read = await fetch(`${BASE}/api/progress`, { headers }).then((r) => r.json());
      expect(read.progress?.points === 250, 'read-back did not match');
      return `${read.progress.points} pts, ${read.progress.milestones.length} milestones`;
    },
    { usesAI: false }
  );

  /* ---------------------------- Research & Mind Maps ---------------------------- */

  await check('POST /api/research/mindmap', async () => {
    const data = await post('/api/research/mindmap', { topic: 'the water cycle' });
    expect(data.root?.children?.length >= 3, 'too few branches');
    expect(data.root.children.every((b) => b.label && b.detail), 'branch missing label or detail');
    expect(data.keyFacts?.length > 0, 'no key facts');
    expect(data.followUps?.length > 0, 'no follow-ups');
    return `grounded=${data.grounded}`;
  });

  await check('POST /api/research/expand', async () => {
    const data = await post('/api/research/expand', {
      topic: 'the water cycle',
      nodeLabel: 'Evaporation',
      nodeDetail: 'Water turns from liquid into vapour.',
      path: ['The Water Cycle', 'Evaporation']
    });
    expect(data.children?.length > 0, 'no children returned');
    return `${data.children.length} children`;
  });

  await check('POST /api/chat (SSE stream with persistence)', async () => {
    const response = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'map out how tides work' }] })
    });
    expect(response.ok, `HTTP ${response.status}`);

    const events = [];
    let map = null;
    const decoder = new TextDecoder();
    let buffer = '';
    let event = '';

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
          events.push(event);
        } else if (line.startsWith('data:') && event === 'map') {
          map = JSON.parse(line.slice(5).trim());
        }
      }
    }

    expect(events.includes('reply'), 'no reply event');
    expect(events.includes('done'), 'stream never completed');
    return `${events.length} events received`;
  });

  /* ------------------------------ In-Page Agent ------------------------------ */

  await check('POST /api/agent/plan', async () => {
    const data = await post('/api/agent/plan', {
      task: 'search for running shoes',
      pageContext: {
        title: 'ShopCo',
        url: 'https://example.com',
        headings: ['Welcome to ShopCo'],
        controls: [
          { ref: 'r0', tag: 'input', type: 'search', label: 'Search products' },
          { ref: 'r1', tag: 'button', type: 'submit', label: 'Search' },
          { ref: 'r2', tag: 'a', label: 'Cart' }
        ],
        text: 'Welcome to ShopCo. Find anything.'
      }
    });
    expect(data.steps?.length > 0, 'no steps planned');
    return `${data.steps.length} steps`;
  });

  await check('POST /api/export', async () => {
    const data = await post('/api/export', {
      mode: 'start',
      data: { clarifyingQuestion: 'q', immediateTenMinuteAction: 'a', microSteps: ['s1'] }
    });
    expect(data.markdown?.includes('#'), 'no markdown produced');
    return data.filename;
  }, { usesAI: false });

  /* ------------------------- Error Handling ------------------------- */

  await check('rejects empty input with 400', async () => {
    const response = await fetch(`${BASE}/api/research/mindmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: '' })
    });
    expect(response.status === 400, `expected 400, got ${response.status}`);
    return '400';
  }, { usesAI: false });

  await check('unknown route returns 404 JSON', async () => {
    const response = await fetch(`${BASE}/api/unknown_endpoint_404`, { method: 'POST' });
    expect(response.status === 404, `expected 404, got ${response.status}`);
    return '404';
  }, { usesAI: false });

  console.log(`\n${failed === 0 ? green('ALL CHECKS PASSED') : red(`${failed} FAILED`)} — ${passed}/${passed + failed}\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
