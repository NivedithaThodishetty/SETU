/**
 * SETU Mobile — eight tools, eight result layouts.
 *
 * The modes used to print on identical stationery: a coloured card, a bold
 * heading, a column of paragraphs, whatever the answer actually was. That made
 * eight genuinely different jobs read as one feature with a dropdown, and it
 * hid the accommodation — nothing on screen said that Numbers works differently
 * from Simplify, or that Practice hands you a script rather than a summary.
 *
 * So each answer is laid out in the shape of the thing it is:
 *
 *   Start     an ignition card, then a ladder whose rail fills as rungs are ticked
 *   Simplify  the rewrite first, the original folded away beneath it
 *   Learn     a quiz dealt one card at a time — the rest are dots, so nothing
 *             has to be held in your head
 *   Meet      a real ledger: task, owner, due, priority, ticked off row by row
 *   Practice  the conversation in the shape of a conversation
 *   Write     the cut sentence struck through, the reason set beside it
 *   Guide     stations on a filling rail, with "you are here"
 *   Numbers   countable objects, one step at a time (see NumberStory)
 *
 * Interactive state — which rung is ticked, which quiz card you are on — lives
 * in each renderer rather than in the screen, because it is genuinely local and
 * resetting it is exactly what should happen when a new answer arrives.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock,
  Quote,
  Target,
  Lightbulb,
  ArrowRight,
} from 'lucide-react-native';

import { SPACING, RADIUS } from '../../constants/theme';
import { Palette } from '../../constants/themes';
import { useThemeColors, useThemedStyles } from '../../context/ThemeContext';
import { Text } from '../Typography';
import { Tag } from '../Card';
import { BionicText } from '../BionicText';
import { NumberStory } from '../NumberStory';
import { award } from '../../services/progress';
import {
  CognitiveModeKey,
  StartModeResult,
  SimplifyModeResult,
  LearnModeResult,
  MeetModeResult,
  PracticeModeResult,
  WriteModeResult,
  GuideModeResult,
  NumbersModeResult,
  ChunkedTaskResult,
} from '../../types';

/* ========================================================================== */
/* Start — the launch pad                                                     */
/* ========================================================================== */

const StartResult: React.FC<{ data: StartModeResult }> = ({ data }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const [done, setDone] = useState<Set<number>>(new Set());

  const steps = data.microSteps || [];
  const completion = steps.length ? done.size / steps.length : 0;

  const toggle = (index: number) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else {
        next.add(index);
        award('stepChecked');
      }
      return next;
    });
  };

  return (
    <View>
      {data.supportiveMessage ? (
        <Text variant="bodySm" color={COLORS.textMuted} style={styles.lede}>
          {data.supportiveMessage}
        </Text>
      ) : null}

      {/* The ignition card. One action, in the largest type on the screen,
          because the whole failure mode this addresses is not knowing which
          thing to do first. */}
      <View style={[styles.ignition, { borderColor: COLORS.yellow }]}>
        <View style={styles.ignitionTop}>
          <Target size={15} color={COLORS.yellowDark} />
          <Text variant="kicker" color={COLORS.yellowDark} style={{ marginLeft: 6 }}>
            Do only this
          </Text>
          {data.confidenceMeter?.estimatedTimeMinutes ? (
            <View style={styles.ignitionClock}>
              <Clock size={12} color={COLORS.textMuted} />
              <Text variant="caption" color={COLORS.textMuted} style={{ marginLeft: 3 }}>
                {data.confidenceMeter.estimatedTimeMinutes} min
              </Text>
            </View>
          ) : null}
        </View>

        <BionicText
          text={data.immediateTenMinuteAction || ''}
          variant="bodyLg"
          style={styles.ignitionAction}
        />

        {data.confidenceMeter ? (
          <View style={styles.meterRow}>
            <Tag label={`Effort: ${data.confidenceMeter.effortLevel}`} variant="neutral" />
            <Tag label={`Anxiety: ${data.confidenceMeter.anxietyLevel}`} variant="neutral" />
          </View>
        ) : null}
      </View>

      {steps.length ? (
        <View style={styles.ladder}>
          <View style={styles.ladderHeader}>
            <Text variant="bodySm" weight="bold">
              Then, in order
            </Text>
            <Text variant="caption" color={COLORS.textMuted}>
              {done.size} of {steps.length}
            </Text>
          </View>

          <View style={styles.rail}>
            <View
              style={[styles.railFill, { width: `${Math.round(completion * 100)}%` }]}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${done.size} of ${steps.length} steps done`}
            />
          </View>

          {steps.map((step, index) => {
            const ticked = done.has(index);
            return (
              <TouchableOpacity
                key={`rung-${index}`}
                style={styles.rung}
                activeOpacity={0.75}
                onPress={() => toggle(index)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ticked }}
                accessibilityLabel={step}
              >
                <View style={[styles.tickBox, ticked ? styles.tickBoxOn : null]}>
                  {ticked ? <Check size={13} color={COLORS.textInverse} /> : null}
                </View>
                <Text
                  variant="bodySm"
                  color={ticked ? COLORS.textSubtle : COLORS.text}
                  style={[{ flex: 1 }, ticked ? styles.struck : null]}
                >
                  {step}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {data.clarifyingQuestion ? (
        <View style={styles.aside}>
          <Lightbulb size={14} color={COLORS.cyan} />
          <Text variant="caption" color={COLORS.textMuted} style={styles.asideText}>
            {data.clarifyingQuestion}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

/* ========================================================================== */
/* Simplify — the translation bench                                           */
/* ========================================================================== */

const SimplifyResult: React.FC<{ data: SimplifyModeResult; input: string }> = ({ data, input }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <View>
      {data.readabilityGrade ? (
        <View style={styles.gradeRow}>
          <Tag label={data.readabilityGrade} variant="cyan" />
        </View>
      ) : null}

      {/* The rewrite leads. The original is available but folded, because the
          reader came here precisely because the original did not work. */}
      <View style={styles.plainPanel}>
        <BionicText text={data.plainLanguageRewrite || ''} variant="bodyLg" />
      </View>

      {input.trim() ? (
        <View>
          <TouchableOpacity
            style={styles.foldToggle}
            onPress={() => setShowOriginal((prev) => !prev)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showOriginal }}
            accessibilityLabel={showOriginal ? 'Hide the original text' : 'Show the original text'}
          >
            {showOriginal ? (
              <ChevronUp size={14} color={COLORS.textMuted} />
            ) : (
              <ChevronDown size={14} color={COLORS.textMuted} />
            )}
            <Text variant="caption" color={COLORS.textMuted} style={{ marginLeft: 4 }}>
              {showOriginal ? 'Hide what you pasted' : 'Compare with what you pasted'}
            </Text>
          </TouchableOpacity>

          {showOriginal ? (
            <View style={styles.originalPanel}>
              <Text variant="bodySm" color={COLORS.textMuted}>
                {input.trim()}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {data.keyTakeaways?.length ? (
        <View style={styles.block}>
          <Text variant="bodySm" weight="bold" style={styles.blockTitle}>
            What it comes down to
          </Text>
          {data.keyTakeaways.map((item, index) => (
            <View key={`take-${index}`} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: COLORS.cyan }]} />
              <Text variant="bodySm" style={{ flex: 1 }}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {data.sensoryTips?.length ? (
        <View style={styles.block}>
          <Text variant="bodySm" weight="bold" style={styles.blockTitle}>
            If it is still hard to read
          </Text>
          {data.sensoryTips.map((item, index) => (
            <View key={`tip-${index}`} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: COLORS.textSubtle }]} />
              <Text variant="bodySm" color={COLORS.textMuted} style={{ flex: 1 }}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

/* ========================================================================== */
/* Learn — the study deck                                                     */
/* ========================================================================== */

const LearnResult: React.FC<{ data: LearnModeResult }> = ({ data }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const quiz = useMemo(() => data.quiz || [], [data.quiz]);
  const [card, setCard] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  // A new result is a new deck. Carrying answers across would show a tick
  // against a question that has not been asked yet.
  useEffect(() => {
    setCard(0);
    setAnswers({});
  }, [data]);

  const question = quiz[card];
  const picked = answers[card];
  const answered = picked !== undefined;

  const choose = (option: number) => {
    if (answered) return;
    setAnswers((prev) => ({ ...prev, [card]: option }));
    if (quiz[card]?.answerIndex === option) award('quizCorrect');
  };

  return (
    <View>
      {data.summary ? (
        <View style={styles.summaryCard}>
          <Text variant="kicker" color={COLORS.magenta}>
            The short version
          </Text>
          <BionicText text={data.summary} variant="body" style={{ marginTop: SPACING.xs }} />
        </View>
      ) : null}

      {data.mindMap?.branches?.length ? (
        <View style={styles.block}>
          <Text variant="bodySm" weight="bold" style={styles.blockTitle}>
            {data.mindMap.rootNode || 'The shape of it'}
          </Text>
          {data.mindMap.branches.map((branch, index) => (
            <View key={`branch-${index}`} style={styles.outlineBranch}>
              <Text variant="bodySm" weight="semibold" color={COLORS.magenta}>
                {branch.topic}
              </Text>
              {(branch.details || []).map((detail, di) => (
                <View key={`detail-${di}`} style={styles.outlineDetail}>
                  <Text variant="caption" color={COLORS.textSubtle}>
                    ·
                  </Text>
                  <Text variant="caption" color={COLORS.textMuted} style={{ flex: 1, marginLeft: 6 }}>
                    {detail}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {/* One card at a time. A page of eight questions is eight things to hold
          at once; the dots say how much is left without making you read it. */}
      {question ? (
        <View style={styles.deck}>
          <View style={styles.deckHeader}>
            <Text variant="bodySm" weight="bold">
              Check yourself
            </Text>
            <View style={styles.dots}>
              {quiz.map((_, index) => (
                <View
                  key={`dot-${index}`}
                  style={[
                    styles.dot,
                    index === card ? styles.dotCurrent : null,
                    answers[index] !== undefined ? styles.dotAnswered : null,
                  ]}
                />
              ))}
            </View>
          </View>

          <Text variant="body" weight="semibold" style={styles.question}>
            {question.question}
          </Text>

          {(question.options || []).map((option, index) => {
            const isPicked = picked === index;
            const isRight = index === question.answerIndex;
            const reveal = answered && (isPicked || isRight);

            return (
              <TouchableOpacity
                key={`option-${index}`}
                activeOpacity={0.8}
                onPress={() => choose(index)}
                disabled={answered}
                style={[
                  styles.option,
                  reveal ? (isRight ? styles.optionRight : styles.optionWrong) : null,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isPicked, disabled: answered }}
                accessibilityLabel={option}
              >
                {reveal ? (
                  isRight ? (
                    <CircleCheck size={15} color={COLORS.success} />
                  ) : (
                    <Circle size={15} color={COLORS.magenta} />
                  )
                ) : (
                  <Circle size={15} color={COLORS.textSubtle} />
                )}
                <Text
                  variant="bodySm"
                  color={reveal ? (isRight ? COLORS.success : COLORS.magenta) : COLORS.text}
                  weight={reveal && isRight ? 'semibold' : 'normal'}
                  style={{ flex: 1, marginLeft: SPACING.sm }}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}

          {answered && question.explanation ? (
            <View style={styles.explain}>
              <Text variant="caption" color={COLORS.textMuted}>
                {question.explanation}
              </Text>
            </View>
          ) : null}

          <View style={styles.deckNav}>
            <TouchableOpacity
              style={styles.deckBtn}
              onPress={() => setCard((prev) => Math.max(0, prev - 1))}
              disabled={card === 0}
              accessibilityRole="button"
              accessibilityLabel="Previous question"
              accessibilityState={{ disabled: card === 0 }}
            >
              <ChevronLeft size={16} color={card === 0 ? COLORS.textSubtle : COLORS.cyan} />
              <Text variant="caption" color={card === 0 ? COLORS.textSubtle : COLORS.cyan}>
                Back
              </Text>
            </TouchableOpacity>

            <Text variant="caption" color={COLORS.textMuted}>
              {card + 1} of {quiz.length}
            </Text>

            <TouchableOpacity
              style={styles.deckBtn}
              onPress={() => setCard((prev) => Math.min(quiz.length - 1, prev + 1))}
              disabled={card >= quiz.length - 1}
              accessibilityRole="button"
              accessibilityLabel="Next question"
              accessibilityState={{ disabled: card >= quiz.length - 1 }}
            >
              <Text
                variant="caption"
                color={card >= quiz.length - 1 ? COLORS.textSubtle : COLORS.cyan}
              >
                Next
              </Text>
              <ChevronRight
                size={16}
                color={card >= quiz.length - 1 ? COLORS.textSubtle : COLORS.cyan}
              />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
};

/* ========================================================================== */
/* Meet — the ledger                                                          */
/* ========================================================================== */

const MeetResult: React.FC<{ data: MeetModeResult }> = ({ data }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const [done, setDone] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else {
        next.add(index);
        award('stepChecked');
      }
      return next;
    });
  };

  return (
    <View>
      {data.summary ? (
        <Text variant="body" style={styles.lede}>
          {data.summary}
        </Text>
      ) : null}

      {data.actionItems?.length ? (
        <View style={styles.ledger}>
          <View style={styles.ledgerHead}>
            <Text variant="caption" weight="bold" color={COLORS.textMuted} style={{ flex: 1 }}>
              WHAT
            </Text>
            <Text variant="caption" weight="bold" color={COLORS.textMuted} style={styles.ledgerWho}>
              WHO
            </Text>
          </View>

          {data.actionItems.map((item, index) => {
            const ticked = done.has(index);
            return (
              <TouchableOpacity
                key={`action-${index}`}
                activeOpacity={0.75}
                onPress={() => toggle(index)}
                style={styles.ledgerRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ticked }}
                accessibilityLabel={`${item.task}. Owner ${item.owner}. Due ${item.deadline}. Priority ${item.priority}.`}
              >
                <View style={[styles.tickBox, ticked ? styles.tickBoxOn : null]}>
                  {ticked ? <Check size={13} color={COLORS.textInverse} /> : null}
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    variant="bodySm"
                    weight="semibold"
                    color={ticked ? COLORS.textSubtle : COLORS.text}
                    style={ticked ? styles.struck : undefined}
                  >
                    {item.task}
                  </Text>
                  <Text variant="caption" color={COLORS.textMuted}>
                    due {item.deadline}
                  </Text>
                </View>

                <View style={styles.ledgerWho}>
                  <Text variant="caption" weight="semibold" numberOfLines={1}>
                    {item.owner}
                  </Text>
                  {/* The priority enum stays in English by contract — the
                      badge switches on the literal string. */}
                  <Text
                    variant="caption"
                    color={item.priority === 'High' ? COLORS.magenta : COLORS.textSubtle}
                  >
                    {item.priority}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {data.keyDecisions?.length ? (
        <View style={styles.block}>
          <Text variant="bodySm" weight="bold" style={styles.blockTitle}>
            What was decided
          </Text>
          {data.keyDecisions.map((decision, index) => (
            <View key={`decision-${index}`} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: COLORS.cyan }]} />
              <Text variant="bodySm" style={{ flex: 1 }}>
                {decision}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {data.jargonDecoded?.length ? (
        <View style={styles.block}>
          <Text variant="bodySm" weight="bold" style={styles.blockTitle}>
            Words they used
          </Text>
          {data.jargonDecoded.map((entry, index) => (
            <View key={`jargon-${index}`} style={styles.jargonRow}>
              <Text variant="bodySm" weight="semibold" color={COLORS.cyan}>
                {entry.term}
              </Text>
              <Text variant="caption" color={COLORS.textMuted}>
                {entry.plainMeaning}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

/* ========================================================================== */
/* Practice — the rehearsal room                                              */
/* ========================================================================== */

const PracticeResult: React.FC<{ data: PracticeModeResult }> = ({ data }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const responses = data.suggestedResponses || [];
  const [tone, setTone] = useState(0);

  useEffect(() => setTone(0), [data]);

  const chosen = responses[tone];

  return (
    <View>
      {data.scenarioContext ? (
        <Text variant="bodySm" color={COLORS.textMuted} style={styles.lede}>
          {data.scenarioContext}
        </Text>
      ) : null}

      {/* Laid out as the conversation itself: their line arrives from the left,
          yours goes out to the right. Reading a script as a list of quoted
          paragraphs loses the thing that makes rehearsal work — knowing which
          part is yours to say. */}
      {data.openingLine ? (
        <View style={styles.incoming}>
          <Quote size={13} color={COLORS.textSubtle} />
          <Text variant="bodySm" style={{ marginTop: 4 }}>
            {data.openingLine}
          </Text>
          <Text variant="caption" color={COLORS.textSubtle} style={{ marginTop: 4 }}>
            they open
          </Text>
        </View>
      ) : null}

      {responses.length ? (
        <View style={styles.toneRow}>
          {responses.map((response, index) => (
            <TouchableOpacity
              key={`tone-${index}`}
              onPress={() => setTone(index)}
              activeOpacity={0.8}
              style={[styles.toneChip, tone === index ? styles.toneChipOn : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected: tone === index }}
              accessibilityLabel={`${response.tone} tone`}
            >
              <Text
                variant="caption"
                weight={tone === index ? 'bold' : 'normal'}
                color={tone === index ? COLORS.magentaDark : COLORS.textMuted}
              >
                {response.tone}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {chosen ? (
        <View style={styles.outgoing}>
          <BionicText text={chosen.text} variant="body" color={COLORS.text} />
          <Text variant="caption" color={COLORS.magentaDark} style={{ marginTop: 6 }}>
            you say
          </Text>
        </View>
      ) : null}

      {data.coachingTip ? (
        <View style={styles.aside}>
          <Lightbulb size={14} color={COLORS.magenta} />
          <Text variant="caption" color={COLORS.textMuted} style={styles.asideText}>
            {data.coachingTip}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

/* ========================================================================== */
/* Write — the copy desk                                                      */
/* ========================================================================== */

const WriteResult: React.FC<{ data: WriteModeResult }> = ({ data }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  return (
    <View>
      {data.originalGradeLevel ? (
        <View style={styles.gradeRow}>
          <Tag label={`Your draft reads at ${data.originalGradeLevel}`} variant="yellow" />
        </View>
      ) : null}

      <View style={styles.manuscript}>
        <BionicText text={data.improvedText || ''} variant="bodyLg" />
      </View>

      {data.clarityFixes?.length ? (
        <View style={styles.block}>
          <Text variant="bodySm" weight="bold" style={styles.blockTitle}>
            What changed, and why
          </Text>
          {data.clarityFixes.map((fix, index) => (
            <View key={`fix-${index}`} style={styles.fix}>
              <Text variant="caption" color={COLORS.textSubtle} style={styles.struck}>
                {fix.originalSnippet}
              </Text>
              <View style={styles.fixArrow}>
                <ArrowRight size={12} color={COLORS.yellowDark} />
                <Text variant="bodySm" style={{ flex: 1, marginLeft: 6 }}>
                  {fix.suggestedSnippet}
                </Text>
              </View>
              <Text variant="caption" color={COLORS.textMuted} style={styles.margin}>
                {fix.reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {data.passiveVoiceInstances?.length ? (
        <View style={styles.block}>
          <Text variant="bodySm" weight="bold" style={styles.blockTitle}>
            Sentences where the doer went missing
          </Text>
          {data.passiveVoiceInstances.map((instance, index) => (
            <View key={`passive-${index}`} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: COLORS.yellow }]} />
              <Text variant="caption" color={COLORS.textMuted} style={{ flex: 1 }}>
                {instance}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

/* ========================================================================== */
/* Guide — the trail                                                          */
/* ========================================================================== */

const GuideResult: React.FC<{ data: GuideModeResult }> = ({ data }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const [at, setAt] = useState(0);

  const steps = data.steps || [];
  useEffect(() => setAt(0), [data]);

  return (
    <View>
      {data.workflowName ? (
        <Text variant="titleSm" weight="bold" style={styles.lede}>
          {data.workflowName}
        </Text>
      ) : null}

      <View style={styles.trail}>
        {steps.map((step, index) => {
          const passed = index < at;
          const here = index === at;

          return (
            <TouchableOpacity
              key={`station-${index}`}
              activeOpacity={0.8}
              onPress={() => setAt(index)}
              style={styles.station}
              accessibilityRole="button"
              accessibilityState={{ selected: here }}
              accessibilityLabel={`Step ${step.stepNumber || index + 1}: ${step.title}${here ? '. You are here.' : ''}`}
            >
              {/* The rail, drawn behind the marker so the line reads as
                  continuous rather than as a column of dots. */}
              <View style={styles.stationRail}>
                {index > 0 ? (
                  <View style={[styles.railSegment, passed || here ? styles.railSegmentOn : null]} />
                ) : (
                  <View style={styles.railSegment} />
                )}
                <View
                  style={[
                    styles.marker,
                    passed ? styles.markerPassed : null,
                    here ? styles.markerHere : null,
                  ]}
                >
                  {passed ? (
                    <Check size={11} color={COLORS.textInverse} />
                  ) : (
                    <Text
                      variant="caption"
                      weight="bold"
                      color={here ? COLORS.textInverse : COLORS.textMuted}
                    >
                      {step.stepNumber || index + 1}
                    </Text>
                  )}
                </View>
                {index < steps.length - 1 ? (
                  <View style={[styles.railSegment, passed ? styles.railSegmentOn : null]} />
                ) : (
                  <View style={styles.railSegment} />
                )}
              </View>

              <View style={[styles.stationBody, here ? styles.stationBodyHere : null]}>
                <Text variant="bodySm" weight={here ? 'bold' : 'semibold'}>
                  {step.title}
                </Text>
                {here ? (
                  <>
                    <Text variant="bodySm" color={COLORS.text} style={{ marginTop: 4 }}>
                      {step.actionRequired}
                    </Text>
                    {step.tip ? (
                      <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 6 }}>
                        {step.tip}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {at < steps.length - 1 ? (
        <TouchableOpacity
          style={styles.trailNext}
          onPress={() => {
            setAt((prev) => Math.min(steps.length - 1, prev + 1));
            award('stepChecked');
          }}
          accessibilityRole="button"
          accessibilityLabel="I have done this one — move to the next step"
        >
          <Check size={15} color={COLORS.textInverse} />
          <Text variant="bodySm" weight="bold" color={COLORS.textInverse} style={{ marginLeft: 8 }}>
            Done — what is next?
          </Text>
        </TouchableOpacity>
      ) : steps.length ? (
        <View style={styles.trailEnd}>
          <Text variant="bodySm" weight="semibold" color={COLORS.success}>
            That is the last step.
          </Text>
        </View>
      ) : null}
    </View>
  );
};

/* ========================================================================== */
/* Chunk — three steps, never more                                            */
/* ========================================================================== */

const ChunkResult: React.FC<{ data: ChunkedTaskResult }> = ({ data }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const [done, setDone] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else {
        next.add(index);
        award('stepChecked');
      }
      return next;
    });
  };

  return (
    <View>
      {data.whatThisPageIsFor ? (
        <Text variant="body" style={styles.lede}>
          {data.whatThisPageIsFor}
        </Text>
      ) : null}

      <View style={styles.gradeRow}>
        {data.estimatedMinutes ? (
          <Tag label={`About ${data.estimatedMinutes} minutes`} variant="cyan" />
        ) : null}
      </View>

      {data.thingsToHaveReady?.length ? (
        <View style={styles.readyBox}>
          <Text variant="caption" weight="bold" color={COLORS.yellowDark}>
            Have this to hand first
          </Text>
          {data.thingsToHaveReady.map((thing, index) => (
            <View key={`ready-${index}`} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: COLORS.yellow }]} />
              <Text variant="bodySm" style={{ flex: 1 }}>
                {thing}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {(data.steps || []).map((step, index) => {
        const ticked = done.has(index);
        return (
          <TouchableOpacity
            key={`chunk-${index}`}
            activeOpacity={0.85}
            onPress={() => toggle(index)}
            style={[styles.chunkCard, ticked ? styles.chunkCardDone : null]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ticked }}
            accessibilityLabel={`Step ${index + 1}: ${step.title}. ${step.what}`}
          >
            <View style={styles.chunkTop}>
              <View style={[styles.chunkNumber, ticked ? styles.chunkNumberDone : null]}>
                {ticked ? (
                  <Check size={13} color={COLORS.textInverse} />
                ) : (
                  <Text variant="caption" weight="bold" color={COLORS.textInverse}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                variant="bodySm"
                weight="bold"
                style={[{ flex: 1 }, ticked ? styles.struck : null]}
              >
                {step.title}
              </Text>
            </View>
            <Text variant="bodySm" style={{ marginTop: SPACING.sm }}>
              {step.what}
            </Text>
            {step.why ? (
              <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 6 }}>
                {step.why}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}

      {data.encouragement ? (
        <View style={styles.aside}>
          <Lightbulb size={14} color={COLORS.cyan} />
          <Text variant="caption" color={COLORS.textMuted} style={styles.asideText}>
            {data.encouragement}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

/* ========================================================================== */
/* Dispatcher                                                                 */
/* ========================================================================== */

export type ModeResultKey = CognitiveModeKey | 'chunk';

export interface ModeResultProps {
  mode: ModeResultKey;
  result: any;
  /** What the reader pasted in. Only Simplify shows it, for comparison. */
  input?: string;
}

export const ModeResult: React.FC<ModeResultProps> = ({ mode, result, input = '' }) => {
  if (!result) return null;

  switch (mode) {
    case 'start':
      return <StartResult data={result as StartModeResult} />;
    case 'simplify':
      return <SimplifyResult data={result as SimplifyModeResult} input={input} />;
    case 'learn':
      return <LearnResult data={result as LearnModeResult} />;
    case 'meet':
      return <MeetResult data={result as MeetModeResult} />;
    case 'practice':
      return <PracticeResult data={result as PracticeModeResult} />;
    case 'write':
      return <WriteResult data={result as WriteModeResult} />;
    case 'guide':
      return <GuideResult data={result as GuideModeResult} />;
    case 'numbers':
      return (
        <NumberStory
          data={result as NumbersModeResult}
          onSolved={() => award('numbersSolved')}
        />
      );
    case 'chunk':
      return <ChunkResult data={result as ChunkedTaskResult} />;
    default:
      return null;
  }
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    lede: {
      marginBottom: SPACING.lg,
    },
    block: {
      marginTop: SPACING.xl,
    },
    blockTitle: {
      marginBottom: SPACING.sm,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    bullet: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      marginTop: 8,
    },
    aside: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: SPACING.xl,
      padding: SPACING.md,
      backgroundColor: t.surface,
      borderRadius: RADIUS.md,
      borderLeftWidth: 2,
      borderLeftColor: t.cyanBorder,
    },
    asideText: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
    struck: {
      textDecorationLine: 'line-through',
    },
    gradeRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },

    /* Start */
    ignition: {
      backgroundColor: t.yellowLight,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      padding: SPACING.lg,
    },
    ignitionTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    ignitionClock: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 'auto',
    },
    ignitionAction: {
      marginTop: SPACING.sm,
      fontWeight: '700',
    },
    meterRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    ladder: {
      marginTop: SPACING.xl,
    },
    ladderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    rail: {
      height: 3,
      backgroundColor: t.dividerSubtle,
      borderRadius: 2,
      marginBottom: SPACING.md,
      overflow: 'hidden',
    },
    railFill: {
      height: 3,
      backgroundColor: t.success,
    },
    rung: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: t.dividerSubtle,
      gap: SPACING.md,
      minHeight: 48,
    },
    tickBox: {
      width: 22,
      height: 22,
      borderRadius: RADIUS.sm,
      borderWidth: 1.5,
      borderColor: t.divider,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    tickBoxOn: {
      backgroundColor: t.success,
      borderColor: t.success,
    },

    /* Simplify */
    plainPanel: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.cyan,
      padding: SPACING.lg,
    },
    foldToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingVertical: SPACING.md,
      minHeight: 44,
    },
    originalPanel: {
      backgroundColor: t.bg,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.md,
    },

    /* Learn */
    summaryCard: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.magenta,
      padding: SPACING.lg,
    },
    outlineBranch: {
      marginBottom: SPACING.md,
      paddingLeft: SPACING.md,
      borderLeftWidth: 1,
      borderLeftColor: t.dividerSubtle,
    },
    outlineDetail: {
      flexDirection: 'row',
      marginTop: 3,
    },
    deck: {
      marginTop: SPACING.xl,
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.lg,
    },
    deckHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    dots: {
      flexDirection: 'row',
      gap: 5,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: t.divider,
    },
    dotAnswered: {
      backgroundColor: t.cyanBorder,
    },
    dotCurrent: {
      backgroundColor: t.magenta,
    },
    question: {
      marginBottom: SPACING.md,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      backgroundColor: t.bg,
      marginBottom: SPACING.sm,
      minHeight: 48,
    },
    optionRight: {
      borderColor: t.success,
      backgroundColor: t.successLight,
    },
    optionWrong: {
      borderColor: t.magenta,
      backgroundColor: t.magentaLight,
    },
    explain: {
      backgroundColor: t.bg,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginTop: SPACING.xs,
    },
    deckNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.md,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: t.dividerSubtle,
    },
    deckBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minHeight: 44,
      paddingHorizontal: SPACING.sm,
    },

    /* Meet */
    ledger: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      overflow: 'hidden',
    },
    ledgerHead: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: t.surfaceAlt,
      gap: SPACING.md,
    },
    ledgerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: t.dividerSubtle,
      gap: SPACING.md,
      minHeight: 56,
    },
    ledgerWho: {
      width: 88,
      alignItems: 'flex-end',
    },
    jargonRow: {
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: t.dividerSubtle,
    },

    /* Practice */
    incoming: {
      alignSelf: 'flex-start',
      maxWidth: '92%',
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderBottomLeftRadius: 2,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.md,
    },
    toneRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
      marginVertical: SPACING.md,
    },
    toneChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      backgroundColor: t.surface,
      minHeight: 40,
      justifyContent: 'center',
    },
    toneChipOn: {
      backgroundColor: t.magentaLight,
      borderColor: t.magenta,
    },
    outgoing: {
      alignSelf: 'flex-end',
      maxWidth: '92%',
      backgroundColor: t.magentaLight,
      borderRadius: RADIUS.lg,
      borderBottomRightRadius: 2,
      borderWidth: 1,
      borderColor: t.magentaLight,
      padding: SPACING.md,
    },

    /* Write */
    manuscript: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.yellow,
      padding: SPACING.lg,
    },
    fix: {
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: t.dividerSubtle,
    },
    fixArrow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 4,
    },
    margin: {
      marginTop: 6,
      paddingLeft: SPACING.md,
      borderLeftWidth: 2,
      borderLeftColor: t.dividerSubtle,
      fontStyle: 'italic',
    },

    /* Guide */
    trail: {
      marginTop: SPACING.sm,
    },
    station: {
      flexDirection: 'row',
      alignItems: 'stretch',
      minHeight: 56,
    },
    stationRail: {
      width: 32,
      alignItems: 'center',
    },
    railSegment: {
      width: 2,
      flex: 1,
      backgroundColor: t.dividerSubtle,
    },
    railSegmentOn: {
      backgroundColor: t.cyanBorder,
    },
    marker: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: t.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.divider,
    },
    markerPassed: {
      backgroundColor: t.success,
      borderColor: t.success,
    },
    markerHere: {
      backgroundColor: t.cyan,
      borderColor: t.cyan,
    },
    stationBody: {
      flex: 1,
      paddingVertical: SPACING.md,
      paddingLeft: SPACING.md,
      justifyContent: 'center',
    },
    stationBodyHere: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      marginVertical: SPACING.xs,
    },
    trailNext: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cyan,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.md,
      marginTop: SPACING.lg,
      minHeight: 48,
    },
    trailEnd: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
    },

    /* Chunk */
    readyBox: {
      backgroundColor: t.yellowLight,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    chunkCard: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.lg,
      marginBottom: SPACING.md,
    },
    chunkCardDone: {
      backgroundColor: t.bg,
      borderColor: t.dividerSubtle,
    },
    chunkTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    chunkNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: t.cyan,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chunkNumberDone: {
      backgroundColor: t.success,
    },
  });
