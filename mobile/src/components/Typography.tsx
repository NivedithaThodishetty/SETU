/**
 * SETU Mobile — text.
 *
 * Every piece of text in the app goes through here, which is the only way the
 * four reading preferences can be honoured everywhere: typeface, size, line
 * spacing and letter spacing. A screen that reaches for `<RNText>` directly
 * opts out of all four, and the symptom — one paragraph that ignores the large
 * text setting — reads as a rendering bug rather than a missed prop.
 *
 * The three reading typefaces ARE bundled now (`assets/fonts`, registered by
 * `constants/fonts.ts`). They previously were not, and all three silently
 * rendered as the serif; anything here that reads as defensive about font
 * families is guarding that specific failure, which is invisible at runtime.
 *
 * Letter spacing is offered alongside them rather than instead of them. Zorzi
 * et al. (PNAS 2012) widened letter spacing for dyslexic children and measured
 * roughly a 20% reading-speed gain and about half the errors, with no training
 * — the mechanism is reduced visual crowding, which is elevated in dyslexia.
 * The evidence for increased tracking is better than the evidence for any
 * particular dyslexia typeface, and it applies to whatever glyphs are on
 * screen, so it is the control worth having even once the fonts ship.
 *
 * Line spacing and letter spacing are SEPARATE preferences: `spacing` scales
 * line height, `letterSpacing` sets tracking. They were briefly derived from
 * one control, which meant a reader could not loosen lines without also
 * loosening letters.
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';

import { FONT_SIZES } from '../constants/theme';
import { familyFor, weightFor } from '../constants/fonts';
import { useThemeColors } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';

export interface AccessibleTextProps extends RNTextProps {
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
  weight?: 'normal' | 'medium' | 'semibold' | 'bold' | '800';
  italic?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
}

/**
 * The regular-weight family name for a preference.
 *
 * Kept as a named export because `Input.tsx` styles a `TextInput`, which cannot
 * render through this component but must still follow the reader's typeface.
 * It delegates so that both paths resolve to the same bundled files.
 */
export function fontFamilyFor(font: string): string | undefined {
  return familyFor(font as Parameters<typeof familyFor>[0], 'regular');
}

export const Text: React.FC<AccessibleTextProps> = ({
  children,
  variant = 'body',
  color,
  weight = 'normal',
  italic = false,
  align = 'left',
  style,
  ...rest
}) => {
  const COLORS = useThemeColors();
  const { font, sizeScale, spacingScale, letterSpacing } = useAccessibility();

  const fontSize = Math.round((FONT_SIZES[variant] || FONT_SIZES.body) * sizeScale);

  const lineRatio =
    variant === 'h1' || variant === 'titleLg' ? 1.15 : variant === 'kicker' ? 1.4 : 1.45;
  const lineHeight = Math.round(fontSize * lineRatio * spacingScale);

  const fontWeight: TextStyle['fontWeight'] =
    weight === 'bold' || weight === '800' || variant === 'h1' || variant === 'titleLg' || variant === 'title'
      ? '700'
      : weight === 'semibold' || variant === 'titleSm'
        ? '600'
        : weight === 'medium' || variant === 'kicker'
          ? '600'
          : '400';

  /**
   * Tracking, as a FRACTION OF THE FONT SIZE rather than a fixed number of
   * points.
   *
   * React Native's `letterSpacing` is absolute, so a value tuned for 16pt body
   * text is nearly invisible at 30pt and overwhelming at 11pt — and the reader
   * changing the text size is the whole point of this app.
   *
   * `wide` is the evidence-backed dose: Zorzi et al. widened tracking to about
   * 0.12em. `wider` reaches the full magnitude the study tested.
   */
  const trackingEm = letterSpacing === 'wider' ? 0.18 : letterSpacing === 'wide' ? 0.12 : 0;
  const tracking = fontSize * trackingEm;

  const resolved: TextStyle = {
    /*
     * The family is chosen by weight, not just by preference.
     *
     * React Native on Android will not synthesise bold from a single custom
     * face: setting fontWeight '700' on a family with only a regular file is
     * silently ignored, and every heading in the app flattens to body weight
     * with no error anywhere. So the bold file is selected by name.
     */
    fontFamily: familyFor(font, weightFor(fontWeight)),
    fontSize,
    lineHeight,
    color: color || COLORS.text,
    textAlign: align,
    fontStyle: italic ? 'italic' : 'normal',
    fontWeight,
    /*
     * Kickers keep their own decorative tracking; everything else follows the
     * reader's setting. Headings are excluded because at 28pt+ the crowding
     * this fixes is not present, and the extra tracking reads as a stylistic
     * choice rather than an accommodation.
     */
    letterSpacing:
      variant === 'kicker'
        ? 0.8
        : variant === 'h1' || variant === 'titleLg'
          ? undefined
          : tracking || undefined,
    textTransform: variant === 'kicker' ? 'uppercase' : undefined,
  };

  return (
    <RNText style={[resolved, style]} {...rest}>
      {children}
    </RNText>
  );
};

export const Heading: React.FC<AccessibleTextProps> = (props) => (
  <Text variant="h1" weight="bold" {...props} />
);

export const Subheading: React.FC<AccessibleTextProps> = (props) => {
  const COLORS = useThemeColors();
  return <Text variant="titleSm" weight="semibold" color={COLORS.textMuted} {...props} />;
};

export const Kicker: React.FC<AccessibleTextProps> = (props) => {
  const COLORS = useThemeColors();
  return <Text variant="kicker" color={COLORS.cyan} weight="semibold" {...props} />;
};
