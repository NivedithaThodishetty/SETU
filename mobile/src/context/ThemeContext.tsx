/**
 * SETU Mobile — theme plumbing.
 *
 * React Native evaluates `StyleSheet.create` once at module load, so a palette
 * read at that point is frozen for the life of the process. Screens therefore
 * declare a style *factory* and call `useThemedStyles`, which re-runs it when
 * the ground changes. It costs one `useMemo` per screen and is the only way a
 * theme switch can reach a stylesheet at all.
 *
 * `useThemeColors` covers the other half — icon tints and inline colours that
 * live in the render body rather than in a stylesheet.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { Palette, SPACING_SCALE, paletteFor, plateColorsFor } from '../constants/themes';
import { useAccessibility } from './AccessibilityContext';

interface ThemeContextValue {
  colors: Palette;
  plateColors: string[];
  /** Line-height and block-gap multiplier from the reading-density setting. */
  spacingScale: number;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, spacing } = useAccessibility();

  const value = useMemo<ThemeContextValue>(() => {
    const colors = paletteFor(theme);
    return {
      colors,
      plateColors: plateColorsFor(colors),
      spacingScale: SPACING_SCALE[spacing] || 1,
      isDark: colors.isDark,
    };
  }, [theme, spacing]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}

export function useThemeColors(): Palette {
  return useTheme().colors;
}

/**
 * Build a screen's stylesheet against the live palette.
 *
 * The factory must be declared at module scope so its identity is stable;
 * defining it inline in a component rebuilds every stylesheet on every render.
 */
export function useThemedStyles<T>(factory: (t: Palette) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
