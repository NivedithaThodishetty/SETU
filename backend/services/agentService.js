/**
 * SETU In-Page Agent Service
 * --------------------------
 * Plans multi-step browser actions from a natural-language goal plus a snapshot
 * of the live page. The extension executes the plan; this module decides what
 * should happen and — critically — what must be confirmed by a human first.
 *
 * Safety model: the agent runs on arbitrary websites, including banking and
 * government portals. Any step that sends data, spends money, or cannot be
 * undone is marked `requiresConfirmation` and the extension will not fire it
 * without an explicit click from the user.
 */

const {
  requestStructuredAI,
  requestText,
  describeImage,
  streamText,
  parseJsonLoose
} = require('./aiService');
const { resolveLanguage } = require('../config/languages');

/** Action verbs that can have real-world consequences on a live page. */
const IRREVERSIBLE_ACTIONS = new Set(['submit', 'purchase', 'delete', 'send']);

/** Label patterns that mean "this button does something you can't take back". */
const IRREVERSIBLE_LABEL = /\b(submit|pay|purchase|buy|checkout|order|confirm|delete|remove|send|transfer|withdraw|deposit|apply now|sign up|register|book now|place order|unsubscribe|deactivate|close account)\b/i;

/**
 * Budgets for work with a human waiting on the other end.
 *
 * Every call in this module is in front of somebody staring at a panel on a
 * live page, and every one of them has a deterministic in-page fallback to
 * land on. Answering "I could not" in twenty seconds is worth far more here
 * than answering well in three minutes.
 *
 * `deadlineMs` is the one that actually bounds the wait. `timeoutMs` caps a
 * single HTTP call, but a structured request walks the model chain and retries,
 * so without an overall ceiling a per-call timeout permits a multi-minute
 * request. These numbers are set for Flash-tier Gemini with reasoning held at
 * "low": first token lands in about a second, and a full structured reply well
 * inside the per-call budget, so the deadline is there for the pathological
 * case rather than the normal one.
 */
const INTERACTIVE = { timeoutMs: 12000, maxRetries: 1, deadlineMs: 25000 };

/**
 * The structure map is a heavier generation than the rest — branches, their
 * children, a numeric series, and insights run to several hundred tokens. It
 * gets a longer per-model budget so a capable model is not cut off mid-answer,
 * and a longer ceiling so a second one can be tried. The client is already
 * showing a map read from the page itself while this runs, so the wait costs
 * the reader nothing.
 */
const INTERACTIVE_MAP = { timeoutMs: 20000, maxRetries: 1, deadlineMs: 40000 };

/**
 * Planning, which is the heaviest structured generation in the product.
 *
 * A plan is up to six steps of seven fields each, plus six top-level fields,
 * all under a strict response schema — several hundred tokens of JSON that has
 * to be right first time. It was running on the INTERACTIVE budget, which is
 * sized for a single paragraph of prose, while the *lighter* structure map got
 * nearly twice as long. That was simply the wrong way round, and it showed:
 * planning routinely burned its whole 25-second ceiling walking the model chain
 * and fell back to the keyword planner, so the agent looked far less capable
 * than it is.
 *
 * The budget below fits two unhurried attempts (20s + 20s) inside the ceiling
 * with room to spare, rather than one and a half. The user is not left staring
 * at nothing meanwhile: the panel narrates real stages, counts the seconds, and
 * offers Cancel throughout, and the extension's own request timeout is far
 * longer than this.
 */
const PLANNING = { timeoutMs: 20000, maxRetries: 1, deadlineMs: 48000 };

/** Vision is slower again: a whole image has to be read before a token is written. */
const INTERACTIVE_VISION = { timeoutMs: 25000, deadlineMs: 45000 };

const planSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    goal: { type: 'string' },
    understanding: {
      type: 'string',
      description: 'One sentence restating what the user wants, in their own terms.'
    },
    feasible: {
      type: 'boolean',
      description: 'False when the page simply does not contain what the goal needs.'
    },
    blockedReason: {
      type: 'string',
      description: 'When not feasible, a plain-language explanation. Empty otherwise.'
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stepNumber: { type: 'number' },
          instruction: { type: 'string', description: 'What happens, in plain language, one short sentence.' },
          actionType: {
            type: 'string',
            enum: ['click', 'fill', 'select', 'scroll', 'read', 'wait', 'navigate', 'submit']
          },
          targetRef: {
            type: 'string',
            description: 'The exact "ref" value of the target control from the page snapshot. Empty for scroll/read/wait.'
          },
          targetText: { type: 'string', description: 'Visible label of the target, for fuzzy re-matching.' },
          valueToFill: {
            type: 'string',
            description:
              'Value for fill/select actions. Empty otherwise. To use one of the user\'s saved ' +
              'details, write the placeholder "{{profile.KEY}}" using a key from SAVED DETAILS — ' +
              'the extension substitutes the real value in the browser. Never write a literal ' +
              'name, number, address, or date the user did not give you in their goal.'
          },
          tip: { type: 'string', description: 'A calm, reassuring note for the user.' }
        },
        required: ['stepNumber', 'instruction', 'actionType', 'targetRef', 'targetText', 'valueToFill', 'tip']
      }
    },
    supportiveMessage: { type: 'string', description: 'A warm closing note to reduce task anxiety.' }
  },
  required: ['goal', 'understanding', 'feasible', 'blockedReason', 'steps', 'supportiveMessage']
};

const AGENT_SYSTEM = `You are SETU Commander, an autonomous web navigation agent for users with
ADHD, dyslexia, autism, or memory difficulties. You are given a user's goal and a
snapshot of the interactive controls currently on their screen.

Produce the shortest plan that actually achieves the goal.

Hard rules:
- Only ever target controls that appear in the snapshot. Use their exact "ref" value
  as targetRef. Never invent a ref, a CSS selector, or a control that is not listed.
- If the page genuinely cannot serve the goal, set feasible=false and explain why in
  plain language. A short honest answer beats a plausible fake plan.
- Use actionType "submit" for anything that sends data, buys, deletes, or posts.
  Do not disguise those as ordinary clicks.
- Never invent personal data. You are never shown the user's actual details and you
  must never guess at them. A name, number, date, or address that did not come from
  the user's own goal must be written as a "{{profile.KEY}}" placeholder or left empty.
- Instructions address the user directly, calmly, one action at a time.

Filling in the user's details:
- The SAVED DETAILS list below names the details the user has stored on their own
  device. You are told which keys exist; you are never told what they contain.
- To put one into a field, set valueToFill to "{{profile.KEY}}" — for example
  "{{profile.fullName}}" or "{{profile.pincode}}". The browser extension replaces it
  with the real value locally, after this plan reaches it.
- Only use keys that appear in SAVED DETAILS. A key that is not listed is not
  available: leave valueToFill empty so the user is asked to type it.
- Match the field to the key by meaning, not by wording. A box labelled "Applicant
  Name" takes {{profile.fullName}}; "PIN"/"Postal Code"/"ZIP" all take
  {{profile.pincode}}; a permanent-address block takes the permanent* keys.
- Details the user has not saved are simply absent from the list. Do not substitute a
  near-miss key for a missing one.

Keep plans to 6 steps or fewer. Fewer, clearer steps beat exhaustive ones.
The one exception is filling in a form the user asked you to fill: there, one step per
field is correct, up to 20 steps, because a half-filled form is not a finished task.`;

/**
 * Flag steps the extension must not auto-execute.
 * Belt and braces: we trust the model's actionType but also scan the label,
 * because a "Place order" button is dangerous however it was classified.
 */
function markConfirmations(steps, controls) {
  const byRef = new Map(controls.map((c) => [c.ref, c]));

  /**
   * Find the control a step targets.
   *
   * AI plans address controls by `ref`, but the L0 fallback planner emits
   * `targetText`/`targetSelector` instead. Matching on ref alone meant the
   * `type === 'submit'` check could never fire on a fallback plan, leaving an
   * offline plan protected only by the label regex — so a submit button with
   * an innocuous label ("Go", "Continue") would not be gated.
   */
  const resolve = (step) => {
    if (step.targetRef && byRef.has(step.targetRef)) return byRef.get(step.targetRef);

    const needle = String(step.targetText || '').trim().toLowerCase();
    if (!needle) return null;

    return (
      controls.find((c) => (c.label || '').trim().toLowerCase() === needle) ||
      controls.find((c) => (c.label || '').toLowerCase().includes(needle)) ||
      null
    );
  };

  return steps.map((step) => {
    const control = resolve(step);
    const label = `${step.targetText || ''} ${control?.label || ''}`;

    // A submit-typed control is treated as irreversible regardless of how the
    // step was classified or what the button happens to be called.
    const isSubmitControl =
      control?.type === 'submit' ||
      (control?.tag === 'button' && !control?.type && /submit/i.test(step.actionType));

    const requiresConfirmation =
      IRREVERSIBLE_ACTIONS.has(step.actionType) ||
      IRREVERSIBLE_LABEL.test(label) ||
      isSubmitControl;

    return { ...step, requiresConfirmation };
  });
}

/** Drop steps that point at controls the page never reported. */
function pruneUnresolvableSteps(steps, controls) {
  const refs = new Set(controls.map((c) => c.ref));
  const selfContained = new Set(['scroll', 'read', 'wait', 'navigate']);

  return steps
    .filter((step) => selfContained.has(step.actionType) || !step.targetRef || refs.has(step.targetRef))
    .map((step, index) => ({ ...step, stepNumber: index + 1 }));
}

/**
 * One line describing a control to the model.
 *
 * The extra attributes matter more than they look. A very large share of real
 * forms are labelled badly or not at all and carry their whole meaning in
 * `name="dateOfBirth"` or `autocomplete="postal-code"`; without those the model
 * is matching a goal against the string "Enter here". `required` is included
 * because a plan that fills the optional boxes and skips a mandatory one leaves
 * the user with a form that still will not submit.
 */
function describeControl(c) {
  const parts = [`[${c.ref}] <${c.tag}${c.type ? ` type=${c.type}` : ''}>`, `"${c.label}"`];

  if (c.name) parts.push(`name=${c.name}`);
  if (c.autocomplete) parts.push(`autocomplete=${c.autocomplete}`);
  if (c.placeholder) parts.push(`placeholder="${c.placeholder}"`);
  if (c.required) parts.push('REQUIRED');
  if (Array.isArray(c.options) && c.options.length) {
    parts.push(`options: ${c.options.slice(0, 12).join(' / ')}`);
  }
  if (c.value) parts.push(`(current value: "${c.value}")`);

  return parts.join(' ');
}

/**
 * The user's saved details, as a list of keys with no values attached.
 *
 * This is the entire privacy contract of the feature, and it is one function
 * long: the model is told that `pincode` exists and is filled, and never that
 * it is 560102. It answers with `{{profile.pincode}}`, and the substitution
 * happens in the browser after the plan has come back. Nothing personal is
 * ever in a prompt, a provider's logs, or this process's memory.
 *
 * Values are stripped here as well as in the client. The client is the one
 * that decides what to send, but a server that would happily forward a home
 * address into a prompt if a future client sent one is not actually holding
 * the guarantee.
 */
function describeProfile(profileFields) {
  if (!Array.isArray(profileFields) || !profileFields.length) {
    return 'SAVED DETAILS: (the user has not saved any details, or has not shared which they have.\nLeave valueToFill empty for every personal field and let them type it.)';
  }

  const lines = profileFields
    .slice(0, 120)
    .map((field) => `- {{profile.${field.key}}} — ${field.label}`)
    .join('\n');

  return `SAVED DETAILS the user has stored locally (keys only — you are not shown the values):\n${lines}`;
}

/**
 * Build an action plan for `task` against the supplied page snapshot.
 *
 * @param {object}  args
 * @param {string}  args.task           the user's goal, in their own words
 * @param {object}  args.pageContext    snapshot from the extension
 * @param {Array}   args.profileFields  `{key,label}` of details the user holds;
 *                                      never values — see `describeProfile`.
 */
async function planPageTask({ task, pageContext = {}, profileFields = [] }) {
  const controls = Array.isArray(pageContext.controls) ? pageContext.controls : [];

  const snapshot = `PAGE TITLE: ${pageContext.title || 'Untitled'}
PAGE URL: ${pageContext.url || 'unknown'}
HEADINGS: ${(pageContext.headings || []).slice(0, 12).join(' | ') || 'none'}

${describeProfile(profileFields)}

INTERACTIVE CONTROLS ON SCREEN:
${controls.length ? controls.map(describeControl).join('\n') : '(none detected)'}

VISIBLE TEXT EXCERPT:
${(pageContext.text || '').slice(0, 2500) || '(no text captured)'}`;

  const plan = await requestStructuredAI({
    name: 'setu_page_plan',
    schema: planSchema,
    instructions: AGENT_SYSTEM,
    input: `USER GOAL: "${task}"\n\n${snapshot}`,
    temperature: 0.3,
    ...PLANNING
  });

  const steps = markConfirmations(
    pruneUnknownTokens(pruneUnresolvableSteps(plan.steps || [], controls), profileFields),
    controls
  );

  return {
    ...plan,
    steps,
    totalSteps: steps.length,
    currentStepIndex: 0
  };
}

/** `{{profile.key}}` in whatever shape a model under load actually emitted it. */
const PROFILE_TOKEN = /\{\{\s*(?:profile\s*\.\s*)?([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Strip placeholders naming a detail the user does not have.
 *
 * Models fill gaps. Told the user has saved a `pincode` and asked to complete an
 * address, one will happily also write `{{profile.aadhaar}}` for the ID box on
 * the same form — a key it was never given, for a number the user never saved.
 * Left alone that produces a step which claims it will fill a field and then
 * writes an empty string into it, which is the specific failure this whole
 * feature exists to stop.
 *
 * Emptying `valueToFill` is the right repair rather than dropping the step: the
 * extension then either matches the field from the saved details itself or asks
 * the user to type it, and either way the field is still on their list.
 */
function pruneUnknownTokens(steps, profileFields) {
  const known = new Set((profileFields || []).map((field) => field.key));

  return steps.map((step) => {
    const value = String(step.valueToFill || '');
    if (!value.includes('{{')) return step;

    PROFILE_TOKEN.lastIndex = 0;
    const referenced = [...value.matchAll(PROFILE_TOKEN)].map((match) => match[1]);
    if (!referenced.length || referenced.every((key) => known.has(key))) return step;

    // The tip is replaced rather than kept. The model wrote it to describe a
    // step that is no longer going to happen — "Your Aadhaar." above a field
    // the agent is now going to leave for the user is worse than no tip at all.
    return {
      ...step,
      valueToFill: '',
      tip: 'I do not have this one saved — type it in and carry on.'
    };
  });
}

/**
 * The one prompt behind every plain-language explanation.
 *
 * Shared by the buffered and streamed paths so an answer does not change
 * character depending on which transport the client happened to use.
 */
function explainerInstructions({ language = 'English', style = 'plain' } = {}) {
  const styleGuide = {
    plain: 'Explain in plain Grade 6 language using a short everyday analogy.',
    simple: 'Explain as if to a bright 10-year-old. Two sentences maximum.',
    detailed: 'Explain thoroughly but in short sentences, with one worked example.',
    spoken:
      'Write it to be listened to, not read: no headings, no bullet points, no markdown. ' +
      'Short spoken sentences that flow into each other, at a Grade 6 level.'
  }[style] || 'Explain in plain Grade 6 language.';

  // Callers hand us whatever they have: a BCP-47 code from the web app's
  // language picker ('hi-IN'), or a bare name from the extension ('Hindi').
  // Resolving both to the same catalogue entry is what stops an explanation
  // coming back in English because the prompt said "respond entirely in hi-IN"
  // and the model quietly ignored it.
  const resolved = resolveLanguage(language);
  const looksLikeCode = /^[a-z]{2}([-_][A-Za-z]{2,4})?$/.test(String(language || '').trim());
  const languageName = looksLikeCode || !language ? resolved.name : String(language);
  const nativeName = looksLikeCode || !language ? resolved.native : '';

  return `You are SETU's vernacular explainer for neurodivergent users.
${styleGuide}
Respond entirely in ${languageName}${nativeName && nativeName !== languageName ? ` (${nativeName})` : ''}, in its native script, written naturally rather than
translated word-for-word from English.
Keep widely used English technical terms in English where a ${languageName} speaker would normally say them that way.
Never use jargon without immediately defining it. Keep sentences under 20 words.
Write prose only: no markdown, no headings, no bullet characters.`;
}

/**
 * Explain any page element, selection, or jargon in plain language —
 * optionally in the user's own language, per the Multilingual Vernacular
 * Explainer in the product spec.
 */
async function explainContent({ text, language = 'English', style = 'plain' }) {
  return requestText({
    instructions: explainerInstructions({ language, style }),
    input: text,
    temperature: 0.5,
    ...INTERACTIVE
  });
}

/**
 * The same explanation, yielded token by token.
 *
 * A model takes several seconds to finish a paragraph and about one to start
 * it. Buffering the whole answer spends that entire difference on a spinner;
 * streaming spends it on the user already reading. This is the single largest
 * perceived-latency improvement available without changing models.
 */
async function* streamExplanation({ text, language = 'English', style = 'plain' }) {
  yield* streamText({
    instructions: explainerInstructions({ language, style }),
    input: text,
    temperature: 0.5
  });
}

/**
 * Preemptive Cognitive Task Chunking: turn a dense, high-anxiety page into a
 * short linear checklist so the user is never facing the whole thing at once.
 */
const chunkSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pageName: { type: 'string' },
    whatThisPageIsFor: { type: 'string', description: 'One plain sentence.' },
    estimatedMinutes: { type: 'number' },
    thingsToHaveReady: { type: 'array', items: { type: 'string' } },
    steps: {
      type: 'array',
      description: 'Exactly 3 steps. Never more — the point is to shrink the wall.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: '3-6 words.' },
          what: { type: 'string', description: 'One sentence on what to do.' },
          why: { type: 'string', description: 'One short sentence on why it matters.' }
        },
        required: ['title', 'what', 'why']
      }
    },
    encouragement: { type: 'string' }
  },
  required: ['pageName', 'whatThisPageIsFor', 'estimatedMinutes', 'thingsToHaveReady', 'steps', 'encouragement']
};

async function chunkPageIntoTasks({ pageContext = {} }) {
  return requestStructuredAI({
    name: 'setu_task_chunks',
    schema: chunkSchema,
    instructions: `You reduce overwhelming web pages into exactly 3 calm, linear steps for users
facing task-initiation paralysis.

Rules:
- Exactly 3 steps. If the page needs more, group them — never exceed 3.
- Each step is something the user can finish in a few minutes.
- "thingsToHaveReady" lists documents or details to gather first, so they are not
  ambushed halfway through. Empty array if nothing is needed.
- Encouragement is warm and specific, never generic cheerleading.`,
    input: `PAGE TITLE: ${pageContext.title || ''}
URL: ${pageContext.url || ''}
HEADINGS: ${(pageContext.headings || []).join(' | ')}
FORM FIELDS: ${(pageContext.controls || []).filter((c) => ['input', 'select', 'textarea'].includes(c.tag)).map((c) => c.label).join(', ') || 'none'}
TEXT:
${(pageContext.text || '').slice(0, 4000)}`,
    temperature: 0.4,
    ...INTERACTIVE
  });
}

/**
 * Describe a chart, diagram, or dense interface region for someone who cannot
 * easily parse it visually.
 */
async function describeVisual({ imageBase64, mimeType, context = '', language = 'English' }) {
  return describeImage({
    imageBase64,
    mimeType,
    instructions: `You describe visuals for users with dyslexia, ADHD, or low vision.

Structure every answer as:
1. One sentence on what this is.
2. The main thing it shows — the actual takeaway, not a restatement of the axes.
3. The specific numbers, labels, or steps it contains, as a short list.

Use short sentences. Read values off the image rather than guessing. If part of
it is genuinely illegible, say which part instead of inventing it.
Respond entirely in ${language}.`,
    prompt: context
      ? `Describe this image. Surrounding page context: ${context}`
      : 'Describe this image.',
    ...INTERACTIVE_VISION
  });
}

/* -------------------------------------------------------------------------- */
/* Visual explainer — a picture of the thing, not a paragraph about it         */
/* -------------------------------------------------------------------------- */

/**
 * The structure a chart, table, diagram, or dense section gets turned into.
 *
 * Deliberately one schema for every input type. A user pointing at a bar chart
 * and a user pointing at a wall of terms and conditions want the same thing —
 * the shape of the information, laid out so it can be scanned instead of
 * decoded — and giving each its own format would mean two renderers, two sets
 * of bugs, and two different things to learn.
 *
 * `series` is what makes a chart readable rather than merely described: the
 * numbers come back as data, so the client can redraw them large, labelled,
 * and in the reader's own palette.
 */
const visualSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Short name for what this is. 2-7 words.' },
    kind: {
      type: 'string',
      enum: ['mindmap', 'flow', 'comparison', 'timeline', 'data'],
      description:
        'data for charts and tables of numbers. flow for step-by-step processes. ' +
        'timeline for anything ordered by date. comparison for A-vs-B. mindmap otherwise.'
    },
    summary: {
      type: 'string',
      description: 'One plain sentence: what this shows. Not a restatement of the axes or headings.'
    },
    branches: {
      type: 'array',
      description:
        '3 to 6 top-level parts, each a genuinely distinct facet. Never overlapping. ' +
        'For a flow these are the steps in order; for a timeline, the periods in order.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', description: '2-5 words. Never a sentence.' },
          detail: { type: 'string', description: 'One clear sentence at a Grade 6 reading level.' },
          children: {
            type: 'array',
            description: '0 to 4 specifics that add detail rather than restating the parent.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string', description: '2-5 words.' },
                detail: { type: 'string', description: 'One short sentence. May be empty.' }
              },
              required: ['label', 'detail']
            }
          }
        },
        required: ['label', 'detail', 'children']
      }
    },
    series: {
      type: 'array',
      description:
        'Numbers actually readable in the source, for redrawing. Empty array when there are none. ' +
        'Never estimate a value that is not legible.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          value: { type: 'number' },
          unit: { type: 'string', description: 'Empty string when unitless.' }
        },
        required: ['label', 'value', 'unit']
      }
    },
    insights: {
      type: 'array',
      description: '2 to 4 takeaways a reader should leave with. Each one short and specific.',
      items: { type: 'string' }
    },
    caution: {
      type: 'string',
      description:
        'What was genuinely illegible or ambiguous in the source. Empty string when nothing was.'
    }
  },
  required: ['title', 'kind', 'summary', 'branches', 'series', 'insights', 'caution']
};

const VISUAL_SYSTEM = `You turn one piece of a web page into a structured map for readers with
dyslexia, ADHD, autism, or low vision. They are not asking for prose — prose is the thing they
were already struggling with. They are asking for the shape underneath it.

THE MAP IS THE ANSWER. A reply whose "branches" array is empty is a failed reply, however good
the summary sentence is. Every response must contain at least 3 branches. If the source is short,
break it down more finely rather than returning fewer.

Rules:
- Read values, labels, and steps off the source. Never invent one to make the map tidier.
- If part of it is genuinely illegible or ambiguous, name that part in "caution" rather than
  guessing. A stated gap is useful; a confident wrong number is not.
- Branch labels are 2-5 words, never sentences. Details are one sentence, under 20 words.
- Distinct branches only. Two branches that say the same thing differently is a failure.
- Every number you can actually read goes in "series", as a real JSON number with its label —
  and when the source is mostly numbers, set kind to "data". An empty "series" on a chart or a
  table of figures is a failed reply.
- "insights" carry the point: what changed, what is largest, what the reader should do.
  Always give at least two.

`;

/**
 * A fully-populated reply for the model to copy the shape of.
 *
 * This is doing more work than any instruction above it. The small free models
 * SETU runs on reliably fill a schema's scalar fields and then hand back `[]`
 * for every array — producing a valid object with a title, a summary, and no
 * map at all. Prose rules did not fix it; being shown one complete example
 * did.
 */
const VISUAL_EXAMPLE = {
  title: 'Regional Sales This Quarter',
  kind: 'data',
  summary: 'East sold the most; South sold the least.',
  branches: [
    {
      label: 'East leads',
      detail: 'East sold 210 units, more than any other region.',
      children: [{ label: 'New distributor', detail: 'A distributor deal opened in March.' }]
    },
    {
      label: 'North steady',
      detail: 'North sold 120 units, close to last quarter.',
      children: []
    },
    {
      label: 'South lagging',
      detail: 'South sold 85 units, the lowest of the four.',
      children: []
    }
  ],
  series: [
    { label: 'East', value: 210, unit: 'units' },
    { label: 'North', value: 120, unit: 'units' },
    { label: 'West', value: 96, unit: 'units' },
    { label: 'South', value: 85, unit: 'units' }
  ],
  insights: [
    'East outsold South by nearly three to one.',
    'The distributor deal is the clearest cause of the gap.'
  ],
  caution: ''
};

/**
 * Build the structure map for a page region or an image of one.
 *
 * Takes either `text` (a table, a section, a block of prose) or `imageBase64`
 * (a chart, a diagram, a screenshot of an interface). Images go to the vision
 * model; text does not, because text is exact, free, and far faster.
 */
async function visualiseContent({
  text = '',
  imageBase64 = '',
  mimeType = 'image/jpeg',
  context = '',
  language = 'English'
}) {
  const languageName = resolveLanguage(language).name || language;
  const instructions = `${VISUAL_SYSTEM}

Write every human-readable string in ${languageName}, in its native script. JSON key names and
enum values stay in English exactly as specified, and numbers stay as digits.`;

  if (imageBase64) {
    // The vision helper returns prose rather than taking a response schema, so
    // the shape has to be carried by the prompt and recovered from loose JSON.
    // The text path below uses Gemini's server-enforced schema instead, which
    // is why only this branch needs the instruction block spelled out.
    const raw = await describeImage({
      imageBase64,
      mimeType,
      instructions: `${instructions}

You must reply with a single raw JSON object and nothing else — no markdown, no code fence,
no commentary. It must match this JSON Schema exactly:
${JSON.stringify(visualSchema, null, 2)}

Use these exact key names and nesting. Every key listed in "required" must be present, and every
array must be populated — returning an empty [] for branches, series, or insights is a failed
reply.

A correctly shaped reply looks exactly like this:
${JSON.stringify(VISUAL_EXAMPLE)}`,
      prompt: context
        ? `Map this image. Surrounding page context: ${context}`
        : 'Map this image.',
      ...INTERACTIVE_VISION
    });

    return assertUsable(normaliseVisual(parseJsonLoose(raw)));
  }

  const structured = await requestStructuredAI({
    name: 'setu_visual_map',
    schema: visualSchema,
    instructions,
    example: VISUAL_EXAMPLE,
    // Checked inside the request rather than after it, so an empty map is
    // never cached and counts as a failure worth trying another model for.
    validate: (parsed) => {
      const branches = Array.isArray(parsed?.branches) ? parsed.branches : [];
      const series = Array.isArray(parsed?.series) ? parsed.series : [];
      if (!branches.length && !series.length) {
        return 'both "branches" and "series" are empty, so there is no map to draw';
      }
      return null;
    },
    input: `${context ? `PAGE CONTEXT: ${context}\n\n` : ''}CONTENT TO MAP:\n${String(text).slice(0, 12000)}`,
    temperature: 0.25,
    ...INTERACTIVE_MAP
  });

  return assertUsable(normaliseVisual(structured));
}

/**
 * Repair a structure that is *almost* right.
 *
 * Free models drop an empty array or return a number as a string often enough
 * that rejecting the whole answer over it would mean visibly failing on
 * responses a reader would have been perfectly happy with.
 *
 * What is *not* repairable is a map with nothing in it. Free models will
 * happily return a valid object carrying a title, a summary, and three empty
 * arrays — schema-valid, and completely useless, because the map is the entire
 * point of this endpoint. Treating that as success would render a blank panel;
 * throwing sends the caller to its retry and then to the in-page structure
 * reader, which always has something to show.
 */
function assertUsable(map) {
  if (!map.branches.length && !map.series.length) {
    const error = new Error(
      'The model returned an empty map — no branches and no values.'
    );
    error.emptyMap = true;
    throw error;
  }
  return map;
}

function normaliseVisual(raw) {
  const branches = Array.isArray(raw?.branches) ? raw.branches : [];

  return {
    title: String(raw?.title || 'This section').slice(0, 120),
    kind: ['mindmap', 'flow', 'comparison', 'timeline', 'data'].includes(raw?.kind)
      ? raw.kind
      : 'mindmap',
    summary: String(raw?.summary || ''),
    branches: branches.slice(0, 8).map((branch) => ({
      label: String(branch?.label || '').slice(0, 80),
      detail: String(branch?.detail || ''),
      children: (Array.isArray(branch?.children) ? branch.children : [])
        .slice(0, 6)
        .map((child) => ({
          label: String(child?.label || '').slice(0, 80),
          detail: String(child?.detail || '')
        }))
        .filter((child) => child.label)
    })).filter((branch) => branch.label),
    series: (Array.isArray(raw?.series) ? raw.series : [])
      .slice(0, 24)
      .map((point) => ({
        label: String(point?.label || '').slice(0, 60),
        value: Number(point?.value),
        unit: String(point?.unit || '')
      }))
      .filter((point) => point.label && Number.isFinite(point.value)),
    insights: (Array.isArray(raw?.insights) ? raw.insights : [])
      .slice(0, 6)
      .map((line) => String(line))
      .filter(Boolean),
    caution: String(raw?.caution || '')
  };
}

module.exports = {
  planPageTask,
  // Exported for the profile test suite: both are pure, and both are places a
  // regression would leak or silently drop a value rather than throw.
  describeProfile,
  pruneUnknownTokens,
  explainContent,
  streamExplanation,
  chunkPageIntoTasks,
  describeVisual,
  visualiseContent,
  markConfirmations,
  visualSchema
};
