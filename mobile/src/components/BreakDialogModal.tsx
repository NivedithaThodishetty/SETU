/**
 * SETU Mobile — Calm Break Dialog Modal
 * --------------------------------------
 * Triggered at the end of a 25-minute focus session.
 * Warm, encouraging, and unhurried rather than a stressful alert.
 */

import React from 'react';
import { Modal, View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { Coffee } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, SHADOWS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text, Heading, Kicker } from './Typography';
import { Button } from './Button';
import { useFocus } from '../context/FocusContext';

export const BreakDialogModal: React.FC = () => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isBreakDialogOpen, dismissBreakDialog } = useFocus();

  return (
    <Modal
      visible={isBreakDialogOpen}
      transparent
      animationType="fade"
      onRequestClose={() => dismissBreakDialog(false)}
    >
      <TouchableWithoutFeedback onPress={() => dismissBreakDialog(false)}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <Coffee size={24} color={COLORS.cyan} />
              </View>

              <Kicker color={COLORS.cyan} style={styles.kicker}>
                Interval Complete
              </Kicker>

              <Heading variant="title" style={styles.title}>
                That’s twenty-five minutes.
              </Heading>

              <Text variant="body" color={COLORS.textMuted} style={styles.body}>
                You’ve done the hard part. Look away from the screen for a few minutes —
                your research and maps will be exactly where you left them.
              </Text>

              <View style={styles.actionsRow}>
                <Button
                  title="Keep going"
                  variant="secondary"
                  size="md"
                  style={styles.actionBtn}
                  onPress={() => dismissBreakDialog(false)}
                />
                <Button
                  title="Take five"
                  variant="primary"
                  size="md"
                  style={styles.actionBtn}
                  onPress={() => dismissBreakDialog(true)}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(32, 30, 29, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: t.bg,
    borderRadius: RADIUS.md,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: t.divider,
    ...SHADOWS.lg,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.cyanLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  kicker: {
    marginBottom: SPACING.xs,
  },
  title: {
    marginBottom: SPACING.sm,
  },
  body: {
    marginBottom: SPACING.lg,
    lineHeight: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  actionBtn: {
    flex: 1,
  },
});
