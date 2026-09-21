import { api } from './api';

/**
 * The eight cognitive modes, and what makes each one look like itself.
 *
 * The modes used to share one chrome: same list, same textarea, same button,
 * same result column. They do genuinely different jobs — one breaks a frozen
 * task into a first move, one rewrites legalese, one turns arithmetic into
 * objects on a table — and rendering all eight through identical furniture made
 * them read as one feature with a dropdown. Worse, it hid the accommodation:
 * a person looking for help with numbers could not see that Numbers was a
 * different kind of thing from Simplify.
 *
 * So each mode carries a full identity here rather than a colour swatch:
 *
 *  - `accent` / `ink`   the plate it prints on, and what reads on top of it.
 *  - `texture`          a background pattern unique to the mode, drawn in CSS
 *                       so it costs no request and tints with the palette.
 *  - `stage`            the workspace archetype — a launch pad, a bench, a deck
 *                       of cards, a ledger, a rehearsal room, a copy desk, a
 *                       table of objects, a trail. This is the part a person
 *                       recognises before they read a word.
 *  - `input`            the shape of the ask. Four modes take a sentence and
 *                       four take a wall of pasted text; giving both the same
 *                       six-row textarea made the short ones feel like homework.
 *  - `verb`             what the button says. "Run Simplify" tells you nothing;
 *                       "Rewrite it plainly" tells you what is about to happen.
 *
 * `workedExample` is what the screen shows before the first run. It is a real,
 * hand-checked answer rather than an empty state, so every mode can be
 * understood — and demonstrated — without an API key.
 */

/** Field shapes. `prompt` is one sentence about you; `sheet` is pasted material. */
export const INPUT_PROMPT = 'prompt';
export const INPUT_SHEET = 'sheet';

export const MODES = [
  {
    key: 'start',
    name: 'Start',
    stage: 'launchpad',
    icon: 'ph-rocket-launch',
    accent: '#c98a00',
    accentDeep: '#8a5e00',
    ink: '#ffffff',
    texture: 'caution',
    tagline: 'Break task freeze',
    kicker: 'Launch pad',
    blurb:
      'Turns something you have been avoiding into one ten-minute action small enough to actually begin.',
    verb: 'Find my first move',
    loading: 'Finding the smallest possible first move…',
    input: {
      kind: INPUT_PROMPT,
      label: 'What are you stuck on or putting off?',
      placeholder: 'e.g. writing my quarterly report, or filing my medical reimbursement claim',
      hint: 'One sentence is enough. Name the thing you keep scrolling past.',
      rows: 2
    },
    run: (value) => api.start(value, true),
    workedExample: {
      supportiveMessage:
        'Starting is the only hard part. Executive freeze happens when a task looks like an endless mountain rather than a single physical step.',
      confidenceMeter: {
        effortLevel: 'Low',
        anxietyLevel: 'Manageable',
        estimatedTimeMinutes: 10
      },
      immediateTenMinuteAction:
        'Open the document, create the title page, and type the first 3 section headings.',
      microSteps: [
        'Open the blank document and save it as "Quarterly Report Q3".',
        'Type the main heading: Summary of Accomplishments.',
        'Paste in 3 bullet points of what you actually finished this week.',
        'Close the tab or take a 5-minute break.'
      ],
      clarifyingQuestion:
        'What is the single most important number or milestone your reader needs to see first?'
    }
  },

  {
    key: 'simplify',
    name: 'Simplify',
    stage: 'bench',
    icon: 'ph-waves',
    accent: '#0088b0',
    accentDeep: '#00607d',
    ink: '#ffffff',
    texture: 'ripple',
    tagline: 'Plain language',
    kicker: 'Translation bench',
    blurb: 'Rewrites dense or legal text at a Grade 6 reading level without dropping a single fact.',
    verb: 'Rewrite it plainly',
    loading: 'Rewriting this at a Grade 6 reading level…',
    input: {
      kind: INPUT_SHEET,
      label: 'The dense text, notice, or clause',
      placeholder:
        'Paste a government policy, a contract clause, an insurance letter, or an academic abstract…',
      hint: 'Paste the whole thing. Nothing is dropped — it is only said differently.',
      rows: 7
    },
    run: (value) => api.simplify(value),
    workedExample: {
      readabilityGrade: 'Grade 6 · Plain English',
      plainLanguageRewrite:
        'You have 14 days after moving in to tell the landlord in writing about any broken items. If you send this notice on time, the landlord must fix safety hazards within 7 days at no cost to you.',
      keyTakeaways: [
        'Deadline: 14 days from move-in date.',
        'Format: Written notice (email or paper).',
        'Landlord responsibility: Safety fixes within 7 days.'
      ],
      sensoryTips: [
        'Read one bullet at a time and highlight the dates.',
        'Keep a copy of your email in a dedicated folder.'
      ]
    }
  },

  {
    key: 'learn',
    name: 'Learn',
    stage: 'deck',
    icon: 'ph-cards',
    accent: '#d6006c',
    accentDeep: '#a30052',
    ink: '#ffffff',
    texture: 'confetti',
    tagline: 'Study material',
    kicker: 'Study deck',
    blurb: 'A summary, a branching outline, and a self-quiz, built from whatever you paste in.',
    verb: 'Build my study deck',
    loading: 'Reading the material and writing your quiz…',
    input: {
      kind: INPUT_SHEET,
      label: 'Study notes, lecture content, or an article',
      placeholder: 'Paste lecture transcripts, a textbook chapter, or reference material…',
      hint: 'The more you paste, the better the quiz. Cards come back one question at a time.',
      rows: 7
    },
    run: (value) => api.learn(value),
    workedExample: {
      summary:
        'Photosynthesis converts solar photons into chemical glucose using chlorophyll pigments in chloroplast thylakoids, releasing oxygen as a byproduct.',
      mindMap: {
        rootNode: 'Photosynthesis Mechanism',
        branches: [
          {
            topic: 'Light-Dependent Reactions',
            details: [
              'Takes place in thylakoid membranes',
              'Splits water molecules (photolysis)',
              'Generates ATP and NADPH'
            ]
          },
          {
            topic: 'Calvin Cycle (Light-Independent)',
            details: [
              'Occurs in chloroplast stroma',
              'Fixes CO2 into organic carbon compounds',
              'Requires RuBisCO enzyme'
            ]
          }
        ]
      },
      quiz: [
        {
          question: 'Where do the light-dependent reactions of photosynthesis take place?',
          options: ['Thylakoid membrane', 'Stroma', 'Mitochondrial matrix', 'Outer membrane'],
          answerIndex: 0,
          explanation: 'Thylakoid membranes contain chlorophyll and ATP synthase complexes.'
        },
        {
          question: 'What does the Calvin cycle actually consume to build sugar?',
          options: [
            'ATP and NADPH made by the light reactions',
            'Oxygen released from water',
            'Chlorophyll pigment itself',
            'Sunlight directly'
          ],
          answerIndex: 0,
          explanation:
            'The Calvin cycle is light-independent: it spends the ATP and NADPH the light reactions produced.'
        }
      ]
    }
  },

  {
    key: 'meet',
    name: 'Meet',
    stage: 'ledger',
    icon: 'ph-clipboard-text',
    accent: '#0f766e',
    accentDeep: '#115e59',
    ink: '#ffffff',
    texture: 'ledger',
    tagline: 'Meeting rescue',
    kicker: 'The ledger',
    blurb:
      'Pulls the decisions, owners and deadlines out of a transcript, and decodes the jargon along the way.',
    verb: 'Pull out the actions',
    loading: 'Reading the transcript for decisions and owners…',
    input: {
      kind: INPUT_SHEET,
      label: 'Meeting transcript or raw notes',
      placeholder: 'Paste a Zoom transcript, a Slack thread, or the notes you scrambled to take…',
      hint: 'Messy notes are fine. Half-sentences and crosstalk are what this is for.',
      rows: 7
    },
    run: (value) => api.meet(value),
    workedExample: {
      summary:
        'The team aligned on shipping the accessibility audit by Friday and resolved the pending database schema migration conflict.',
      actionItems: [
        {
          task: 'Finalize WCAG contrast audit report',
          owner: 'Sarah M.',
          deadline: 'Friday 5 PM',
          priority: 'High'
        },
        {
          task: 'Deploy staging migration patch',
          owner: 'Alex K.',
          deadline: 'Thursday noon',
          priority: 'Medium'
        }
      ],
      keyDecisions: [
        'Broadsheet light theme approved as the default accessible palette.',
        'MongoDB selected for resilient persistence layer.'
      ],
      jargonDecoded: [
        {
          term: 'RLS',
          plainMeaning: 'Row-Level Security — database rules that limit which user can see each row.'
        },
        { term: 'Telemetry spike', plainMeaning: 'A sudden burst in user activity or logged error counts.' }
      ]
    }
  },

  {
    key: 'practice',
    name: 'Practice',
    stage: 'rehearsal',
    icon: 'ph-microphone-stage',
    accent: '#7c3aed',
    accentDeep: '#5b21b6',
    ink: '#ffffff',
    texture: 'spotlight',
    tagline: 'Rehearse it first',
    kicker: 'Rehearsal room',
    blurb:
      'Scripts for a hard conversation, in a few different tones, before you have to have it for real.',
    verb: 'Rehearse this with me',
    loading: 'Writing their opening line and your replies…',
    input: {
      kind: INPUT_PROMPT,
      label: 'What conversation do you need to prepare for?',
      placeholder: 'e.g. asking my team lead for an extra two days on a sprint task',
      hint: 'Say who it is with and what you need. Nobody sees this but you.',
      rows: 2
    },
    run: (value) => api.practice(value),
    workedExample: {
      scenarioContext: 'Requesting a realistic deadline extension while maintaining professional trust.',
      openingLine:
        'Hey, I wanted to check in quickly on how the frontend deliverable is pacing for tomorrow.',
      suggestedResponses: [
        {
          tone: 'Direct & collaborative',
          text: 'Thanks for checking in. The core feature is working well, but ensuring keyboard accessibility will take until Thursday morning. Can we move the review to Thursday 2 PM?'
        },
        {
          tone: 'Brief & factual',
          text: 'The architecture is complete, and I am running the final validation passes. I will have the branch ready for merge on Thursday morning.'
        }
      ],
      coachingTip:
        'Propose a specific new time rather than asking open-ended permission. It shows control of your workload.'
    }
  },

  {
    key: 'write',
    name: 'Write',
    stage: 'copydesk',
    icon: 'ph-pen-nib',
    accent: '#b91c1c',
    accentDeep: '#7f1d1d',
    ink: '#ffffff',
    texture: 'ruled',
    tagline: 'Accessible writing',
    kicker: 'Copy desk',
    blurb: 'Checks your draft for reading level, passive voice, and the sentences that lose people.',
    verb: 'Mark up my draft',
    loading: 'Marking up your draft, line by line…',
    input: {
      kind: INPUT_SHEET,
      label: 'Your draft text or message',
      placeholder: 'Paste your email draft, documentation section, or announcement…',
      hint: 'Your words come back with the cuts shown, not silently replaced.',
      rows: 7
    },
    run: (value) => api.write(value),
    workedExample: {
      originalGradeLevel: 'Grade 12.4 → rewritten at Grade 7',
      improvedText:
        'We updated the login system today. You can now sign in with your email address or your Google account. You no longer have to wait for an SMS code.',
      passiveVoiceInstances: [
        'SMS codes were dispatched by our authentication server',
        'Users are advised that credentials will be migrated'
      ],
      clarityFixes: [
        {
          originalSnippet:
            'Please be advised that as of today our authentication subsystem has been upgraded to facilitate a seamless synchronization paradigm across identity providers.',
          suggestedSnippet: 'We updated the login system today.',
          reason: 'A 24-word sentence of corporate jargon replaced with the one fact the reader needs.'
        },
        {
          originalSnippet: 'SMS codes were dispatched by our authentication server.',
          suggestedSnippet: 'You no longer have to wait for an SMS code.',
          reason: 'Passive voice hides who acts. Active voice tells the reader what changes for them.'
        }
      ]
    }
  },

  {
    key: 'numbers',
    name: 'Numbers',
    stage: 'table',
    icon: 'ph-math-operations',
    accent: '#15803d',
    accentDeep: '#14532d',
    ink: '#ffffff',
    texture: 'graph',
    tagline: 'Maths with objects',
    kicker: 'The table',
    blurb:
      'Turns a sum into things you can count on a table, one step at a time, read aloud as you go. Built for dyscalculia.',
    verb: 'Put it on the table',
    loading: 'Laying the objects out on the table…',
    input: {
      kind: INPUT_PROMPT,
      label: 'What number problem is in your way?',
      placeholder: 'e.g. 12 × 4, splitting a ₹840 bill between 6 people, or 15% off 2400',
      hint: 'Everyday sums are welcome. Nothing here is graded.',
      rows: 2
    },
    run: (value) => api.numbers(value),
    workedExample: {
      plainQuestion: 'What is 12 lots of 4?',
      objectName: 'apple',
      objectNamePlural: 'apples',
      objectEmoji: '🍎',
      story: 'You have 12 baskets on the table, and every basket holds 4 apples.',
      steps: [
        {
          narration: 'Make 12 separate piles on the table.',
          operation: 'group',
          count: 12,
          runningTotal: 0,
          groupSize: 4
        },
        {
          narration: 'Now put 4 apples into every single pile.',
          operation: 'add',
          count: 48,
          runningTotal: 48,
          groupSize: 4
        },
        {
          narration: 'Count every apple across all the piles. There are 48.',
          operation: 'result',
          count: 48,
          runningTotal: 48
        }
      ],
      answer: '48',
      answerNumber: 48,
      checkIt: 'Count the piles one at a time, adding 4 each time. You should land on 48.',
      realLife: 'This is what you do when you buy 12 packs of something that costs 4 each.'
    }
  },

  {
    key: 'guide',
    name: 'Guide',
    stage: 'trail',
    icon: 'ph-path',
    accent: '#334155',
    accentDeep: '#1e293b',
    ink: '#ffffff',
    texture: 'trail',
    tagline: 'Step by step',
    kicker: 'The trail',
    blurb: 'Turns any workflow into numbered steps, each with a clear signal that it worked.',
    verb: 'Map out the steps',
    loading: 'Laying out the trail, one station at a time…',
    input: {
      kind: INPUT_PROMPT,
      label: 'What process or goal do you need broken down?',
      placeholder: 'e.g. submitting an expense report, setting up SSH keys, appealing a parking ticket',
      hint: 'Each station tells you how to know it worked before you move on.',
      rows: 2
    },
    run: (value) => api.guide(value),
    workedExample: {
      workflowName: 'Setting up Git SSH authentication',
      totalSteps: 3,
      steps: [
        {
          stepNumber: 1,
          title: 'Generate your key pair',
          actionRequired:
            'Run ssh-keygen -t ed25519 -C "your_email@example.com" in the terminal and press Enter at every prompt.',
          tip: 'the terminal prints "Your identification has been saved in ~/.ssh/id_ed25519".'
        },
        {
          stepNumber: 2,
          title: 'Give GitHub the public half',
          actionRequired:
            'Run cat ~/.ssh/id_ed25519.pub, copy the whole line, and paste it into GitHub → Settings → SSH and GPG keys → New SSH key.',
          tip: 'the key appears in the list with your email beside it.'
        },
        {
          stepNumber: 3,
          title: 'Prove the connection works',
          actionRequired: 'Run ssh -T git@github.com and type yes if it asks about the fingerprint.',
          tip: 'you see "Hi username! You\'ve successfully authenticated".'
        }
      ]
    }
  }
];

export const MODE_BY_KEY = new Map(MODES.map((mode) => [mode.key, mode]));

export function getMode(key) {
  return MODE_BY_KEY.get(key) || MODES[0];
}

/**
 * The background pattern for a mode, as an inline style object.
 *
 * Drawn with CSS gradients rather than images so it inherits the mode's accent,
 * costs no network request, and stays crisp at any zoom — which matters here
 * because text scaling is one of the accommodations.
 *
 * `alpha` keeps every pattern well under the contrast floor: this is texture
 * that tells you which room you are in, not decoration competing with the words
 * on top of it.
 */
export function modeTexture(mode, { alpha = 0.1, scale = 1 } = {}) {
  const tint = (a = alpha) => `color-mix(in srgb, ${mode.accent} ${Math.round(a * 100)}%, transparent)`;
  const px = (n) => `${Math.round(n * scale)}px`;

  switch (mode.texture) {
    // Start — hazard stripes, because this is the mode you reach for when a
    // task has become a wall.
    case 'caution':
      return {
        backgroundImage: `repeating-linear-gradient(135deg, ${tint()} 0, ${tint()} ${px(8)}, transparent ${px(8)}, transparent ${px(20)})`
      };

    // Simplify — long horizontal swells: dense text smoothed out.
    case 'ripple':
      return {
        backgroundImage: `repeating-linear-gradient(0deg, ${tint(alpha * 0.9)} 0, ${tint(alpha * 0.9)} ${px(1)}, transparent ${px(1)}, transparent ${px(9)})`
      };

    // Learn — scattered index-card dots.
    case 'confetti':
      return {
        backgroundImage: `radial-gradient(circle at 30% 30%, ${tint(alpha * 1.4)} ${px(2)}, transparent ${px(2)}), radial-gradient(circle at 75% 65%, ${tint(alpha)} ${px(1.5)}, transparent ${px(1.5)})`,
        backgroundSize: `${px(26)} ${px(26)}, ${px(38)} ${px(38)}`
      };

    // Meet — accounts-book rules with a margin column.
    case 'ledger':
      return {
        backgroundImage: `repeating-linear-gradient(0deg, transparent 0, transparent ${px(21)}, ${tint(alpha * 0.85)} ${px(21)}, ${tint(alpha * 0.85)} ${px(22)}), linear-gradient(90deg, transparent ${px(46)}, ${tint(alpha * 1.6)} ${px(46)}, ${tint(alpha * 1.6)} ${px(47)}, transparent ${px(47)})`
      };

    // Practice — a soft stage wash from above.
    case 'spotlight':
      return {
        backgroundImage: `radial-gradient(ellipse 70% 120% at 50% -20%, ${tint(alpha * 2.2)} 0%, transparent 70%)`
      };

    // Write — ruled manuscript paper with the red margin rule.
    case 'ruled':
      return {
        backgroundImage: `repeating-linear-gradient(0deg, transparent 0, transparent ${px(23)}, ${tint(alpha * 0.7)} ${px(23)}, ${tint(alpha * 0.7)} ${px(24)}), linear-gradient(90deg, transparent ${px(34)}, ${tint(alpha * 2)} ${px(34)}, ${tint(alpha * 2)} ${px(35.5)}, transparent ${px(35.5)})`
      };

    // Numbers — squared graph paper you could count on.
    case 'graph':
      return {
        backgroundImage: `linear-gradient(0deg, ${tint(alpha * 0.8)} ${px(1)}, transparent ${px(1)}), linear-gradient(90deg, ${tint(alpha * 0.8)} ${px(1)}, transparent ${px(1)})`,
        backgroundSize: `${px(18)} ${px(18)}`
      };

    // Guide — dashed waymarks heading off to the right.
    case 'trail':
      return {
        backgroundImage: `repeating-linear-gradient(90deg, ${tint(alpha * 1.3)} 0, ${tint(alpha * 1.3)} ${px(10)}, transparent ${px(10)}, transparent ${px(24)})`,
        backgroundSize: `100% ${px(2)}`,
        backgroundPosition: '0 50%',
        backgroundRepeat: 'repeat-x'
      };

    default:
      return {};
  }
}
