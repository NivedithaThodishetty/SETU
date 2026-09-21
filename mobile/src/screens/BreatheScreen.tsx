/**
 * SETU Mobile — Breathe.
 *
 * The extension watches for the interaction signature of overwhelm — cursor
 * reversals, scroll thrash, rage-clicks — and offers box breathing when it
 * fires. There is no equivalent signal on a phone worth trusting: a thumb
 * moving erratically is somebody on a bus. So on mobile the same tool is
 * offered rather than triggered, from the menu, from quick actions, and from
 * Home.
 *
 * Three patterns, because they do different jobs. Box breathing is the neutral
 * one. The 4-7-8 pattern has a long exhale, which is the half that actually
 * settles the nervous system, but it is harder and unpleasant if you are
 * already short of breath. Grounding does not involve breathing at all, which
 * matters — for some people, being told to notice their breathing is the thing
 * that starts the spiral.
 *
 * Nothing here is scored, nothing is recorded, and nothing calls the engine.
 * It works with the phone in flight mode.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, Vibration } from 'react-native';
import { Play, Square, Wind } from 'lucide-react-native';

import { SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { Text } from '../components/Typography';
import { Button } from '../components/Button';
import { tts } from '../services/tts';

type PatternKey = 'box' | 'long' | 'ground';

interface Phase {
  label: string;
  seconds: number;
  /** How large the circle should be during this phase, 0–1. */
  scale: number;
}

interface Pattern {
  key: PatternKey;
  name: string;
  blurb: string;
  phases: Phase[];
}

const PATTERNS: Pattern[] = [
  {
    key: 'box',
    name: 'Square',
    blurb:
      'Four counts in, four held, four out, four held. The even one — nothing about it is demanding.',
    phases: [
      { label: 'Breathe in', seconds: 4, scale: 1 },
      { label: 'Hold', seconds: 4, scale: 1 },
      { label: 'Breathe out', seconds: 4, scale: 0.55 },
      { label: 'Hold', seconds: 4, scale: 0.55 },
    ],
  },
  {
    key: 'long',
    name: 'Long out',
    blurb:
      'Four in, seven held, eight out. The long exhale is the part that settles things — but stop if it feels like effort.',
    phases: [
      { label: 'Breathe in', seconds: 4, scale: 1 },
      { label: 'Hold', seconds: 7, scale: 1 },
      { label: 'Breathe out, slowly', seconds: 8, scale: 0.5 },
    ],
  },
  {
    key: 'ground',
    name: 'Grounding',
    blurb:
      'No breathing at all. Five things you can see, four you can touch, and so on down to one. For when attention to breathing makes it worse.',
    phases: [
      { label: 'Five things you can see', seconds: 15, scale: 0.9 },
      { label: 'Four things you can touch', seconds: 12, scale: 0.8 },
      { label: 'Three things you can hear', seconds: 10, scale: 0.7 },
      { label: 'Two things you can smell', seconds: 8, scale: 0.6 },
      { label: 'One thing you can taste', seconds: 6, scale: 0.55 },
    ],
  },
];

export interface BreatheScreenProps {
  navigation: any;
}

export const BreatheScreen: React.FC<BreatheScreenProps> = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { reduceMotion, speakOnTap } = useAccessibility();

  const [patternKey, setPatternKey] = useState<PatternKey>('box');
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [cycles, setCycles] = useState(0);

  const pattern = useMemo(
    () => PATTERNS.find((entry) => entry.key === patternKey) || PATTERNS[0],
    [patternKey]
  );
  const phase = pattern.phases[phaseIndex] || pattern.phases[0];

  const scale = useRef(new Animated.Value(0.55)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    setRunning(false);
    setPhaseIndex(0);
    setRemaining(0);
    setCycles(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    scale.stopAnimation();
    Animated.timing(scale, {
      toValue: 0.55,
      duration: reduceMotion ? 0 : 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    tts.stop();
  }, [scale, reduceMotion]);

  useEffect(() => stop, [stop]);

  /* Changing pattern mid-session would leave the circle animating to a phase
     that no longer exists, so it simply resets. */
  useEffect(() => {
    stop();
  }, [patternKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Drive one phase: animate the circle over its whole duration, tick the
   * count down for the people who follow the number rather than the shape, and
   * hand over to the next phase when it runs out.
   *
   * The animation is the timekeeper's twin rather than its master — a dropped
   * frame must not make the breath longer, so the countdown runs on its own
   * interval and the phase change is driven by that.
   */
  useEffect(() => {
    if (!running) return undefined;

    const current = pattern.phases[phaseIndex];
    setRemaining(current.seconds);

    Animated.timing(scale, {
      toValue: current.scale,
      duration: reduceMotion ? 0 : current.seconds * 1000,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();

    // A short buzz at each change, so the pattern can be followed with the
    // phone face down or eyes closed.
    try {
      Vibration.vibrate(18);
    } catch (_) {
      /* some devices have no vibrator; the visual is the primary channel */
    }

    if (speakOnTap) {
      tts.speak(current.label, { quiet: true });
    }

    let left = current.seconds;
    timerRef.current = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setRemaining(left);
        return;
      }

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;

      const next = phaseIndex + 1;
      if (next >= pattern.phases.length) {
        setCycles((prev) => prev + 1);
        setPhaseIndex(0);
      } else {
        setPhaseIndex(next);
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running, phaseIndex, pattern, scale, reduceMotion, speakOnTap]);

  const start = () => {
    setPhaseIndex(0);
    setCycles(0);
    setRunning(true);
  };

  return (
    <Screen
      title="Breathe"
      subtitle="A minute, and nothing is asked of you"
      leading="back"
      onBack={() => navigation.goBack()}
      scroll
    >
      <Segmented
        options={PATTERNS.map((entry) => ({ key: entry.key, label: entry.name }))}
        value={patternKey}
        onChange={setPatternKey}
      />

      <Text variant="bodySm" color={COLORS.textMuted} style={styles.blurb}>
        {pattern.blurb}
      </Text>

      <View
        style={styles.stage}
        accessible
        accessibilityRole="timer"
        accessibilityLabel={
          running ? `${phase.label}. ${remaining} seconds.` : 'Not running. Press begin to start.'
        }
        accessibilityLiveRegion="polite"
      >
        <Animated.View
          style={[
            styles.circle,
            {
              transform: [{ scale }],
              // Reduced motion keeps the circle still; the words and the count
              // carry the pattern instead. Motion is the accommodation for some
              // readers and the problem for others.
              opacity: reduceMotion ? 0.8 : 1,
            },
          ]}
        />

        <View style={styles.stageText} pointerEvents="none">
          <Text variant="title" weight="bold" align="center">
            {running ? phase.label : 'Ready when you are'}
          </Text>
          {running ? (
            <Text variant="h1" weight="bold" color={COLORS.cyan} align="center">
              {remaining}
            </Text>
          ) : (
            <Text variant="bodySm" color={COLORS.textMuted} align="center" style={{ marginTop: 6 }}>
              Follow the circle, or just the words
            </Text>
          )}
        </View>
      </View>

      {running && cycles > 0 ? (
        <Text variant="caption" color={COLORS.textMuted} align="center" style={styles.cycles}>
          {cycles === 1 ? 'One round done' : `${cycles} rounds done`}
        </Text>
      ) : null}

      <View style={styles.controls}>
        {running ? (
          <Button
            title="That is enough"
            variant="secondary"
            size="lg"
            fullWidth
            icon={<Square size={16} color={COLORS.text} />}
            onPress={stop}
          />
        ) : (
          <Button
            title="Begin"
            variant="primary"
            size="lg"
            fullWidth
            icon={<Play size={16} color={COLORS.textInverse} />}
            onPress={start}
          />
        )}
      </View>

      <View style={styles.note}>
        <Wind size={14} color={COLORS.textSubtle} />
        <Text variant="caption" color={COLORS.textSubtle} style={styles.noteText}>
          Stop whenever you like — there is no target here, and nothing is counted or saved. If
          breathing exercises make things worse for you, Grounding above asks nothing of your
          breath at all.
        </Text>
      </View>
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    blurb: {
      marginTop: SPACING.lg,
      marginBottom: SPACING.xl,
    },
    stage: {
      height: 300,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circle: {
      position: 'absolute',
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: t.cyanLight,
      borderWidth: 2,
      borderColor: t.cyanBorder,
    },
    stageText: {
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
    },
    cycles: {
      marginTop: SPACING.md,
    },
    controls: {
      marginTop: SPACING.xxl,
    },
    note: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: SPACING.xxl,
      paddingHorizontal: SPACING.xs,
    },
    noteText: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
  });
