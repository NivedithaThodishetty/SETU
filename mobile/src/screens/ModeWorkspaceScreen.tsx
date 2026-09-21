/**
 * SETU Mobile — one tool, the whole screen.
 *
 * Every cognitive mode used to share a single screen behind a horizontal strip
 * of eight tabs. The strip cost a row of vertical space on a phone, it put
 * seven things you are not doing next to the one you are, and it meant the
 * answer always appeared below the fold. Giving a tool the screen it needs is
 * the cheapest calm there is.
 *
 * The composer collapses once an answer arrives. What somebody wants after
 * running Simplify is the rewrite, not the box they pasted into — and a
 * six-line textarea sitting above the result pushes it off the screen. It is
 * one tap to bring back.
 *
 * A failed run never silently shows the worked example. Reading somebody else's
 * answer as if it were yours is the worst possible outcome for a reader who
 * cannot easily evaluate text, so the error says what happened and keeps what
 * was typed.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Sparkles,
  Volume2,
  VolumeX,
  Copy,
  Share2,
  Info,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Replace,
  Check,
} from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { ModeResult, ModeResultKey } from '../components/modes/ModeResults';
import { MODES, ModeDefinition, modeFor } from '../constants/modeCatalog';
import { api } from '../services/api';
import { tts } from '../services/tts';
import { award } from '../services/progress';
import { saveSummaryAndSync } from '../services/storage';
import { copyToClipboard, modeResultToMarkdown, shareText } from '../services/exportUtils';
import { CognitiveModeKey } from '../types';

/**
 * The task chunker, brought over from the extension.
 *
 * It is not one of the eight cognitive modes — it has no schema of its own on
 * the modes route and answers from `/api/agent/chunk` — but from the reader's
 * side it is the same shape of thing, so it gets the same workspace rather than
 * a screen of its own.
 */
const CHUNK_TOOL: ModeDefinition = {
  key: 'chunk' as CognitiveModeKey,
  name: 'Three steps',
  problem: 'The whole of this is too much',
  tagline: 'Never more than three at a time',
  blurb:
    'Takes something long — a form, a process, a page you have to get through — and gives you exactly three steps, plus what to have ready first.',
  icon: ListChecks,
  plate: 'cyan',
  verb: 'Break it into three',
  fieldLabel: 'Paste the thing, or describe what you have to get through',
  placeholder: 'Paste the form instructions, the process, or the page text…',
  rows: 6,
  keywords: 'chunk break down overwhelm three steps form process',
  workedExample: {
    pageName: 'Renewing a passport',
    whatThisPageIsFor:
      'This asks for your existing passport details, some proof of address, and a payment, then books you an appointment.',
    estimatedMinutes: 12,
    thingsToHaveReady: ['Your current passport', 'A recent utility bill or bank statement'],
    steps: [
      {
        title: 'Read only the first section',
        what: 'Read the part that asks who you are. Ignore everything below it for now.',
        why: 'Seeing one section at a time keeps the page from feeling like a wall.',
      },
      {
        title: 'Fill in what you already know',
        what: 'Type in the answers you can give without looking anything up. Skip the rest.',
        why: 'The easy fields build momentum, and they make the hard ones look smaller.',
      },
      {
        title: 'Go back for the gaps, then submit',
        what: 'Now find the two or three things you skipped, fill them, and submit.',
        why: 'One deliberate pass at the end catches mistakes without slowing you down.',
      },
    ],
    encouragement: 'Twelve minutes, three passes. You do not have to hold the whole form at once.',
  },
};

const ALL_TOOLS: ModeDefinition[] = [...MODES, CHUNK_TOOL];

function toolFor(key?: string | null): ModeDefinition {
  if (key === 'chunk') return CHUNK_TOOL;
  return modeFor(key);
}

/**
 * What gets read aloud for a given answer.
 *
 * Each mode has one thing that is actually the answer — the rewrite, the
 * script, the first action — and reading the whole structure aloud buries it.
 * A reader whose accommodation *is* the audio should not have to listen through
 * a list of metadata to reach the sentence they came for.
 */
function speechFor(mode: ModeResultKey, result: any): string {
  if (!result) return '';
  switch (mode) {
    case 'start':
      return [result.supportiveMessage, `The first thing to do: ${result.immediateTenMinuteAction}`]
        .filter(Boolean)
        .join('. ');
    case 'simplify':
      return result.plainLanguageRewrite || '';
    case 'learn':
      return result.summary || '';
    case 'meet':
      return [
        result.summary,
        ...(result.actionItems || []).map(
          (item: any) => `${item.task}, ${item.owner}, due ${item.deadline}`
        ),
      ]
        .filter(Boolean)
        .join('. ');
    case 'practice':
      return [result.openingLine, result.suggestedResponses?.[0]?.text].filter(Boolean).join('. ');
    case 'write':
      return result.improvedText || '';
    case 'guide':
      return [
        result.workflowName,
        ...(result.steps || []).map(
          (step: any, index: number) => `Step ${index + 1}. ${step.title}. ${step.actionRequired}`
        ),
      ]
        .filter(Boolean)
        .join('. ');
    case 'numbers':
      return [result.plainQuestion, result.story, `The answer is ${result.answer}`]
        .filter(Boolean)
        .join('. ');
    case 'chunk':
      return [
        result.whatThisPageIsFor,
        ...(result.steps || []).map(
          (step: any, index: number) => `Step ${index + 1}. ${step.title}. ${step.what}`
        ),
      ]
        .filter(Boolean)
        .join('. ');
    default:
      return '';
  }
}

export interface ModeWorkspaceScreenProps {
  route?: any;
  navigation: any;
}

export const ModeWorkspaceScreen: React.FC<ModeWorkspaceScreenProps> = ({ route, navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const [toolKey, setToolKey] = useState<string>(route?.params?.mode || 'start');
  const tool = useMemo(() => toolFor(toolKey), [toolKey]);

  const [input, setInput] = useState<string>(route?.params?.initialInput || '');
  const [result, setResult] = useState<any>(tool.workedExample);
  const [isOwn, setIsOwn] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const plate =
    tool.plate === 'cyan'
      ? COLORS.cyan
      : tool.plate === 'magenta'
        ? COLORS.magenta
        : tool.plate === 'yellow'
          ? COLORS.yellowDark
          : COLORS.text;

  /* Switching tool resets the *answer* — a Simplify rewrite left on screen
     under a Numbers heading is worse than an empty panel — but deliberately not
     the input. Somebody who pasted a dense paragraph and picked the wrong tool
     should not have to paste it again; that is precisely the executive-function
     tax this app exists to remove. */
  useEffect(() => {
    tts.stop();
    setSpeaking(false);
    setResult(tool.workedExample);
    setIsOwn(false);
    setError(null);
    setComposerOpen(true);
  }, [toolKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      tts.stop();
    },
    []
  );

  const run = useCallback(async () => {
    const text = input.trim();
    if (!text || running) return;

    setRunning(true);
    setError(null);
    tts.stop();
    setSpeaking(false);

    try {
      let response: any;
      switch (toolKey) {
        case 'start':
          response = await api.start(text);
          break;
        case 'simplify':
          response = await api.simplify(text);
          break;
        case 'learn':
          response = await api.learn(text);
          break;
        case 'meet':
          response = await api.meet(text);
          break;
        case 'practice':
          response = await api.practice(text);
          break;
        case 'write':
          response = await api.write(text);
          break;
        case 'guide':
          response = await api.guide(text);
          break;
        case 'numbers':
          response = await api.numbers(text);
          break;
        case 'chunk':
          response = await api.chunkIntoSteps(text);
          break;
        default:
          response = null;
      }

      if (!response) throw new Error('The engine returned nothing for that.');

      setResult(response);
      setIsOwn(true);
      setComposerOpen(false);
      award('modeRun');

      saveSummaryAndSync({
        id: `sum_${Date.now()}`,
        modeKey: toolKey,
        modeName: tool.name,
        input: text,
        result: response,
        createdAt: new Date().toISOString(),
      }).catch(() => {
        /* the result is on screen either way */
      });
    } catch (err: any) {
      setError(
        err?.message ||
          'Could not reach the engine. What you typed is still here — try again in a moment.'
      );
    } finally {
      setRunning(false);
    }
  }, [input, running, toolKey, tool.name]);

  const markdown = () =>
    toolKey === 'chunk'
      ? [
          `## ${result?.pageName || tool.name}`,
          '',
          result?.whatThisPageIsFor || '',
          '',
          ...(result?.steps || []).map(
            (step: any, index: number) => `${index + 1}. **${step.title}** — ${step.what}`
          ),
        ].join('\n')
      : modeResultToMarkdown(toolKey as CognitiveModeKey, result, input);

  const onCopy = async () => {
    const ok = await copyToClipboard(markdown());
    if (!ok) {
      setError('Could not copy that to the clipboard.');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const onSpeak = () => {
    if (speaking) {
      tts.stop();
      setSpeaking(false);
      return;
    }
    const spoken = speechFor(toolKey as ModeResultKey, result);
    if (!spoken) return;
    setSpeaking(true);
    tts.speak(spoken, {
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const showExample = () => {
    tts.stop();
    setSpeaking(false);
    setResult(tool.workedExample);
    setIsOwn(false);
    setError(null);
  };

  return (
    <Screen
      title={tool.name}
      subtitle={tool.tagline}
      leading="back"
      onBack={() => navigation.goBack()}
      actions={[
        {
          key: 'speak',
          label: speaking ? 'Stop reading aloud' : 'Read this answer aloud',
          icon: speaking ? (
            <VolumeX size={18} color={COLORS.magenta} />
          ) : (
            <Volume2 size={18} color={COLORS.text} />
          ),
          onPress: onSpeak,
          active: speaking,
        },
        {
          key: 'switch',
          label: 'Switch to a different tool',
          icon: <Replace size={18} color={COLORS.text} />,
          onPress: () => setSwitcherOpen(true),
        },
      ]}
    >
      {/* The composer. Collapses once an answer lands so the answer gets the
          screen, and comes back with one tap. */}
      {composerOpen ? (
        <View style={styles.composer}>
          <Text variant="bodySm" color={COLORS.textMuted} style={styles.blurb}>
            {tool.blurb}
          </Text>

          <Input
            label={tool.fieldLabel}
            placeholder={tool.placeholder}
            value={input}
            onChangeText={setInput}
            multiline
            numberOfLines={tool.rows}
            accessibilityLabel={tool.fieldLabel}
            trailingIcon={
              <VoiceInputButton
                onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
                size={34}
              />
            }
          />

          <View style={styles.composerActions}>
            <Button
              title={tool.verb}
              variant="primary"
              size="md"
              loading={running}
              disabled={!input.trim()}
              icon={<Sparkles size={16} color={COLORS.textInverse} />}
              onPress={run}
              style={{ flex: 1 }}
              accessibilityLabel={`${tool.verb} — run ${tool.name}`}
            />
            {isOwn ? (
              <Button
                title="Hide"
                variant="secondary"
                size="md"
                onPress={() => setComposerOpen(false)}
                accessibilityLabel="Hide the composer and show the answer"
              />
            ) : null}
          </View>

          {error ? (
            <View style={styles.error}>
              <Text variant="bodySm" color={COLORS.error}>
                {error}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <TouchableOpacity
          style={styles.composerClosed}
          activeOpacity={0.8}
          onPress={() => setComposerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Change what you asked"
          accessibilityState={{ expanded: false }}
        >
          <ChevronDown size={16} color={COLORS.textMuted} />
          <Text variant="bodySm" color={COLORS.textMuted} numberOfLines={1} style={styles.closedText}>
            {input.trim() ? `“${input.trim()}”` : 'Ask something else'}
          </Text>
        </TouchableOpacity>
      )}

      {/* The answer. */}
      {result ? (
        <View style={styles.resultWrap}>
          {isOwn && result?.fallback ? (
            <View style={styles.fallbackNotice}>
              <Info size={14} color={COLORS.yellowDark} />
              <Text variant="caption" style={styles.fallbackText}>
                {result.languageFallback
                  ? 'The AI engine was unavailable, so this came from the built-in offline engine — which only writes English. It is rougher than usual, and not in the language you chose.'
                  : 'The AI engine was unavailable, so this came from the built-in offline engine. It is rougher than usual — worth running again in a few minutes.'}
              </Text>
            </View>
          ) : null}

          <View style={styles.resultHeader}>
            <View style={[styles.plateDot, { backgroundColor: plate }]} />
            <Text variant="kicker" color={COLORS.textMuted} style={{ flex: 1 }}>
              {isOwn ? 'Your answer' : 'Worked example'}
            </Text>

            <TouchableOpacity
              style={styles.headerBtn}
              onPress={onCopy}
              accessibilityRole="button"
              accessibilityLabel="Copy this answer"
            >
              {copied ? (
                <Check size={15} color={COLORS.success} />
              ) : (
                <Copy size={15} color={COLORS.textMuted} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => shareText(markdown(), `SETU ${tool.name}`, 'md')}
              accessibilityRole="button"
              accessibilityLabel="Share this answer"
            >
              <Share2 size={15} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {!isOwn ? (
            <Text variant="caption" color={COLORS.textSubtle} style={styles.exampleNote}>
              This is a hand-checked example so you can see what {tool.name} gives back. Put your
              own text in above and it will be replaced.
            </Text>
          ) : null}

          <ModeResult mode={toolKey as ModeResultKey} result={result} input={input} />

          {isOwn ? (
            <TouchableOpacity
              style={styles.exampleLink}
              onPress={showExample}
              accessibilityRole="button"
              accessibilityLabel={`Show the worked example for ${tool.name} again`}
            >
              <ChevronUp size={14} color={COLORS.cyan} />
              <Text variant="caption" color={COLORS.cyan} style={{ marginLeft: 4 }}>
                Show the worked example again
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Switch tool without going back and picking again. */}
      <Sheet
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        title="Use a different tool"
        subtitle="Your text comes with you"
      >
        {ALL_TOOLS.map((entry) => {
          const Icon = entry.icon;
          const selected = entry.key === toolKey;
          return (
            <TouchableOpacity
              key={entry.key}
              activeOpacity={0.8}
              onPress={() => {
                setSwitcherOpen(false);
                if (entry.key !== toolKey) setToolKey(entry.key);
              }}
              style={[styles.switchRow, selected ? styles.switchRowOn : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${entry.name}. ${entry.problem}`}
            >
              <Icon size={18} color={selected ? COLORS.cyan : COLORS.textMuted} />
              <View style={{ flex: 1, marginLeft: SPACING.md }}>
                <Text variant="bodySm" weight="semibold" color={selected ? COLORS.cyan : COLORS.text}>
                  {entry.problem}
                </Text>
                <Text variant="caption" color={COLORS.textMuted}>
                  {entry.name} — {entry.tagline}
                </Text>
              </View>
              {selected ? <Check size={16} color={COLORS.cyan} /> : null}
            </TouchableOpacity>
          );
        })}
      </Sheet>
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    composer: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.lg,
    },
    blurb: {
      marginBottom: SPACING.lg,
    },
    composerActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    error: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.errorLight,
    },
    composerClosed: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      minHeight: 48,
    },
    closedText: {
      flex: 1,
      marginLeft: SPACING.sm,
      fontStyle: 'italic',
    },
    resultWrap: {
      marginTop: SPACING.xl,
    },
    fallbackNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: t.yellowLight,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    fallbackText: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.md,
      gap: SPACING.sm,
    },
    plateDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.surface,
    },
    exampleNote: {
      marginBottom: SPACING.lg,
      fontStyle: 'italic',
    },
    exampleLink: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      marginTop: SPACING.xxl,
      paddingVertical: SPACING.md,
      minHeight: 44,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      marginBottom: SPACING.xs,
      minHeight: 56,
    },
    switchRowOn: {
      backgroundColor: t.cyanLight,
      borderColor: t.cyanBorder,
    },
  });
