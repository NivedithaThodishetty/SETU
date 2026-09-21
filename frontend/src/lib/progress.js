/**
 * SETU Momentum — reward, streak, and rank engine.
 *
 * Built on the clinical guidance that ADHD attention is sustained by interest
 * and visible progress rather than by reports: every meaningful action pays out
 * immediately, milestones are one-off and named, and the whole thing is
 * summarised as a single ring rather than a page of numbers.
 *
 * Local-first by necessity, not convenience — a reward that waits on a network
 * round trip has already missed the moment it was meant to reinforce. Points are
 * committed to browser storage synchronously and mirrored to MongoDB in the
 * background, so the celebration fires instantly and offline.
 */

import { syncInBackground } from './api';
import { getPrefs } from './storage';

const PROGRESS_KEY = 'setu.progress.v1';

/* -------------------------------------------------------------------------- */
/* Award table                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What each action is worth.
 *
 * Values are weighted by effort rather than by how much we would like the user
 * to do it — finishing a 25-minute focus session pays roughly three times a mode
 * run because it genuinely costs that much more. Inflating cheap actions is how
 * a points system stops meaning anything.
 */
export const AWARDS = {
  focusSession: { points: 25, label: 'Finished a focus session', icon: 'ph-timer' },
  modeRun: { points: 8, label: 'Used a cognitive mode', icon: 'ph-squares-four' },
  stepChecked: { points: 3, label: 'Ticked off a step', icon: 'ph-check-square' },
  quizCorrect: { points: 5, label: 'Answered a quiz question', icon: 'ph-graduation-cap' },
  mapCreated: { points: 12, label: 'Researched a new map', icon: 'ph-graph' },
  branchExpanded: { points: 4, label: 'Explored a branch deeper', icon: 'ph-tree-structure' },
  numbersSolved: { points: 10, label: 'Worked through a sum', icon: 'ph-math-operations' },
  checkIn: { points: 15, label: 'Checked in with the listener', icon: 'ph-heart' },
  noteParked: { points: 2, label: 'Parked a thought', icon: 'ph-push-pin' }
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
  { level: 7, name: 'Quiet Mastery', at: 2000 }
];

/**
 * One-off milestones.
 *
 * `test` reads the counters map, so a milestone can key off any award kind
 * without the award sites needing to know milestones exist.
 */
export const MILESTONES = [
  {
    id: 'first-move',
    name: 'First move',
    hint: 'Use any cognitive mode once',
    icon: 'ph-flag',
    test: (c) => totalActions(c) >= 1
  },
  {
    id: 'first-focus',
    name: 'Twenty-five quiet minutes',
    hint: 'Finish one focus session',
    icon: 'ph-timer',
    test: (c) => (c.focusSession || 0) >= 1
  },
  {
    id: 'mapmaker',
    name: 'Mapmaker',
    hint: 'Research five mind maps',
    icon: 'ph-graph',
    test: (c) => (c.mapCreated || 0) >= 5
  },
  {
    id: 'numbers-friend',
    name: 'Numbers, unafraid',
    hint: 'Work through five sums with objects',
    icon: 'ph-math-operations',
    test: (c) => (c.numbersSolved || 0) >= 5
  },
  {
    id: 'said-it-out-loud',
    name: 'Said it out loud',
    hint: 'Check in with the listener once',
    icon: 'ph-heart',
    test: (c) => (c.checkIn || 0) >= 1
  },
  {
    id: 'ten-steps',
    name: 'Ten things done',
    hint: 'Tick off ten steps across any mode',
    icon: 'ph-check-square',
    test: (c) => (c.stepChecked || 0) >= 10
  },
  {
    id: 'deep-diver',
    name: 'Deep diver',
    hint: 'Expand ten branches on your maps',
    icon: 'ph-tree-structure',
    test: (c) => (c.branchExpanded || 0) >= 10
  },
  {
    id: 'four-sessions',
    name: 'A proper stretch',
    hint: 'Finish four focus sessions',
    icon: 'ph-hourglass-high',
    test: (c) => (c.focusSession || 0) >= 4
  }
];

/** Streak milestones are checked against days rather than counters. */
export const STREAK_MILESTONES = [
  { id: 'streak-3', name: 'Three days running', days: 3, icon: 'ph-flame' },
  { id: 'streak-7', name: 'A full week', days: 7, icon: 'ph-flame' },
  { id: 'streak-30', name: 'Thirty days', days: 30, icon: 'ph-flame' }
];

function totalActions(counters) {
  return Object.values(counters || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

const DEFAULT_STATE = {
  points: 0,
  counters: {},
  milestones: [],
  streakDays: 0,
  longestStreakDays: 0,
  lastActiveDay: null
};

let cache = null;
const listeners = new Set();
const awardListeners = new Set();

/**
 * Subscribe to award events.
 *
 * Separate from `subscribeProgress` because the two have different jobs: state
 * subscribers re-render a total, award subscribers celebrate a moment. Keeping
 * them apart means every call site can simply call `award()` and let the toast
 * host decide how loudly to react, instead of threading a callback through.
 */
export function onAward(listener) {
  awardListeners.add(listener);
  return () => awardListeners.delete(listener);
}

/**
 * Local calendar day, not UTC.
 *
 * A streak is about the user's day. Using an ISO/UTC date would break the streak
 * for anyone working late in a positive-offset timezone — including IST, where
 * anything after 5:30am local is already "tomorrow" in UTC terms.
 */
function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function dayBefore(isoDay) {
  const [year, month, day] = String(isoDay).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function readState() {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    cache = raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch (_) {
    // Private mode or tracking prevention — memory-only for this session.
    cache = { ...DEFAULT_STATE };
  }
  return cache;
}

function writeState(next) {
  cache = next;
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch (_) {
    /* the in-memory cache still drives the UI for this session */
  }
  for (const listener of listeners) {
    try {
      listener(next);
    } catch (_) {}
  }
  syncInBackground('POST', '/api/progress', next);
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function getProgress() {
  return { ...readState() };
}

export function subscribeProgress(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Rank for a points total, plus how far into the next one it sits. */
export function getRank(points = readState().points) {
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
    fraction: next ? Math.max(0, Math.min(1, into / span)) : 1
  };
}

export function getEarnedMilestones() {
  const state = readState();
  const earned = new Set(state.milestones);
  const all = [
    ...MILESTONES.map((m) => ({ ...m, earned: earned.has(m.id) })),
    ...STREAK_MILESTONES.map((m) => ({
      ...m,
      hint: `Use SETU on ${m.days} different days`,
      earned: earned.has(m.id)
    }))
  ];
  return all;
}

/**
 * Record one action and pay out for it.
 *
 * Returns what changed so the caller can celebrate proportionally: a plain
 * points award is a quiet toast, a rank change or a milestone is a chime. When
 * rewards are switched off the action is still counted — turning the display off
 * should not silently erase someone's streak — but nothing is announced.
 */
export function award(kind, { silent = false } = {}) {
  const definition = AWARDS[kind];
  if (!definition) return null;

  const state = readState();
  const previousRank = getRank(state.points);
  const day = today();

  // Streak: same day is a no-op, yesterday extends, any older gap restarts.
  let streakDays = state.streakDays;
  if (state.lastActiveDay !== day) {
    streakDays = state.lastActiveDay === dayBefore(day) ? state.streakDays + 1 : 1;
  }

  const counters = {
    ...state.counters,
    [kind]: (state.counters[kind] || 0) + 1
  };

  const points = state.points + definition.points;

  const earned = new Set(state.milestones);
  const freshMilestones = [];

  for (const milestone of MILESTONES) {
    if (!earned.has(milestone.id) && milestone.test(counters)) {
      earned.add(milestone.id);
      freshMilestones.push(milestone);
    }
  }
  for (const milestone of STREAK_MILESTONES) {
    if (!earned.has(milestone.id) && streakDays >= milestone.days) {
      earned.add(milestone.id);
      freshMilestones.push(milestone);
    }
  }

  const next = {
    points,
    counters,
    milestones: [...earned],
    streakDays,
    longestStreakDays: Math.max(streakDays, state.longestStreakDays || 0),
    lastActiveDay: day
  };

  writeState(next);

  const newRank = getRank(points);

  const event = {
    kind,
    label: definition.label,
    icon: definition.icon,
    points: definition.points,
    total: points,
    rankedUp: newRank.level > previousRank.level,
    rank: newRank,
    newMilestones: freshMilestones,
    streakDays,
    // Honour the preference at the announce layer only; the count still happened.
    announce: !silent && getPrefs().rewards !== false
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

/**
 * Merge the server's snapshot into the local one at startup.
 *
 * Takes the maximum on every monotonic field and the union of milestones, so
 * opening the app on a second device tops the local copy up instead of
 * overwriting a session the server has not seen yet.
 */
export function mergeServerProgress(remote) {
  if (!remote || typeof remote !== 'object') return getProgress();
  const local = readState();

  const counters = { ...local.counters };
  for (const [kind, count] of Object.entries(remote.counters || {})) {
    counters[kind] = Math.max(counters[kind] || 0, Number(count) || 0);
  }

  const merged = {
    points: Math.max(local.points || 0, Number(remote.points) || 0),
    counters,
    milestones: [...new Set([...(local.milestones || []), ...(remote.milestones || [])])],
    streakDays: Math.max(local.streakDays || 0, Number(remote.streakDays) || 0),
    longestStreakDays: Math.max(
      local.longestStreakDays || 0,
      Number(remote.longestStreakDays) || 0
    ),
    lastActiveDay:
      [local.lastActiveDay, remote.lastActiveDay].filter(Boolean).sort().pop() || null
  };

  writeState(merged);
  return merged;
}

export function resetProgress() {
  writeState({ ...DEFAULT_STATE });
}

/** Ordered activity totals for the progress page. */
export function getActivityBreakdown() {
  const { counters } = readState();
  return Object.entries(AWARDS)
    .map(([kind, definition]) => ({
      kind,
      ...definition,
      count: counters[kind] || 0,
      earned: (counters[kind] || 0) * definition.points
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.earned - a.earned);
}
