/**
 * SETU Mobile — the progress ring.
 *
 * The whole reward system is summarised as one shape on purpose. A dashboard of
 * counters is a reading task, and asking someone to read a table to find out
 * whether they are doing well defeats the point. The ring answers "am I moving?"
 * at a glance, and the numbers are there for anyone who wants them.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Palette } from '../constants/themes';
import { useThemeColors } from '../context/ThemeContext';
import { Rank } from '../types';
import { Text } from './Typography';

interface MomentumRingProps {
  rank: Rank;
  points: number;
  size?: number;
  strokeWidth?: number;
}

export const MomentumRing: React.FC<MomentumRingProps> = ({
  rank,
  points,
  size = 132,
  strokeWidth = 10,
}) => {
  const COLORS: Palette = useThemeColors();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.max(0, Math.min(1, rank.fraction));

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        rank.next
          ? `${rank.name}, level ${rank.level}. ${points} points. ${rank.pointsToNext} points to ${rank.next.name}.`
          : `${rank.name}, the top level. ${points} points.`
      }
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.surfaceAlt}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.cyan}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          // Start the arc at twelve o'clock rather than three, which is where
          // people expect a progress dial to begin.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={styles.centre} pointerEvents="none">
        <Text variant="title" weight="bold">
          {points}
        </Text>
        <Text variant="caption" color={COLORS.textMuted}>
          points
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MomentumRing;
