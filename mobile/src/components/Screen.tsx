/**
 * SETU Mobile — the screen scaffold.
 *
 * Every screen is a header, a body, and nothing else. Having one component own
 * that means the safe-area maths, the scroll padding above the tab bar, the
 * pull-to-refresh tint and the keyboard behaviour are decided once instead of
 * eight times — the previous screens disagreed about all four, which is why
 * the app felt like it had been assembled from parts.
 *
 * `scroll={false}` is for screens that manage their own scrolling area — the
 * mind map canvas, a chat transcript — where wrapping in a ScrollView would
 * nest two scrollers and make neither work.
 */

import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
  StyleProp,
} from 'react-native';

import { SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { AppBar, AppBarAction } from './AppBar';

export interface ScreenProps {
  title: string;
  subtitle?: string;
  leading?: 'menu' | 'back' | 'none';
  actions?: AppBarAction[];
  /** Rendered inside the header, below the title row. */
  headerBelow?: React.ReactNode;
  onBack?: () => void;

  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra bottom padding, for screens that float a bar over their content. */
  bottomInset?: number;
  contentStyle?: StyleProp<ViewStyle>;
  /** Lifts content above the keyboard. Off by default — it costs a layout pass. */
  avoidKeyboard?: boolean;
  children: React.ReactNode;
}

export const Screen: React.FC<ScreenProps> = ({
  title,
  subtitle,
  leading = 'menu',
  actions,
  headerBelow,
  onBack,
  scroll = true,
  refreshing,
  onRefresh,
  bottomInset = 0,
  contentStyle,
  avoidKeyboard = false,
  children,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const header = (
    <AppBar
      title={title}
      subtitle={subtitle}
      leading={leading}
      actions={actions}
      onBack={onBack}
    >
      {headerBelow}
    </AppBar>
  );

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: SPACING.huge + bottomInset },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            colors={[COLORS.cyan]}
            tintColor={COLORS.cyan}
            progressBackgroundColor={COLORS.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.plainContent, contentStyle]}>{children}</View>
  );

  const content = (
    <View style={styles.root}>
      {header}
      {body}
    </View>
  );

  if (!avoidKeyboard) return content;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {content}
    </KeyboardAvoidingView>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.bg,
    },
    flex: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.lg,
    },
    plainContent: {
      paddingHorizontal: SPACING.lg,
    },
  });
