/**
 * In-Page Agent Controller
 * Plans and explains actions for the browser extension running on any website.
 */

const agent = require('../services/agentService');
const fallbacks = require('../services/fallbackEngine');
const config = require('../config');

/**
 * Build the deterministic L0 plan used when the AI engine is unavailable.
 *
 * Critically, this runs through the same `markConfirmations` pass as an AI
 * plan. Without it, an offline fallback would hand the extension a "click
 * Submit" step carrying no safety flag, and Auto-Run would fire it unattended.
 */
function localPlan(task, pageContext = {}, reason) {
  const plan = fallbacks.generateLocalNavigationPlan(task, pageContext);
  return {
    ...plan,
    feasible: true,
    understanding: `Working from a basic page scan for "${task}".`,
    blockedReason: '',
    steps: agent.markConfirmations(plan.steps || [], pageContext.controls || []),
    fallback: true,
    fallbackReason: reason
  };
}

/**
 * Reduce the client's profile manifest to keys and labels, and nothing else.
 *
 * The extension already sends only `{key, label}` — but "the client promises
 * not to" is not a privacy guarantee, it is a hope about a client we do not
 * control the version of. Rebuilding the list field by field here means a
 * future build that starts attaching values, or a third-party caller that
 * copies the endpoint shape and sends a whole profile, cannot get a home
 * address into a prompt through this route.
 *
 * The 120-key cap and the length limits are the other half: an unbounded array
 * of unbounded strings from a request body is a prompt-injection surface and a
 * token bill.
 */
function sanitiseProfileFields(raw) {
  if (!Array.isArray(raw)) return [];

  const seen = new Set();
  const fields = [];

  for (const entry of raw.slice(0, 200)) {
    if (!entry || typeof entry !== 'object') continue;

    // A key is an identifier. Anything else is not a key, whatever it claims.
    const key = String(entry.key || '').trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) || seen.has(key)) continue;

    seen.add(key);
    fields.push({ key, label: String(entry.label || key).slice(0, 60) });

    if (fields.length >= 120) break;
  }

  return fields;
}

/** POST /api/agent/plan — natural-language goal + page snapshot -> action plan. */
async function handleAgentPlan(req, res, next) {
  try {
    const task = String(req.body.task || req.body.command || '').trim();
    if (!task) return res.status(400).json({ error: 'A task is required.' });

    const pageContext = req.body.pageContext || {};
    const profileFields = sanitiseProfileFields(req.body.profileFields);

    if (!config.aiEnabled) {
      return res.json(localPlan(task, pageContext, 'No AI provider is configured on the server.'));
    }

    try {
      const plan = await agent.planPageTask({ task, pageContext, profileFields });
      res.json({ ...plan, fallback: false });
    } catch (error) {
      console.warn('[SETU Agent] Planning failed, using local heuristics:', error.message);
      res.json(localPlan(task, pageContext, error.message));
    }
  } catch (error) {
    next(error);
  }
}

/** POST /api/agent/explain — plain-language explanation, optionally translated. */
async function handleExplain(req, res, next) {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Text to explain is required.' });

    if (!config.aiEnabled) {
      return res.json({
        explanation: fallbacks.generateLocalSimplifyMode(text).plainLanguageRewrite,
        fallback: true
      });
    }

    try {
      const explanation = await agent.explainContent({
        text,
        language: req.body.language || 'English',
        style: req.body.style || 'plain'
      });
      res.json({ explanation, fallback: false });
    } catch (error) {
      res.json({
        explanation: fallbacks.generateLocalSimplifyMode(text).plainLanguageRewrite,
        fallback: true,
        fallbackReason: error.message
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/agent/explain/stream — the same explanation, as server-sent events.
 *
 * Free models take 20-40 seconds to finish a paragraph and about a second to
 * start one. Streaming spends that difference on the reader already reading
 * rather than on a spinner, which is the whole of the perceived-latency win.
 *
 * Errors are delivered *inside* the stream once the headers are out, because by
 * then it is far too late for a status code.
 */
async function handleExplainStream(req, res) {
  const text = String(req.body.text || '').trim();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Render and most reverse proxies buffer responses by default, which would
    // hold every token until the stream closed and defeat the entire point.
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  if (!text) {
    send({ error: 'Text to explain is required.', code: 'request' });
    return res.end();
  }

  // A disconnected client must not leave a model call running to completion.
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  try {
    if (!config.aiEnabled) {
      send({ text: fallbacks.generateLocalSimplifyMode(text).plainLanguageRewrite });
      send({ done: true, fallback: true });
      return res.end();
    }

    for await (const chunk of agent.streamExplanation({
      text,
      language: req.body.language || 'English',
      style: req.body.style || 'plain'
    })) {
      if (aborted) break;
      send({ text: chunk });
    }

    if (!aborted) {
      res.write('data: [DONE]\n\n');
    }
  } catch (error) {
    console.warn('[SETU Agent] Streamed explanation failed, sending local rewrite:', error.message);
    if (!aborted) {
      // Falling back mid-stream is better than ending on an error: the reader
      // still gets something usable, clearly labelled as the offline engine.
      send({ text: fallbacks.generateLocalSimplifyMode(text).plainLanguageRewrite });
      send({ done: true, fallback: true, fallbackReason: error.message });
    }
  } finally {
    res.end();
  }
}

/**
 * POST /api/agent/visualize — turn a chart, table, or dense section into a
 * structure the client can draw.
 *
 * Accepts `text` or `image`. The answer is data, not prose, because the client
 * renders it as a mind map, a flow, or a redrawn chart in the reader's own
 * palette — which is the accommodation. A paragraph describing a diagram is
 * still a paragraph.
 */
async function handleVisualize(req, res, next) {
  try {
    const text = String(req.body.text || '').trim();
    const image = String(req.body.image || '');

    if (!text && !image) {
      return res.status(400).json({ error: 'Text or an image is required.' });
    }

    if (!config.aiEnabled) {
      return res.status(503).json({
        error: 'Mapping needs an AI provider configured on the server.',
        fallbackToLocal: true
      });
    }

    // Accept either a bare base64 payload or a full data: URL.
    const match = image.match(/^data:([^;]+);base64,(.*)$/);

    const map = await agent.visualiseContent({
      text,
      imageBase64: match ? match[2] : image,
      mimeType: match ? match[1] : req.body.mimeType || 'image/jpeg',
      context: String(req.body.context || '').slice(0, 600),
      language: req.body.language || 'English'
    });

    res.json({ ...map, fallback: false });
  } catch (error) {
    // A model that could not produce a usable structure is a normal outcome on
    // free tiers, not a server fault. Say so with a status the client can route
    // to its own in-page fallback map.
    if (error.emptyMap || /JSON|contract|empty|rate limit|quota/i.test(error.message || '')) {
      return res.status(503).json({
        error: 'The AI could not produce a usable map for this. Try a smaller selection.',
        fallbackToLocal: true
      });
    }
    next(error);
  }
}

/** POST /api/agent/chunk — collapse a dense page into 3 calm steps. */
async function handleChunkPage(req, res, next) {
  try {
    const pageContext = req.body.pageContext || {};

    if (!config.aiEnabled) {
      return res.json({ ...localChunks(pageContext), fallback: true });
    }

    try {
      const chunks = await agent.chunkPageIntoTasks({ pageContext });
      res.json({ ...chunks, fallback: false });
    } catch (error) {
      console.warn('[SETU Agent] Chunking failed, using local heuristics:', error.message);
      res.json({ ...localChunks(pageContext), fallback: true, fallbackReason: error.message });
    }
  } catch (error) {
    next(error);
  }
}

/** Deterministic 3-step chunking used when no AI is reachable. */
function localChunks(pageContext) {
  const fields = (pageContext.controls || []).filter((c) =>
    ['input', 'select', 'textarea'].includes(c.tag)
  );

  return {
    pageName: pageContext.title || 'This page',
    whatThisPageIsFor: 'This page asks you for some information and then submits it.',
    estimatedMinutes: Math.max(3, Math.min(15, Math.ceil(fields.length * 0.75) || 5)),
    thingsToHaveReady: fields.length ? ['Any ID numbers or documents this form asks for'] : [],
    steps: [
      {
        title: 'Read the top section',
        what: 'Read only the first section of the page. Ignore everything below it for now.',
        why: 'Seeing one section at a time keeps the page from feeling overwhelming.'
      },
      {
        title: 'Fill what you know',
        what: `Fill in the fields you can answer straight away${fields.length ? ` (${fields.length} found)` : ''}. Skip anything you need to look up.`,
        why: 'Momentum from easy fields makes the harder ones feel smaller.'
      },
      {
        title: 'Check, then submit',
        what: 'Go back over the skipped fields, then submit when you are ready.',
        why: 'One deliberate pass at the end catches mistakes without slowing you down.'
      }
    ],
    encouragement: 'You do not have to finish this in one sitting. One step is real progress.'
  };
}

/** POST /api/agent/describe-image — plain-language description of a visual. */
async function handleDescribeImage(req, res, next) {
  try {
    const image = String(req.body.image || '');
    if (!image) return res.status(400).json({ error: 'An image is required.' });
    if (!config.aiEnabled) {
      return res.status(503).json({ error: 'Image description needs an AI provider configured.' });
    }

    // Accept either a bare base64 payload or a full data: URL.
    const match = image.match(/^data:([^;]+);base64,(.*)$/);

    const description = await agent.describeVisual({
      imageBase64: match ? match[2] : image,
      mimeType: match ? match[1] : req.body.mimeType || 'image/jpeg',
      context: req.body.context || '',
      language: req.body.language || 'English'
    });

    res.json({ description });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleAgentPlan,
  sanitiseProfileFields,
  handleExplain,
  handleExplainStream,
  handleVisualize,
  handleChunkPage,
  handleDescribeImage
};
