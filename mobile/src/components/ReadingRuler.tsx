/**
 * SETU Mobile — Accessible Reading Ruler Overlay
 * ----------------------------------------------
 * A draggable focus band that darkens above and below the active line
 * to eliminate visual crowding and line-skipping for dyslexic readers.
 */

import React, { useState } from 'react';
import { View, StyleSheet, PanResponder, Dimensions } from 'react-native';
import { COLORS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';

export const ReadingRuler: React.FC = () => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { readingRuler } = useAccessibility();
  const [rulerY, setRulerY] = useState(250);
  const rulerHeight = 64;

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      const newY = Math.max(80, Math.min(Dimensions.get('window').height - 150, gestureState.moveY));
      setRulerY(newY);
    },
  });

  if (!readingRuler) return null;

  return (
    <View style={styles.fullscreen} pointerEvents="box-none">
      {/* Top Dimmed Overlay */}
      <View style={[styles.dimmed, { height: rulerY }]} pointerEvents="none" />

      {/* Active Focus Window */}
      <View
        style={[
          styles.window,
          {
            top: rulerY,
            height: rulerHeight,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.topGuideLine} />
        <View style={styles.bottomGuideLine} />
        <View style={styles.dragHandle} />
      </View>

      {/* Bottom Dimmed Overlay */}
      <View
        style={[
          styles.dimmed,
          {
            top: rulerY + rulerHeight,
            bottom: 0,
          },
        ]}
        pointerEvents="none"
      />
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
  fullscreen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 999,
  },
  dimmed: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(32, 30, 29, 0.18)',
  },
  window: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 136, 176, 0.06)',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: t.cyan,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  topGuideLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: t.cyan,
  },
  bottomGuideLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: t.cyan,
  },
  dragHandle: {
    width: 24,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.cyan,
    opacity: 0.6,
  },
});
