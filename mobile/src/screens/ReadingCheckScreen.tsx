/**
 * SETU Mobile — Reading Check.
 *
 * The one place in the product that measures something rather than transforming
 * it. Everything else takes text and makes it easier to read; this asks how the
 * reading is actually going, and it is the feature a teacher or a parent can act
 * on without understanding anything else in the app.
 *
 * WHAT IT CLAIMS, AND WHAT IT REFUSES TO CLAIM
 * --------------------------------------------
 * It produces one of three bands — no concerns, worth watching, worth a
 * professional assessment. No percentage, no score out of anything, no reading
 * age, and the word "dyslexia" appears in no result. That is a deliberate line:
 * a tool that outputs a diagnosis is regulated Medical Device Software under
 * CDSCO's function-based guidance. What this claims is that a teacher can find
 * the few children in a class who should see someone, which is both defensible
 * and the thing that is actually needed.
 *
 * The disclaimer comes from the server and is rendered verbatim on every result.
 * It is not a checkbox — it is the sentence that keeps this an educational
 * screener.
 *
 * THE ACCOMMODATIONS ARE TURNED OFF FOR THE PASSAGE. THIS IS THE POINT.
 * --------------------------------------------------------------------
 * Every other screen renders text through the reader's own settings — widened
 * letter spacing, their typeface, their size. Here the passage is shown in plain
 * unmodified type, because the measurement is of unaided reading. Scoring a
 * child on spaced text and banding them against norms collected on ordinary text
 * would produce a number that means nothing, and it would mean nothing in the
 * flattering direction, which is worse. The size still scales, because a
 * passage nobody can physically see is not a measurement either.
 *
 * WHERE THE SCORING HAPPENS
 * -------------------------
 * On the server, always. The client sends a transcript and a duration and
 * renders what comes back; it never decides a band. Band boundaries and the
 * regulatory wording then live in one place and a correction reaches every
 * surface at once, rather than waiting on an app store review — which for a
 * number shown to a parent about their child is the difference that matters.
 *
 * THE TRANSCRIPT IS NOT KEPT BY DEFAULT
 * -------------------------------------
 * A recording of a child reading is recoverable content about a minor, and every
 * number has already been computed from it by the time it could be stored. So
 * `keepTranscript` stays false unless someone deliberately turns it on, and the
 * screen says what that choice means in the sentence next to the switch rather
 * than in a policy nobody opens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Text as RawText,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Info,
  Mic,
  RefreshCw,
  Square,
  X,
} from 'lucide-react-native';

import { RADIUS, SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { api } from '../services/api';
import { READING_PROBE_MAX_MS, useReadingRecorder } from '../services/stt';
import {
  ReadingBand,
  ReadingCheckResult,
  ReadingSeriesPoint,
  ReadingStimulus,
} from '../types';
import { Text, Heading, Kicker, Subheading } from '../components/Typography';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { ReadingProgressChart } from '../components/ReadingProgressChart';

type Stage = 'intro' | 'reading' | 'questions' | 'result';

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Band colours.
 *
 * Deliberately not a traffic light. "Worth a professional assessment" is not a
 * failure and must not be coloured like one — the amber/red pairing invites a
 * parent to read a referral as bad news about their child, when the whole
 * message of the copy is that it is a question worth answering. Cyan carries the
 * flagged band because it is the app's own attention colour rather than an alarm
 * colour, and the wording does the rest.
 */
const bandTint = (band: ReadingBand | null, t: Palette): string => {
  if (band === 'worth-assessment') return t.cyan;
  if (band === 'worth-watching') return t.yellowDark;
  return t.success;
};

const seconds = (ms: number) => Math.floor(ms / 1000);

export const ReadingCheckScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language, sizeScale } = useAccessibility();
  const { width } = useWindowDimensions();

  const [stage, setStage] = useState<Stage>('intro');
  const [grade, setGrade] = useState(4);
  const [learnerLabel, setLearnerLabel] = useState('');
  const [keepTranscript, setKeepTranscript] = useState(false);

  const [stimulus, setStimulus] = useState<ReadingStimulus | null>(null);
  const [loadingStimulus, setLoadingStimulus] = useState(false);
  const [result, setResult] = useState<ReadingCheckResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [take, setTake] = useState<{ transcript: string; durationMs: number } | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);

  const [series, setSeries] = useState<ReadingSeriesPoint[]>([]);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  const loadHistory = useCallback(async () => {
    const history = await api.readingHistory('oral-reading');
    if (history) {
      setSeries(history.series || []);
      setDbConnected(Boolean(history.dbConnected));
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const fetchStimulus = useCallback(async () => {
    setLoadingStimulus(true);
    setError(null);
    const data = await api.readingStimuli({ language, grade, task: 'oral-reading' });
    setLoadingStimulus(false);

    if (!data || !data.text) {
      setError(
        'Could not fetch a passage. The reading check needs the engine — it hands out the passage and does the scoring.'
      );
      return;
    }
    setStimulus(data as ReadingStimulus);
    setAnswers(new Array((data.questions || []).length).fill(false));
    setTake(null);
    setResult(null);
    setStage('reading');
  }, [grade, language]);

  const onTake = useCallback((completed: { transcript: string; durationMs: number }) => {
    setTake(completed);
  }, []);

  const recorder = useReadingRecorder(onTake);

  /*
   * Move on the moment a take lands, rather than making the reader press a
   * second button to confirm something they already finished. If the passage
   * carried comprehension questions they come next; otherwise score straight
   * away.
   */
  useEffect(() => {
    if (!take || !stimulus) return;
    if ((stimulus.questions || []).length > 0) {
      setStage('questions');
    } else {
      submit(take, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take]);

  const submit = async (
    completed: { transcript: string; durationMs: number },
    comprehension: { correct: number; total: number } | null
  ) => {
    if (!stimulus) return;
    setScoring(true);
    setError(null);

    try {
      const response = await api.submitReadingCheck({
        task: 'oral-reading',
        type: 'probe',
        language: stimulus.language,
        grade,
        learnerLabel: learnerLabel.trim(),
        stimulusId: stimulus.stimulusId,
        passage: stimulus.text,
        transcript: completed.transcript,
        durationMs: completed.durationMs,
        comprehensionCorrect: comprehension?.correct,
        comprehensionTotal: comprehension?.total,
        keepTranscript,
      });

      setResult(response.result as ReadingCheckResult);
      setStage('result');
      loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Could not score that reading.');
      setStage('reading');
    } finally {
      setScoring(false);
    }
  };

  const restart = () => {
    setStage('intro');
    setStimulus(null);
    setTake(null);
    setResult(null);
    setError(null);
  };

  const remaining = Math.max(0, seconds(READING_PROBE_MAX_MS - recorder.elapsedMs));

  /* ------------------------------------------------------------------ */

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        <ArrowLeft size={20} color={COLORS.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Kicker color={COLORS.cyan}>How is the reading going?</Kicker>
        <Heading variant="titleLg">Reading Check</Heading>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {header}

        {error ? (
          <Card plateColor={COLORS.magenta} style={{ marginBottom: SPACING.md }}>
            <Text variant="bodySm" color={COLORS.magenta} accessibilityLiveRegion="polite">
              {error}
            </Text>
          </Card>
        ) : null}

        {/* ---------------------------------------------------------- */}
        {stage === 'intro' ? (
          <View>
            <Card style={styles.block}>
              <Text variant="body">
                One short passage, read out loud, about a minute. It gives you one of three
                answers: no concerns right now, worth watching, or worth a professional
                assessment.
              </Text>
              <Text variant="bodySm" color={COLORS.textMuted} style={{ marginTop: SPACING.sm }}>
                It is a screening tool, not a test and not a diagnosis. It cannot tell you whether
                someone has dyslexia — only a qualified professional can. What it can do is tell
                you whether that question is worth asking.
              </Text>
            </Card>

            <Subheading style={styles.label}>Reading age or school year</Subheading>
            <Text variant="caption" color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }}>
              Used to pick a passage and to compare against what is typical at that age.
            </Text>
            <View style={styles.gradeRow}>
              {GRADES.map((value) => (
                <TouchableOpacity
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: grade === value }}
                  accessibilityLabel={`Year ${value}`}
                  onPress={() => setGrade(value)}
                  style={[styles.gradeChip, grade === value && styles.gradeChipActive]}
                >
                  <Text
                    variant="bodySm"
                    weight="semibold"
                    color={grade === value ? COLORS.textInverse : COLORS.text}
                  >
                    {value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Subheading style={styles.label}>Whose reading is this? (optional)</Subheading>
            <Input
              value={learnerLabel}
              onChangeText={setLearnerLabel}
              placeholder="A name or initials"
              accessibilityLabel="Name or initials for this reading, optional"
            />
            <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 4 }}>
              Only needed if you are checking more than one person and want to keep the readings
              apart. Leave it blank otherwise.
            </Text>

            <Card style={[styles.block, { marginTop: SPACING.lg }]}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: SPACING.md }}>
                  <Text variant="bodySm" weight="semibold">
                    Keep what was read aloud
                  </Text>
                  <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 2 }}>
                    Off by default. The score is worked out from the recording either way — keeping
                    the text only matters if you want to look back at exactly which words went
                    wrong. It is stored on the server if you turn this on.
                  </Text>
                </View>
                <Switch
                  value={keepTranscript}
                  onValueChange={setKeepTranscript}
                  accessibilityLabel="Keep the text of what was read aloud"
                  trackColor={{ false: COLORS.dividerSubtle, true: COLORS.cyanLight }}
                  thumbColor={keepTranscript ? COLORS.cyan : COLORS.surfaceAlt}
                />
              </View>
            </Card>

            <Button
              title={loadingStimulus ? 'Fetching a passage…' : 'Start the check'}
              onPress={fetchStimulus}
              disabled={loadingStimulus}
              icon={<BookOpen size={18} color={COLORS.textInverse} />}
              style={{ marginTop: SPACING.lg }}
            />

            {series.length > 0 ? (
              <View style={styles.block}>
                <Kicker color={COLORS.cyan}>Over time</Kicker>
                <Subheading style={{ marginBottom: SPACING.sm }}>Previous readings</Subheading>
                <ReadingProgressChart series={series} width={width - SPACING.lg * 2 - SPACING.md * 2} />
                {dbConnected === false ? (
                  <Text variant="caption" color={COLORS.magenta} style={{ marginTop: SPACING.sm }}>
                    The engine has no database connected right now, so new readings will not be
                    here tomorrow.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ---------------------------------------------------------- */}
        {stage === 'reading' && stimulus ? (
          <View>
            <Card plateColor={COLORS.cyan} style={styles.block}>
              <Text variant="bodySm" weight="semibold">
                {stimulus.instruction}
              </Text>
              <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 4 }}>
                {stimulus.languageName} · {stimulus.wordCount} words · up to one minute
              </Text>
            </Card>

            {/*
              The passage, in plain type.
              See the file header — the reader's own spacing and typeface are
              deliberately not applied here, because the measurement is of
              unaided reading. Size still follows their setting; a passage they
              cannot see is not a measurement either.
            */}
            <View
              style={styles.passage}
              accessible
              accessibilityLabel={`Passage to read aloud. ${stimulus.text}`}
            >
              {stimulus.title ? (
                <Text variant="caption" color={COLORS.textMuted} style={{ marginBottom: 6 }}>
                  {stimulus.title}
                </Text>
              ) : null}
              <RNPlainText
                text={stimulus.text || ''}
                sizeScale={sizeScale}
                color={COLORS.text}
                rtl={stimulus.dir === 'rtl'}
              />
            </View>

            {recorder.status === 'recording' ? (
              <View style={styles.recordingBox}>
                <Text variant="titleLg" weight="bold" color={COLORS.magenta}>
                  {seconds(recorder.elapsedMs)}s
                </Text>
                <Text variant="caption" color={COLORS.textMuted}>
                  {remaining}s left · it stops on its own at a minute
                </Text>
                <Button
                  title="Finished reading"
                  onPress={recorder.stop}
                  icon={<Square size={16} color={COLORS.textInverse} />}
                  style={{ marginTop: SPACING.md, alignSelf: 'stretch' }}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Throw this recording away"
                  onPress={recorder.cancel}
                  style={styles.cancelLink}
                >
                  <X size={14} color={COLORS.textMuted} />
                  <Text variant="caption" color={COLORS.textMuted} style={{ marginLeft: 4 }}>
                    Throw it away
                  </Text>
                </TouchableOpacity>
              </View>
            ) : recorder.status === 'transcribing' || scoring ? (
              <View style={styles.recordingBox}>
                <ActivityIndicator color={COLORS.cyan} />
                <Text variant="bodySm" color={COLORS.textMuted} style={{ marginTop: SPACING.sm }}>
                  {scoring ? 'Working out the score…' : 'Listening back to the recording…'}
                </Text>
              </View>
            ) : (
              <View>
                <Button
                  title="Start reading"
                  onPress={recorder.start}
                  disabled={recorder.available === false}
                  icon={<Mic size={18} color={COLORS.textInverse} />}
                  style={{ marginTop: SPACING.md }}
                />
                {recorder.available === false ? (
                  <Text variant="caption" color={COLORS.magenta} style={{ marginTop: SPACING.sm }}>
                    The reading check needs the speech engine to hear what was read, and it is not
                    switched on right now. Nothing here can be scored without it.
                  </Text>
                ) : null}
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={fetchStimulus}
                  style={styles.cancelLink}
                >
                  <RefreshCw size={14} color={COLORS.textMuted} />
                  <Text variant="caption" color={COLORS.textMuted} style={{ marginLeft: 4 }}>
                    Try a different passage
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {recorder.error ? (
              <Text
                variant="bodySm"
                color={COLORS.magenta}
                accessibilityLiveRegion="polite"
                style={{ marginTop: SPACING.sm }}
              >
                {recorder.error}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ---------------------------------------------------------- */}
        {stage === 'questions' && stimulus ? (
          <View>
            <Card plateColor={COLORS.yellow} style={styles.block}>
              <Text variant="bodySm" weight="semibold">
                Now ask these, without letting them look back at the passage.
              </Text>
              <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 4 }}>
                Reading speed on its own does not tell you whether any of it went in. Tick the ones
                they got. Skip this if it does not apply — the check still works without it.
              </Text>
            </Card>

            {(stimulus.questions || []).map((question, index) => (
              <TouchableOpacity
                key={question}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: answers[index] }}
                accessibilityLabel={question}
                onPress={() =>
                  setAnswers((prev) => prev.map((v, i) => (i === index ? !v : v)))
                }
                style={styles.questionRow}
              >
                <View style={[styles.checkbox, answers[index] && styles.checkboxOn]}>
                  {answers[index] ? <Check size={14} color={COLORS.textInverse} /> : null}
                </View>
                <Text variant="bodySm" style={{ flex: 1 }}>
                  {question}
                </Text>
              </TouchableOpacity>
            ))}

            <Button
              title={scoring ? 'Working it out…' : 'See the result'}
              disabled={scoring}
              onPress={() =>
                take &&
                submit(take, {
                  correct: answers.filter(Boolean).length,
                  total: answers.length,
                })
              }
              icon={<ChevronRight size={18} color={COLORS.textInverse} />}
              style={{ marginTop: SPACING.lg }}
            />
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => take && submit(take, null)}
              style={styles.cancelLink}
            >
              <Text variant="caption" color={COLORS.textMuted}>
                Skip the questions
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ---------------------------------------------------------- */}
        {stage === 'result' && result ? (
          <View>
            <Card plateColor={bandTint(result.band, COLORS)} style={styles.block}>
              <Kicker color={bandTint(result.band, COLORS)}>Result</Kicker>
              <Heading variant="titleLg" style={{ marginTop: 2 }}>
                {result.bandCopy?.label || 'Result'}
              </Heading>
              <Text variant="body" style={{ marginTop: SPACING.sm }}>
                {result.bandCopy?.summary}
              </Text>
              <Text variant="bodySm" weight="semibold" style={{ marginTop: SPACING.md }}>
                {result.bandCopy?.nextStep}
              </Text>
            </Card>

            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <Text variant="titleLg" weight="bold" color={COLORS.cyan}>
                  {Math.round(result.metrics.wcpm)}
                </Text>
                <Text variant="caption" color={COLORS.textMuted}>
                  words correct per minute
                </Text>
              </View>
              <View style={styles.metric}>
                <Text variant="titleLg" weight="bold" color={COLORS.cyan}>
                  {Math.round((result.metrics.accuracy || 0) * 100)}%
                </Text>
                <Text variant="caption" color={COLORS.textMuted}>
                  of what was attempted
                </Text>
              </View>
            </View>

            {result.metrics.notReached > 0 ? (
              <Text variant="caption" color={COLORS.textMuted} style={{ marginBottom: SPACING.md }}>
                {result.metrics.notReached} words at the end were not reached in the time. Those are
                not counted as mistakes.
              </Text>
            ) : null}

            {result.metrics.missedWords && result.metrics.missedWords.length > 0 ? (
              <Card style={styles.block}>
                <Subheading style={{ marginBottom: SPACING.xs }}>Words that went wrong</Subheading>
                <Text variant="caption" color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }}>
                  Only from the part that was actually read.
                </Text>
                {result.metrics.missedWords.slice(0, 12).map((word, index) => (
                  <View key={`${word.expected}-${index}`} style={styles.missedRow}>
                    <Text variant="bodySm" weight="semibold">
                      {word.expected}
                    </Text>
                    <Text variant="bodySm" color={COLORS.textMuted}>
                      {word.read ? `read as “${word.read}”` : 'skipped'}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {/*
              Verbatim from the server, on every result, without exception.
              This sentence is what makes the whole feature an educational
              screener rather than something that needs a licence.
            */}
            <View style={styles.disclaimer}>
              <Info size={14} color={COLORS.textMuted} />
              <Text variant="caption" color={COLORS.textMuted} style={{ flex: 1, marginLeft: 6 }}>
                {result.disclaimer}
              </Text>
            </View>

            {series.length > 1 ? (
              <View style={styles.block}>
                <Kicker color={COLORS.cyan}>Over time</Kicker>
                <Subheading style={{ marginBottom: SPACING.sm }}>Reading speed</Subheading>
                <ReadingProgressChart series={series} width={width - SPACING.lg * 2} />
              </View>
            ) : (
              <Text variant="bodySm" color={COLORS.textMuted} style={{ marginTop: SPACING.md }}>
                One reading is a snapshot. Check again in four to six weeks — the shape of the
                change tells you far more than any single number here.
              </Text>
            )}

            <Button
              title="Do another check"
              variant="secondary"
              onPress={restart}
              style={{ marginTop: SPACING.lg }}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

/**
 * The passage itself, rendered outside the accessible Typography component.
 *
 * Everything else in the app goes through `Text` from components/Typography,
 * which applies the reader's letter spacing and typeface. That is exactly what
 * must not happen to a passage being scored — see the file header. This is the
 * only text in SETU rendered deliberately unaided, and it is a separate
 * component so that nobody later "fixes the inconsistency" by routing it back
 * through the themed one.
 */
const RNPlainText: React.FC<{
  text: string;
  sizeScale: number;
  color: string;
  rtl: boolean;
}> = ({ text, sizeScale, color, rtl }) => {
  return (
    <RawText
      style={{
        fontSize: Math.round(18 * sizeScale),
        lineHeight: Math.round(18 * sizeScale * 1.6),
        color,
        letterSpacing: 0,
        writingDirection: rtl ? 'rtl' : 'ltr',
        textAlign: rtl ? 'right' : 'left',
      }}
    >
      {text}
    </RawText>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: t.bg,
    },
    scroll: {
      padding: SPACING.lg,
      paddingBottom: SPACING.huge,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -SPACING.sm,
      marginRight: SPACING.xs,
    },
    block: {
      marginTop: SPACING.lg,
      marginBottom: SPACING.xs,
    },
    label: {
      marginTop: SPACING.lg,
      marginBottom: 2,
    },
    gradeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    gradeChip: {
      minWidth: 44,
      minHeight: 44,
      paddingHorizontal: SPACING.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      backgroundColor: t.surface,
    },
    gradeChipActive: {
      backgroundColor: t.cyan,
      borderColor: t.cyan,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    passage: {
      marginTop: SPACING.lg,
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
    },
    recordingBox: {
      marginTop: SPACING.lg,
      padding: SPACING.lg,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      alignItems: 'center',
    },
    cancelLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      marginTop: SPACING.xs,
    },
    questionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: t.dividerSubtle,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: RADIUS.sm,
      borderWidth: 2,
      borderColor: t.divider,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.sm,
    },
    checkboxOn: {
      backgroundColor: t.cyan,
      borderColor: t.cyan,
    },
    metricRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginTop: SPACING.md,
      marginBottom: SPACING.md,
    },
    metric: {
      flex: 1,
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
    },
    missedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: t.dividerSubtle,
    },
    disclaimer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: SPACING.md,
      padding: SPACING.sm,
      borderRadius: RADIUS.sm,
      backgroundColor: t.surfaceAlt,
    },
  });
