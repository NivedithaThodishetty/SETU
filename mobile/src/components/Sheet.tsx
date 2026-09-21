/**
 * SETU Mobile — bottom sheet.
 *
 * Sheets, not screens, for anything that is a decision about what is already on
 * screen: which branch, which voice, which appearance. Pushing a route for
 * those loses the context the decision is about, and the audience this is built
 * for pays a real cost for having to hold that context in their head instead.
 *
 * Three details worth keeping:
 *
 *  - The panel animates in but its content mounts immediately, so a slow child
 *    (a streamed explanation) starts working while the sheet is still moving.
 *  - Motion collapses to nothing under the reduced-motion setting rather than
 *    being merely faster.
 *  - Closing is always available three ways — the handle, the backdrop, and the
 *    system back gesture — because a sheet you cannot dismiss is the single
 *    most panicking thing a small screen can do.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { DURATION, EASE_OUT, duration } from '../constants/motion';
import { Text } from './Typography';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Fraction of the screen the panel may grow to. */
  maxHeightRatio?: number;
  /** Own the scrolling yourself — for a list that needs its own scroller. */
  scroll?: boolean;
  /** Pinned to the bottom of the panel, outside the scrolling area. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  maxHeightRatio = 0.82,
  scroll = true,
  footer,
  children,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { reduceMotion } = useAccessibility();

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: duration(DURATION.panel, reduceMotion),
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  }, [visible, progress, reduceMotion]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [height * 0.35, 0],
  });

  const body = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.plainBody}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              maxHeight: height * maxHeightRatio,
              paddingBottom: Math.max(insets.bottom, SPACING.lg),
              transform: [{ translateY }],
              opacity: progress,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.handleZone}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close this panel"
          >
            <View style={styles.handle} />
          </TouchableOpacity>

          {title ? (
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text variant="titleSm" weight="bold" numberOfLines={2}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="caption" color={COLORS.textMuted} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          ) : null}

          {body}

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.isDark ? 'rgba(0, 0, 0, 0.62)' : 'rgba(32, 30, 29, 0.42)',
    },
    panel: {
      backgroundColor: t.bg,
      borderTopLeftRadius: RADIUS.lg * 2,
      borderTopRightRadius: RADIUS.lg * 2,
      borderTopWidth: 1,
      borderColor: t.divider,
      ...SHADOWS.lg,
    },
    handleZone: {
      alignItems: 'center',
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.divider,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.md,
      gap: SPACING.md,
    },
    headerText: {
      flex: 1,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.surface,
    },
    scroll: {
      flexShrink: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    plainBody: {
      paddingHorizontal: SPACING.lg,
      flexShrink: 1,
    },
    footer: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: t.dividerSubtle,
    },
  });
