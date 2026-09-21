/**
 * SETU Mobile — Accessible Input and Textarea Components
 */

import React, { useState } from 'react';
import {
  TextInput,
  TextInputProps,
  View,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text, fontFamilyFor } from './Typography';
import { useAccessibility } from '../context/AccessibilityContext';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  hint,
  error,
  leadingIcon,
  trailingIcon,
  containerStyle,
  style,
  multiline,
  numberOfLines = 1,
  ...rest
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const [isFocused, setIsFocused] = useState(false);
  const { font } = useAccessibility();


  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <Text variant="bodySm" weight="semibold" color={COLORS.text} style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputContainer,
          multiline ? { minHeight: numberOfLines * 24 + 24, alignItems: 'flex-start' } : {},
          isFocused ? styles.focused : {},
          error ? styles.errorBorder : {},
        ]}
      >
        {leadingIcon && <View style={styles.leading}>{leadingIcon}</View>}
        <TextInput
          placeholderTextColor={COLORS.textSubtle}
          style={[
            styles.input,
            { fontFamily: fontFamilyFor(font) },
            multiline ? styles.multiline : {},
            style,
          ]}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...rest}
        />
        {trailingIcon && <View style={styles.trailing}>{trailingIcon}</View>}
      </View>

      {hint && !error ? (
        <Text variant="caption" color={COLORS.textMuted} style={styles.helper}>
          {hint}
        </Text>
      ) : null}

      {error ? (
        <Text variant="caption" color={COLORS.magenta} weight="medium" style={styles.helper}>
          {error}
        </Text>
      ) : null}
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
  wrapper: {
    marginBottom: SPACING.md,
  },
  label: {
    marginBottom: SPACING.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.bg,
    borderWidth: 1.5,
    borderColor: t.divider,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 48,
  },
  focused: {
    borderColor: t.cyan,
  },
  errorBorder: {
    borderColor: t.magenta,
  },
  leading: {
    marginRight: SPACING.sm,
  },
  trailing: {
    marginLeft: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: t.text,
    paddingVertical: SPACING.sm,
  },
  multiline: {
    textAlignVertical: 'top',
    paddingTop: SPACING.sm,
  },
  helper: {
    marginTop: 4,
  },
});
