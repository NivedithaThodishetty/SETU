/**
 * SETU Mobile — bundled typefaces.
 *
 * WHY THESE ARE BUNDLED RATHER THAN MAPPED ONTO PLATFORM STACKS
 * -------------------------------------------------------------
 * Settings offered "Atkinson Hyperlegible" and "Lexend" by name and delivered
 * neither. `hyper` resolved to the platform sans — Roboto on Android, San
 * Francisco on iOS — and `lexend` fell through a chain of `if`s to the *serif*
 * default, so picking the rounded sans intended for reading fluency gave you
 * newsprint. The control was real, the label was a claim, and the reader had no
 * way to tell.
 *
 * That matters more here than it would in most products. This is an
 * accessibility tool: a reader who tries the setting the app recommends, feels
 * no difference, and concludes that typeface changes do nothing for them has
 * been given a false negative about their own accommodation. The web app has
 * loaded the genuine faces from Google Fonts since the beginning, so mobile was
 * also the one surface out of three that disagreed.
 *
 * All three are Open Font Licence, so shipping the files is permitted and costs
 * about 640 KB.
 *
 * WHAT THE FACES ARE FOR — and what is NOT claimed
 * ------------------------------------------------
 * Atkinson Hyperlegible was drawn by the Braille Institute to maximise
 * character disambiguation for low-vision readers — the letterforms most often
 * confused (I/l/1, O/0, b/d) are deliberately differentiated. Lexend is a
 * rounded sans designed around reading proficiency.
 *
 * Neither is claimed as a treatment for dyslexia, and the product is careful
 * not to imply it. The controlled evidence for "dyslexia fonts" improving
 * reading over a good ordinary typeface is weak; the evidence for letter
 * spacing is not, which is why spacing is the default-on accommodation here and
 * the typeface is a preference. Offering a genuinely well-drawn face that a
 * reader may simply find more comfortable is worth doing on its own terms.
 *
 * A NOTE ON WEIGHTS, WHICH IS EASY TO GET WRONG
 * ---------------------------------------------
 * With custom fonts, React Native on Android does NOT synthesise bold from a
 * regular file: `fontWeight: '700'` on a family with one registered face is
 * silently ignored, so headings render at regular weight and the whole
 * hierarchy flattens. Each weight must therefore be registered as its own
 * family and selected by name. `familyFor()` below is the only place that
 * decision is made.
 */

import { Platform } from 'react-native';

import { FontStyleOption } from '../types';

/**
 * Files handed to `useFonts`. Keys become the family names usable in styles.
 *
 * Named `<Face>-<Weight>` rather than relying on a shared family with a weight
 * axis, for the Android reason above.
 */
export const FONT_ASSETS = {
  'SourceSerif4-Regular': require('../../assets/fonts/SourceSerif4-Regular.ttf'),
  'SourceSerif4-Bold': require('../../assets/fonts/SourceSerif4-Bold.ttf'),
  'AtkinsonHyperlegible-Regular': require('../../assets/fonts/AtkinsonHyperlegible-Regular.ttf'),
  'AtkinsonHyperlegible-Bold': require('../../assets/fonts/AtkinsonHyperlegible-Bold.ttf'),
  'Lexend-Regular': require('../../assets/fonts/Lexend-Regular.ttf'),
  'Lexend-Bold': require('../../assets/fonts/Lexend-Bold.ttf'),
};

/** The two registered faces for each choice, plus the platform fallback. */
const FAMILIES: Record<
  FontStyleOption,
  { regular: string | undefined; bold: string | undefined }
> = {
  serif: { regular: 'SourceSerif4-Regular', bold: 'SourceSerif4-Bold' },
  hyper: { regular: 'AtkinsonHyperlegible-Regular', bold: 'AtkinsonHyperlegible-Bold' },
  lexend: { regular: 'Lexend-Regular', bold: 'Lexend-Bold' },

  /**
   * `sans` stays the PLATFORM sans rather than one of the bundled faces, so the
   * choice keeps meaning "the ordinary sans this phone uses". iOS has no
   * generic 'sans-serif' family, so naming one there silently falls back to the
   * system face; undefined asks for that fallback honestly.
   */
  sans: {
    regular: Platform.select({ android: 'sans-serif', default: undefined }),
    bold: Platform.select({ android: 'sans-serif-medium', default: undefined }),
  },

  /**
   * The system face, deliberately undefined so React Native uses the platform
   * default. A reader who has set a system-wide font — which people with low
   * vision often have — keeps it here rather than being overridden by ours.
   */
  system: { regular: undefined, bold: undefined },

  /**
   * `dyslexic` is a legacy stored value from an earlier build that offered
   * OpenDyslexic. That face is not bundled — it is not OFL, and the evidence
   * does not support singling it out — so the value resolves to Hyperlegible,
   * which is the closest thing actually shipped. Kept rather than dropped so an
   * upgraded install does not fall back to an unreadable undefined family.
   */
  dyslexic: { regular: 'AtkinsonHyperlegible-Regular', bold: 'AtkinsonHyperlegible-Bold' },
};

/**
 * Resolve a font choice and a weight to a registered family name.
 *
 * `loaded` is false for the first frames while the files are read from disk. It
 * returns undefined then — the platform face — rather than a family name the
 * renderer does not yet know, which on Android draws nothing at all.
 */
export function familyFor(
  font: FontStyleOption,
  weight: 'regular' | 'bold',
  loaded: boolean = true
): string | undefined {
  if (!loaded) return undefined;
  const entry = FAMILIES[font] || FAMILIES.serif;
  return weight === 'bold' ? entry.bold : entry.regular;
}

/**
 * Weights at or above this render with the bold file.
 *
 * 600 is included because the app uses `semibold` widely for subheadings and
 * emphasis, and with only two faces available the honest options are to round
 * it up to bold or drop it to regular. Rounding up preserves the hierarchy the
 * layout was designed around; dropping it collapses it.
 */
export const BOLD_THRESHOLD = 600;

export function weightFor(fontWeight: string | number | undefined): 'regular' | 'bold' {
  const numeric =
    typeof fontWeight === 'number'
      ? fontWeight
      : fontWeight === 'bold'
      ? 700
      : parseInt(String(fontWeight || '400'), 10);
  return Number.isFinite(numeric) && numeric >= BOLD_THRESHOLD ? 'bold' : 'regular';
}
