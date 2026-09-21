import {
  CognitiveModeKey,
  StartModeResult,
  SimplifyModeResult,
  LearnModeResult,
  MeetModeResult,
  PracticeModeResult,
  WriteModeResult,
  GuideModeResult,
  NumbersModeResult,
} from '../types';

export const WORKED_EXAMPLES: Record<CognitiveModeKey, any> = {
  start: {
    supportiveMessage:
      'Starting is the only hard part. Executive freeze happens when a task looks like an endless mountain rather than a single physical step.',
    confidenceMeter: {
      effortLevel: 'Low',
      anxietyLevel: 'Manageable',
      estimatedTimeMinutes: 10,
    },
    immediateTenMinuteAction: 'Open the document, create the title page, and type the first 3 section headings.',
    microSteps: [
      'Open the blank document and save it as "Quarterly Report".',
      'Type the main heading: Summary of Accomplishments.',
      'Paste in 3 bullet points of what you actually finished this week.',
      'Take a 5-minute break and celebrate starting.',
    ],
    clarifyingQuestion: 'What is the single most important milestone your reader needs to see first?',
  } as StartModeResult,
  simplify: {
    readabilityGrade: 'Grade 6 · Plain English',
    plainLanguageRewrite:
      'You have 14 days after moving in to tell the landlord in writing about any broken items. If you send this notice on time, the landlord must fix safety hazards within 7 days at no cost to you.',
    keyTakeaways: [
      'Deadline: 14 days from move-in date.',
      'Format: Written notice (email or paper).',
      'Landlord responsibility: Safety fixes within 7 days.',
    ],
    sensoryTips: [
      'Read one bullet at a time and highlight dates.',
      'Keep a copy of your email in a dedicated folder.',
    ],
  } as SimplifyModeResult,
  learn: {
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
            'Generates ATP and NADPH',
          ],
        },
        {
          topic: 'Calvin Cycle (Light-Independent)',
          details: [
            'Occurs in chloroplast stroma',
            'Fixes CO2 into organic carbon compounds',
            'Requires RuBisCO enzyme',
          ],
        },
      ],
    },
    quiz: [
      {
        question: 'Where do the light-dependent reactions take place?',
        options: ['Thylakoid membrane', 'Stroma', 'Mitochondrial matrix', 'Outer membrane'],
        answerIndex: 0,
        explanation: 'Thylakoid membranes contain chlorophyll and ATP synthase complexes.',
      },
      {
        question: 'What does the Calvin cycle actually consume to build sugar?',
        options: [
          'ATP and NADPH made by the light reactions',
          'Oxygen released from water',
          'Chlorophyll pigment itself',
          'Sunlight directly',
        ],
        answerIndex: 0,
        explanation: 'The Calvin cycle is light-independent: it spends the ATP and NADPH produced earlier.',
      },
    ],
  } as LearnModeResult,
  meet: {
    summary:
      'The team aligned on shipping the accessibility audit by Friday and resolved the pending database schema migration conflict.',
    actionItems: [
      { task: 'Finalize WCAG contrast audit report', owner: 'Sarah M.', deadline: 'Friday 5 PM', priority: 'High' as const },
      { task: 'Deploy staging migration patch', owner: 'Alex K.', deadline: 'Thursday noon', priority: 'Medium' as const },
    ],
    keyDecisions: [
      'Broadsheet light theme approved as default accessible palette.',
      'MongoDB selected for resilient persistence layer.',
    ],
    jargonDecoded: [
      { term: 'RLS', plainMeaning: 'Row-Level Security — database rules that limit user visibility.' },
      { term: 'Telemetry spike', plainMeaning: 'A sudden burst in user activity or logged error counts.' },
    ],
  } as MeetModeResult,
  practice: {
    scenarioContext: 'Requesting a realistic deadline extension while maintaining professional trust.',
    openingLine: 'Hey, I wanted to check in quickly on how the frontend deliverable is pacing for tomorrow.',
    suggestedResponses: [
      {
        tone: 'Direct & collaborative',
        text: 'Thanks for checking in. The core feature is working well, but ensuring keyboard accessibility will take until Thursday morning. Can we move the review to Thursday 2 PM?',
      },
      {
        tone: 'Brief & factual',
        text: 'The architecture is complete, and I am running the final validation passes. I will have the branch ready for merge on Thursday morning.',
      },
    ],
    coachingTip: 'Propose a specific new time rather than asking open-ended permission.',
  } as PracticeModeResult,
  write: {
    originalGradeLevel: 'Grade 12.4 → rewritten at Grade 7',
    improvedText:
      'We updated the login system today. You can now sign in with your email address or your Google account. You no longer have to wait for an SMS code.',
    passiveVoiceInstances: [
      'SMS codes were dispatched by our authentication server',
      'Users are advised that credentials will be migrated',
    ],
    clarityFixes: [
      {
        originalSnippet: 'Please be advised that as of today our authentication subsystem has been upgraded.',
        suggestedSnippet: 'We updated the login system today.',
        reason: 'A 24-word sentence replaced with the one fact the reader needs.',
      },
    ],
  } as WriteModeResult,
  guide: {
    workflowName: 'Setting up Git SSH authentication',
    totalSteps: 3,
    steps: [
      {
        stepNumber: 1,
        title: 'Generate your key pair',
        actionRequired: 'Run ssh-keygen -t ed25519 -C "your_email@example.com" in terminal and press Enter.',
        tip: 'Terminal prints "Your identification has been saved in ~/.ssh/id_ed25519".',
      },
      {
        stepNumber: 2,
        title: 'Give GitHub the public half',
        actionRequired: 'Run cat ~/.ssh/id_ed25519.pub, copy the line, and paste it into GitHub SSH keys.',
        tip: 'The key appears in the list with your email beside it.',
      },
      {
        stepNumber: 3,
        title: 'Prove the connection works',
        actionRequired: 'Run ssh -T git@github.com and type yes if asked about fingerprint.',
        tip: 'You see "Hi username! You\'ve successfully authenticated".',
      },
    ],
  } as GuideModeResult,

  /**
   * The dyscalculia worked example.
   *
   * A division, chosen because division is where notation loses people fastest
   * and where the arrangement of objects carries the whole insight - "three
   * plates of four" explains it in a way that "12 divided by 3" never does.
   */
  numbers: {
    plainQuestion: 'You have 12 samosas and 3 friends. How many does each person get?',
    objectName: 'samosa',
    objectNamePlural: 'samosas',
    objectEmoji: '🥟',
    story:
      'You bought a box of 12 samosas to share equally between the three of you. Nobody should get more than anyone else, and none should be left over.',
    steps: [
      {
        narration: 'Start with all 12 samosas on the table.',
        operation: 'start',
        count: 12,
        runningTotal: 12,
      },
      {
        narration: 'Put out one plate for each of the three friends.',
        operation: 'group',
        count: 3,
        runningTotal: 0,
        groupSize: 3,
      },
      {
        narration: 'Deal them out one at a time, going round the plates, until the box is empty.',
        operation: 'split',
        count: 12,
        runningTotal: 4,
        groupSize: 3,
      },
      {
        narration: 'Every plate has the same amount and nothing is left over.',
        operation: 'result',
        count: 4,
        runningTotal: 4,
        groupSize: 3,
      },
    ],
    answer: '4 samosas each',
    answerNumber: 4,
    checkIt:
      'Count one plate: 4. Now count all three plates together - 4 and 4 and 4 makes 12, which is exactly what you started with.',
    realLife:
      'This is the same move as splitting a bill three ways, or working out how many days a strip of 12 tablets lasts if you take three a day.',
  } as NumbersModeResult,
};
