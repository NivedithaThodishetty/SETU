/**
 * SETU Mobile — application entry point.
 *
 * Provider order is deliberate: accessibility preferences load first because
 * every layer above them reads from that state, the theme derives from it, and
 * the navigation container needs a resolved palette before it paints anything.
 * The shell sits inside the theme (its panels are themed) but outside the
 * navigator (its panels have to outlive any screen). The error boundary wraps
 * the lot so a failure anywhere inside still leaves the user a readable screen
 * with a way out.
 */

import React, { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { familyFor, FONT_ASSETS } from './src/constants/fonts';
import { AccessibilityProvider, useAccessibility } from './src/context/AccessibilityContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { FocusProvider } from './src/context/FocusContext';
import { IdentityProvider } from './src/context/IdentityContext';
import { ShellProvider } from './src/context/ShellContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { ErrorBoundary } from './src/components/ErrorBoundary';

/**
 * The navigation shell.
 *
 * Split out so it can read the live palette — the navigation theme and the
 * status bar both have to flip when someone switches to a dark ground, and a
 * component that sits above ThemeProvider cannot see it.
 */
function Shell() {
  const { colors, isDark } = useTheme();
  const { font } = useAccessibility();

  /*
   * Navigation's own chrome — header titles, tab labels — follows the reader's
   * typeface too. It used to be pinned to 'serif' regardless, so someone who
   * chose Hyperlegible got it everywhere except the tab bar they read on every
   * screen.
   *
   * React Navigation's theme types require a family name rather than allowing
   * undefined, so the "system" choice — where undefined is precisely what we
   * want everywhere else — needs the platform's own name spelled out here.
   */
  const systemFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' });
  const regular = familyFor(font, 'regular') || systemFamily;
  const bold = familyFor(font, 'bold') || systemFamily;

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{
        dark: isDark,
        colors: {
          primary: colors.cyan,
          background: colors.bg,
          card: colors.bg,
          text: colors.text,
          border: colors.dividerSubtle,
          notification: colors.magenta,
        },
        fonts: {
          regular: { fontFamily: regular, fontWeight: 'normal' },
          medium: { fontFamily: regular, fontWeight: '500' },
          bold: { fontFamily: bold, fontWeight: 'bold' },
          heavy: { fontFamily: bold, fontWeight: '900' },
        },
      }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

/*
 * Hold the splash until the typefaces are on disk.
 *
 * Without this the app paints one frame in the platform font and then reflows
 * into the chosen face. That flash is ugly anywhere; for a reader with ADHD it
 * is an unprompted movement on the first screen, which is the specific thing
 * the reduced-motion setting elsewhere in the app exists to avoid. Holding the
 * splash for the few hundred milliseconds the load takes is the cheaper trade.
 *
 * The catch is deliberate and load-bearing: `preventAutoHideAsync` rejects if
 * the splash has already gone, and an unhandled rejection at module scope takes
 * the app down before the error boundary is mounted to catch it.
 */
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  /*
   * A font that fails to load must not leave the user on a splash screen
   * forever. Every family falls back to the platform face, so a failure here
   * costs the chosen typeface and nothing else — proceeding is strictly better
   * than blocking.
   */
  const ready = fontsLoaded || !!fontError;

  const revealApp = useCallback(async () => {
    if (ready) await SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    revealApp();
  }, [revealApp]);

  if (!ready) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AccessibilityProvider>
            <ThemeProvider>
              <FocusProvider>
                <IdentityProvider>
                  <ShellProvider>
                    <Shell />
                  </ShellProvider>
                </IdentityProvider>
              </FocusProvider>
            </ThemeProvider>
          </AccessibilityProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
