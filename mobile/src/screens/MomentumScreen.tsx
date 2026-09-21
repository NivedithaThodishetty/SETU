/**
 * SETU Mobile — Momentum.
 *
 * The one place the reward system is laid out in full. Everywhere else it is a
 * toast and a ring, because progress should be felt in passing rather than
 * checked; this screen exists for the moment someone actually wants to look.
 *
 * The framing is deliberately non-punitive throughout. There is no "you missed
 * a day", no comparison to anyone else, and no target you can fall short of —
 * only what you have already done. That constraint comes from the audience:
 * adults who have spent years being measured against a norm they were never
 * given the accommodations to meet.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Alert } from 'react-native';
import { Award, Flame, RotateCcw } from 'lucide-react-native';

import { Palette } from '../constants/themes';
import { RADIUS, SPACING } from '../constants/theme';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import {
  getActivityBreakdown,
  getEarnedMilestones,
  getProgress,
  getRank,
  initProgress,
  resetProgress,
  subscribeProgress,
} from '../services/progress';
import { ProgressState } from '../types';
import { Text, Kicker } from '../components/Typography';
import { Screen } from '../components/Screen';
import { MomentumRing } from '../components/MomentumRing';

export const MomentumScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { rewards, toggleRewards } = useAccessibility();

  const [progress, setProgress] = useState<ProgressState>(getProgress);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => subscribeProgress(setProgress), []);

  const refresh = async () => {
    setRefreshing(true);
    await initProgress().catch(() => {});
    setProgress(getProgress());
    setRefreshing(false);
  };

  const rank = getRank(progress.points);
  const breakdown = getActivityBreakdown();
  const milestones = getEarnedMilestones();
  const earnedCount = milestones.filter((m) => m.earned).length;

  const confirmReset = () => {
    Alert.alert(
      'Start the count again?',
      'Points, streak and milestones go back to zero on this phone. Your maps, notes and settings are untouched.',
      [
        { text: 'Keep my progress', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetProgress();
            setProgress(getProgress());
          },
        },
      ]
    );
  };

  return (
    <Screen
      title="Momentum"
      subtitle="What you have been doing"
      leading="back"
      onBack={() => navigation?.goBack?.()}
      refreshing={refreshing}
      onRefresh={refresh}
      contentStyle={styles.body}
    >
        <View>
          <Text variant="bodySm" color={COLORS.textMuted}>
            Not a target and not a score to beat. Just a record that the effort happened, because
            the effort is usually the part that goes unnoticed.
          </Text>
        </View>

        {/* The ring */}
        <View style={styles.ringCard}>
          <MomentumRing rank={rank} points={progress.points} />

          <View style={styles.rankBlock}>
            <Kicker color={COLORS.cyan}>Level {rank.level}</Kicker>
            <Text variant="titleSm" weight="bold">
              {rank.name}
            </Text>
            <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 2 }}>
              {rank.next
                ? `${rank.pointsToNext} more to ${rank.next.name}`
                : 'You have reached the top of the ladder'}
            </Text>
          </View>
        </View>

        {/* Streak */}
        <View style={styles.streakRow}>
          <View style={styles.streakCard}>
            <Flame size={18} color={COLORS.yellowDark} />
            <Text variant="title" weight="bold" style={{ marginTop: 4 }}>
              {progress.streakDays}
            </Text>
            <Text variant="caption" color={COLORS.textMuted}>
              {progress.streakDays === 1 ? 'day running' : 'days running'}
            </Text>
          </View>

          <View style={styles.streakCard}>
            <Award size={18} color={COLORS.magenta} />
            <Text variant="title" weight="bold" style={{ marginTop: 4 }}>
              {earnedCount}
            </Text>
            <Text variant="caption" color={COLORS.textMuted}>
              of {milestones.length} milestones
            </Text>
          </View>

          <View style={styles.streakCard}>
            <Text variant="title" weight="bold">
              {progress.longestStreakDays}
            </Text>
            <Text variant="caption" color={COLORS.textMuted} align="center">
              longest run so far
            </Text>
          </View>
        </View>

        {/* Activity */}
        <View>
          <Kicker style={{ marginBottom: SPACING.sm }}>Where the points came from</Kicker>

          {breakdown.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text variant="bodySm" color={COLORS.textMuted}>
                Nothing counted yet. Run any mode, research a map, or sit through one focus session
                and this fills in.
              </Text>
            </View>
          ) : (
            breakdown.map((row) => {
              const share = progress.points > 0 ? row.earned / progress.points : 0;
              return (
                <View key={row.kind} style={styles.activityRow}>
                  <View style={styles.activityHeader}>
                    <Text variant="bodySm" weight="semibold" style={{ flex: 1 }}>
                      {row.label}
                    </Text>
                    <Text variant="caption" color={COLORS.textMuted}>
                      ×{row.count} · {row.earned} pts
                    </Text>
                  </View>
                  <View style={styles.activityTrack}>
                    <View style={[styles.activityFill, { width: `${Math.round(share * 100)}%` }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Milestones */}
        <View>
          <Kicker style={{ marginBottom: SPACING.sm }}>Milestones</Kicker>
          <View style={styles.milestoneGrid}>
            {milestones.map((milestone) => (
              <View
                key={milestone.id}
                style={[styles.milestone, milestone.earned ? styles.milestoneEarned : null]}
                accessible
                accessibilityLabel={`${milestone.name}. ${
                  milestone.earned ? 'Earned.' : `Not yet. ${milestone.hint}.`
                }`}
              >
                <Award
                  size={16}
                  color={milestone.earned ? COLORS.magenta : COLORS.textSubtle}
                />
                <Text
                  variant="caption"
                  weight="bold"
                  color={milestone.earned ? COLORS.text : COLORS.textSubtle}
                  style={{ marginTop: 4 }}
                >
                  {milestone.name}
                </Text>
                <Text variant="caption" color={COLORS.textSubtle} style={{ marginTop: 2 }}>
                  {milestone.hint}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: rewards }}
            accessibilityLabel="Show points, streaks and milestones"
            accessibilityHint="Turning this off hides the notifications. Your progress keeps counting either way."
            onPress={toggleRewards}
            style={styles.controlRow}
          >
            <View style={{ flex: 1 }}>
              <Text variant="bodySm" weight="semibold">
                Show reward notifications
              </Text>
              <Text variant="caption" color={COLORS.textMuted}>
                Off is a perfectly good setting. The count carries on regardless.
              </Text>
            </View>
            <View style={[styles.switch, rewards ? styles.switchOn : null]}>
              <View style={[styles.knob, rewards ? styles.knobOn : null]} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Reset all progress"
            onPress={confirmReset}
            style={styles.resetButton}
          >
            <RotateCcw size={15} color={COLORS.magenta} />
            <Text variant="bodySm" weight="semibold" color={COLORS.magenta} style={{ marginLeft: 6 }}>
              Start the count again
            </Text>
          </TouchableOpacity>
        </View>
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    body: {
      paddingBottom: SPACING.huge,
      gap: SPACING.xl,
    },
    ringCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      padding: SPACING.lg,
      borderRadius: RADIUS.lg,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.divider,
    },
    rankBlock: {
      flex: 1,
    },
    streakRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    streakCard: {
      flex: 1,
      alignItems: 'center',
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.divider,
    },
    emptyCard: {
      padding: SPACING.lg,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.divider,
    },
    activityRow: {
      marginBottom: SPACING.md,
    },
    activityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 5,
    },
    activityTrack: {
      height: 7,
      borderRadius: 4,
      backgroundColor: t.surfaceAlt,
      overflow: 'hidden',
    },
    activityFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: t.cyan,
    },
    milestoneGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    milestone: {
      width: '48%',
      flexGrow: 1,
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      opacity: 0.7,
    },
    milestoneEarned: {
      opacity: 1,
      borderColor: t.magenta,
      backgroundColor: t.magentaLight,
    },
    controls: {
      gap: SPACING.sm,
    },
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      minHeight: 56,
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.divider,
    },
    switch: {
      width: 46,
      height: 28,
      borderRadius: 14,
      backgroundColor: t.surfaceAlt,
      borderWidth: 1,
      borderColor: t.divider,
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    switchOn: {
      backgroundColor: t.cyan,
      borderColor: t.cyan,
    },
    knob: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: t.bg,
    },
    knobOn: {
      alignSelf: 'flex-end',
    },
    resetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: t.magenta,
    },
  });

export default MomentumScreen;
