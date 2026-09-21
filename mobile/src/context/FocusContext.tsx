/**
 * SETU Mobile — focus session (ADHD Pomodoro).
 *
 * Deliberately warm rather than strict: pausing is one tap, the break prompt
 * offers "keep going" as an equal option, and nothing is ever framed as a
 * failure. The audience includes adults who have spent years being told they
 * lack discipline, and a timer that scolds gets deleted.
 *
 * Time is tracked as a wall-clock deadline rather than by decrementing a
 * counter. JavaScript timers in React Native are throttled or suspended while
 * the app is backgrounded, so a counting-down integer quietly loses minutes
 * whenever the user switches to the thing they are actually working on — which
 * is, of course, the entire point of a focus session.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';

import { FocusSessionState } from '../types';
import { getFocusSession, saveFocusSession, DEFAULT_FOCUS_STATE } from '../services/storage';
import { award } from '../services/progress';

const WORK_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

interface FocusContextValue {
  isActive: boolean;
  isPaused: boolean;
  isBreak: boolean;
  secondsRemaining: number;
  formattedTime: string;
  totalSessionsCompleted: number;
  isBreakDialogOpen: boolean;
  startSession: () => void;
  pauseSession: () => void;
  resetSession: () => void;
  /** `takeBreak` starts the five-minute breather; otherwise a fresh 25 begins. */
  dismissBreakDialog: (takeBreak?: boolean) => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

interface InternalState extends FocusSessionState {
  isBreak: boolean;
  /** Epoch ms the current run ends at. Null whenever the clock is not running. */
  endsAt: number | null;
}

const INITIAL: InternalState = { ...DEFAULT_FOCUS_STATE, isBreak: false, endsAt: null };

export const FocusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<InternalState>(INITIAL);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFocusSession().then((stored) => {
      if (cancelled) return;
      // A session is never resumed across a cold start: coming back to a timer
      // that has been "running" since yesterday is alarming, not helpful.
      setSession({
        ...INITIAL,
        totalSessionsCompleted: stored.totalSessionsCompleted || 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: InternalState) => {
    saveFocusSession({
      isActive: next.isActive,
      isPaused: next.isPaused,
      secondsRemaining: next.secondsRemaining,
      totalSessionsCompleted: next.totalSessionsCompleted,
      isBreakDialogOpen: next.isBreakDialogOpen,
    });
  }, []);

  /** Recompute the remaining time from the deadline and fire completion once. */
  const syncFromClock = useCallback(() => {
    setSession((prev) => {
      if (!prev.isActive || prev.isPaused || prev.endsAt === null) return prev;

      const remaining = Math.max(0, Math.round((prev.endsAt - Date.now()) / 1000));
      if (remaining > 0) {
        return prev.secondsRemaining === remaining ? prev : { ...prev, secondsRemaining: remaining };
      }

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (_) {}

      // Sitting through a whole work session is the single most effortful thing
      // the app asks for, so it is the largest single award. A break ending is
      // not an achievement and pays nothing.
      const finishedWork = !prev.isBreak;
      if (finishedWork) award('focusSession');

      const next: InternalState = {
        ...prev,
        isActive: false,
        isPaused: false,
        isBreak: false,
        endsAt: null,
        secondsRemaining: WORK_SECONDS,
        totalSessionsCompleted: prev.totalSessionsCompleted + (finishedWork ? 1 : 0),
        isBreakDialogOpen: finishedWork,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  useEffect(() => {
    if (session.isActive && !session.isPaused) {
      syncFromClock();
      tickRef.current = setInterval(syncFromClock, 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [session.isActive, session.isPaused, syncFromClock]);

  // Coming back from the background is where the deadline earns its keep: the
  // interval may not have run for minutes, so we recompute rather than trust it.
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') syncFromClock();
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [syncFromClock]);

  const begin = useCallback(
    (seconds: number, isBreak: boolean) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (_) {}

      setSession((prev) => {
        const next: InternalState = {
          ...prev,
          isActive: true,
          isPaused: false,
          isBreak,
          secondsRemaining: seconds,
          endsAt: Date.now() + seconds * 1000,
          isBreakDialogOpen: false,
        };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const startSession = useCallback(() => {
    setSession((prev) => {
      // Resuming keeps whatever was left rather than restarting the clock.
      const seconds = prev.isPaused ? prev.secondsRemaining : WORK_SECONDS;
      const isBreak = prev.isPaused ? prev.isBreak : false;

      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (_) {}

      const next: InternalState = {
        ...prev,
        isActive: true,
        isPaused: false,
        isBreak,
        secondsRemaining: seconds,
        endsAt: Date.now() + seconds * 1000,
        isBreakDialogOpen: false,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const pauseSession = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}

    setSession((prev) => {
      if (!prev.isActive || prev.isPaused) return prev;
      const remaining =
        prev.endsAt !== null
          ? Math.max(0, Math.round((prev.endsAt - Date.now()) / 1000))
          : prev.secondsRemaining;

      const next: InternalState = { ...prev, isPaused: true, secondsRemaining: remaining, endsAt: null };
      persist(next);
      return next;
    });
  }, [persist]);

  const resetSession = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}

    setSession((prev) => {
      const next: InternalState = {
        ...prev,
        isActive: false,
        isPaused: false,
        isBreak: false,
        secondsRemaining: WORK_SECONDS,
        endsAt: null,
        isBreakDialogOpen: false,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const dismissBreakDialog = useCallback(
    (takeBreak = false) => {
      if (takeBreak) {
        begin(BREAK_SECONDS, true);
        return;
      }
      begin(WORK_SECONDS, false);
    },
    [begin]
  );

  const minutes = Math.floor(session.secondsRemaining / 60);
  const seconds = session.secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <FocusContext.Provider
      value={{
        isActive: session.isActive,
        isPaused: session.isPaused,
        isBreak: session.isBreak,
        secondsRemaining: session.secondsRemaining,
        formattedTime,
        totalSessionsCompleted: session.totalSessionsCompleted,
        isBreakDialogOpen: session.isBreakDialogOpen,
        startSession,
        pauseSession,
        resetSession,
        dismissBreakDialog,
      }}
    >
      {children}
    </FocusContext.Provider>
  );
};

export function useFocus(): FocusContextValue {
  const context = useContext(FocusContext);
  if (!context) throw new Error('useFocus must be used within a FocusProvider');
  return context;
}
