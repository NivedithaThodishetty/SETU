/**
 * SETU Mobile — Broadsheet Card & Tag Components
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { COLORS, RADIUS, SPACING, SHADOWS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text } from './Typography';

export interface CardProps {
  children?: React.ReactNode;
  plateColor?: string;
  elevated?: boolean;
  onPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: any;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  plateColor,
  elevated = true,
  onPress,
  selected = false,
  style,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const containerStyle: ViewStyle = {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? COLORS.cyan : COLORS.dividerSubtle,
    borderLeftWidth: plateColor ? 4 : selected ? 2 : 1,
    borderLeftColor: plateColor || (selected ? COLORS.cyan : COLORS.dividerSubtle),
    ...(elevated ? SHADOWS.sm : {}),
  };

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[containerStyle, style]}
        accessible={true}
        accessibilityRole={accessibilityRole || 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[containerStyle, style]}
      accessible={Boolean(accessibilityLabel || accessibilityRole)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {children}
    </View>
  );
};

export interface TagProps {
  label: string;
  variant?: 'cyan' | 'magenta' | 'yellow' | 'ink' | 'neutral';
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
}

export const Tag: React.FC<TagProps> = ({
  label,
  variant = 'neutral',
  icon,
  size = 'sm',
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const getColors = () => {
    switch (variant) {
      case 'cyan':
        return { bg: COLORS.cyanLight, text: COLORS.cyanDark, border: COLORS.cyanBorder };
      case 'magenta':
        return { bg: COLORS.magentaLight, text: COLORS.magentaDark, border: COLORS.magenta };
      case 'yellow':
        return { bg: COLORS.yellowLight, text: COLORS.yellowDark, border: COLORS.yellow };
      case 'ink':
        return { bg: COLORS.surfaceAlt, text: COLORS.text, border: COLORS.divider };
      case 'neutral':
      default:
        return { bg: COLORS.surface, text: COLORS.textMuted, border: COLORS.dividerSubtle };
    }
  };

  const colors = getColors();

  return (
    <View
      style={[
        styles.tagContainer,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          paddingHorizontal: size === 'sm' ? SPACING.sm : SPACING.md,
          paddingVertical: size === 'sm' ? 2 : 4,
        },
      ]}
    >
      {icon && <View style={styles.tagIcon}>{icon}</View>}
      <Text
        variant="caption"
        weight="semibold"
        color={colors.text}
        style={{ fontSize: size === 'sm' ? 11 : 12 }}
      >
        {label}
      </Text>
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
  tagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  tagIcon: {
    marginRight: 4,
  },
});
