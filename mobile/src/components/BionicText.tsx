/**
 * SETU Mobile — bold word starts.
 *
 * Thickens the first few letters of each word, on the theory that the eye lands
 * on the anchor and completes the rest. Offered honestly rather than
 * enthusiastically: the clinical review for this project was explicit that the
 * evidence for it is weak and that the difficulty is comprehension and decoding
 * rather than eyesight. It is off by default and labelled as a comfort option,
 * not as the accommodation.
 *
 * The colour default used to come from the static reference palette, which
 * meant that on the two dark grounds every mode result and every map node drew
 * near-black ink on a near-black surface. It reads from the live palette now —
 * a component that renders text can never take its colour from a constant.
 */

import React from 'react';
import { Text as RNText, TextStyle, StyleProp } from 'react-native';

import { Text } from './Typography';
import { useAccessibility } from '../context/AccessibilityContext';
import { useThemeColors } from '../context/ThemeContext';

interface BionicTextProps {
  text: string;
  /** Overrides the user's preference — used where the effect is being demonstrated. */
  forceBionic?: boolean;
  variant?:
    | 'h1'
    | 'titleLg'
    | 'title'
    | 'titleSm'
    | 'bodyLg'
    | 'body'
    | 'bodySm'
    | 'caption'
    | 'kicker';
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function getFixationLength(word: string): number {
  const clean = word.replace(/^[^\w]+|[^\w]+$/g, '');
  const len = clean.length;
  if (len <= 3) return 1;
  if (len <= 6) return 2;
  if (len <= 8) return 3;
  return Math.ceil(len * 0.4);
}

export const BionicText: React.FC<BionicTextProps> = ({
  text,
  forceBionic,
  variant = 'body',
  color,
  style,
}) => {
  const COLORS = useThemeColors();
  const { bionic } = useAccessibility();

  const enabled = forceBionic !== undefined ? forceBionic : bionic;
  const ink = color || COLORS.text;

  if (!text) return null;

  if (!enabled) {
    return (
      <Text variant={variant} color={ink} style={style}>
        {text}
      </Text>
    );
  }

  // Split on whitespace but keep it, so the original spacing survives.
  const tokens = text.split(/(\s+)/);

  return (
    <Text variant={variant} color={ink} style={style}>
      {tokens.map((token, index) => {
        if (/^\s+$/.test(token)) return token;

        const leadingMatch = token.match(/^[^\w]+/);
        const leading = leadingMatch ? leadingMatch[0] : '';
        const rest = token.slice(leading.length);

        const trailingMatch = rest.match(/[^\w]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : '';
        const core = rest.slice(0, rest.length - trailing.length);

        if (!core) return token;

        const fixation = getFixationLength(core);

        return (
          <RNText key={`bionic-${index}`}>
            {leading}
            <RNText style={{ fontWeight: '800' }}>{core.slice(0, fixation)}</RNText>
            <RNText>{core.slice(fixation)}</RNText>
            {trailing}
          </RNText>
        );
      })}
    </Text>
  );
};
