/**
 * SETU Mobile — the one header every screen wears.
 *
 * Before this, each screen invented its own top: some had a title, some had a
 * title plus a status pill plus a stats row, one had a search field where the
 * title should be. The cost was not ugliness — it was that nothing was ever in
 * the same place twice, so orientation had to be re-done on every screen. For
 * an audience with working-memory difficulty that is the expensive kind of
 * inconsistency.
 *
 * So: left slot is always the way out (menu, or back), the centre is always
 * what this screen is, and the right slot holds at most two actions. Anything
 * that does not fit belongs in the quick-actions sheet.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, ChevronLeft } from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useShell } from '../context/ShellContext';
import { Text } from './Typography';
import { goBack } from '../navigation/navigationRef';

export interface AppBarAction {
  key: string;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  /** Draws the pressable in the accent tint, for a state that is currently on. */
  active?: boolean;
}

export interface AppBarProps {
  title: string;
  subtitle?: string;
  /** `menu` opens the side menu; `back` pops the stack; `none` leaves it empty. */
  leading?: 'menu' | 'back' | 'none';
  actions?: AppBarAction[];
  /** Rendered under the title row — a search field, a segmented control. */
  children?: React.ReactNode;
  onBack?: () => void;
}

export const AppBar: React.FC<AppBarProps> = ({
  title,
  subtitle,
  leading = 'menu',
  actions = [],
  children,
  onBack,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { openMenu } = useShell();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + SPACING.sm }]}>
      <View style={styles.row}>
        {leading === 'menu' ? (
          <TouchableOpacity
            style={styles.leadingBtn}
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel="Open the menu"
            accessibilityHint="Everything else in SETU lives here"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Menu size={22} color={COLORS.text} />
          </TouchableOpacity>
        ) : leading === 'back' ? (
          <TouchableOpacity
            style={styles.leadingBtn}
            onPress={onBack || goBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={24} color={COLORS.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.leadingSpacer} />
        )}

        <View style={styles.titleBlock}>
          <Text variant="titleSm" weight="bold" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color={COLORS.textMuted} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {actions.slice(0, 2).map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[styles.actionBtn, action.active ? styles.actionBtnActive : null]}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityState={{ selected: Boolean(action.active) }}
            >
              {action.icon}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {children ? <View style={styles.below}>{children}</View> : null}
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    bar: {
      backgroundColor: t.bg,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
    },
    leadingBtn: {
      width: 40,
      height: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
      marginLeft: -6,
    },
    leadingSpacer: {
      width: 0,
    },
    titleBlock: {
      flex: 1,
      justifyContent: 'center',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    actionBtn: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
    },
    actionBtnActive: {
      backgroundColor: t.cyanLight,
      borderColor: t.cyanBorder,
    },
    below: {
      marginTop: SPACING.md,
    },
  });
