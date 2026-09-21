/**
 * SETU Mobile — reward notifications.
 *
 * Fires the moment an action is recorded, because the point of the reward is to
 * mark *that* moment; a summary shown later is a report, and reports do not
 * reinforce anything.
 *
 * Deliberately quiet by default. A plain points award is a small bar that fades
 * on its own; only a rank change or a named milestone gets the larger treatment.
 * Constant celebration stops registering after a day, and for an audience that
 * includes autistic users, a loud animation on every tap is an irritant rather
 * than a motivator — so it also honours the reduced-motion setting and the
 * rewards switch.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Award, Flame, Sparkles, TrendingUp } from 'lucide-react-native';

import { Palette } from '../constants/themes';
import { RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { onAward } from '../services/progress';
import { AwardEvent } from '../types';
import { Text } from './Typography';

const VISIBLE_MS = 2600;
const MILESTONE_VISIBLE_MS = 4200;

export const RewardToast: React.FC = () => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useAccessibility();

  const [event, setEvent] = useState<AwardEvent | null>(null);
  const queue = useRef<AwardEvent[]>([]);
  const slide = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const showNext = () => {
      const next = queue.current.shift();
      if (!next) return;
      setEvent(next);
    };

    const unsubscribe = onAward((incoming) => {
      queue.current.push(incoming);
      // Only start a new toast when nothing is on screen; otherwise the queue
      // drains as each one finishes, so a burst of awards does not flicker.
      if (!event) showNext();
    });

    return unsubscribe;
    // `event` is intentionally in the dependency list: when a toast clears we
    // re-subscribe with a closure that knows the screen is free again.
  }, [event]);

  useEffect(() => {
    if (!event) return undefined;

    const duration = reduceMotion ? 0 : 220;
    Animated.timing(slide, { toValue: 1, duration, useNativeDriver: true }).start();

    const lifetime = event.newMilestones.length || event.rankedUp ? MILESTONE_VISIBLE_MS : VISIBLE_MS;

    hideTimer.current = setTimeout(() => {
      Animated.timing(slide, { toValue: 0, duration, useNativeDriver: true }).start(() => {
        setEvent(() => {
          const next = queue.current.shift() || null;
          return next;
        });
      });
    }, lifetime);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [event, reduceMotion, slide]);

  if (!event) return null;

  const milestone = event.newMilestones[0];
  const isBig = Boolean(milestone) || event.rankedUp;

  const headline = milestone
    ? milestone.name
    : event.rankedUp
      ? `${event.rank.name}`
      : event.label;

  const detail = milestone
    ? 'Milestone reached'
    : event.rankedUp
      ? `You have moved up a level · ${event.total} points`
      : `+${event.points} · ${event.total} points`;

  const Icon = milestone ? Award : event.rankedUp ? TrendingUp : event.streakDays > 1 ? Flame : Sparkles;
  const accent = isBig ? COLORS.magenta : COLORS.cyan;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          top: insets.top + SPACING.sm,
          opacity: slide,
          transform: [
            {
              translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }),
            },
          ],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        accessibilityRole="alert"
        accessibilityLabel={`${headline}. ${detail}`}
        onPress={() => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          setEvent(queue.current.shift() || null);
        }}
        style={[styles.toast, isBig ? { borderColor: accent, borderWidth: 1.5 } : null]}
      >
        <View style={[styles.iconBubble, { backgroundColor: isBig ? COLORS.magentaLight : COLORS.cyanLight }]}>
          <Icon size={18} color={accent} />
        </View>

        <View style={styles.copy}>
          <Text variant="bodySm" weight="bold" numberOfLines={1}>
            {headline}
          </Text>
          <Text variant="caption" color={COLORS.textMuted} numberOfLines={1}>
            {detail}
          </Text>
        </View>

        {event.streakDays > 1 ? (
          <View style={styles.streak}>
            <Flame size={13} color={COLORS.yellowDark} />
            <Text variant="caption" weight="bold" color={COLORS.yellowDark} style={{ marginLeft: 3 }}>
              {event.streakDays}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      left: SPACING.md,
      right: SPACING.md,
      zIndex: 200,
    },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.divider,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      ...SHADOWS.lg,
    },
    iconBubble: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
    streak: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 3,
      borderRadius: RADIUS.pill,
      backgroundColor: t.yellowLight,
      marginLeft: SPACING.sm,
    },
  });

export default RewardToast;
