/**
 * SETU Mobile — the app shell.
 *
 * Owns the three things that have to be reachable from every screen without
 * any screen knowing about them: the side menu, the quick-actions sheet, and
 * the parking lot.
 *
 * They live here rather than in the navigator because they are not
 * destinations. Opening the menu should not push a route, should not be undone
 * by the back gesture landing you on a different screen, and must not lose the
 * screen underneath — which is exactly what happens if you model a drawer as
 * navigation state.
 *
 * The Android hardware back button is handled centrally for the same reason: at
 * most one of these surfaces is open at a time, and back should close it rather
 * than leaving the app.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { BackHandler } from 'react-native';

type ShellSurface = 'menu' | 'actions' | 'parking' | null;

interface ShellContextValue {
  /** Which overlay is open, if any. Only ever one. */
  surface: ShellSurface;
  isMenuOpen: boolean;
  isActionsOpen: boolean;
  isParkingOpen: boolean;

  openMenu: () => void;
  openActions: () => void;
  openParking: () => void;
  closeShell: () => void;
  toggleMenu: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [surface, setSurface] = useState<ShellSurface>(null);

  const closeShell = useCallback(() => setSurface(null), []);
  const openMenu = useCallback(() => setSurface('menu'), []);
  const openActions = useCallback(() => setSurface('actions'), []);
  const openParking = useCallback(() => setSurface('parking'), []);
  const toggleMenu = useCallback(
    () => setSurface((prev) => (prev === 'menu' ? null : 'menu')),
    []
  );

  /**
   * Back closes whatever is open, and only then falls through to navigation.
   *
   * Registered once here rather than in each overlay: three components each
   * adding their own handler makes the order they were mounted in decide which
   * one wins, which is not something a user can reason about.
   */
  useEffect(() => {
    if (!surface) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSurface(null);
      return true;
    });
    return () => subscription.remove();
  }, [surface]);

  const value = useMemo<ShellContextValue>(
    () => ({
      surface,
      isMenuOpen: surface === 'menu',
      isActionsOpen: surface === 'actions',
      isParkingOpen: surface === 'parking',
      openMenu,
      openActions,
      openParking,
      closeShell,
      toggleMenu,
    }),
    [surface, openMenu, openActions, openParking, closeShell, toggleMenu]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
};

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useShell must be used within a ShellProvider');
  return context;
}
