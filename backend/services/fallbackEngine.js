/**
 * Deterministic L0 Offline Rule Engine
 * 100% offline, zero-latency local fallback algorithms.
 */

function splitSentences(text) {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text])
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length > 10);
}

function generateLocalStartMode(task, isStuck) {
  const cleanTask = task.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const words = cleanTask.split(/\s+/).slice(0, 5).join(' ');

  return {
    clarifyingQuestion: isStuck
      ? `What is the single smallest obstacle stopping you right now from working on "${words}"?`
      : `Would you prefer to spend 10 minutes drafting an outline or gathering materials for "${words}"?`,
    immediateTenMinuteAction: `Open a blank document, title it "${words || 'My Task'}", and write down 3 quick bullet points.`,
    microSteps: [
      `Step 1: Set a timer for 10 minutes (no pressure to finish).`,
      `Step 2: Write down the first 3 sub-items for ${words || 'this task'}.`,
      `Step 3: Pick one sub-item and complete just 1 sentence or line.`,
      `Step 4: Take a 2-minute break and celebrate starting.`
    ],
    supportiveMessage: `Starting is the hardest part. You don't have to finish today — just give yourself 10 quiet minutes.`,
    confidenceMeter: {
      effortLevel: isStuck ? 'Low' : 'Medium',
      anxietyLevel: isStuck ? 'High' : 'Moderate',
      estimatedTimeMinutes: 10
    }
  };
}

function generateLocalSimplifyMode(text) {
  const sentences = splitSentences(text);
  const plainText = sentences.slice(0, 4).join(' ');
  return {
    plainLanguageRewrite: plainText
      ? `In clear terms: ${plainText}`
      : 'The page content has been formatted into short, direct sentences.',
    keyTakeaways: sentences.slice(0, 3).map((s) => s.trim()),
    sensoryTips: [
      'Enable High Contrast mode if bright backgrounds strain your eyes.',
      'Use Bionic Reading anchors to guide visual tracking.'
    ],
    readabilityGrade: 'Grade 6.5 (Plain Language)'
  };
}

function generateLocalLearnMode(text) {
  const sentences = splitSentences(text);
  const title = sentences[0] ? sentences[0].slice(0, 40) : 'Core Concept';
  return {
    summary: sentences.slice(0, 3).join(' ') || 'Key learning points extracted from source material.',
    mindMap: {
      rootNode: title,
      branches: [
        {
          topic: 'Overview',
          details: [sentences[0] || 'Primary context', sentences[1] || 'Key background']
        },
        {
          topic: 'Key Insights',
          details: [sentences[2] || 'Core finding', sentences[3] || 'Important implication']
        }
      ]
    },
    quiz: [
      {
        question: `What is the main topic discussed in this material?`,
        options: [title, 'Unrelated topic A', 'Unrelated topic B'],
        answerIndex: 0,
        explanation: `The material primarily focuses on ${title}.`
      },
      {
        question: `How should you approach reading this text?`,
        options: ['Break it into small chunks', 'Read it all in one sitting without breaks', 'Ignore key terms'],
        answerIndex: 0,
        explanation: 'Chunking dense text reduces cognitive load.'
      }
    ]
  };
}

function generateLocalMeetMode(transcript) {
  const sentences = splitSentences(transcript);
  return {
    summary: sentences.slice(0, 2).join(' ') || 'Meeting transcript processed.',
    keyDecisions: [
      sentences[0] || 'Decided to move forward with project plan.',
      'Agreed on timeline for initial draft review.'
    ],
    actionItems: [
      { task: sentences[1] || 'Review initial draft details', owner: 'Team Lead', deadline: 'End of week', priority: 'High' },
      { task: 'Prepare next milestone overview', owner: 'Assignee', deadline: 'Next Monday', priority: 'Medium' }
    ],
    jargonDecoded: [
      { term: 'Bandwidth', plainMeaning: 'Available time and energy' },
      { term: 'Actionable', plainMeaning: 'Can be done right away' }
    ]
  };
}

function generateLocalPracticeMode(topic, userUtterance) {
  return {
    scenarioContext: `Rehearsing for: ${topic}`,
    openingLine: `Roleplay Partner: "Hello! Thanks for reaching out regarding ${topic}. How can I assist you today?"`,
    suggestedResponses: [
      { label: 'Direct & Clear', text: `Hi, I wanted to discuss ${topic} and align on the next immediate steps.`, tone: 'Direct' },
      { label: 'Polite & Collaborative', text: `Thanks for making time. I'd love to share my thoughts on ${topic} when you have a moment.`, tone: 'Collaborative' },
      { label: 'Asking for Time', text: `I am currently reviewing details for ${topic}. Can we check in tomorrow morning?`, tone: 'Cautious' }
    ],
    coachingTip: 'Take a slow breath before responding. Pause whenever you need to collect your thoughts.'
  };
}

function generateLocalWriteMode(text) {
  const sentences = splitSentences(text);
  const passiveRegex = /\b(am|is|are|was|were|be|been|being)\s+(\w+ed|\w+en)\b/gi;
  const passiveMatches = text.match(passiveRegex) || [];

  return {
    originalGradeLevel: 'Grade 10.2',
    improvedText: sentences.map((s) => s.replace(passiveRegex, 'is active')).join(' '),
    passiveVoiceInstances: Array.from(new Set(passiveMatches)).slice(0, 4),
    clarityFixes: [
      {
        originalSnippet: sentences[0] || 'Complex phrasing used here.',
        suggestedSnippet: sentences[0] ? sentences[0].slice(0, 60) + '.' : 'Use shorter sentences.',
        reason: 'Shortening sentences improves working-memory retention.'
      }
    ]
  };
}

/**
 * Each `tip` is written as a clause completing "You will know it worked when …",
 * matching both the AI contract and how the web app labels it.
 */
function generateLocalGuideMode(goal) {
  const cleanGoal = String(goal || 'this task').trim();
  return {
    workflowName: cleanGoal,
    totalSteps: 4,
    steps: [
      {
        stepNumber: 1,
        title: 'Write down the finish line',
        actionRequired: `In one sentence, write what "${cleanGoal}" looks like when it is done.`,
        tip: 'you can read the sentence back and it names something you could point at.'
      },
      {
        stepNumber: 2,
        title: 'Gather what you need first',
        actionRequired: 'List every document, number, or login this will ask you for, and find them before starting.',
        tip: 'nothing on the list is still marked "need to find".'
      },
      {
        stepNumber: 3,
        title: 'Do the first concrete action',
        actionRequired: 'Open the form, page, or file and complete only the parts you can answer without looking anything up.',
        tip: 'the easy fields are filled and only the ones needing research are blank.'
      },
      {
        stepNumber: 4,
        title: 'Close the gaps, then submit',
        actionRequired: 'Go back to the blanks one at a time, then review once and submit.',
        tip: 'you see a confirmation message or reference number.'
      }
    ]
  };
}

function generateLocalSummary(text, maxPoints) {
  const sentences = splitSentences(text);
  return sentences.slice(0, maxPoints);
}

/* -------------------------------------------------------------------------- */
/* Numbers (dyscalculia) — offline concrete-object arithmetic                 */
/* -------------------------------------------------------------------------- */

/** Objects are countable, everyday, and cheap to picture. One per problem. */
const COUNTABLE_OBJECTS = [
  { name: 'apple', plural: 'apples', emoji: '🍎' },
  { name: 'banana', plural: 'bananas', emoji: '🍌' },
  { name: 'orange', plural: 'oranges', emoji: '🍊' },
  { name: 'biscuit', plural: 'biscuits', emoji: '🍪' },
  { name: 'coin', plural: 'coins', emoji: '🪙' },
  { name: 'pencil', plural: 'pencils', emoji: '✏️' }
];

/**
 * Pick an object deterministically from the question text, so re-running the
 * same problem keeps drawing the same fruit and the picture stays familiar.
 */
function pickObject(seedText) {
  const seed = String(seedText || '')
    .split('')
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  return COUNTABLE_OBJECTS[seed % COUNTABLE_OBJECTS.length];
}

/**
 * Pull a single two-operand sum out of free text.
 *
 * Handles both notation ("12 - 5", "3 x 4") and the words people actually type
 * ("what is 3 times 4"). Returns null when there is no clean single operation,
 * which is the signal to fall back to a non-numeric breakdown rather than
 * inventing an answer.
 */
function parseSimpleArithmetic(text) {
  const normalised = String(text || '')
    .toLowerCase()
    .replace(/\bplus\b|\band\b|\badded to\b/g, '+')
    .replace(/\bminus\b|\bless\b|\btake away\b|\bsubtract\b/g, '-')
    .replace(/\btimes\b|\bmultiplied by\b|\blots of\b|\bgroups of\b|×/g, '*')
    .replace(/\bdivided by\b|\bshared between\b|\bsplit between\b|÷/g, '/')
    .replace(/\bx\b/g, '*');

  const match = normalised.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const left = Number(match[1]);
  const operator = match[2];
  const right = Number(match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  if (operator === '/' && right === 0) return null;

  const result = {
    '+': left + right,
    '-': left - right,
    '*': left * right,
    '/': left / right
  }[operator];

  return { left, right, operator, result };
}

/**
 * Deterministic dyscalculia explanation used when no AI provider is reachable.
 *
 * Deliberately mirrors the AI contract exactly — same objects, same step shape —
 * so the client renders identical counters either way and the offline answer is
 * never the visibly degraded one.
 */
function generateLocalNumbersMode(problem) {
  const question = String(problem || '').trim();
  const object = pickObject(question);
  const sum = parseSimpleArithmetic(question);

  if (!sum) {
    return {
      plainQuestion: question || 'Your number problem',
      objectName: object.name,
      objectNamePlural: object.plural,
      objectEmoji: object.emoji,
      story: `Let us lay this out with ${object.plural} on the table instead of keeping it in your head.`,
      steps: [
        {
          narration: `Read the problem once and put down one ${object.name} for every number you can find.`,
          operation: 'start',
          count: 0,
          runningTotal: 0
        },
        {
          narration:
            'Now say out loud what is happening to them — are they joining together, going away, or being shared out?',
          operation: 'compare',
          count: 0,
          runningTotal: 0
        },
        {
          narration: 'Do that one action with the objects in front of you, then count what is left.',
          operation: 'result',
          count: 0,
          runningTotal: 0
        }
      ],
      answer: 'Count the objects left on the table — that is your answer.',
      answerNumber: 0,
      checkIt: 'Count them a second time backwards. You should land on the same number.',
      realLife: 'Laying out real objects removes the need to hold numbers in your head while you work.'
    };
  }

  const { left, right, operator, result } = sum;
  const round = (value) => Math.round(value * 100) / 100;

  const byOperator = {
    '+': {
      story: `You have ${left} ${object.plural} on the table. Someone hands you ${right} more.`,
      steps: [
        {
          narration: `Put ${left} ${object.plural} on the table and count them out loud.`,
          operation: 'start',
          count: left,
          runningTotal: left
        },
        {
          narration: `Now add ${right} more ${object.plural} next to them.`,
          operation: 'add',
          count: right,
          runningTotal: round(result)
        },
        {
          narration: `Count everything on the table. There are ${round(result)} ${object.plural}.`,
          operation: 'result',
          count: round(result),
          runningTotal: round(result)
        }
      ],
      checkIt: `Take the ${right} you added back off the table. You should be back to ${left}.`,
      realLife: 'This is what you do when you add one shop bill to another.'
    },
    '-': {
      story: `You have ${left} ${object.plural}. You give ${right} of them away.`,
      steps: [
        {
          narration: `Put ${left} ${object.plural} on the table and count them out loud.`,
          operation: 'start',
          count: left,
          runningTotal: left
        },
        {
          narration: `Slide ${right} ${object.plural} away from the group.`,
          operation: 'remove',
          count: right,
          runningTotal: round(result)
        },
        {
          narration: `Count what is still in front of you. There are ${round(result)} ${object.plural}.`,
          operation: 'result',
          count: Math.max(0, round(result)),
          runningTotal: round(result)
        }
      ],
      checkIt: `Put the ${right} back. If you land on ${left} again, the answer is right.`,
      realLife: 'This is working out how much money is left after you pay for something.'
    },
    '*': {
      story: `You have ${left} baskets, and every basket holds ${right} ${object.plural}.`,
      steps: [
        {
          narration: `Make ${left} separate piles.`,
          operation: 'group',
          count: left,
          runningTotal: 0,
          groupSize: right
        },
        {
          narration: `Put ${right} ${object.plural} into every single pile.`,
          operation: 'add',
          count: round(result),
          runningTotal: round(result),
          groupSize: right
        },
        {
          narration: `Now count every ${object.name} across all the piles: ${round(result)}.`,
          operation: 'result',
          count: round(result),
          runningTotal: round(result)
        }
      ],
      checkIt: `Count the piles one at a time, adding ${right} each time. You should reach ${round(result)}.`,
      realLife: 'This is working out the cost of buying several of the same item.'
    },
    '/': {
      story: `You have ${left} ${object.plural} and you are sharing them fairly between ${right} people.`,
      steps: [
        {
          narration: `Put all ${left} ${object.plural} on the table.`,
          operation: 'start',
          count: left,
          runningTotal: left
        },
        {
          narration: `Deal them out one at a time into ${right} equal piles, like dealing cards.`,
          operation: 'split',
          count: left,
          runningTotal: round(result),
          groupSize: right
        },
        {
          narration: `Count one pile. Each person gets ${round(result)} ${object.plural}.`,
          operation: 'result',
          count: Math.max(0, Math.floor(result)),
          runningTotal: round(result)
        }
      ],
      checkIt: `Push the ${right} piles back together. You should have ${left} again.`,
      realLife: 'This is splitting a restaurant bill evenly between friends.'
    }
  }[operator];

  const verb = { '+': 'plus', '-': 'take away', '*': 'lots of', '/': 'shared between' }[operator];

  return {
    plainQuestion: `What is ${left} ${verb} ${right}?`,
    objectName: object.name,
    objectNamePlural: object.plural,
    objectEmoji: object.emoji,
    story: byOperator.story,
    steps: byOperator.steps,
    answer: `${round(result)}`,
    answerNumber: round(result),
    checkIt: byOperator.checkIt,
    realLife: byOperator.realLife
  };
}

/* -------------------------------------------------------------------------- */
/* Listen — offline reflective support                                        */
/* -------------------------------------------------------------------------- */

/**
 * Offline reflective response.
 *
 * Kept deliberately plain: with no model available the honest thing is to
 * acknowledge, offer a grounding exercise that works without any AI at all, and
 * ask one open question — not to simulate understanding it does not have.
 */
function generateLocalListenMode(entry) {
  const text = String(entry || '').trim();
  const firstLine = splitSentences(text)[0] || text.slice(0, 120);

  return {
    reflection: firstLine
      ? `I hear you saying: "${firstLine}"`
      : 'I hear that something is sitting heavily with you right now.',
    namedFeelings: ['Overwhelmed'],
    validation:
      'That sounds genuinely hard, and it makes sense that it is taking up space. You are not being dramatic about it.',
    groundingExercise: {
      name: '5-4-3-2-1 senses',
      durationMinutes: 3,
      steps: [
        'Name five things you can see right now.',
        'Name four things you can physically feel touching you.',
        'Name three things you can hear.',
        'Name two things you can smell, and one slow breath out.'
      ]
    },
    openQuestion: 'What part of this is sitting heaviest at the moment?',
    oneSmallThing: 'Drink a glass of water and step away from the screen for two minutes before deciding anything.'
  };
}

/**
 * Crisis detection and the fixed crisis response.
 *
 * Both moved to services/crisisDetector.js and are re-exported here so every
 * existing caller keeps working unchanged. The move was not cosmetic: the
 * implementation that lived at this spot was twelve English regular expressions
 * in a product that accepts input in twenty-three languages, so a Hindi or
 * Tamil speaker in distress matched nothing and was answered by a sampled model
 * reply instead of the reviewed script. Detection is now per-language, covers
 * romanised and code-mixed input, and has a classifier second pass behind it,
 * which is more code than belongs in the middle of the offline rule engine and
 * needs a test suite of its own.
 */
const {
  detectCrisisLanguage,
  buildCrisisResponse,
  inspectCrisisLanguage,
  assessCrisisRisk
} = require('./crisisDetector');

function formatArtifactMarkdown(mode, data) {
  let md = `# NeuroBridge One Artifact: ${mode.toUpperCase()}\n\n`;
  if (mode === 'start') {
    md += `## Clarifying Question\n${data.clarifyingQuestion}\n\n`;
    md += `## Immediate 10-Minute Action\n> ${data.immediateTenMinuteAction}\n\n`;
    md += `## Micro-steps\n`;
    (data.microSteps || []).forEach((s) => (md += `- ${s}\n`));
  } else if (mode === 'learn') {
    md += `## Summary\n${data.summary}\n\n## Mind Map Branches\n`;
    (data.mindMap?.branches || []).forEach((b) => {
      md += `### ${b.topic}\n`;
      b.details.forEach((d) => (md += `- ${d}\n`));
    });
  } else if (mode === 'meet') {
    md += `## Summary\n${data.summary}\n\n## Action Items\n`;
    (data.actionItems || []).forEach((a) => (md += `- [ ] **${a.task}** (Owner: ${a.owner}, Deadline: ${a.deadline})\n`));
  } else {
    md += `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
  }
  return md;
}

function generateLocalNavigationPlan(task, pageContext = {}) {
  const cleanTask = String(task || 'Navigate page').trim();
  const controls = pageContext.controls || [];
  const title = pageContext.title || 'Target Portal';

  // Extract login or primary action controls from page context
  const loginControl = controls.find(c => /login|sign in|member|passbook|portal|log in/i.test(c.label || c.text || ''));
  const submitControl = controls.find(c => /submit|apply|proceed|next|register|search/i.test(c.label || c.text || ''));
  const inputControl = controls.find(c => /input|text|search|uan|aadhaar|pan|email|user/i.test(c.type || c.label || ''));

  const steps = [];

  if (loginControl) {
    steps.push({
      stepNumber: 1,
      instruction: `Click the "${loginControl.label || 'Login'}" link highlighted on the page to open the member access portal.`,
      targetSelector: loginControl.selector || 'a, button',
      targetText: loginControl.label || 'Login',
      actionType: 'click',
      tip: 'The target element is highlighted with a green glowing halo ring on your screen.'
    });
  } else {
    steps.push({
      stepNumber: 1,
      instruction: `Locate the main access section on ${title}.`,
      targetSelector: 'body',
      targetText: title,
      actionType: 'view',
      tip: 'Look for the primary navigation header or main button.'
    });
  }

  if (inputControl) {
    steps.push({
      stepNumber: steps.length + 1,
      instruction: `Enter your details into the "${inputControl.label || 'Input'}" field.`,
      targetSelector: inputControl.selector || 'input[type="text"]',
      targetText: inputControl.label || '',
      actionType: 'fill',
      tip: 'Optional fields can be skipped to save working memory.'
    });
  }

  steps.push({
    stepNumber: steps.length + 1,
    instruction: submitControl 
      ? `Click "${submitControl.label || 'Submit'}" to complete your request for "${cleanTask}".`
      : `Press the primary action button to complete "${cleanTask}".`,
    targetSelector: submitControl?.selector || 'button[type="submit"], input[type="submit"]',
    targetText: submitControl?.label || 'Submit',
    actionType: 'click',
    tip: 'Your progress is automatically saved.'
  });

  return {
    goal: cleanTask,
    totalSteps: steps.length,
    currentStepIndex: 0,
    steps,
    supportiveMessage: `I am guiding you step-by-step through ${cleanTask}. Focus on one highlighted action at a time.`
  };
}

module.exports = {
  splitSentences,
  generateLocalStartMode,
  generateLocalSimplifyMode,
  generateLocalLearnMode,
  generateLocalMeetMode,
  generateLocalPracticeMode,
  generateLocalWriteMode,
  generateLocalGuideMode,
  generateLocalNumbersMode,
  generateLocalListenMode,
  generateLocalSummary,
  generateLocalNavigationPlan,
  formatArtifactMarkdown,
  parseSimpleArithmetic,
  detectCrisisLanguage,
  buildCrisisResponse,
  inspectCrisisLanguage,
  assessCrisisRisk
};
