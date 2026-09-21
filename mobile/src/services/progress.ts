/**
 * SETU Momentum — reward, streak and rank engine.
 *
 * Built on the clinical guidance that ADHD attention is sustained by interest
 * and visible progress rather than by reports: every meaningful action pays out
 * immediately, milestones are one-off and named, and the whole thing is summed
 * up as a single ring instead of a page of numbers.
 *
 * Local-first by necessity rather than convenience — a reward that waits on a
 * network round trip has already missed the moment it was meant to reinforce.
 * State is held in memory and paid out synchronously; the AsyncStorage write and
 * the MongoDB mirror both happen behind the celebration.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, syncInBackground } from './api';
import { AwardEvent, AwardKind, ProgressState, Rank } from '../types';

const PROGRESS_KEY = 'setu.mobile.progress.v1';

/* -------------------------------------------------------------------------- */
/* Award table                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What each action is worth.
 *
 * Weighted by effort rather than by how much we would like the user to do it —
 * finishing a 25-minute focus session pays roughly three times a mode run
 * because it genuinely costs that much more. Inflating cheap actions is how a
 * points system stops meaning anything.
 */
export const AWARDS: Record<AwardKind, { points: number; label: string; icon: string }> = {
  focusSession: { points: 25, label: 'Finished a focus session', icon: 'timer' },
  modeRun: { points: 8, label: 'Used a cognitive mode', icon: 'grid' },
  stepChecked: { points: 3, label: 'Ticked off a step', icon: 'check' },
  quizCorrect: { points: 5, label: 'Answered a quiz question', icon: 'quiz' },
  mapCreated: { points: 12, label: 'Researched a new map', icon: 'map' },
  branchExpanded: { points: 4, label: 'Explored a branch deeper', icon: 'branch' },
  numbersSolved: { points: 10, label: 'Worked through a sum', icon: 'numbers' },
  checkIn: { points: 15, label: 'Checked in with the listener', icon: 'heart' },
  noteParked: { points: 2, label: 'Parked a thought', icon: 'pin' },
};

/**
 * Rank ladder.
 *
 * Named for steadiness rather than conquest. The audience includes adults with
 * performance anxiety, so the ladder never implies falling behind — you only
 * ever move up it, and the top rung is reachable through ordinary use.
 */
export const RANKS = [
  { level: 1, name: 'Settling In', at: 0 },
  { level: 2, name: 'Finding Footing', at: 60 },
  { level: 3, name: 'Steady Hands', at: 180 },
  { level: 4, name: 'Building Rhythm', at: 400 },
  { level: 5, name: 'In Flow', at: 750 },
  { level: 6, name: 'Well Practised', at: 1250 },
  { level: 7, name: 'Quiet Mastery', at: 2000 },
];

type Counters = Partial<Record<AwardKind, number>>;

export const MILESTONES: {
  id: string;
  name: string;
  hint: string;
  test: (counters: Counters) => boolean;
}[] = [
  {
    id: 'first-move',
    name: 'First move',
    hint: 'Use any cognitive mode once',
    test: (c) => totalActions(c) >= 1,
  },
  {
    id: 'first-focus',
    name: 'Twenty-five quiet minutes',
    hint: 'Finish one focus session',
    test: (c) => (c.focusSession || 0) >= 1,
  },
  {
    id: 'mapmaker',
    name: 'Mapmaker',
    hint: 'Research five mind maps',
    test: (c) => (c.mapCreated || 0) >= 5,
  },
  {
    id: 'numbers-friend',
    name: 'Numbers, unafraid',
    hint: 'Work through five sums with objects',
    test: (c) => (c.numbersSolved || 0) >= 5,
  },
  {
    id: 'said-it-out-loud',
    name: 'Said it out loud',
    hint: 'Check in with the listener once',
    test: (c) => (c.checkIn || 0) >= 1,
  },
  {
    id: 'ten-steps',
    name: 'Ten things done',
    hint: 'Tick off ten steps across any mode',
    test: (c) => (c.stepChecked || 0) >= 10,
  },
  {
    id: 'deep-diver',
    name: 'Deep diver',
    hint: 'Expand ten branches on your maps',
    test: (c) => (c.branchExpanded || 0) >= 10,
  },
  {
    id: 'four-sessions',
    name: 'A proper stretch',
    hint: 'Finish four focus sessions',
    test: (c) => (c.focusSession || 0) >= 4,
  },
];

/** Streak milestones are checked against days rather than counters. */
export const STREAK_MILESTONES = [
  { id: 'streak-3', name: 'Three days running', days: 3 },
  { id: 'streak-7', name: 'A full week', days: 7 },
  { id: 'streak-30', name: 'Thirty days', days: 30 },
];

function totalActions(counters: Counters): number {
  return Object.values(counters || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

const DEFAULT_STATE: ProgressState = {
  points: 0,
  counters: {},
  milestones: [],
  streakDays: 0,
  longestStreakDays: 0,
  lastActiveDay: null,
};

let state: ProgressState = { ...DEFAULT_STATE };
let loaded = false;

/**
 * Whether rewards are announced.
 *
 * Held here rather than read from preferences, so the award path stays
 * synchronous. The preferences layer pushes it on load and on change.
 */
let announceRewards = true;

const stateListeners = new Set<(next: ProgressState) => void>();
const awardListeners = new Set<(event: AwardEvent) => void>();

/**
 * Local calendar day, not UTC.
 *
 * A streak is about the user's day. An ISO/UTC date would break the streak for
 * anyone working late in a positive-offset timezone — including IST, where
 * anything after 5:30am local is already "tomorrow" in UTC terms.
 */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function dayBefore(isoDay: string): string | null {
  const [year, month, day] = String(isoDay).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function commit(next: ProgressState): void {
  state = next;
  AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next)).catch(() => {});
  syncInBackground('POST', '/api/progress', next);

  for (const listener of stateListeners) {
    try {
      listener(next);
    } catch (_) {}
  }
}

export function setRewardsAnnounced(enabled: boolean): void {
  announceRewards = enabled !== false;
}

/**
 * Load the local copy and top it up from the server.
 *
 * Called once at boot. The merge takes the maximum on every monotonic field so
 * opening the app on a second device tops the local copy up instead of
 * overwriting a session the server has not seen yet.
 */
export async function initProgress(): Promise<ProgressState> {
  if (!loaded) {
    try {
      const raw = await AsyncStorage.getItem(PROGRESS_KEY);
      if (raw) state = { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch (_) {
      /* memory-only for this session */
    }
    loaded = true;
    for (const listener of stateListeners) {
      try {
        listener(state);
      } catch (_) {}
    }
  }

  try {
    const result = await api.getProgress();
    if (result?.progress) mergeServerProgress(result.progress);
  } catch (_) {
    /* the local copy is authoritative when the engine is unreachable */
  }
  return state;
}

export function getProgress(): ProgressState {
  return { ...state };
}

export function subscribeProgress(listener: (next: ProgressState) => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/**
 * Subscribe to award events.
 *
 * Separate from `subscribeProgress` because the two have different jobs: state
 * subscribers re-render a total, award subscribers celebrate a moment. Keeping
 * them apart means every call site can just call `award()` and let the toast
 * host decide how loudly to react, instead of threading a callback through.
 */
export function onAward(listener: (event: AwardEvent) => void): () => void {
  awardListeners.add(listener);
  return () => {
    awardListeners.delete(listener);
  };
}

/** Rank for a points total, plus how far into the next one it sits. */
export function getRank(points: number = state.points): Rank {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (points >= rank.at) current = rank;
  }
  const next = RANKS.find((rank) => rank.at > points) || null;

  const span = next ? next.at - current.at : 1;
  const into = next ? points - current.at : 1;

  return {
    ...current,
    next,
    pointsToNext: next ? next.at - points : 0,
    // Clamped so the ring can never render past full at the top rank.
    fraction: next ? Math.max(0, Math.min(1, into / span)) : 1,
  };
}

export function getEarnedMilestones() {
  const earned = new Set(state.milestones);
  return [
    ...MILESTONES.map((m) => ({ id: m.id, name: m.name, hint: m.hint, earned: earned.has(m.id) })),
    ...STREAK_MILESTONES.map((m) => ({
      id: m.id,
      name: m.name,
      hint: `Use SETU on ${m.days} different days`,
      earned: earned.has(m.id),
    })),
  ];
}

/**
 * Record one action and pay out for it.
 *
 * Returns what changed so the caller can celebrate proportionally: a plain
 * points award is a quiet toast, a rank change or a milestone is a bigger one.
 * When rewards are switched off the action is still counted — turning the
 * display off should not silently erase someone's streak — but nothing is
 * announced.
 */
export function award(kind: AwardKind, { silent = false }: { silent?: boolean } = {}): AwardEvent | null {
  const definition = AWARDS[kind];
  if (!definition) return null;

  const previousRank = getRank(state.points);
  const day = today();

  // Streak: same day is a no-op, yesterday extends, any older gap restarts.
  let streakDays = state.streakDays;
  if (state.lastActiveDay !== day) {
    streakDays = state.lastActiveDay === dayBefore(day) ? state.streakDays + 1 : 1;
  }

  const counters: Counters = {
    ...state.counters,
    [kind]: (state.counters[kind] || 0) + 1,
  };

  const points = state.points + definition.points;

  const earned = new Set(state.milestones);
  const freshMilestones: { id: string; name: string }[] = [];

  for (const milestone of MILESTONES) {
    if (!earned.has(milestone.id) && milestone.test(counters)) {
      earned.add(milestone.id);
      freshMilestones.push({ id: milestone.id, name: milestone.name });
    }
  }
  for (const milestone of STREAK_MILESTONES) {
    if (!earned.has(milestone.id) && streakDays >= milestone.days) {
      earned.add(milestone.id);
      freshMilestones.push({ id: milestone.id, name: milestone.name });
    }
  }

  commit({
    points,
    counters,
    milestones: [...earned],
    streakDays,
    longestStreakDays: Math.max(streakDays, state.longestStreakDays || 0),
    lastActiveDay: day,
  });

  const newRank = getRank(points);

  const event: AwardEvent = {
    kind,
    label: definition.label,
    points: definition.points,
    total: points,
    rankedUp: newRank.level > previousRank.level,
    rank: newRank,
    newMilestones: freshMilestones,
    streakDays,
    // Honour the preference at the announce layer only; the count still happened.
    announce: !silent && announceRewards,
  };

  if (event.announce) {
    for (const listener of awardListeners) {
      try {
        listener(event);
      } catch (_) {}
    }
  }

  return event;
}

export function mergeServerProgress(remote: Partial<ProgressState>): ProgressState {
  if (!remote || typeof remote !== 'object') return getProgress();

  const counters: Counters = { ...state.counters };
  for (const [kind, count] of Object.entries(remote.counters || {})) {
    const key = kind as AwardKind;
    counters[key] = Math.max(counters[key] || 0, Number(count) || 0);
  }

  const merged: ProgressState = {
    points: Math.max(state.points || 0, Number(remote.points) || 0),
    counters,
    milestones: [...new Set([...(state.milestones || []), ...(remote.milestones || [])])],
    streakDays: Math.max(state.streakDays || 0, Number(remote.streakDays) || 0),
    longestStreakDays: Math.max(
      state.longestStreakDays || 0,
      Number(remote.longestStreakDays) || 0
    ),
    lastActiveDay:
      [state.lastActiveDay, remote.lastActiveDay].filter(Boolean).sort().pop() || null,
  };

  commit(merged);
  return merged;
}

export function resetProgress(): void {
  commit({ ...DEFAULT_STATE, counters: {}, milestones: [] });
}

/** Ordered activity totals for the Momentum screen. */
export function getActivityBreakdown() {
  return (Object.entries(AWARDS) as [AwardKind, (typeof AWARDS)[AwardKind]][])
    .map(([kind, definition]) => ({
      kind,
      ...definition,
      count: state.counters[kind] || 0,
      earned: (state.counters[kind] || 0) * definition.points,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.earned - a.earned);
}
