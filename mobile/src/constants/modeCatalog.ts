/**
 * SETU Mobile — what each tool is.
 *
 * One entry per cognitive mode, holding everything that differs between them:
 * the plate it prints on, the problem it answers, the shape of its ask, the
 * words on its button, and the worked example it opens on.
 *
 * It lives here rather than inside a screen because five surfaces need it now —
 * Home, Tools, the workspace, quick actions and the Library — and when the list
 * was a private constant inside `ModesScreen` each of the others carried its
 * own drifting copy. Adding a mode should mean adding an entry, not editing
 * five files.
 *
 * Two conventions are load-bearing:
 *
 *  - `problem` is written in the first person, as the thing somebody would
 *    actually say. "Run Simplify" is only findable by a reader who already
 *    knows the feature exists; "this text is too dense" is findable by the
 *    person who needs it.
 *  - `verb` is the button. A button that says "Submit" tells you nothing about
 *    what you are about to get, and on a screen aimed at people who find
 *    committing to an action expensive, that hesitation is the whole cost.
 */

import {
  PlayCircle,
  Waves,
  GraduationCap,
  Users,
  MessageCircle,
  PenTool,
  Route,
  Calculator,
} from 'lucide-react-native';

import { CognitiveModeKey } from '../types';
import { WORKED_EXAMPLES } from './seedExamples';

/** Which of the four process plates a mode is inked in. */
export type PlateKey = 'cyan' | 'magenta' | 'yellow' | 'ink';

export interface ModeDefinition {
  key: CognitiveModeKey;
  name: string;
  /** First-person phrasing of the problem this mode answers. */
  problem: string;
  tagline: string;
  blurb: string;
  icon: any;
  plate: PlateKey;
  /** The button label. Always says what you will get. */
  verb: string;
  fieldLabel: string;
  placeholder: string;
  rows: number;
  /** Words that should match this mode in search but are not shown. */
  keywords: string;
  workedExample: any;
}

export const MODES: ModeDefinition[] = [
  {
    key: 'start',
    name: 'Start',
    problem: 'I cannot get started',
    tagline: 'Break task freeze',
    blurb:
      'Turns something you have been avoiding into one ten-minute action small enough to actually begin.',
    icon: PlayCircle,
    plate: 'yellow',
    verb: 'Find the first step',
    fieldLabel: 'What are you stuck on or putting off?',
    placeholder: 'e.g. writing my quarterly report, or filing that reimbursement…',
    rows: 3,
    keywords: 'stuck freeze procrastinate avoid paralysis begin task initiation',
    workedExample: WORKED_EXAMPLES.start,
  },
  {
    key: 'simplify',
    name: 'Simplify',
    problem: 'This text is too dense',
    tagline: 'Plain language rewrite',
    blurb:
      'Rewrites dense or legal text at roughly a Grade 6 reading level without dropping a single fact.',
    icon: Waves,
    plate: 'cyan',
    verb: 'Rewrite it plainly',
    fieldLabel: 'Paste the dense text, notice, or clause',
    placeholder: 'Paste a policy, a legal clause, or an academic abstract…',
    rows: 6,
    keywords: 'legal jargon policy notice rewrite plain grade reading level dense',
    workedExample: WORKED_EXAMPLES.simplify,
  },
  {
    key: 'learn',
    name: 'Learn',
    problem: 'I need to learn this',
    tagline: 'Study notes and a self-quiz',
    blurb: 'A summary, a branching outline, and a quiz dealt one card at a time.',
    icon: GraduationCap,
    plate: 'magenta',
    verb: 'Make study notes',
    fieldLabel: 'Paste study notes, lecture content, or an article',
    placeholder: 'Paste a lecture transcript, a textbook chapter, or reference material…',
    rows: 6,
    keywords: 'study revise exam quiz notes lecture memorise flashcards',
    workedExample: WORKED_EXAMPLES.learn,
  },
  {
    key: 'meet',
    name: 'Meet',
    problem: 'I missed what was decided',
    tagline: 'Meeting rescue',
    blurb:
      'Pulls the decisions, owners and deadlines out of a transcript, and decodes the jargon.',
    icon: Users,
    plate: 'cyan',
    verb: 'Pull out the actions',
    fieldLabel: 'Paste the meeting transcript or your raw notes',
    placeholder: 'Paste a call transcript, a chat thread, or scrappy notes…',
    rows: 6,
    keywords: 'meeting minutes transcript action items owners deadlines standup call',
    workedExample: WORKED_EXAMPLES.meet,
  },
  {
    key: 'practice',
    name: 'Practice',
    problem: 'I have to say something hard',
    tagline: 'Rehearse it first',
    blurb: 'Scripts a difficult conversation in several tones before you have it for real.',
    icon: MessageCircle,
    plate: 'magenta',
    verb: 'Write me a script',
    fieldLabel: 'What conversation do you need to prepare for?',
    placeholder: 'e.g. asking my team lead for two more days on a sprint task…',
    rows: 3,
    keywords: 'conversation rehearse script difficult ask boss confront negotiate',
    workedExample: WORKED_EXAMPLES.practice,
  },
  {
    key: 'write',
    name: 'Write',
    problem: 'Is my writing clear?',
    tagline: 'Accessible writing check',
    blurb: 'Checks a draft for reading level, passive voice, and sentences that lose people.',
    icon: PenTool,
    plate: 'yellow',
    verb: 'Check my draft',
    fieldLabel: 'Paste your draft text or message',
    placeholder: 'Paste an email draft, a documentation section, or an announcement…',
    rows: 6,
    keywords: 'draft email edit clarity passive voice check proofread tone',
    workedExample: WORKED_EXAMPLES.write,
  },
  {
    key: 'guide',
    name: 'Guide',
    problem: 'I do not know the steps',
    tagline: 'Step-by-step workflow',
    blurb: 'Turns any process into numbered steps, each with a clear signal that it worked.',
    icon: Route,
    plate: 'ink',
    verb: 'Break it into steps',
    fieldLabel: 'What process or goal do you need broken down?',
    placeholder: 'e.g. submitting an expense claim, or appealing a parking ticket…',
    rows: 3,
    keywords: 'process how to workflow instructions form apply steps procedure',
    workedExample: WORKED_EXAMPLES.guide,
  },
  {
    key: 'numbers',
    name: 'Numbers',
    problem: 'The numbers will not sit still',
    tagline: 'Sums with countable things',
    blurb:
      'Works a sum through as a short story with objects on a table, one step at a time, instead of notation.',
    icon: Calculator,
    plate: 'magenta',
    verb: 'Work it out with objects',
    fieldLabel: 'What sum or number problem is in the way?',
    placeholder: 'e.g. splitting a 2,400 rupee bill four ways, or 15% off 899…',
    rows: 3,
    keywords: 'maths math dyscalculia percentage split bill arithmetic sum numbers money',
    workedExample: WORKED_EXAMPLES.numbers,
  },
];

const BY_KEY = new Map(MODES.map((mode) => [mode.key, mode]));

/** Look up a mode, falling back to Start rather than returning undefined. */
export function modeFor(key?: string | null): ModeDefinition {
  return BY_KEY.get(key as CognitiveModeKey) || MODES[0];
}
