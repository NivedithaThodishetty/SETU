/**
 * SETU Mobile — concrete-object arithmetic.
 *
 * The special-education method this project was advised to use: a sum is
 * explained by putting countable things on a table inside a short story, not by
 * notation. So the drawn objects *are* the explanation and the sentence is only
 * narration — which is why every step renders an actual quantity rather than a
 * description of one.
 *
 * One step on screen at a time is the working-memory accommodation. Working
 * memory is impaired in this group while long-term memory is not, so nothing is
 * ever asked to be carried between steps: the table always shows the current
 * truth, and going back is always available.
 *
 * Narration is on by default rather than hidden behind a button, because the
 * clinical guidance was explicit that graphical material only works for this
 * audience when it is paired with audio.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Repeat,
  Volume2,
  VolumeX,
} from 'lucide-react-native';

import { Palette } from '../constants/themes';
import { RADIUS, SPACING } from '../constants/theme';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { tts } from '../services/tts';
import { NumbersModeResult, NumbersStep } from '../types';
import { Text, Kicker } from './Typography';

/**
 * Above this many objects the grid stops being countable and starts being
 * wallpaper, which defeats the purpose. Past it we draw a representative set and
 * say the real total in words.
 */
const MAX_DRAWN = 48;
const MAX_PILES = 10;

interface NumberStoryProps {
  data: NumbersModeResult;
  onSolved?: () => void;
}

export const NumberStory: React.FC<NumberStoryProps> = ({ data, onSolved }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const [stepIndex, setStepIndex] = useState(0);
  const [narrate, setNarrate] = useState(true);
  const solvedRef = useRef(false);

  const steps = useMemo(() => (Array.isArray(data?.steps) ? data.steps : []), [data]);
  const step = steps[stepIndex] || null;
  const isLast = stepIndex >= steps.length - 1;

  // Reset when a different problem arrives, so a new sum never opens half-solved.
  useEffect(() => {
    setStepIndex(0);
    solvedRef.current = false;
  }, [data]);

  useEffect(() => {
    if (!step || !narrate) return;
    tts.speak(step.narration, { quiet: true });
  }, [step, narrate]);

  useEffect(
    () => () => {
      tts.stop();
    },
    []
  );

  if (!data || !steps.length) return null;

  const emoji = data.objectEmoji || '🔵';
  const plural = data.objectNamePlural || data.objectName || 'objects';

  const advance = () => {
    if (isLast) {
      if (!solvedRef.current) {
        solvedRef.current = true;
        onSolved?.();
      }
      return;
    }
    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  };

  return (
    <View style={{ gap: SPACING.lg }}>
      {/* The story */}
      <View style={styles.storyCard}>
        <Kicker color={COLORS.cyan}>The same question, in plain words</Kicker>
        <Text variant="bodyLg" weight="semibold" style={{ marginTop: 4 }}>
          {data.plainQuestion}
        </Text>
        <Text variant="bodySm" color={COLORS.textMuted} style={{ marginTop: SPACING.sm }}>
          {data.story}
        </Text>
      </View>

      {/* The table */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Kicker>
            Step {stepIndex + 1} of {steps.length}
          </Kicker>

          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: narrate }}
            accessibilityLabel={narrate ? 'Reading each step aloud' : 'Steps are silent'}
            onPress={() => {
              setNarrate((current) => {
                if (current) tts.stop();
                else if (step) tts.speak(step.narration);
                return !current;
              });
            }}
            style={[styles.narrateToggle, narrate ? styles.narrateOn : null]}
          >
            {narrate ? (
              <Volume2 size={14} color={COLORS.textInverse} />
            ) : (
              <VolumeX size={14} color={COLORS.textMuted} />
            )}
            <Text
              variant="caption"
              weight="semibold"
              color={narrate ? COLORS.textInverse : COLORS.textMuted}
              style={{ marginLeft: 5 }}
            >
              {narrate ? 'Reading aloud' : 'Silent'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Progress pips — position without a number to hold in mind */}
        <View style={styles.pips} accessibilityElementsHidden importantForAccessibility="no">
          {steps.map((_, index) => (
            <View
              key={index}
              style={[styles.pip, index <= stepIndex ? styles.pipFilled : null]}
            />
          ))}
        </View>

        <Text variant="body" weight="semibold">
          {step?.narration}
        </Text>

        {step ? (
          <ObjectTable
            step={step}
            previousTotal={stepIndex > 0 ? Number(steps[stepIndex - 1]?.runningTotal) || 0 : 0}
            emoji={emoji}
            plural={plural}
          />
        ) : null}

        <View style={styles.controls}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back one step"
            accessibilityState={{ disabled: stepIndex === 0 }}
            disabled={stepIndex === 0}
            onPress={() => setStepIndex((current) => Math.max(0, current - 1))}
            style={[styles.controlButton, stepIndex === 0 ? styles.controlDisabled : null]}
          >
            <ArrowLeft size={15} color={stepIndex === 0 ? COLORS.textSubtle : COLORS.text} />
            <Text
              variant="bodySm"
              weight="semibold"
              color={stepIndex === 0 ? COLORS.textSubtle : COLORS.text}
              style={{ marginLeft: 5 }}
            >
              Back
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Show me the answer' : 'Next step'}
            onPress={advance}
            style={[styles.controlButton, styles.controlPrimary]}
          >
            <Text variant="bodySm" weight="bold" color={COLORS.textInverse}>
              {isLast ? 'Show me the answer' : 'Next step'}
            </Text>
            {isLast ? (
              <Check size={15} color={COLORS.textInverse} style={{ marginLeft: 5 }} />
            ) : (
              <ArrowRight size={15} color={COLORS.textInverse} style={{ marginLeft: 5 }} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Say this step again"
            onPress={() => step && tts.speak(step.narration)}
            style={styles.controlButton}
          >
            <Repeat size={15} color={COLORS.cyan} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Answer, revealed only at the end */}
      {isLast ? (
        <View style={styles.answerCard}>
          <Kicker color={COLORS.cyanDark}>The answer</Kicker>
          <Text variant="h1" weight="bold" color={COLORS.cyanDark} style={{ marginTop: 2 }}>
            {data.answer}
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Hear the answer read aloud"
            onPress={() =>
              tts.speak(`The answer is ${data.answer}. ${data.checkIt} ${data.realLife}`)
            }
            style={styles.hearButton}
          >
            <Volume2 size={14} color={COLORS.cyanDark} />
            <Text variant="caption" weight="bold" color={COLORS.cyanDark} style={{ marginLeft: 5 }}>
              Hear the answer
            </Text>
          </TouchableOpacity>

          <View style={styles.answerDetails}>
            <View>
              <Kicker color={COLORS.cyanDark}>Check it yourself</Kicker>
              <Text variant="bodySm" style={{ marginTop: 2 }}>
                {data.checkIt}
              </Text>
            </View>
            <View style={{ marginTop: SPACING.md }}>
              <Kicker color={COLORS.cyanDark}>Where this shows up</Kicker>
              <Text variant="bodySm" style={{ marginTop: 2 }}>
                {data.realLife}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
};

/* --------------------------- Object rendering --------------------------- */

/**
 * Work out whether a step should be drawn as piles rather than a single row.
 *
 * Multiplication and division are the two operations where the *arrangement*
 * carries the meaning — "four piles of five" is the insight, not "twenty" — so
 * grouping steps get piles and everything else gets a flat, countable row.
 *
 * The awkward part is that `count`, `runningTotal` and `groupSize` do not
 * arrive with fixed roles. For "12 samosas between 3 friends" the model tends to
 * send count=12, runningTotal=4, groupSize=3 — total dealt, per pile, number of
 * piles. For "2400 rupees four ways" it sends count=4, runningTotal=2400,
 * groupSize=600 — number of piles, total, per pile. Both readings are internally
 * sensible and neither is wrong; picking one and hard-coding it draws six
 * hundred piles for the second.
 *
 * So instead of trusting a role assignment, we test the candidate readings
 * against the quantity actually on the table before this step, and take the one
 * that multiplies out to it. When nothing fits, we return null and the caller
 * draws a plain countable row — which is never wrong, only less illuminating.
 */
function pilesFor(
  step: NumbersStep,
  quantityBefore: number
): { piles: number; pileSize: number } | null {
  const groupSize = Math.max(0, Math.round(Number(step.groupSize) || 0));
  if (groupSize <= 0) return null;

  const total = Math.max(0, Math.round(Number(step.runningTotal) || 0));
  const count = Math.max(0, Math.round(Number(step.count) || 0));

  if (step.operation === 'group' && total === 0) {
    // The piles have been laid out but nothing is in them yet.
    const piles = count || groupSize;
    return piles > 0 ? { piles, pileSize: 0 } : null;
  }

  const candidates: { piles: number; pileSize: number }[] = [
    { piles: groupSize, pileSize: total },
    { piles: count, pileSize: groupSize },
    { piles: groupSize, pileSize: count },
    { piles: count, pileSize: total },
  ].filter((option) => option.piles > 0 && option.pileSize > 0);

  const target = quantityBefore > 0 ? quantityBefore : total;
  const consistent = candidates.find((option) => option.piles * option.pileSize === target);
  if (consistent) return consistent;

  // No reading reconciles with the running total — for example when the model
  // rounds. Fall back to whichever is small enough to actually be counted.
  return (
    candidates.find(
      (option) => option.piles <= MAX_PILES && option.piles * option.pileSize <= MAX_DRAWN
    ) || null
  );
}

const ObjectTable: React.FC<{
  step: NumbersStep;
  previousTotal: number;
  emoji: string;
  plural: string;
}> = ({ step, previousTotal, emoji, plural }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const grouping = pilesFor(step, previousTotal);
  const total = Math.max(0, Math.round(Number(step.runningTotal) || 0));
  const count = Math.max(0, Math.round(Number(step.count) || 0));

  if (grouping && grouping.piles > 0 && grouping.piles * Math.max(1, grouping.pileSize) <= MAX_DRAWN) {
    const piles = Math.min(grouping.piles, MAX_PILES);
    return (
      <View style={{ marginTop: SPACING.lg }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pileRow}>
            {Array.from({ length: piles }, (_, pileIndex) => (
              <View key={pileIndex} style={styles.pile}>
                <View style={styles.pileObjects}>
                  {Array.from({ length: grouping.pileSize }, (_, index) => (
                    <Countable key={index} emoji={emoji} />
                  ))}
                </View>
                {grouping.pileSize > 0 ? (
                  <Text variant="caption" weight="bold" color={COLORS.cyanDark}>
                    {grouping.pileSize}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </ScrollView>

        <Text variant="caption" color={COLORS.textMuted} style={styles.caption}>
          {grouping.piles} pile{grouping.piles === 1 ? '' : 's'}
          {grouping.pileSize > 0 ? ` of ${grouping.pileSize}` : ''} · {total} {plural} altogether
        </Text>
      </View>
    );
  }

  // A removal keeps the taken-away objects on screen, struck through, because
  // seeing what left is what makes subtraction concrete rather than magical.
  const removed = step.operation === 'remove' ? Math.min(count, 20) : 0;
  // On an addition the arriving objects are tinted, so the change is visible
  // without recounting the whole row from scratch.
  const added = step.operation === 'add' ? Math.min(count, total) : 0;

  const drawn = Math.min(total, MAX_DRAWN);
  const truncated = total > MAX_DRAWN;

  return (
    <View style={{ marginTop: SPACING.lg }}>
      <View style={styles.objectRow}>
        {Array.from({ length: drawn }, (_, index) => (
          <Countable key={index} emoji={emoji} fresh={added > 0 && index >= drawn - added} />
        ))}
        {Array.from({ length: removed }, (_, index) => (
          <Countable key={`gone_${index}`} emoji={emoji} gone />
        ))}
      </View>

      <Text variant="caption" color={COLORS.textMuted} style={styles.caption}>
        {truncated ? `showing ${MAX_DRAWN} of ` : ''}
        {total} {plural} on the table
        {removed > 0 ? ` · ${removed} taken away` : ''}
      </Text>
    </View>
  );
};

const Countable: React.FC<{ emoji: string; fresh?: boolean; gone?: boolean }> = ({
  emoji,
  fresh = false,
  gone = false,
}) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={[styles.countable, fresh ? styles.countableFresh : null, gone ? styles.countableGone : null]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text variant="body" style={gone ? { textDecorationLine: 'line-through' } : undefined}>
        {emoji}
      </Text>
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    storyCard: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: t.divider,
      padding: SPACING.lg,
    },
    tableCard: {
      backgroundColor: t.bg,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.divider,
      padding: SPACING.lg,
    },
    tableHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    narrateToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: 7,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.divider,
      minHeight: 34,
    },
    narrateOn: {
      backgroundColor: t.cyan,
      borderColor: t.cyan,
    },
    pips: {
      flexDirection: 'row',
      gap: 4,
      marginBottom: SPACING.lg,
    },
    pip: {
      flex: 1,
      height: 5,
      borderRadius: 3,
      backgroundColor: t.surfaceAlt,
    },
    pipFilled: {
      backgroundColor: t.cyan,
    },
    objectRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
    },
    pileRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    pile: {
      minWidth: 74,
      maxWidth: 128,
      alignItems: 'center',
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.cyanBorder,
      backgroundColor: t.surface,
      padding: SPACING.sm,
    },
    pileObjects: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 2,
      marginBottom: 3,
    },
    countable: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
    },
    countableFresh: {
      backgroundColor: t.cyanLight,
      borderWidth: 1,
      borderColor: t.cyanBorder,
    },
    countableGone: {
      opacity: 0.3,
    },
    caption: {
      marginTop: SPACING.sm,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.lg,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: t.divider,
    },
    controlButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.divider,
    },
    controlPrimary: {
      flex: 1,
      backgroundColor: t.cyan,
      borderColor: t.cyan,
    },
    controlDisabled: {
      opacity: 0.5,
    },
    answerCard: {
      backgroundColor: t.cyanLight,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.cyanBorder,
      borderLeftWidth: 4,
      borderLeftColor: t.cyan,
      padding: SPACING.lg,
    },
    hearButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginTop: SPACING.md,
      minHeight: 40,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.pill,
      backgroundColor: t.bg,
      borderWidth: 1,
      borderColor: t.cyanBorder,
    },
    answerDetails: {
      marginTop: SPACING.lg,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: t.cyanBorder,
    },
  });

export default NumberStory;
