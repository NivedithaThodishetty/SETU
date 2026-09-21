/**
 * SETU Broadsheet Design System Tokens
 * ------------------------------------
 * Bound strictly to the SETU Broadsheet design guidelines.
 * Near-black ink on paper ground with four process ink spot colors
 * (Cyan, Magenta, Yellow, Ink) and accessible typography.
 */

export const COLORS = {
  // Base Grounds & Surfaces
  bg: '#f3f2f2', // The paper ground
  surface: '#eae9e9', // Elevated panels, cards, canvas ground
  surfaceAlt: '#e2e1e1',
  surfaceHover: '#dfdede',

  // Typography Inks
  text: '#201e1d', // Primary near-black ink
  textMuted: '#686461', // 60% ink for descriptions & subtitles
  textSubtle: '#8e8a86', // 40% ink for kickers & minor timestamps
  textInverse: '#f3f2f2', // Paper text on solid colored fills

  // Interactive Accents & Process Inks
  cyan: '#0088b0', // Primary interactive accent (Cyan plate)
  cyanLight: '#e1f4f9', // Cyan 100 tint
  cyanDark: '#006280', // Cyan 700
  cyanBorder: '#80cde2',

  magenta: '#d6006c', // Secondary spot color / destructive (Magenta plate)
  magentaLight: '#fce6f1', // Magenta 100 tint
  magentaDark: '#a30052',

  yellow: '#edbb00', // Process Yellow plate (Start / Write modes)
  yellowLight: '#fdf8e2',
  yellowDark: '#b89100',

  ink: '#201e1d', // Ink plate (Guide mode / Root branches)

  // Status & Utility
  divider: 'rgba(32, 30, 29, 0.16)', // Hairlines
  dividerSubtle: 'rgba(32, 30, 29, 0.08)',
  success: '#107c41',
  successLight: '#e6f7ee',
  warning: '#d83b01',
  warningLight: '#fdeee8',
  error: '#a80000',
  errorLight: '#fdf0f0',

  // Focus and Selection Rings
  focusRing: '#0088b0',
  selectionGlow: 'rgba(0, 136, 176, 0.25)',
  shadowColor: '#201e1d',
};

/**
 * Mind Map 4-Plate Color Cycle
 * Assigned at depth 1 and inherited down subtrees.
 */
export const PLATE_COLORS = [
  COLORS.cyan,
  COLORS.magenta,
  COLORS.yellow,
  COLORS.ink,
];

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
};

export const RADIUS = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  pill: 9999,
};

export const FONT_SIZES = {
  kicker: 10,
  caption: 12,
  bodySm: 14,
  body: 16,
  bodyLg: 18,
  titleSm: 20,
  title: 24,
  titleLg: 28,
  h1: 34,
  hero: 42,
};

export const SIZE_SCALE = {
  normal: 1.0,
  comfortable: 1.1,
  large: 1.22,
};

export type TextSizeOption = 'normal' | 'comfortable' | 'large';
export type MotionOption = 'movement' | 'reduced';

/**
 * Extra tracking, in points, added to every glyph.
 *
 * Small numbers on purpose. Past about a point and a half the words stop
 * holding together as words, which is the opposite of the intended effect.
 */
export const LETTER_SPACING = {
  normal: 0,
  wide: 0.6,
  wider: 1.2,
};

export const SHADOWS = {
  sm: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
};
