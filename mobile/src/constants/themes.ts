/**
 * SETU Mobile — Sensory themes.
 *
 * Six grounds rather than a light/dark switch, because the reasons people
 * change the page here are not about ambient light. Cream is for scotopic
 * sensitivity, where white paper visibly shimmers; sage and pastel lower
 * contrast for readers who find pure black on white physically tiring; velvet
 * and contrast go the other way for low vision and for late-night use.
 *
 * Every palette carries the full token set rather than overriding a few keys,
 * so a screen can never half-theme itself — the failure mode of partial
 * palettes is near-black text on a near-black ground, which is exactly the kind
 * of accident that locks someone out of the app entirely.
 */

import { ThemeOption } from '../types';

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceHover: string;

  text: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;

  cyan: string;
  cyanLight: string;
  cyanDark: string;
  cyanBorder: string;

  magenta: string;
  magentaLight: string;
  magentaDark: string;

  yellow: string;
  yellowLight: string;
  yellowDark: string;

  ink: string;

  divider: string;
  dividerSubtle: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  error: string;
  errorLight: string;

  focusRing: string;
  selectionGlow: string;
  shadowColor: string;

  /** Whether this ground is dark, for status-bar and elevation decisions. */
  isDark: boolean;
}

/** The reference Broadsheet palette. Every other theme is a deviation from it. */
export const BROADSHEET: Palette = {
  bg: '#f3f2f2',
  surface: '#eae9e9',
  surfaceAlt: '#e2e1e1',
  surfaceHover: '#dfdede',

  text: '#201e1d',
  textMuted: '#686461',
  textSubtle: '#8e8a86',
  textInverse: '#f3f2f2',

  cyan: '#0088b0',
  cyanLight: '#e1f4f9',
  cyanDark: '#006280',
  cyanBorder: '#80cde2',

  magenta: '#d6006c',
  magentaLight: '#fce6f1',
  magentaDark: '#a30052',

  yellow: '#edbb00',
  yellowLight: '#fdf8e2',
  yellowDark: '#b89100',

  ink: '#201e1d',

  divider: 'rgba(32, 30, 29, 0.16)',
  dividerSubtle: 'rgba(32, 30, 29, 0.08)',
  success: '#107c41',
  successLight: '#e6f7ee',
  warning: '#d83b01',
  warningLight: '#fdeee8',
  error: '#a80000',
  errorLight: '#fdf0f0',

  focusRing: '#0088b0',
  selectionGlow: 'rgba(0, 136, 176, 0.25)',
  shadowColor: '#201e1d',

  isDark: false,
};

const CREAM: Palette = {
  ...BROADSHEET,
  bg: '#faf7ee',
  surface: '#f3eed9',
  surfaceAlt: '#ebe4cd',
  surfaceHover: '#e6dec4',
  text: '#26231e',
  textMuted: '#6b6355',
  textSubtle: '#918872',
  textInverse: '#faf7ee',
  cyan: '#00779c',
  cyanLight: '#e3f2f7',
  cyanDark: '#005672',
  cyanBorder: '#9ad4e6',
  magenta: '#b8005d',
  magentaLight: '#f9e4ee',
  magentaDark: '#8c0047',
  yellowLight: '#f8f0d2',
  ink: '#26231e',
  divider: 'rgba(38, 35, 30, 0.15)',
  dividerSubtle: 'rgba(38, 35, 30, 0.08)',
  focusRing: '#00779c',
  selectionGlow: 'rgba(0, 119, 156, 0.22)',
  shadowColor: '#26231e',
};

const PASTEL: Palette = {
  ...BROADSHEET,
  bg: '#f0f4f8',
  surface: '#e2e8f0',
  surfaceAlt: '#d6dee8',
  surfaceHover: '#cdd7e3',
  text: '#1e293b',
  textMuted: '#5a6a80',
  textSubtle: '#8494a8',
  textInverse: '#f0f4f8',
  cyan: '#0284c7',
  cyanLight: '#e0f2fe',
  cyanDark: '#0369a1',
  cyanBorder: '#7dd3fc',
  magenta: '#be1259',
  magentaLight: '#fce7f0',
  magentaDark: '#911044',
  yellow: '#d99b00',
  yellowLight: '#fdf3d8',
  yellowDark: '#a67700',
  ink: '#1e293b',
  divider: 'rgba(30, 41, 59, 0.14)',
  dividerSubtle: 'rgba(30, 41, 59, 0.07)',
  focusRing: '#0284c7',
  selectionGlow: 'rgba(2, 132, 199, 0.22)',
  shadowColor: '#1e293b',
};

const SAGE: Palette = {
  ...BROADSHEET,
  bg: '#f2f6f1',
  surface: '#e2efe0',
  surfaceAlt: '#d5e6d3',
  surfaceHover: '#c9dec7',
  text: '#1c2b1d',
  textMuted: '#556b57',
  textSubtle: '#7d8f7e',
  textInverse: '#f2f6f1',
  cyan: '#15803d',
  cyanLight: '#dcfce7',
  cyanDark: '#166534',
  cyanBorder: '#86efac',
  magenta: '#b4005a',
  magentaLight: '#f9e3ed',
  magentaDark: '#8a0045',
  yellow: '#c98a00',
  yellowLight: '#f7eed4',
  yellowDark: '#9c6b00',
  ink: '#1c2b1d',
  divider: 'rgba(28, 43, 29, 0.15)',
  dividerSubtle: 'rgba(28, 43, 29, 0.07)',
  success: '#15803d',
  focusRing: '#15803d',
  selectionGlow: 'rgba(21, 128, 61, 0.22)',
  shadowColor: '#1c2b1d',
};

const VELVET: Palette = {
  ...BROADSHEET,
  bg: '#18181a',
  surface: '#222226',
  surfaceAlt: '#2c2c31',
  surfaceHover: '#35353b',
  text: '#f3f2f2',
  textMuted: '#a9a7a5',
  textSubtle: '#7d7b79',
  textInverse: '#18181a',
  cyan: '#38bdf8',
  cyanLight: 'rgba(56, 189, 248, 0.16)',
  cyanDark: '#7dd3fc',
  cyanBorder: 'rgba(56, 189, 248, 0.45)',
  magenta: '#f43f5e',
  magentaLight: 'rgba(244, 63, 94, 0.16)',
  magentaDark: '#fb7185',
  yellow: '#fbbf24',
  yellowLight: 'rgba(251, 191, 36, 0.16)',
  yellowDark: '#fcd34d',
  ink: '#f3f2f2',
  divider: 'rgba(243, 242, 242, 0.16)',
  dividerSubtle: 'rgba(243, 242, 242, 0.08)',
  success: '#4ade80',
  successLight: 'rgba(74, 222, 128, 0.16)',
  warning: '#fb923c',
  warningLight: 'rgba(251, 146, 60, 0.16)',
  error: '#f87171',
  errorLight: 'rgba(248, 113, 113, 0.16)',
  focusRing: '#38bdf8',
  selectionGlow: 'rgba(56, 189, 248, 0.3)',
  shadowColor: '#000000',
  isDark: true,
};

const CONTRAST: Palette = {
  ...BROADSHEET,
  bg: '#0d0d0d',
  surface: '#1a1a1a',
  surfaceAlt: '#242424',
  surfaceHover: '#2e2e2e',
  text: '#ffffff',
  textMuted: '#d4d4d4',
  textSubtle: '#a3a3a3',
  textInverse: '#0d0d0d',
  cyan: '#facc15',
  cyanLight: 'rgba(250, 204, 21, 0.18)',
  cyanDark: '#fef08a',
  cyanBorder: '#eab308',
  magenta: '#fb7185',
  magentaLight: 'rgba(251, 113, 133, 0.18)',
  magentaDark: '#fda4af',
  yellow: '#facc15',
  yellowLight: 'rgba(250, 204, 21, 0.18)',
  yellowDark: '#fef08a',
  ink: '#ffffff',
  divider: 'rgba(255, 255, 255, 0.28)',
  dividerSubtle: 'rgba(255, 255, 255, 0.16)',
  success: '#4ade80',
  successLight: 'rgba(74, 222, 128, 0.18)',
  warning: '#fdba74',
  warningLight: 'rgba(253, 186, 116, 0.18)',
  error: '#fca5a5',
  errorLight: 'rgba(252, 165, 165, 0.18)',
  focusRing: '#facc15',
  selectionGlow: 'rgba(250, 204, 21, 0.35)',
  shadowColor: '#000000',
  isDark: true,
};

export const PALETTES: Record<ThemeOption, Palette> = {
  broadsheet: BROADSHEET,
  cream: CREAM,
  pastel: PASTEL,
  sage: SAGE,
  velvet: VELVET,
  contrast: CONTRAST,
};

export const THEME_LABELS: Record<ThemeOption, { name: string; blurb: string }> = {
  broadsheet: { name: 'Broadsheet', blurb: 'Newsprint paper, near-black ink' },
  cream: { name: 'Warm parchment', blurb: 'Less glare from the page' },
  pastel: { name: 'Calm blue', blurb: 'Softer contrast, easier to sit with' },
  sage: { name: 'Muted sage', blurb: 'Low-stimulation green ground' },
  velvet: { name: 'Velvet dark', blurb: 'Dark ground for evening reading' },
  contrast: { name: 'High contrast', blurb: 'Yellow on black, maximum legibility' },
};

export function paletteFor(theme?: ThemeOption | null): Palette {
  return PALETTES[(theme || 'broadsheet') as ThemeOption] || BROADSHEET;
}

/**
 * Mind map plate colours for a palette.
 *
 * Branch identity is carried by colour, so on the dark grounds the four plates
 * have to be re-picked rather than reused — process yellow on a paper ground and
 * process yellow on near-black are not equally readable, and the ink plate is
 * invisible on velvet by definition.
 */
export function plateColorsFor(palette: Palette): string[] {
  return [palette.cyan, palette.magenta, palette.yellow, palette.isDark ? palette.textMuted : palette.ink];
}

/**
 * Tint overlays for visual stress (Irlen-type symptoms).
 *
 * Rendered as a non-interactive sheet over the whole app rather than baked into
 * the palette, because the accommodation is specifically a coloured film over
 * everything — including images and the mind map canvas.
 */
export const COLOR_OVERLAYS: Record<string, string | null> = {
  none: null,
  peach: '#ffb38a',
  rose: '#ff9ec4',
  mint: '#8ff0c0',
  aqua: '#7ad7f0',
  lavender: '#c4a9ff',
  yellow: '#ffe680',
};

export const OVERLAY_LABELS: Record<string, string> = {
  none: 'None',
  peach: 'Peach',
  rose: 'Rose',
  mint: 'Mint',
  aqua: 'Aqua',
  lavender: 'Lavender',
  yellow: 'Yellow',
};

/** Line-height and block-gap multipliers for the reading-density setting. */
export const SPACING_SCALE: Record<string, number> = {
  normal: 1,
  relaxed: 1.15,
  spacious: 1.3,
};
