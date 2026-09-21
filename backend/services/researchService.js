/**
 * SETU Research & Mind Map Service
 * -------------------------------
 * Turns a plain-language topic or source document into an interactive, expandable mind map.
 *
 * Pipeline:
 *   1. RESEARCH  — Google Search-grounded research, with source citations.
 *   2. STRUCTURE — transforms research into a strict hierarchical cognitive node tree.
 *
 * Both passes run on the Pro model chain. This is the one place in SETU where
 * nobody is watching a spinner — the client draws a placeholder map immediately
 * and fills it in — so the extra seconds buy a genuinely better map.
 */

const { requestStructuredAI, requestResearch, requestText } = require('./aiService');
const { languageDirective, replyLanguageNote, resolveLanguage } = require('../config/languages');

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const nodeSchema = (depth) => {
  const base = {
    type: 'object',
    additionalProperties: false,
    properties: {
      label: { type: 'string', description: 'Short node title, 2-6 words.' },
      detail: { type: 'string', description: 'One clear plain-language sentence explaining this node.' }
    },
    required: ['label', 'detail']
  };

  if (depth > 0) {
    base.properties.children = { type: 'array', items: nodeSchema(depth - 1) };
    base.required.push('children');
  }
  return base;
};

const mindMapSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'The mind map title — the topic itself.' },
    summary: { type: 'string', description: '2-3 sentence plain-language overview, Grade 8 reading level.' },
    keyFacts: {
      type: 'array',
      items: { type: 'string' },
      description: '3-5 standalone facts a learner should remember.'
    },
    branches: {
      type: 'array',
      description: '4-6 top-level branches, each with 2-4 children.',
      items: nodeSchema(1)
    },
    followUps: {
      type: 'array',
      items: { type: 'string' },
      description: '3 natural follow-up questions to explore next.'
    }
  },
  required: ['title', 'summary', 'keyFacts', 'branches', 'followUps']
};

const expansionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    children: { type: 'array', items: nodeSchema(0) }
  },
  required: ['children']
};

const intentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: ['research_topic', 'expand_map', 'answer_question', 'query_document', 'smalltalk'],
      description: 'research_topic when user wants a subject researched into a map. expand_map when they want more depth on an existing branch. answer_question for questions about current map. query_document when asking about an attached file. smalltalk for greetings.'
    },
    topic: { type: 'string', description: 'The subject to research, cleaned up. Empty when not applicable.' },
    reply: { type: 'string', description: 'A short, warm reply to show the user while work happens.' }
  },
  required: ['intent', 'topic', 'reply']
};

/* -------------------------------------------------------------------------- */
/* Prompts                                                                    */
/* -------------------------------------------------------------------------- */

const RESEARCH_SYSTEM = `You are SETU's research analyst, writing for neurodivergent learners (ADHD, dyslexia, autism, memory difficulties).

Research the requested topic thoroughly and report back covering:
- what it fundamentally is, in plain words
- how it works or is structured, broken into distinct sub-areas
- why it matters and where it is used in the real world
- the common misunderstandings people have about it
- concrete examples, numbers, or named entities that make it stick

Write in short, direct sentences. Prefer a concrete detail over an abstract claim.
Never pad. If something is genuinely uncertain or contested, say so plainly.`;

const STRUCTURE_SYSTEM = `You convert research notes into a mind map for neurodivergent learners.

Rules:
- Branch labels are 2-6 words. Never a full sentence.
- Every "detail" is ONE clear sentence at roughly a Grade 8 reading level.
- Produce 4-6 top-level branches covering genuinely distinct facets — never overlapping ones.
- Each branch gets 2-4 children that add specifics, not restatements.
- Ground the content in the supplied research notes. Do not invent facts that are absent from them.
- Prefer concrete nouns and real examples over abstractions.`;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

let nodeCounter = 0;
const nextId = () => `n${Date.now().toString(36)}${(nodeCounter += 1).toString(36)}`;

/** Attach stable ids and depth so the client can address any node. */
function decorate(node, depth = 0) {
  return {
    id: nextId(),
    label: node.label,
    detail: node.detail || '',
    depth,
    children: (node.children || []).map((child) => decorate(child, depth + 1))
  };
}

function buildTree(topic, structured) {
  return {
    id: nextId(),
    label: structured.title || topic,
    detail: structured.summary || '',
    depth: 0,
    children: (structured.branches || []).map((branch) => decorate(branch, 1))
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Full research → mind map pipeline for a topic or document context.
 */
async function researchMindMap({ topic, context = '', language, onProgress = () => {} }) {
  const cleanTopic = String(topic || '').trim();
  if (!cleanTopic) throw Object.assign(new Error('A topic or title is required.'), { status: 400 });

  const lang = resolveLanguage(language);

  onProgress({ stage: 'researching', message: `Researching "${cleanTopic}"…` });

  // The research pass stays in English regardless of the output language: it is
  // an internal note-taking step, English sources are far better covered, and
  // translating twice loses more than it gains. Only the structuring pass, whose
  // output the user actually reads, is language-directed.
  const research = await requestResearch({
    instructions: RESEARCH_SYSTEM,
    input: context
      ? `TOPIC: ${cleanTopic}\n\nADDITIONAL CONTEXT / SOURCE MATERIAL:\n${context}`
      : `TOPIC: ${cleanTopic}`
  });

  onProgress({
    stage: 'structuring',
    message: research.grounded
      ? `Found ${research.sources.length} sources. Building your map…`
      : 'Building your map…'
  });

  const structured = await requestStructuredAI({
    name: 'setu_mind_map',
    schema: mindMapSchema,
    instructions: `${STRUCTURE_SYSTEM}${languageDirective(lang.code)}`,
    input: `TOPIC: ${cleanTopic}\n\nRESEARCH NOTES:\n${research.text}`,
    temperature: 0.3,
    tier: 'pro'
  });

  onProgress({ stage: 'done', message: 'Map ready.' });

  return {
    topic: cleanTopic,
    title: structured.title || cleanTopic,
    summary: structured.summary,
    keyFacts: structured.keyFacts || [],
    followUps: structured.followUps || [],
    sources: research.sources || [],
    grounded: research.grounded,
    language: lang.code,
    root: buildTree(cleanTopic, structured),
    createdAt: new Date().toISOString()
  };
}

/** Grow one node of an existing map into deeper children. */
async function expandNode({ topic, nodeLabel, nodeDetail, path = [], language }) {
  const trail = path.length ? path.join(' → ') : nodeLabel;

  const result = await requestStructuredAI({
    name: 'setu_node_expansion',
    schema: expansionSchema,
    instructions: `${STRUCTURE_SYSTEM}

You are expanding ONE node of an existing mind map. Return 3-4 children that go a
genuine level deeper — more specific mechanisms, examples, or consequences.
Never restate the parent node in different words.${languageDirective(resolveLanguage(language).code)}`,
    input: `OVERALL TOPIC: ${topic}
PATH TO THIS NODE: ${trail}
NODE TO EXPAND: ${nodeLabel}
WHAT IT CURRENTLY SAYS: ${nodeDetail || '(no detail)'}`,
    temperature: 0.4
  });

  return (result.children || []).map((child) => decorate(child, path.length + 1));
}

/** Classify a chat turn. */
async function classifyTurn({ messages, hasMap, currentTopic, hasDocument }) {
  const recent = messages
    .slice(-6)
    .map((m) => `${m.role === 'assistant' ? 'SETU' : 'USER'}: ${m.content}`)
    .join('\n');

  try {
    // Deliberately the tightest budget in the codebase. Routing sits in front of
    // every chat turn and produces nothing the user sees except an acknowledgement,
    // so time spent here is time before any real work starts — and the heuristic
    // fallback below is a perfectly serviceable answer. Fast and occasionally
    // wrong beats correct and late.
    return await requestStructuredAI({
      name: 'setu_intent',
      schema: intentSchema,
      instructions: `You route messages inside SETU's mind-map chat.

Current state:
- Mind Map: ${hasMap ? `open on "${currentTopic}"` : 'none'}
- Attached Document: ${hasDocument ? 'present' : 'none'}

Choose:
- "query_document" if the user has an attached document and is asking questions about it.
- "research_topic" whenever the user names any subject they want mapped or explained.
- "expand_map" when they want more depth on the existing mind map.
- "answer_question" for questions about the on-screen map.
- "smalltalk" for general greetings.

Make the "reply" warm, brief, and reassuring.`,
      input: recent,
      temperature: 0.2,
      thinkingLevel: 'minimal',
      timeoutMs: 8000,
      maxRetries: 0,
      deadlineMs: 12000
    });
  } catch (_) {
    // Robust fallback intent
    const last = messages[messages.length - 1]?.content || '';
    if (hasDocument) {
      return {
        intent: 'query_document',
        topic: currentTopic || 'Document',
        reply: 'Analyzing your document…'
      };
    }
    return {
      intent: 'research_topic',
      topic: last,
      reply: `Looking into "${last}"…`
    };
  }
}

/** Conversational answer grounded in the map currently on screen. */
async function answerAboutMap({ messages, map, language }) {
  const outline = map
    ? `CURRENT MIND MAP: ${map.title}
SUMMARY: ${map.summary}
BRANCHES:
${(map.root?.children || [])
  .map((b) => `- ${b.label}: ${b.detail}${(b.children || []).map((c) => `\n   • ${c.label}: ${c.detail}`).join('')}`)
  .join('\n')}`
    : 'No mind map is currently open.';

  return requestText({
    instructions: `You are SETU, a calm cognitive assistant for neurodivergent users.
Answer using the mind map below as your primary context. Keep it to 2-4 short
sentences in plain language. If the map does not cover the answer, say so and
offer to research it as a new map.

${outline}${replyLanguageNote(resolveLanguage(language).code)}`,
    messages: messages.slice(-8),
    temperature: 0.5
  });
}

module.exports = {
  researchMindMap,
  expandNode,
  classifyTurn,
  answerAboutMap,
  mindMapSchema
};
