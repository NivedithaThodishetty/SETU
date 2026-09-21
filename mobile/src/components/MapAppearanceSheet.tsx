/**
 * SETU Mobile — how the map is drawn.
 *
 * These four settings were already in storage and were already read by the
 * layout engine; there was simply no way to change any of them, so every map
 * was drawn with curved connectors, comfortable nodes and full note text
 * whether that suited the reader or not.
 *
 * None of them is decoration:
 *
 *  - Curved connectors are harder to follow for some readers with visual
 *    processing difficulty than a straight or right-angled line.
 *  - Compact nodes fit more of the map on a phone; comfortable ones give the
 *    text room. Which is better is a property of the person.
 *  - Text scale is separate from the app-wide reading size on purpose. A map is
 *    read at arm's length in a way a paragraph is not, and someone can want
 *    large body text and a map that still fits on the screen.
 *  - Picture mode is the clinical one: mind maps help this audience when they
 *    carry no text, or when the text is spoken on contact. It strips the notes
 *    off the map and leaves them to the voice.
 *
 * They persist as preferences rather than per-map state, because it is a way of
 * seeing rather than a property of any one map.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { Sheet } from './Sheet';
import { Segmented } from './Segmented';
import { ListGroup, ListRow } from './ListRow';
import { Text } from './Typography';
import { MapEdgeStyle, MapNodeStyle } from '../types';

const TEXT_SCALE_MIN = 0.85;
const TEXT_SCALE_MAX = 1.3;
const TEXT_SCALE_STEP = 0.05;

export interface MapAppearanceSheetProps {
  visible: boolean;
  onClose: () => void;
  pictureMode: boolean;
  onTogglePictureMode: (next: boolean) => void;
}

export const MapAppearanceSheet: React.FC<MapAppearanceSheetProps> = ({
  visible,
  onClose,
  pictureMode,
  onTogglePictureMode,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { preferences, updatePreferences, speakOnTap, toggleSpeakOnTap, bionic, toggleBionic } =
    useAccessibility();

  const edgeStyle = preferences.mapEdgeStyle || 'bezier';
  const nodeStyle = preferences.mapNodeStyle || 'comfortable';
  const textScale = preferences.mapTextScale || 1;

  const nudgeScale = (delta: number) => {
    const next = Math.min(
      TEXT_SCALE_MAX,
      Math.max(TEXT_SCALE_MIN, Math.round((textScale + delta) * 100) / 100)
    );
    if (next !== textScale) updatePreferences({ mapTextScale: next });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="How the map is drawn"
      subtitle="These stay set for every map, not just this one"
      maxHeightRatio={0.8}
    >
      <Text variant="bodySm" weight="semibold" style={styles.label}>
        Connectors
      </Text>
      <Segmented<MapEdgeStyle>
        options={[
          { key: 'bezier', label: 'Curved' },
          { key: 'straight', label: 'Straight' },
          { key: 'orthogonal', label: 'Right angles' },
        ]}
        value={edgeStyle}
        onChange={(value) => updatePreferences({ mapEdgeStyle: value })}
      />
      <Text variant="caption" color={COLORS.textSubtle} style={styles.hint}>
        If the curves are hard to follow with your eye, straight lines or right angles often are
        not.
      </Text>

      <Text variant="bodySm" weight="semibold" style={styles.label}>
        Branch size
      </Text>
      <Segmented<MapNodeStyle>
        options={[
          { key: 'comfortable', label: 'Comfortable' },
          { key: 'compact', label: 'Compact' },
        ]}
        value={nodeStyle}
        onChange={(value) => updatePreferences({ mapNodeStyle: value })}
      />
      <Text variant="caption" color={COLORS.textSubtle} style={styles.hint}>
        Compact fits more of the map on the screen at once. Comfortable gives the words room.
      </Text>

      <Text variant="bodySm" weight="semibold" style={styles.label}>
        Text on the map
      </Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => nudgeScale(-TEXT_SCALE_STEP)}
          disabled={textScale <= TEXT_SCALE_MIN}
          accessibilityRole="button"
          accessibilityLabel="Make the map text smaller"
          accessibilityState={{ disabled: textScale <= TEXT_SCALE_MIN }}
        >
          <Minus size={18} color={textScale <= TEXT_SCALE_MIN ? COLORS.textSubtle : COLORS.text} />
        </TouchableOpacity>

        <View style={styles.stepValue}>
          <Text variant="body" weight="bold">
            {Math.round(textScale * 100)}%
          </Text>
          <Text variant="caption" color={COLORS.textMuted}>
            separate from the app-wide reading size
          </Text>
        </View>

        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => nudgeScale(TEXT_SCALE_STEP)}
          disabled={textScale >= TEXT_SCALE_MAX}
          accessibilityRole="button"
          accessibilityLabel="Make the map text larger"
          accessibilityState={{ disabled: textScale >= TEXT_SCALE_MAX }}
        >
          <Plus size={18} color={textScale >= TEXT_SCALE_MAX ? COLORS.textSubtle : COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.group}>
        <ListGroup>
          <ListRow
            title="Picture mode"
            description="Strips the notes off the map. Open a branch and it is explained aloud instead."
            toggle
            toggled={pictureMode}
            onToggle={onTogglePictureMode}
          />
          <ListRow
            title="Speak a branch when it opens"
            description="Starts the audio without you having to reach for the button"
            toggle
            toggled={speakOnTap}
            onToggle={toggleSpeakOnTap}
          />
          <ListRow
            title="Bold word starts"
            description="Thickens the first letters. Some readers find it helps; many do not."
            toggle
            toggled={bionic}
            onToggle={toggleBionic}
            divider={false}
          />
        </ListGroup>
      </View>

      {pictureMode ? (
        <Text variant="caption" color={COLORS.textMuted} style={styles.pictureNote}>
          With picture mode on, a map with speaking turned off is silent and wordless. Leave
          “speak a branch when it opens” on unless you are somewhere you cannot listen.
        </Text>
      ) : null}
    </Sheet>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    label: {
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    hint: {
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.sm,
    },
    stepBtn: {
      width: 48,
      height: 48,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bg,
    },
    stepValue: {
      flex: 1,
      alignItems: 'center',
    },
    group: {
      marginTop: SPACING.xl,
    },
    pictureNote: {
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.xs,
    },
  });
