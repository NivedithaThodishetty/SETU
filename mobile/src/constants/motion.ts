/**
 * SETU Mobile — motion tokens.
 *
 * One place for every duration and easing curve in the app, because the
 * accessibility setting that matters most here is the one that turns animation
 * off. `motion: 'reduced'` has to reach every transition, and a screen that
 * hard-codes `duration: 240` quietly ignores it.
 *
 * The durations themselves are deliberately slow-ish. This is an app for people
 * who lose the thread when things move suddenly; a panel that snaps into place
 * in 120ms reads as a flicker rather than as a panel arriving.
 */

import { Easing } from 'react-native';

export const DURATION = {
  /** Chip states, ripples — barely perceptible. */
  instant: 90,
  /** Standard: sheets settling, cards appearing. */
  base: 240,
  /** Full-height surfaces: the side menu, a bottom sheet. */
  panel: 300,
  /** Long, ambient movement — the breathing guide. */
  ambient: 4000,
};

/** Decelerating curve. Things entering the screen use this. */
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** Accelerating curve. Things leaving use this, so exits feel lighter. */
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);

/** Symmetric. Values that move without arriving or leaving — a progress fill. */
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * Collapse a duration to nothing when motion is reduced.
 *
 * Returning 0 rather than skipping the animation entirely keeps every call site
 * on one code path: the value still lands where it should, it just gets there
 * immediately.
 */
export function duration(ms: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : ms;
}
