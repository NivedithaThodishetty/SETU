/**
 * SETU Mobile — what a list says when it has nothing in it.
 *
 * Never a shrug. An empty state that only says "no items" hands the reader a
 * dead end, and a dead end is where somebody with executive-function difficulty
 * closes the app. Every one of these carries the single next action instead.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text } from './Typography';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text variant="body" weight="semibold" align="center">
        {title}
      </Text>
      {body ? (
        <Text
          variant="bodySm"
          color={COLORS.textMuted}
          align="center"
          style={styles.body}
        >
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="secondary" size="md" onPress={onAction} />
      ) : null}
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingVertical: SPACING.xxxl,
      paddingHorizontal: SPACING.lg,
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
    },
    iconWrap: {
      marginBottom: SPACING.md,
      opacity: 0.7,
    },
    body: {
      marginTop: SPACING.xs,
      marginBottom: SPACING.lg,
      maxWidth: 320,
    },
  });
