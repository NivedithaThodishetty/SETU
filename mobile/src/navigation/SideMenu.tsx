/**
 * SETU Mobile — the side menu.
 *
 * The app used to carry six bottom tabs. Six is past the point where a tab bar
 * is a map and into where it is a list you have to read — and the labels shrank
 * to fit, which is a poor trade in an app whose users chose it because reading
 * small text is hard. Worse, everything that did not fit into six simply had no
 * home: Momentum was reachable only by tapping a statistic on Home, the scanner
 * only from a button inside a card.
 *
 * So the bottom bar keeps the four places you *work*, and everything you
 * *reach for* lives here: the reflective listener, the breathing space, the
 * scanner, progress, settings. It also carries the two controls that change
 * hour to hour — the reading aids and the focus timer — because burying those
 * in Settings is the same as removing them.
 *
 * It is a panel over the app rather than a route, so opening it never costs you
 * the screen you were on.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Sparkles,
  Network,
  LayoutGrid,
  BookOpen,
  Heart,
  Wind,
  Camera,
  TrendingUp,
  Settings as SettingsIcon,
  Info,
  Pin,
  Timer,
  Play,
  Pause,
  BookMarked,
  Type,
  Flame,
} from 'lucide-react-native';

import { SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { useShell } from '../context/ShellContext';
import { useFocus } from '../context/FocusContext';
import { useIdentity } from '../context/IdentityContext';
import { DURATION, EASE_OUT, duration } from '../constants/motion';
import { Text } from '../components/Typography';
import { getProgress, getRank, subscribeProgress } from '../services/progress';
import { navigate, navigateTab, currentRouteName } from './navigationRef';

interface Destination {
  key: string;
  label: string;
  hint: string;
  icon: any;
  /** Bottom-tab destinations switch tabs; the rest push a stack route. */
  tab?: string;
  route?: string;
}

const WORKSPACES: Destination[] = [
  { key: 'HomeTab', label: 'Home', hint: 'Where you left off', icon: Sparkles, tab: 'HomeTab' },
  {
    key: 'MapTab',
    label: 'Mind map',
    hint: 'Research a topic into a map',
    icon: Network,
    tab: 'MapTab',
  },
  {
    key: 'ToolsTab',
    label: 'Tools',
    hint: 'Eight ways to make something easier',
    icon: LayoutGrid,
    tab: 'ToolsTab',
  },
  {
    key: 'LibraryTab',
    label: 'Library',
    hint: 'Maps, results and documents you kept',
    icon: BookOpen,
    tab: 'LibraryTab',
  },
];

const SUPPORT: Destination[] = [
  { key: 'Listen', label: 'Listen', hint: 'Somewhere to put it', icon: Heart, route: 'Listen' },
  { key: 'Breathe', label: 'Breathe', hint: 'A minute to settle', icon: Wind, route: 'Breathe' },
  {
    key: 'CameraOCR',
    label: 'Scan a page',
    hint: 'Read printed text with the camera',
    icon: Camera,
    route: 'CameraOCR',
  },
  {
    key: 'Momentum',
    label: 'Momentum',
    hint: 'Points, streak and milestones',
    icon: TrendingUp,
    route: 'Momentum',
  },
];

export const SideMenu: React.FC = () => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isMenuOpen, closeShell, openParking } = useShell();
  const {
    reduceMotion,
    bionic,
    readingRuler,
    speakOnTap,
    toggleBionic,
    toggleReadingRuler,
    toggleSpeakOnTap,
  } = useAccessibility();
  const { isActive, isPaused, formattedTime, startSession, pauseSession } = useFocus();
  const { engineState, isDbConnected } = useIdentity();

  const [progress, setProgress] = useState(getProgress);
  useEffect(() => subscribeProgress(setProgress), []);

  const anim = useRef(new Animated.Value(0)).current;
  const panelWidth = Math.min(330, width * 0.86);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isMenuOpen ? 1 : 0,
      duration: duration(DURATION.panel, reduceMotion),
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  }, [isMenuOpen, anim, reduceMotion]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-panelWidth, 0],
  });

  const go = (destination: Destination) => {
    closeShell();
    if (destination.tab) navigateTab(destination.tab);
    else if (destination.route) navigate(destination.route);
  };

  const active = currentRouteName();
  const rank = getRank(progress.points);

  const engineLabel =
    engineState === 'ok'
      ? isDbConnected
        ? 'Engine and database ready'
        : 'Engine ready'
      : engineState === 'checking'
        ? 'Checking the engine…'
        : engineState === 'nokey'
          ? 'Engine reachable, no AI key'
          : 'Engine offline — saved work still opens';

  const engineTint =
    engineState === 'ok'
      ? COLORS.success
      : engineState === 'checking'
        ? COLORS.textSubtle
        : engineState === 'nokey'
          ? COLORS.yellowDark
          : COLORS.error;

  const renderDestination = (destination: Destination) => {
    const Icon = destination.icon;
    const isActiveRoute = active === destination.key || active === destination.route;
    return (
      <TouchableOpacity
        key={destination.key}
        activeOpacity={0.75}
        onPress={() => go(destination)}
        style={[styles.destination, isActiveRoute ? styles.destinationActive : null]}
        accessibilityRole="button"
        accessibilityState={{ selected: isActiveRoute }}
        accessibilityLabel={destination.label}
        accessibilityHint={destination.hint}
      >
        <Icon size={19} color={isActiveRoute ? COLORS.cyan : COLORS.textMuted} />
        <View style={styles.destinationText}>
          <Text
            variant="bodySm"
            weight={isActiveRoute ? 'bold' : 'semibold'}
            color={isActiveRoute ? COLORS.cyan : COLORS.text}
          >
            {destination.label}
          </Text>
          <Text variant="caption" color={COLORS.textMuted} numberOfLines={1}>
            {destination.hint}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderToggle = (
    key: string,
    label: string,
    hint: string,
    Icon: any,
    on: boolean,
    onPress: () => void
  ) => (
    <TouchableOpacity
      key={key}
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.toggle, on ? styles.toggleOn : null]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Icon size={16} color={on ? COLORS.cyanDark : COLORS.textMuted} />
      <Text
        variant="caption"
        weight={on ? 'semibold' : 'normal'}
        color={on ? COLORS.cyanDark : COLORS.text}
        style={{ marginLeft: 6, flex: 1 }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={[styles.pip, on ? styles.pipOn : null]} />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={isMenuOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeShell}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: anim }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeShell}
            accessibilityRole="button"
            accessibilityLabel="Close the menu"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top + SPACING.lg,
              transform: [{ translateX }],
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xl }}
          >
            {/* What this is, and how you are doing in it. */}
            <View style={styles.brand}>
              <Text variant="title" weight="bold">
                SETU
              </Text>
              <Text variant="caption" color={COLORS.textMuted}>
                A calmer way through dense pages
              </Text>
            </View>

            <TouchableOpacity
              style={styles.progressCard}
              activeOpacity={0.8}
              onPress={() => {
                closeShell();
                navigate('Momentum');
              }}
              accessibilityRole="button"
              accessibilityLabel={`${rank.name}. ${progress.points} points, ${progress.streakDays} day streak. Open Momentum.`}
            >
              <View style={styles.progressTop}>
                <Text variant="bodySm" weight="bold" color={COLORS.cyanDark}>
                  {rank.name}
                </Text>
                <View style={styles.streakPill}>
                  <Flame size={12} color={COLORS.yellowDark} />
                  <Text
                    variant="caption"
                    weight="bold"
                    color={COLORS.yellowDark}
                    style={{ marginLeft: 3 }}
                  >
                    {progress.streakDays}
                  </Text>
                </View>
              </View>
              <Text variant="caption" color={COLORS.textMuted}>
                {progress.points} points ·{' '}
                {progress.streakDays === 1 ? '1 day' : `${progress.streakDays} days`} in a row
              </Text>
            </TouchableOpacity>

            {/* The focus timer is a control, not a page. */}
            <TouchableOpacity
              style={styles.focusRow}
              activeOpacity={0.8}
              onPress={isActive && !isPaused ? pauseSession : startSession}
              accessibilityRole="button"
              accessibilityLabel={
                isActive
                  ? isPaused
                    ? `Focus session paused at ${formattedTime}. Resume.`
                    : `Focus session running, ${formattedTime} left. Pause.`
                  : 'Start a 25 minute focus session'
              }
            >
              <Timer size={18} color={COLORS.cyan} />
              <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                <Text variant="bodySm" weight="semibold">
                  {isActive ? formattedTime : 'Focus for 25 minutes'}
                </Text>
                <Text variant="caption" color={COLORS.textMuted}>
                  {isActive
                    ? isPaused
                      ? 'Paused — tap to resume'
                      : 'Running — tap to pause'
                    : 'Keeps running while you use other apps'}
                </Text>
              </View>
              {isActive && !isPaused ? (
                <Pause size={16} color={COLORS.magenta} />
              ) : (
                <Play size={16} color={COLORS.cyan} />
              )}
            </TouchableOpacity>

            <Text variant="kicker" color={COLORS.textSubtle} style={styles.groupLabel}>
              Workspaces
            </Text>
            {WORKSPACES.map(renderDestination)}

            <Text variant="kicker" color={COLORS.textSubtle} style={styles.groupLabel}>
              When you need it
            </Text>
            {SUPPORT.map(renderDestination)}

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                closeShell();
                // Let the menu finish leaving before the next panel arrives —
                // two overlays crossing mid-flight reads as a glitch.
                setTimeout(openParking, reduceMotion ? 0 : DURATION.panel);
              }}
              style={styles.destination}
              accessibilityRole="button"
              accessibilityLabel="Parking lot"
              accessibilityHint="Park an interrupting thought without losing your place"
            >
              <Pin size={19} color={COLORS.textMuted} />
              <View style={styles.destinationText}>
                <Text variant="bodySm" weight="semibold">
                  Parking lot
                </Text>
                <Text variant="caption" color={COLORS.textMuted} numberOfLines={1}>
                  Put a thought down and come back to it
                </Text>
              </View>
            </TouchableOpacity>

            <Text variant="kicker" color={COLORS.textSubtle} style={styles.groupLabel}>
              Reading aids
            </Text>
            <View style={styles.toggles}>
              {renderToggle(
                'bionic',
                'Bold word starts',
                'Thickens the first letters of each word',
                Type,
                bionic,
                toggleBionic
              )}
              {renderToggle(
                'ruler',
                'Reading ruler',
                'Isolates one line at a time',
                BookMarked,
                readingRuler,
                toggleReadingRuler
              )}
              {renderToggle(
                'speak',
                'Speak on tap',
                'Reads a mind map branch aloud when you open it',
                Heart,
                speakOnTap,
                toggleSpeakOnTap
              )}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.footerRow}
                onPress={() => {
                  closeShell();
                  navigate('Settings');
                }}
                accessibilityRole="button"
                accessibilityLabel="Settings"
              >
                <SettingsIcon size={18} color={COLORS.textMuted} />
                <Text variant="bodySm" weight="semibold" style={{ marginLeft: SPACING.sm }}>
                  Settings
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.footerRow}
                onPress={() => {
                  closeShell();
                  navigate('About');
                }}
                accessibilityRole="button"
                accessibilityLabel="About SETU"
              >
                <Info size={18} color={COLORS.textMuted} />
                <Text variant="bodySm" weight="semibold" style={{ marginLeft: SPACING.sm }}>
                  About SETU
                </Text>
              </TouchableOpacity>

              <View
                style={styles.engineRow}
                accessible
                accessibilityRole="text"
                accessibilityLabel={engineLabel}
              >
                <View style={[styles.engineDot, { backgroundColor: engineTint }]} />
                <Text variant="caption" color={COLORS.textMuted} style={{ flex: 1 }}>
                  {engineLabel}
                </Text>
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      flexDirection: 'row',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.isDark ? 'rgba(0, 0, 0, 0.62)' : 'rgba(32, 30, 29, 0.42)',
    },
    panel: {
      backgroundColor: t.bg,
      borderRightWidth: 1,
      borderRightColor: t.divider,
      paddingHorizontal: SPACING.lg,
      ...SHADOWS.lg,
    },
    brand: {
      marginBottom: SPACING.lg,
    },
    progressCard: {
      backgroundColor: t.cyanLight,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.cyanBorder,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    progressTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    streakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.yellowLight,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 1,
      borderRadius: RADIUS.pill,
    },
    focusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.md,
      minHeight: 56,
    },
    groupLabel: {
      marginTop: SPACING.xl,
      marginBottom: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    destination: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.md,
      minHeight: 52,
      gap: SPACING.md,
    },
    destinationActive: {
      backgroundColor: t.cyanLight,
    },
    destinationText: {
      flex: 1,
    },
    toggles: {
      gap: SPACING.xs,
    },
    toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      minHeight: 48,
    },
    toggleOn: {
      backgroundColor: t.cyanLight,
      borderColor: t.cyanBorder,
    },
    pip: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.divider,
    },
    pipOn: {
      backgroundColor: t.cyan,
    },
    footer: {
      marginTop: SPACING.xl,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: t.dividerSubtle,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      minHeight: 48,
    },
    engineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.sm,
      gap: SPACING.sm,
    },
    engineDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
  });
