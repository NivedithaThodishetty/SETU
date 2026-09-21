/**
 * JSON schemas for the seven cognitive modes.
 * Kept separate from the controllers so the response contract is readable on
 * its own and shared with any client that wants to validate against it.
 */

const startSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clarifyingQuestion: { type: 'string' },
    immediateTenMinuteAction: { type: 'string' },
    microSteps: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    supportiveMessage: { type: 'string' },
    confidenceMeter: {
      type: 'object',
      additionalProperties: false,
      properties: {
        effortLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
        anxietyLevel: { type: 'string', enum: ['Low', 'Moderate', 'High'] },
        estimatedTimeMinutes: { type: 'number' }
      },
      required: ['effortLevel', 'anxietyLevel', 'estimatedTimeMinutes']
    }
  },
  required: [
    'clarifyingQuestion',
    'immediateTenMinuteAction',
    'microSteps',
    'supportiveMessage',
    'confidenceMeter'
  ]
};

const simplifySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    plainLanguageRewrite: { type: 'string' },
    keyTakeaways: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
    sensoryTips: { type: 'array', items: { type: 'string' } },
    readabilityGrade: { type: 'string' }
  },
  required: ['plainLanguageRewrite', 'keyTakeaways', 'sensoryTips', 'readabilityGrade']
};

const learnSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    mindMap: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rootNode: { type: 'string' },
        branches: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              topic: { type: 'string' },
              details: { type: 'array', items: { type: 'string' } }
            },
            required: ['topic', 'details']
          }
        }
      },
      required: ['rootNode', 'branches']
    },
    quiz: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answerIndex: { type: 'number' },
          explanation: { type: 'string' }
        },
        required: ['question', 'options', 'answerIndex', 'explanation']
      },
      minItems: 2,
      maxItems: 4
    }
  },
  required: ['summary', 'mindMap', 'quiz']
};

const meetSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    keyDecisions: { type: 'array', items: { type: 'string' } },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          task: { type: 'string' },
          owner: { type: 'string' },
          deadline: { type: 'string' },
          priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
        },
        required: ['task', 'owner', 'deadline', 'priority']
      }
    },
    jargonDecoded: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { term: { type: 'string' }, plainMeaning: { type: 'string' } },
        required: ['term', 'plainMeaning']
      }
    }
  },
  required: ['summary', 'keyDecisions', 'actionItems', 'jargonDecoded']
};

const practiceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scenarioContext: { type: 'string' },
    openingLine: { type: 'string' },
    suggestedResponses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          text: { type: 'string' },
          tone: {
            type: 'string',
            enum: ['Direct', 'Polite & Assertive', 'Collaborative', 'Cautious']
          }
        },
        required: ['label', 'text', 'tone']
      },
      minItems: 2,
      maxItems: 4
    },
    coachingTip: { type: 'string' }
  },
  required: ['scenarioContext', 'openingLine', 'suggestedResponses', 'coachingTip']
};

const writeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    originalGradeLevel: { type: 'string' },
    improvedText: { type: 'string' },
    passiveVoiceInstances: { type: 'array', items: { type: 'string' } },
    clarityFixes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          originalSnippet: { type: 'string' },
          suggestedSnippet: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['originalSnippet', 'suggestedSnippet', 'reason']
      }
    }
  },
  required: ['originalGradeLevel', 'improvedText', 'passiveVoiceInstances', 'clarityFixes']
};

const guideSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    workflowName: { type: 'string' },
    totalSteps: { type: 'number' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stepNumber: { type: 'number' },
          title: { type: 'string' },
          actionRequired: { type: 'string' },
          tip: { type: 'string' }
        },
        required: ['stepNumber', 'title', 'actionRequired', 'tip']
      }
    }
  },
  required: ['workflowName', 'totalSteps', 'steps']
};

const summarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    gist: { type: 'string' },
    points: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    readingTimeMinutes: { type: 'number' }
  },
  required: ['gist', 'points', 'readingTimeMinutes']
};

/**
 * Numbers — dyscalculia support.
 *
 * The clinical guidance this implements is that arithmetic has to be taught the
 * way special education teaches it: with countable physical objects inside a
 * story, not as notation. So the contract deliberately forbids the model from
 * answering in symbols — it must name one concrete object, then hand back a
 * sequence of steps where every step carries an actual *count* the client can
 * draw. The drawn quantity, not the sentence, is the explanation.
 *
 * `runningTotal` is what the reader can see on the table after the step, which
 * is what makes each step checkable without holding the previous one in working
 * memory.
 */
const numbersSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    plainQuestion: { type: 'string' },
    objectName: { type: 'string' },
    objectNamePlural: { type: 'string' },
    objectEmoji: { type: 'string' },
    story: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          narration: { type: 'string' },
          operation: {
            type: 'string',
            enum: ['start', 'add', 'remove', 'group', 'split', 'compare', 'result']
          },
          count: { type: 'number' },
          runningTotal: { type: 'number' },
          groupSize: { type: 'number' }
        },
        required: ['narration', 'operation', 'count', 'runningTotal']
      },
      minItems: 2,
      maxItems: 6
    },
    answer: { type: 'string' },
    answerNumber: { type: 'number' },
    checkIt: { type: 'string' },
    realLife: { type: 'string' }
  },
  required: [
    'plainQuestion',
    'objectName',
    'objectNamePlural',
    'objectEmoji',
    'story',
    'steps',
    'answer',
    'answerNumber',
    'checkIt',
    'realLife'
  ]
};

/**
 * Listen — reflective support for the roughly 40% of dyslexic and ADHD adults
 * who also carry anxiety or depression.
 *
 * This is deliberately shaped as *reflective listening*, not counselling: the
 * model reflects back what it heard, names the feeling, validates it, and offers
 * one grounding exercise and one small next thing. It is never asked for a
 * diagnosis, an interpretation, or advice about medication, and the crisis path
 * never reaches the model at all (see listenController).
 */
const listenSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reflection: { type: 'string' },
    namedFeelings: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    validation: { type: 'string' },
    groundingExercise: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        durationMinutes: { type: 'number' },
        steps: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 }
      },
      required: ['name', 'durationMinutes', 'steps']
    },
    openQuestion: { type: 'string' },
    oneSmallThing: { type: 'string' }
  },
  required: [
    'reflection',
    'namedFeelings',
    'validation',
    'groundingExercise',
    'openQuestion',
    'oneSmallThing'
  ]
};

module.exports = {
  startSchema,
  simplifySchema,
  learnSchema,
  meetSchema,
  practiceSchema,
  writeSchema,
  guideSchema,
  summarySchema,
  numbersSchema,
  listenSchema
};
