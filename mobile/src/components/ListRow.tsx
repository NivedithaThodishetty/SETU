/**
 * SETU Mobile — one row of a settings or menu list.
 *
 * Rows rather than cards wherever the content is a list of choices. A card
 * carries a border, a shadow and a background, which is three signals that this
 * thing is separate from the thing next to it — worth paying for a mind map, not
 * for eleven language options in a row, where it just makes the list look like
 * a pile.
 *
 * The switch variant is a real `Switch` rather than a styled pressable so it
 * inherits the platform's own accessibility semantics; a custom toggle that
 * announces as "button" is a small thing that makes a screen reader session
 * measurably worse.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { ChevronRight, Check } from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text } from './Typography';

export interface ListRowProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Short status text on the right, e.g. the current value. */
  value?: string;

  onPress?: () => void;

  /** Renders a platform switch instead of a chevron. */
  toggle?: boolean;
  toggled?: boolean;
  onToggle?: (next: boolean) => void;

  /** Renders a tick when true — for single-choice lists. */
  selectable?: boolean;
  selected?: boolean;

  /** Marks a row as consequential (delete, reset). */
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Draws the hairline under the row. Off for the last row in a group. */
  divider?: boolean;
  trailing?: React.ReactNode;
}

export const ListRow: React.FC<ListRowProps> = ({
  icon,
  title,
  description,
  value,
  onPress,
  toggle = false,
  toggled = false,
  onToggle,
  selectable = false,
  selected = false,
  tone = 'default',
  disabled = false,
  divider = true,
  trailing,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const titleColor = tone === 'danger' ? COLORS.error : COLORS.text;

  const content = (
    <View style={[styles.row, divider ? styles.rowDivided : null, disabled ? styles.disabled : null]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}

      <View style={styles.text}>
        <Text variant="bodySm" weight="semibold" color={titleColor}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 1 }}>
            {description}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text variant="caption" color={COLORS.textMuted} numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}

      {trailing}

      {toggle ? (
        <Switch
          value={toggled}
          onValueChange={onToggle}
          disabled={disabled}
          trackColor={{ false: COLORS.surfaceAlt, true: COLORS.cyanBorder }}
          thumbColor={toggled ? COLORS.cyan : COLORS.surfaceHover}
          ios_backgroundColor={COLORS.surfaceAlt}
          accessibilityLabel={title}
        />
      ) : selectable ? (
        selected ? (
          <Check size={18} color={COLORS.cyan} />
        ) : (
          <View style={styles.checkPlaceholder} />
        )
      ) : onPress ? (
        <ChevronRight size={18} color={COLORS.textSubtle} />
      ) : null}
    </View>
  );

  if (toggle && !onPress) {
    // The whole row toggles: a 44px switch is a small target, and the label is
    // the part people actually aim at.
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        disabled={disabled}
        onPress={() => onToggle?.(!toggled)}
        accessibilityRole="switch"
        accessibilityState={{ checked: toggled, disabled }}
        accessibilityLabel={title}
        accessibilityHint={description}
      >
        {content}
      </TouchableOpacity>
    );
  }

  if (!onPress) return content;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={selectable ? 'radio' : 'button'}
      accessibilityState={selectable ? { selected, disabled } : { disabled }}
      accessibilityLabel={title}
      accessibilityHint={description}
    >
      {content}
    </TouchableOpacity>
  );
};

/** A boxed group of rows. Give the last row `divider={false}`. */
export const ListGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.group}>{children}</View>;
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    group: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      gap: SPACING.md,
    },
    rowDivided: {
      borderBottomWidth: 1,
      borderBottomColor: t.dividerSubtle,
    },
    disabled: {
      opacity: 0.5,
    },
    icon: {
      width: 24,
      alignItems: 'center',
    },
    text: {
      flex: 1,
    },
    value: {
      maxWidth: 130,
      textAlign: 'right',
    },
    checkPlaceholder: {
      width: 18,
      height: 18,
    },
  });
