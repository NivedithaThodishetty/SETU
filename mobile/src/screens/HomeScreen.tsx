/**
 * SETU Mobile — Home.
 *
 * The old Home tried to be a dashboard: a status pill, four counters, three
 * toggle chips, a timer, a hero card, eight horizontally-scrolling mode cards,
 * a tip and a map list — all above the fold on a tall phone. Every element was
 * defensible on its own, and together they were a wall. For an audience that
 * came here *because* dense pages are hard, opening the app onto a dense page
 * is the one thing it must not do.
 *
 * So Home now answers one question — what do you want to do right now? — in
 * four blocks, in the order somebody actually needs them: ask something, carry
 * on with what you were doing, name the problem you are stuck on, or look after
 * yourself. The counters moved to Momentum, the toggles and the timer to the
 * side menu, and the full tool list to Tools.
 *
 * Tools are named by the problem, not the feature. Somebody in task paralysis
 * does not search for "Start mode"; they know that they cannot get going.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Sparkles,
  Camera,
  PlayCircle,
  Waves,
  Calculator,
  MessageCircle,
  Heart,
  Wind,
  Timer,
  Network,
  Lightbulb,
  ChevronRight,
  CloudOff,
  BookOpenCheck,
} from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { useFocus } from '../context/FocusContext';
import { useShell } from '../context/ShellContext';
import { useIdentity } from '../context/IdentityContext';
import { Screen } from '../components/Screen';
import { Section } from '../components/Section';
import { ListGroup, ListRow } from '../components/ListRow';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { getSavedMindMaps } from '../services/storage';
import { MindMapDocument, CognitiveModeKey } from '../types';
import { formatRelativeDate, truncateText } from '../utils/formatters';

export interface HomeScreenProps {
  navigation: any;
}

/**
 * The four openings people arrive with most often.
 *
 * Four, not eight. The full set is one tap away in Tools, and a list of eight
 * on the first screen is a decision rather than a starting point — which is the
 * exact executive-function tax this app exists to remove.
 */
const COMMON_PROBLEMS: {
  mode: CognitiveModeKey;
  label: string;
  hint: string;
  icon: any;
}[] = [
  {
    mode: 'start',
    label: 'I cannot get started',
    hint: 'One ten-minute action, small enough to actually begin',
    icon: PlayCircle,
  },
  {
    mode: 'simplify',
    label: 'This text is too dense',
    hint: 'Plain language, with nothing left out',
    icon: Waves,
  },
  {
    mode: 'numbers',
    label: 'The numbers will not sit still',
    hint: 'The sum as countable things, one step at a time',
    icon: Calculator,
  },
  {
    mode: 'practice',
    label: 'I have to say something hard',
    hint: 'Rehearse it in a few tones before it is real',
    icon: MessageCircle,
  },
];

/**
 * One line a day, rotated.
 *
 * Every one of these came out of watching somebody miss a feature. Nothing here
 * is a productivity slogan — a tip that does not teach something specific is
 * just another thing on the screen.
 */
const TIPS = [
  'Tap the microphone anywhere you can type. Dictation handles all eleven languages.',
  'The focus session keeps running while you use another app.',
  'The reading ruler isolates one line at a time. It is in the menu, under Reading aids.',
  'Tap a mind map branch and SETU explains that idea in your language, out loud.',
  'The parking lot holds a thought so you can let go of it and finish what you were doing.',
  'If text seems to shimmer, try a colour tint in Settings. Which colour helps is personal.',
  'Every tool opens on a worked example, so no screen is ever blank.',
  'Numbers explains a sum with countable things rather than notation.',
  'The plus button in the bar opens everything SETU can do, searchable.',
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Late one';
}

function tipOfTheDay(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return TIPS[dayOfYear % TIPS.length];
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isActive, formattedTime, startSession } = useFocus();
  const { openActions } = useShell();
  const { engineState } = useIdentity();

  const [topic, setTopic] = useState('');
  const [recent, setRecent] = useState<MindMapDocument[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const maps = await getSavedMindMaps();
      // Only what the reader made. The bundled reference maps are useful, but
      // "pick up where you left off" is a lie if it offers something they have
      // never opened.
      const own = maps.filter((map) => map.sourceType !== 'seed');
      setRecent((own.length ? own : maps).slice(0, 2));
    } catch (_) {
      /* the section simply does not render */
    }
  }, []);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const draw = (query?: string) => {
    const value = (query ?? topic).trim();
    if (!value) return;
    setTopic('');
    navigation.navigate('MapTab', { initialTopic: value });
  };

  return (
    <Screen
      title="SETU"
      subtitle={greeting()}
      refreshing={refreshing}
      onRefresh={onRefresh}
      bottomInset={SPACING.xl}
    >
      {/*
        Said once, at the top, and only when it is true.
        An app that quietly fails every AI request and never says why is one
        people conclude is broken — and this one keeps a great deal working
        without a server, so the honest thing is to name what still does.
      */}
      {engineState === 'down' || engineState === 'nokey' ? (
        <TouchableOpacity
          style={styles.offline}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel={
            engineState === 'down'
              ? 'The engine cannot be reached. Saved maps, the reading aids, the timer and read-aloud all still work. Opens Settings.'
              : 'The engine has no AI key set. Opens Settings.'
          }
        >
          <CloudOff size={16} color={COLORS.yellowDark} />
          <View style={{ flex: 1, marginLeft: SPACING.sm }}>
            <Text variant="caption" weight="bold" color={COLORS.yellowDark}>
              {engineState === 'down' ? 'Cannot reach the engine' : 'The engine has no AI key'}
            </Text>
            <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 2 }}>
              Your saved maps, the reading aids, the focus timer, the parking lot and read-aloud
              all still work. Anything that needs the AI will wait. Tap to check the address.
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {/*
        THE ONE OBVIOUS THING TO DO.

        This screen used to open on a scoreboard and put the camera behind a
        secondary button. That is backwards for both conditions this app is for.
        In ADHD the deficit is task initiation, not motivation: opening onto a
        row of counters asks the reader to choose among a dozen things before
        doing any of them. For a dyslexic reader the highest-value action is
        "make this page speak" — read-aloud is the best-evidenced thing SETU
        ships, because it bypasses decoding while listening comprehension is
        intact.

        Pointing a phone at a homework page and hearing it read back is also the
        single most-wanted action from a parent of a struggling reader, so it is
        first, at full width, with a target nobody can miss.
      */}
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.cameraHero}
        onPress={() => navigation.navigate('CameraOCR')}
        accessibilityRole="button"
        accessibilityLabel="Point your camera at a page to have it read aloud"
        accessibilityHint="Opens the camera. Take a photo of any printed page and SETU reads it to you."
      >
        <View style={styles.cameraHeroIcon}>
          <Camera size={28} color={COLORS.textInverse} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="titleSm" weight="bold" color={COLORS.textInverse}>
            Read this page to me
          </Text>
          <Text variant="bodySm" color={COLORS.textInverse} style={{ opacity: 0.9 }}>
            Point your camera at any page — a book, a form, a notice
          </Text>
        </View>
      </TouchableOpacity>

      {/* The one thing this app is for, asked plainly. */}
      <View style={styles.hero}>
        <Text variant="titleSm" weight="bold">
          What do you want to understand?
        </Text>
        <Text variant="bodySm" color={COLORS.textMuted} style={styles.heroBody}>
          Ask in your own words. SETU researches it and lays it out as a map you open one
          branch at a time — and reads any branch aloud.
        </Text>

        <Input
          placeholder="How does a heat pump actually work?"
          value={topic}
          onChangeText={setTopic}
          returnKeyType="search"
          onSubmitEditing={() => draw()}
          containerStyle={styles.heroInput}
          accessibilityLabel="What do you want to understand?"
          trailingIcon={
            <VoiceInputButton
              onTranscript={(text) => {
                setTopic(text);
                draw(text);
              }}
              size={36}
            />
          }
        />

        <View style={styles.heroActions}>
          <Button
            title="Draw a map"
            variant="primary"
            size="md"
            icon={<Network size={16} color={COLORS.textInverse} />}
            onPress={() => draw()}
            style={{ flex: 1 }}
            accessibilityLabel="Draw a map of this topic"
          />
        </View>
      </View>

      {recent.length > 0 ? (
        <Section
          title="Pick up where you left off"
          actionLabel="Library"
          onAction={() => navigation.navigate('LibraryTab')}
        >
          <View style={styles.recentStack}>
            {recent.map((map) => (
              <TouchableOpacity
                key={map.id || map._id}
                style={styles.recentCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('MapTab', { selectedMap: map })}
                accessibilityRole="button"
                accessibilityLabel={`Open the map for ${map.topic}`}
                accessibilityHint={map.summary ? truncateText(map.summary, 90) : undefined}
              >
                <View style={styles.recentIcon}>
                  <Network size={18} color={COLORS.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySm" weight="semibold" numberOfLines={1}>
                    {map.topic}
                  </Text>
                  <Text variant="caption" color={COLORS.textMuted} numberOfLines={1}>
                    {map.totalTopics || 12} branches ·{' '}
                    {map.createdAt ? formatRelativeDate(map.createdAt) : 'recently'}
                  </Text>
                </View>
                <ChevronRight size={18} color={COLORS.textSubtle} />
              </TouchableOpacity>
            ))}
          </View>
        </Section>
      ) : null}

      <Section
        title="What is in the way?"
        description="Named by the problem, not the feature"
        actionLabel="All tools"
        onAction={() => navigation.navigate('ToolsTab')}
      >
        <ListGroup>
          {COMMON_PROBLEMS.map((problem, index) => (
            <ListRow
              key={problem.mode}
              icon={<problem.icon size={18} color={COLORS.cyan} />}
              title={problem.label}
              description={problem.hint}
              divider={index < COMMON_PROBLEMS.length - 1}
              onPress={() => navigation.navigate('ModeWorkspace', { mode: problem.mode })}
            />
          ))}
        </ListGroup>
      </Section>

      <Section title="Right now">
        <ListGroup>
          <ListRow
            icon={<Timer size={18} color={COLORS.cyan} />}
            title={isActive ? `Focus session — ${formattedTime} left` : 'Focus for 25 minutes'}
            description={
              isActive
                ? 'Open Momentum to see how the session is going'
                : 'Keeps running while you use other apps'
            }
            onPress={() => (isActive ? navigation.navigate('Momentum') : startSession())}
          />
          <ListRow
            icon={<Heart size={18} color={COLORS.magenta} />}
            title="Say it to someone"
            description="A listener that does not judge, and never scores you"
            onPress={() => navigation.navigate('Listen')}
          />
          <ListRow
            icon={<Wind size={18} color={COLORS.cyan} />}
            title="Settle for a minute"
            description="A slow breathing guide, no talking required"
            divider={false}
            onPress={() => navigation.navigate('Breathe')}
          />
        </ListGroup>
      </Section>

      {/*
        The reading check is deliberately not in "Right now" and not a tab.
        It is the one thing here somebody does occasionally and on purpose — a
        few minutes, every few weeks — so a permanent tab would cost every
        other screen room on a phone to advertise it. But burying a screener
        three taps deep is how a screener never gets run, so it stays on Home:
        it is the only number in this app that is about reading rather than
        about app use.
      */}
      <Section title="Every few weeks">
        <ListGroup>
          <ListRow
            icon={<BookOpenCheck size={18} color={COLORS.cyan} />}
            title="Check how your reading is going"
            description="A few short passages. No score is shown to anyone else."
            divider={false}
            onPress={() => navigation.navigate('ReadingCheck')}
          />
        </ListGroup>
      </Section>

      <TouchableOpacity
        style={styles.tip}
        activeOpacity={0.85}
        onPress={openActions}
        accessibilityRole="button"
        accessibilityLabel={`Tip: ${tipOfTheDay()}. Opens quick actions.`}
      >
        <Lightbulb size={16} color={COLORS.yellowDark} />
        <View style={{ flex: 1, marginLeft: SPACING.sm }}>
          <Text variant="caption" weight="bold" color={COLORS.yellowDark}>
            Something you might not have found
          </Text>
          <Text variant="bodySm" style={{ marginTop: 2 }}>
            {tipOfTheDay()}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Sparkles size={13} color={COLORS.textSubtle} />
        <Text variant="caption" color={COLORS.textSubtle} style={{ marginLeft: 6 }}>
          Nothing here is tied to a name or an email.
        </Text>
      </View>
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    offline: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: t.yellowLight,
      borderRadius: RADIUS.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.yellow,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    cameraHero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      backgroundColor: t.cyan,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.md,
    },
    cameraHeroIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
    },
    hero: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      borderLeftWidth: 3,
      borderLeftColor: t.cyan,
      padding: SPACING.lg,
    },
    heroBody: {
      marginTop: SPACING.xs,
      marginBottom: SPACING.lg,
    },
    heroInput: {
      marginBottom: SPACING.md,
    },
    heroActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    recentStack: {
      gap: SPACING.sm,
    },
    recentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.md,
      minHeight: 64,
      gap: SPACING.md,
    },
    recentIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: t.yellowLight,
      borderRadius: RADIUS.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.yellow,
      padding: SPACING.md,
      marginTop: SPACING.xxl,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.xxl,
    },
  });
