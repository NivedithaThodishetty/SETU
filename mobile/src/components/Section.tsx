/**
 * SETU Mobile — a titled block of a screen.
 *
 * The old screens marked every section with a coloured kicker *and* a
 * subheading *and* a "View all" link, in three different accent colours within
 * one scroll. Each was defensible alone; together they meant nothing on the
 * page was quieter than anything else, so nothing stood out.
 *
 * One title, optional one-line explanation, optional single action. The rule
 * that keeps a screen calm is that a section header is not itself content.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text } from './Typography';

export interface SectionProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Vertical rhythm above the section. Defaults to the standard gap. */
  spacing?: 'none' | 'normal' | 'loose';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  spacing = 'normal',
  style,
  children,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const topGap =
    spacing === 'none' ? 0 : spacing === 'loose' ? SPACING.xxxl : SPACING.xxl;

  return (
    <View style={[{ marginTop: topGap }, style]}>
      {title || actionLabel ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? (
              <Text variant="body" weight="bold" color={COLORS.text}>
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 1 }}>
                {description}
              </Text>
            ) : null}
          </View>

          {actionLabel && onAction ? (
            <TouchableOpacity
              style={styles.action}
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text variant="caption" weight="semibold" color={COLORS.cyan}>
                {actionLabel}
              </Text>
              <ChevronRight size={14} color={COLORS.cyan} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {children}
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
      gap: SPACING.md,
    },
    headerText: {
      flex: 1,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingVertical: 2,
    },
  });
