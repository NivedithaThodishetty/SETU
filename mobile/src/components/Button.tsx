/**
 * SETU Mobile — Accessible Button Component
 * -----------------------------------------
 * Provides high-contrast, accessible touch targets (min 48px height),
 * tactile haptic feedback, and Broadsheet styling.
 */

import React from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  StyleSheet,
  ActivityIndicator,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text } from './Typography';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'option';

export interface ButtonProps extends TouchableOpacityProps {
  title?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  selected?: boolean;
  fullWidth?: boolean;
  subtitle?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  selected = false,
  fullWidth = false,
  subtitle,
  style,
  disabled,
  onPress,
  ...rest
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const handlePress = (e: any) => {
    if (disabled || loading) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}
    onPress?.(e);
  };

  const getContainerStyle = (): ViewStyle => {
    const base: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
      minHeight: size === 'sm' ? 40 : size === 'lg' ? 56 : 48,
      paddingHorizontal: size === 'sm' ? SPACING.md : SPACING.lg,
      paddingVertical: size === 'sm' ? SPACING.xs : SPACING.sm,
      alignSelf: fullWidth ? 'stretch' : 'flex-start',
      opacity: disabled ? 0.45 : 1,
    };

    switch (variant) {
      case 'primary':
        return {
          ...base,
          backgroundColor: COLORS.cyan,
        };
      case 'secondary':
        return {
          ...base,
          backgroundColor: COLORS.bg,
          borderWidth: 1,
          borderColor: COLORS.divider,
        };
      case 'destructive':
        return {
          ...base,
          backgroundColor: COLORS.magenta,
        };
      case 'ghost':
        return {
          ...base,
          backgroundColor: 'transparent',
        };
      case 'option':
        return {
          ...base,
          backgroundColor: selected ? COLORS.cyanLight : 'transparent',
          borderWidth: 1.5,
          borderColor: selected ? COLORS.cyan : COLORS.divider,
          justifyContent: subtitle ? 'flex-start' : 'center',
        };
      default:
        return base;
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'primary':
      case 'destructive':
        return COLORS.textInverse;
      case 'option':
        return selected ? COLORS.cyanDark : COLORS.text;
      case 'secondary':
      case 'ghost':
      default:
        return COLORS.text;
    }
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected }}
      activeOpacity={0.78}
      style={[getContainerStyle(), style as ViewStyle]}
      disabled={disabled || loading}
      onPress={handlePress}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'destructive' ? COLORS.textInverse : COLORS.cyan}
          size="small"
        />
      ) : (
        <View style={styles.innerRow}>
          {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
          <View style={subtitle ? styles.textColumn : styles.centerWrapper}>
            {title ? (
              <Text
                variant={size === 'sm' ? 'bodySm' : 'body'}
                weight={variant === 'primary' || selected ? 'bold' : 'semibold'}
                color={getTextColor()}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="caption" color={selected ? COLORS.cyanDark : COLORS.textMuted}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {icon && iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  iconLeft: {
    marginRight: SPACING.sm,
  },
  iconRight: {
    marginLeft: SPACING.sm,
  },
});
