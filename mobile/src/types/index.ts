/**
 * SETU Mobile — Core TypeScript Type Definitions
 */

/** Theme options matching web frontend */
export type ThemeOption = 'broadsheet' | 'cream' | 'pastel' | 'sage' | 'velvet' | 'contrast';
export type SpacingOption = 'normal' | 'relaxed' | 'spacious';

/**
 * Typefaces SETU can actually render.
 *
 * This used to also offer 'hyper' (Atkinson Hyperlegible), 'lexend' and
 * 'dyslexic' (OpenDyslexic). None of those fonts is bundled and none was ever
 * loaded, so all three silently fell through to the serif — five options, three
 * of which did nothing. Offering an accommodation that does not exist is worse
 * than not offering it: somebody picks the dyslexia-friendly font, sees no
 * change, and concludes the accommodation does not work for them.
 *
 * Old stored values migrate to 'sans'. Letter spacing does the work those fonts
 * were meant to do, and unlike a font it applies to every glyph on the screen.
 */
/**
 * `hyper` and `lexend` name faces that are genuinely bundled (see
 * `constants/fonts.ts`). `dyslexic` is a legacy stored value from a build that
 * offered OpenDyslexic; it is not a UI choice, but it must stay in the union so
 * an upgraded install still resolves to a real family instead of undefined.
 */
export type FontStyleOption = 'serif' | 'sans' | 'system' | 'hyper' | 'lexend' | 'dyslexic';

/**
 * Extra tracking between letters.
 *
 * Increased letter spacing has better evidence behind it for dyslexic readers
 * than any particular typeface does, and it works with whatever font the phone
 * actually has.
 */
export type LetterSpacingOption = 'normal' | 'wide' | 'wider';
export type TextSizeOption = 'normal' | 'comfortable' | 'large';
export type MotionOption = 'movement' | 'reduced';

export type ReadingProfile =
  | 'adhd'
  | 'dyslexia'
  | 'autistic'
  | 'overwhelmed'
  | 'general';

export interface UserPreferences {
  profile: ReadingProfile[];
  font: FontStyleOption;
  size: TextSizeOption;
  theme: ThemeOption;
  spacing: SpacingOption;
  motion: MotionOption;
  letterSpacing: LetterSpacingOption;
  bionic: boolean;
  readingRuler: boolean;
  speechRate: number;
  speechPitch: number;
  hasCompletedOnboarding: boolean;

  /**
   * Backend override typed in Settings. Empty means "follow the build", which is
   * what nearly every install should be — see constants/config.ts.
   */
  customApiUrl: string;

  /**
   * Conversation language, e.g. 'hi-IN'. Drives the language the model answers
   * in and the language the audio is synthesised in, together.
   */
  language: string;

  /** Sarvam speaker id. Null follows whatever the engine is configured to use. */
  voice: string | null;

  /**
   * Speak a mind-map node when it is tapped.
   *
   * On by default. A map whose branches are silent text is, for a reader whose
   * difficulty is decoding rather than eyesight, just a differently-shaped wall
   * of words — pairing each node with audio is what makes the diagram readable.
   */
  speakOnTap: boolean;

  /** Show points, streaks and milestones. Counting continues either way. */
  rewards: boolean;

  /** Tint film for visual stress. See COLOR_OVERLAYS. */
  colorOverlay: string;
  colorOverlayOpacity: number;

  /** Mind map canvas presentation. */
  mapEdgeStyle: MapEdgeStyle;
  mapNodeStyle: MapNodeStyle;
  mapTextScale: number;
}

export type MapEdgeStyle = 'bezier' | 'straight' | 'orthogonal';
export type MapNodeStyle = 'comfortable' | 'compact';

export interface FocusSessionState {
  isActive: boolean;
  isPaused: boolean;
  secondsRemaining: number; // starts at 25 * 60 = 1500
  totalSessionsCompleted: number;
  isBreakDialogOpen: boolean;
}

/** Mind Map Tree Data Model */
export interface MindMapNode {
  id: string;
  label: string;
  detail?: string;
  children?: MindMapNode[];
  branch?: number;
  sources?: string[];
  keyFacts?: string[];
}

export interface PlacedNode {
  id: string;
  label: string;
  detail?: string;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  branch: number;
  childCount: number;
  collapsed: boolean;
  raw: MindMapNode;
}

export interface PlacedEdge {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  depth: number;
  branch: number;
}

export interface MindMapDocument {
  _id?: string;
  id?: string;
  topic: string;
  summary: string;
  root: MindMapNode;
  totalTopics?: number;
  sourceType?: 'query' | 'document' | 'seed';
  createdAt?: string;
  updatedAt?: string;
}

/** 7 Cognitive Modes Types */
export type CognitiveModeKey =
  | 'start'
  | 'simplify'
  | 'learn'
  | 'meet'
  | 'practice'
  | 'write'
  | 'guide'
  | 'numbers';

export interface StartModeResult {
  supportiveMessage: string;
  confidenceMeter: {
    effortLevel: string;
    anxietyLevel: string;
    estimatedTimeMinutes: number;
  };
  immediateTenMinuteAction: string;
  microSteps: string[];
  clarifyingQuestion?: string;
}

export interface SimplifyModeResult {
  readabilityGrade: string;
  plainLanguageRewrite: string;
  keyTakeaways: string[];
  sensoryTips: string[];
}

export interface LearnQuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface LearnModeResult {
  summary: string;
  mindMap: {
    rootNode: string;
    branches: { topic: string; details: string[] }[];
  };
  quiz: LearnQuizQuestion[];
}

export interface MeetActionItem {
  task: string;
  owner: string;
  deadline: string;
  priority: 'High' | 'Medium' | 'Low';
}

export interface MeetModeResult {
  summary: string;
  actionItems: MeetActionItem[];
  keyDecisions: string[];
  jargonDecoded: { term: string; plainMeaning: string }[];
}

export interface PracticeSuggestedResponse {
  tone: string;
  text: string;
}

export interface PracticeModeResult {
  scenarioContext: string;
  openingLine: string;
  suggestedResponses: PracticeSuggestedResponse[];
  coachingTip: string;
}

export interface WriteClarityFix {
  originalSnippet: string;
  suggestedSnippet: string;
  reason: string;
}

export interface WriteModeResult {
  originalGradeLevel: string;
  improvedText: string;
  passiveVoiceInstances: string[];
  clarityFixes: WriteClarityFix[];
}

export interface GuideStep {
  stepNumber: number;
  title: string;
  actionRequired: string;
  tip: string;
}

export interface GuideModeResult {
  workflowName: string;
  totalSteps: number;
  steps: GuideStep[];
}

export type CognitiveModeResult =
  | StartModeResult
  | SimplifyModeResult
  | LearnModeResult
  | MeetModeResult
  | PracticeModeResult
  | WriteModeResult
  | GuideModeResult
  | NumbersModeResult;

export interface CognitiveModeConfig {
  key: CognitiveModeKey;
  name: string;
  icon: string;
  tint: string;
  tagline: string;
  blurb: string;
  fieldLabel: string;
  placeholder: string;
  rows: number;
  workedExample: CognitiveModeResult;
}

/** Chat & Conversation Types */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  mapData?: MindMapNode;
  sources?: string[];
}

export interface ConversationThread {
  id: string;
  topic: string;
  preview: string;
  lastUpdated: string;
  messagesCount: number;
}

/** File Upload / OCR Types */
export interface DocumentFileResult {
  id: string;
  name: string;
  size: number;
  extractedText: string;
  summary: string;
  keyPoints: string[];
  mimeType: string;
  createdAt: string;
}

/** System Status Probe Types */
export interface SystemHealthStatus {
  status: string;
  product: string;
  version: string;
  primaryProvider: string;
  aiConfigured: boolean;
  speech?: {
    provider: string;
    configured: boolean;
    model: string | null;
    sttProvider: string;
    sttConfigured: boolean;
    sttModel: string | null;
  };
  database: {
    provider: string;
    connected: boolean;
    state: string;
    name?: string;
  };
  modes: string[];
  timestamp: string;
}

/** Summarize mode result (POST /api/summarize) */
export interface SummarizeResult {
  gist: string;
  points: string[];
  readingTimeMinutes: number;
}

/** Conversation thread from MongoDB */
export interface Conversation {
  id: string;
  _id?: string;
  title: string;
  currentTopic?: string;
  mode?: string;
  mindMapId?: string;
  documentIds?: string[];
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/** Persisted message in a conversation */
export interface PersistedMessage {
  id: string;
  _id?: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: string;
  sources?: string[];
  fileAttachments?: { fileId: string }[];
  createdAt: string;
}

/** Document file record from MongoDB */
export interface DocumentFile {
  id: string;
  _id?: string;
  originalName: string;
  mimeType: string;
  size: number;
  extractedText?: string;
  summary?: string;
  keyPoints?: string[];
  userId: string;
  conversationId?: string;
  createdAt: string;
}

/** Mind map with full MongoDB fields */
export interface MindMapRecord extends MindMapDocument {
  title?: string;
  keyFacts?: string[];
  followUps?: string[];
  sources?: string[];
  grounded?: boolean;
  isLensHandoff?: boolean;
  isSeed?: boolean;
  userId?: string;
  conversationId?: string;
  documentId?: string;
}

/** SSE Chat stream event types */
export interface ChatStreamStatusEvent {
  stage: string;
  message: string;
}

export interface ChatStreamReplyEvent {
  text: string;
  intent: string;
  final?: boolean;
  sources?: string[];
}

export interface ChatStreamDoneEvent {
  ok: boolean;
  conversationId: string;
}

/** Agent plan response (for future extension integration) */
export interface AgentPlanStep {
  stepNumber: number;
  instruction: string;
  actionType: string;
  targetRef?: string;
  targetText?: string;
  valueToFill?: string;
  tip: string;
  requiresConfirmation: boolean;
}

export interface AgentPlanResult {
  goal: string;
  understanding: string;
  feasible: boolean;
  blockedReason?: string;
  steps: AgentPlanStep[];
  supportiveMessage: string;
  fallback: boolean;
}

/**
 * Every mode response carries the engine's own account of where it came from.
 *
 * `fallback` true means the deterministic offline engine answered rather than a
 * model — usually because the AI provider was rate-limited. That engine only
 * writes English, so `languageFallback` names the language the user asked for
 * and did not get. Both are surfaced in the UI: silently handing someone rough
 * English when they asked for Tamil is the failure this flag exists to prevent.
 */
export interface ModeResponseMeta {
  fallback: boolean;
  fallbackReason?: string;
  language?: string;
  languageFallback?: string;
}



/* -------------------------------------------------------------------------- */
/* Task chunking — three steps out of one wall of text                        */
/* -------------------------------------------------------------------------- */

/**
 * The extension's "break this page into 3 steps", brought over for anything the
 * reader has in front of them rather than only for a web page.
 *
 * Three is a hard limit rather than a guideline. The whole accommodation is
 * that the list is short enough to hold in your head — a nine-step plan for
 * somebody in task paralysis is the original problem with numbers on it.
 */
export interface ChunkedStep {
  title: string;
  what: string;
  why: string;
}

export interface ChunkedTaskResult {
  pageName: string;
  whatThisPageIsFor: string;
  estimatedMinutes: number;
  thingsToHaveReady: string[];
  steps: ChunkedStep[];
  encouragement?: string;
  fallback?: boolean;
  fallbackReason?: string;
}

/* -------------------------------------------------------------------------- */
/* Numbers — dyscalculia support                                              */
/* -------------------------------------------------------------------------- */

/**
 * One beat of the worked story.
 *
 * `operation` is an English enum on purpose and is never translated, even when
 * the narration is in Hindi — the renderer switches on it to decide whether to
 * draw objects appearing, leaving, or being grouped.
 */
export interface NumbersStep {
  narration: string;
  operation: 'start' | 'add' | 'remove' | 'group' | 'split' | 'compare' | 'result';
  count: number;
  runningTotal: number;
  groupSize?: number;
}

export interface NumbersModeResult {
  plainQuestion: string;
  objectName: string;
  objectNamePlural: string;
  objectEmoji: string;
  story: string;
  steps: NumbersStep[];
  answer: string;
  answerNumber: number;
  checkIt: string;
  realLife: string;
}

/* -------------------------------------------------------------------------- */
/* Listen — reflective support                                                */
/* -------------------------------------------------------------------------- */

export interface GroundingExercise {
  name: string;
  durationMinutes: number;
  steps: string[];
}

export interface ListenResult {
  reflection?: string;
  namedFeelings?: string[];
  validation?: string;
  groundingExercise?: GroundingExercise;
  openQuestion?: string;
  oneSmallThing?: string;

  /**
   * Set by the server when the entry trips the risk check.
   *
   * When true the payload is fixed text with real helplines that never went
   * near a model, and the client must render it verbatim — no summarising, no
   * read-aloud rate changes, no scoring the turn.
   */
  crisis?: boolean;
  message?: string;
  languageNote?: string | null;
  helplines?: CrisisHelpline[];
  immediateStep?: string;
  stayingHere?: string;

  /**
   * Set when the reply came from the on-device guard rather than the engine.
   *
   * The text and the helplines are identical either way — both are the same
   * fixed reviewed script. This flag exists because the two paths differ in one
   * respect the user is entitled to know about: an offline reply means the
   * entry never left the phone, and the panel says so rather than guessing.
   */
  offline?: boolean;
}

export interface CrisisHelpline {
  region: string;
  name: string;
  /** A dialable number, or a URL for directory services. */
  contact: string;
  hours: string;
}

export interface JournalEntry {
  id: string;
  text: string;
  mood: number | null;
  at: string;
  reflection: string | null;
}

/* -------------------------------------------------------------------------- */
/* Momentum — points, streaks, milestones                                     */
/* -------------------------------------------------------------------------- */

export type AwardKind =
  | 'focusSession'
  | 'modeRun'
  | 'stepChecked'
  | 'quizCorrect'
  | 'mapCreated'
  | 'branchExpanded'
  | 'numbersSolved'
  | 'checkIn'
  | 'noteParked';

export interface ProgressState {
  points: number;
  counters: Partial<Record<AwardKind, number>>;
  milestones: string[];
  streakDays: number;
  longestStreakDays: number;
  lastActiveDay: string | null;
}

export interface Rank {
  level: number;
  name: string;
  at: number;
  next: { level: number; name: string; at: number } | null;
  pointsToNext: number;
  fraction: number;
}

export interface AwardEvent {
  kind: AwardKind;
  label: string;
  points: number;
  total: number;
  rankedUp: boolean;
  rank: Rank;
  newMilestones: { id: string; name: string }[];
  streakDays: number;
  announce: boolean;
}

/* -------------------------------------------------------------------------- */
/* Parking lot — working-memory offload                                       */
/* -------------------------------------------------------------------------- */

export interface ParkedNote {
  id: string;
  text: string;
  at: string;
  done: boolean;
}

/* -------------------------------------------------------------------------- */
/* Speech                                                                     */
/* -------------------------------------------------------------------------- */

export interface SarvamVoice {
  id: string;
  label: string;
  note: string;
}

export interface VoiceCatalogue {
  enabled: boolean;
  sttEnabled: boolean;
  provider: string;
  model: string;
  sttModel: string;
  language: string;
  defaultSpeaker: string;
  maxCharacters: number;
  voices: SarvamVoice[];
  languages: { code: string; name: string; native: string }[];
}

/* -------------------------------------------------------------------------- */
/* Reading Check                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The screener's vocabulary is deliberately narrow.
 *
 * Three bands, no percentage, no score out of anything, and the word
 * "dyslexia" appears nowhere in a result. That is not squeamishness: a tool
 * that outputs a diagnosis becomes regulated Medical Device Software under
 * CDSCO's function-based guidance, and this is an educational screener. The
 * claim it makes is "this is worth someone looking at", which is both defensible
 * and the thing a teacher actually needs.
 */
export type ReadingBand = 'no-concerns' | 'worth-watching' | 'worth-assessment';

export interface ReadingStimulus {
  language: string;
  languageName: string;
  script: string;
  dir: 'ltr' | 'rtl';
  grade: number;
  task: string;
  stimulusId: string;
  title?: string;
  text?: string;
  wordCount?: number;
  questions?: string[];
  instruction: string;
  disclaimer: string;
}

export interface ReadingMissedWord {
  expected: string;
  read: string;
  type: string;
}

export interface ReadingMetrics {
  wcpm: number;
  accuracy: number;
  wordsCorrect: number;
  wordsAttempted: number;
  wordsInPassage: number;
  notReached: number;
  errors: number;
  errorBreakdown?: { substitutions: number; omissions: number; insertions: number };
  durationMs: number;
  comprehension?: { correct: number; total: number; proportion: number } | null;
  band: ReadingBand;
  missedWords?: ReadingMissedWord[];
  provisionalNorms?: boolean;
}

export interface ReadingBandCopy {
  label: string;
  summary: string;
  nextStep: string;
}

export interface ReadingCheckResult {
  id: string;
  type: string;
  language: string;
  script: string;
  grade: number | null;
  learnerLabel: string;
  stimulusId: string;
  metrics: ReadingMetrics;
  wcpm: number | null;
  accuracy: number | null;
  band: ReadingBand | null;
  bandCopy: ReadingBandCopy | null;
  provisionalNorms: boolean;
  disclaimer: string;
}

export interface ReadingSeriesPoint {
  at: string;
  wcpm: number;
  accuracy: number;
  band: ReadingBand;
  language: string;
}

export interface ReadingHistoryResponse {
  history: any[];
  series: ReadingSeriesPoint[];
  count: number;
  /**
   * Whether the engine actually has a database behind it.
   *
   * Surfaced rather than swallowed: a run of checks that looks like a progress
   * chart but is being dropped on every restart is worse than no chart, and the
   * person watching a child's reading is entitled to know which one they have.
   */
  dbConnected: boolean;
  disclaimer: string;
}
