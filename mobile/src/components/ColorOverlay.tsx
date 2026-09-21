/**
 * SETU Mobile — coloured tint film.
 *
 * The software equivalent of the coloured overlays used for visual stress
 * (Irlen-type symptoms), where black text on a white ground appears to shimmer
 * or swim. Which colour helps is individual and there is no way to predict it,
 * so all seven are offered and the strength is adjustable.
 *
 * Rendered as a non-interactive sheet over the entire app rather than baked into
 * the palette, because the accommodation is specifically a film over
 * *everything* — including photographs, the camera preview and the mind map.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { COLOR_OVERLAYS } from '../constants/themes';
import { useAccessibility } from '../context/AccessibilityContext';

export const ColorOverlay: React.FC = () => {
  const { colorOverlay, colorOverlayOpacity } = useAccessibility();

  const tint = COLOR_OVERLAYS[colorOverlay || 'none'];
  if (!tint) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: tint,
          // Capped well below full strength: past roughly a third the tint stops
          // being an aid and starts hiding the interface underneath it.
          opacity: Math.max(0.04, Math.min(0.35, colorOverlayOpacity || 0.12)),
          zIndex: 500,
        },
      ]}
    />
  );
};

export default ColorOverlay;
