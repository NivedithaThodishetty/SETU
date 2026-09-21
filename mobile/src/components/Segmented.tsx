/**
 * SETU Mobile — segmented control.
 *
 * Three screens each hand-rolled this, and all three drew the selected segment
 * differently. It is also the place a large-text setting used to break the
 * layout, because a fixed-height row of fixed-width buttons has nowhere to put
 * the extra pixels — so this one grows instead, and scrolls horizontally once
 * there are more segments than fit.
 */

import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { Text } from './Typography';

export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
  icon?: React.ReactNode;
  /** Announced instead of the label when the label alone is not enough. */
  accessibilityLabel?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (key: T) => void;
  /** `scroll` lets the row run off the edge; `fill` divides the width evenly. */
  layout?: 'fill' | 'scroll';
  accent?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  layout = 'fill',
  accent,
}: SegmentedProps<T>) {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { sizeScale } = useAccessibility();
  const tint = accent || COLORS.cyan;

  const minHeight = Math.round(40 * Math.max(1, sizeScale));

  const segments = options.map((option) => {
    const selected = option.key === value;
    return (
      <TouchableOpacity
        key={option.key}
        activeOpacity={0.8}
        onPress={() => onChange(option.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={option.accessibilityLabel || option.label}
        style={[
          styles.segment,
          { minHeight },
          layout === 'fill' ? styles.segmentFill : styles.segmentAuto,
          selected ? { backgroundColor: COLORS.bg, borderColor: COLORS.divider } : null,
        ]}
      >
        {option.icon ? <View style={styles.segmentIcon}>{option.icon}</View> : null}
        <Text
          variant="bodySm"
          weight={selected ? 'semibold' : 'normal'}
          color={selected ? tint : COLORS.textMuted}
          numberOfLines={1}
        >
          {option.label}
        </Text>
      </TouchableOpacity>
    );
  });

  if (layout === 'scroll') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollTrack}
      >
        {segments}
      </ScrollView>
    );
  }

  return <View style={styles.track}>{segments}</View>;
}

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      padding: 3,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      gap: 3,
    },
    scrollTrack: {
      flexDirection: 'row',
      gap: SPACING.xs,
      paddingRight: SPACING.lg,
    },
    segment: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    segmentFill: {
      flex: 1,
    },
    segmentAuto: {
      backgroundColor: t.surface,
      borderColor: t.dividerSubtle,
    },
    segmentIcon: {
      marginRight: 6,
    },
  });
