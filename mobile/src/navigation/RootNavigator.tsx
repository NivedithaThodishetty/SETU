/**
 * SETU Mobile — the app shell.
 *
 * Four bottom tabs, one side menu, and a small set of full-screen routes.
 *
 * The previous shell had six tabs and no menu, which meant every feature had to
 * either be a tab or be buried inside another screen — and eleven features do
 * not fit in six slots, so several ended up reachable only by tapping something
 * that did not look tappable. Splitting "places you work" (tabs) from "things
 * you reach for" (menu) gives every feature exactly one obvious home.
 *
 * Everything that must survive a tab change — the focus banner, the reading
 * ruler, the parking lot, reward toasts, the colour film, the menu itself — is
 * mounted above the navigator rather than inside a screen.
 *
 * Headers are drawn by each screen through `Screen`/`AppBar` rather than by the
 * navigator, so a screen can put a search field or a segmented control in its
 * header without fighting a stack header for the space.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pause, Play } from 'lucide-react-native';

import { RADIUS, SPACING, SHADOWS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { useFocus } from '../context/FocusContext';
import { Text } from '../components/Typography';

import { OnboardingScreen } from '../screens/OnboardingScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MindMapScreen } from '../screens/MindMapScreen';
import { ToolsScreen } from '../screens/ToolsScreen';
import { ModeWorkspaceScreen } from '../screens/ModeWorkspaceScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { CameraOcrScreen } from '../screens/CameraOcrScreen';
import { DocumentReaderScreen } from '../screens/DocumentReaderScreen';
import { ListenScreen } from '../screens/ListenScreen';
import { MomentumScreen } from '../screens/MomentumScreen';
import { ReadingCheckScreen } from '../screens/ReadingCheckScreen';
import { BreatheScreen } from '../screens/BreatheScreen';
import { AboutScreen } from '../screens/AboutScreen';

import { BreakDialogModal } from '../components/BreakDialogModal';
import { ReadingRuler } from '../components/ReadingRuler';
import { ParkingLot } from '../components/ParkingLot';
import { RewardToast } from '../components/RewardToast';
import { ColorOverlay } from '../components/ColorOverlay';
import { QuickActionsSheet } from '../components/QuickActionsSheet';
import { SideMenu } from './SideMenu';
import { TabBar } from './TabBar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/**
 * The floating focus indicator.
 *
 * Shown across every tab while a session runs, because the timer's whole job is
 * to be glanceable — a countdown you have to navigate to is a countdown you
 * forget about. It sits above the tab bar rather than beside it so it never
 * competes for a tap with a destination.
 */
function FocusBanner() {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { sizeScale } = useAccessibility();
  const { isActive, isPaused, isBreak, formattedTime, pauseSession, startSession } = useFocus();

  if (!isActive) return null;

  const barHeight = Math.round(56 + (sizeScale - 1) * 40);

  return (
    <View
      style={[styles.bannerWrap, { bottom: barHeight + Math.max(insets.bottom, SPACING.xs) + SPACING.sm }]}
      pointerEvents="box-none"
    >
      <View style={styles.banner}>
        <View style={styles.bannerLeft}>
          <View style={[styles.dot, isPaused ? styles.dotPaused : styles.dotActive]} />
          <Text variant="caption" weight="semibold" color={COLORS.textMuted}>
            {isBreak ? 'Break' : 'Focus'}
          </Text>
          <Text variant="caption" weight="bold" color={COLORS.cyan} style={{ marginLeft: 6 }}>
            {formattedTime}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.bannerBtn}
          onPress={isPaused ? startSession : pauseSession}
          accessibilityRole="button"
          accessibilityLabel={isPaused ? 'Resume the timer' : 'Pause the timer'}
        >
          {isPaused ? (
            <Play size={13} color={COLORS.cyan} />
          ) : (
            <Pause size={13} color={COLORS.magenta} />
          )}
          <Text
            variant="caption"
            weight="semibold"
            color={isPaused ? COLORS.cyan : COLORS.magenta}
            style={{ marginLeft: 4 }}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MainTabs() {
  const COLORS = useThemeColors();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Tab.Navigator
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: COLORS.bg } }}
        tabBar={(props) => <TabBar {...props} />}
      >
        <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home' }} />
        <Tab.Screen name="MapTab" component={MindMapScreen} options={{ title: 'Map' }} />
        <Tab.Screen name="ToolsTab" component={ToolsScreen} options={{ title: 'Tools' }} />
        <Tab.Screen name="LibraryTab" component={LibraryScreen} options={{ title: 'Library' }} />
      </Tab.Navigator>

      <FocusBanner />
    </View>
  );
}

export const RootNavigator: React.FC = () => {
  const COLORS = useThemeColors();
  const { hasCompletedOnboarding, isLoading } = useAccessibility();

  if (isLoading) return null;

  return (
    <>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.bg },
          // Every full-screen route is something you opened *from* somewhere,
          // so they all slide in from the side and back out the way they came.
          animation: 'slide_from_right',
        }}
      >
        {!hasCompletedOnboarding ? (
          <Stack.Screen name="Onboarding">
            {(props) => (
              <OnboardingScreen
                {...props}
                onComplete={() => props.navigation.replace('MainTabs')}
              />
            )}
          </Stack.Screen>
        ) : null}

        <Stack.Screen name="MainTabs" component={MainTabs} />

        <Stack.Screen name="ModeWorkspace" component={ModeWorkspaceScreen} />
        <Stack.Screen name="Listen" component={ListenScreen} />
        <Stack.Screen name="Momentum" component={MomentumScreen} />
        <Stack.Screen name="Breathe" component={BreatheScreen} />
        <Stack.Screen name="CameraOCR" component={CameraOcrScreen} />
        <Stack.Screen name="DocumentReader" component={DocumentReaderScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="About" component={AboutScreen} />

        {/*
          Reading Check sits on the stack rather than in the tab bar.
          It is the one thing here somebody does occasionally and deliberately —
          a few minutes, every few weeks — and a seventh permanent tab would cost
          every other screen room on a phone to advertise it. It is reachable
          from Home.
        */}
        <Stack.Screen name="ReadingCheck" component={ReadingCheckScreen} />
      </Stack.Navigator>

      {/* Above the navigator: everything that has to outlive a screen. */}
      <SideMenu />
      <QuickActionsSheet />
      <ParkingLot />
      <BreakDialogModal />
      <ReadingRuler />
      <RewardToast />
      <ColorOverlay />
    </>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    bannerWrap: {
      position: 'absolute',
      left: SPACING.lg,
      right: SPACING.lg,
      zIndex: 60,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.surface,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.cyanBorder,
      ...SHADOWS.md,
    },
    bannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      marginRight: 8,
    },
    dotActive: {
      backgroundColor: t.cyan,
    },
    dotPaused: {
      backgroundColor: t.yellow,
    },
    bannerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
      backgroundColor: t.bg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      minHeight: 36,
    },
  });
