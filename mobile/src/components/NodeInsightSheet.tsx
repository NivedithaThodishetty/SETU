/**
 * SETU Mobile — what happens when you open a branch.
 *
 * Opening a branch used to do one thing: read the note already written on it
 * back to you, in whatever language that note happened to be in. For a reader
 * who chose Tamil that is not an accommodation — it is an English sentence
 * spoken at them. So opening a branch now asks the engine to *explain* the
 * idea, in the chosen language, and the audio follows the explanation rather
 * than the map text.
 *
 * Four decisions worth keeping:
 *
 *  - It streams. The request goes out the moment the sheet opens, and first
 *    words on screen in about a second is the difference between a reader
 *    following the thread and losing it.
 *  - It caches per branch, per depth, per language. Tapping across a map to
 *    find the branch you meant is the normal way to use one, and paying for the
 *    same explanation twice is slow and, on a metered key, expensive.
 *  - The map's own note stays visible underneath, quietly. The explanation is
 *    generated, and a reader is entitled to see what it was generated from.
 *  - Nothing is spoken automatically. Audio that starts on its own is the
 *    fastest way to make somebody put the phone down in a quiet room.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Volume2, VolumeX, GitBranch, MessageSquare, RotateCw, Pencil } from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { Sheet } from './Sheet';
import { Text } from './Typography';
import { Button } from './Button';
import { Segmented } from './Segmented';
import { BionicText } from './BionicText';
import { streamExplain } from '../services/api';
import { tts } from '../services/tts';
import { pathTo } from '../utils/layout';
import { languageLabel } from '../constants/languages';
import { MindMapDocument, PlacedNode } from '../types';

type Depth = 'simple' | 'plain' | 'detailed';

const DEPTHS: { key: Depth; label: string; hint: string }[] = [
  { key: 'simple', label: 'Simplest', hint: 'Two sentences, as if to a ten-year-old' },
  { key: 'plain', label: 'Plain', hint: 'Everyday language, with a comparison' },
  { key: 'detailed', label: 'Deeper', hint: 'Thorough, in short sentences, with an example' },
];

/** How long a branch must stay open before it is worth spending a call on. */
const SETTLE_MS = 280;

/**
 * Strip the markdown the explainer was asked not to emit.
 *
 * The prompt says prose only, and most of the time that holds — but a model
 * that slips a `**bold**` through renders as literal asterisks in a paragraph
 * aimed at somebody who finds reading effortful, which is the worst possible
 * audience for stray punctuation. Cheap to strip, so it is stripped rather
 * than trusted.
 */
function clean(text: string): string {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/`{1,3}/g, '');
}

/** Compose the passage handed to the explainer. */
function buildPrompt(node: PlacedNode, map?: MindMapDocument | null): string {
  const trail = map?.root ? pathTo(map.root, node.id) : null;
  const lines = [
    `Explain one idea taken from a mind map about "${map?.topic || node.label}".`,
    '',
    `Idea: ${node.label}`,
  ];

  if (trail && trail.length > 1) lines.push(`Where it sits: ${trail.join(' → ')}`);
  if (node.detail) lines.push(`Note already on the map: ${node.detail}`);

  lines.push(
    '',
    'Explain the idea itself — what it means, why it matters here, and one everyday comparison.',
    'Do not describe the mind map or mention that you were given a note.'
  );

  return lines.join('\n');
}

export interface NodeInsightSheetProps {
  node: PlacedNode | null;
  map?: MindMapDocument | null;
  isExpanding?: boolean;
  onClose: () => void;
  onExpandDeeper: (node: PlacedNode) => void;
  onAskAboutNode: (node: PlacedNode) => void;
  onEditNode?: (node: PlacedNode) => void;
}

export const NodeInsightSheet: React.FC<NodeInsightSheetProps> = ({
  node,
  map,
  isExpanding = false,
  onClose,
  onExpandDeeper,
  onAskAboutNode,
  onEditNode,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language } = useAccessibility();

  const [depth, setDepth] = useState<Depth>('plain');
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const cache = useRef(new Map<string, string>());
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
      tts.stop();
    };
  }, []);

  const cacheKey = node ? `${node.id}|${depth}|${language}` : null;
  const prompt = useMemo(() => (node ? buildPrompt(node, map) : ''), [node, map]);

  const run = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!node || !cacheKey) return;

      abort.current?.abort();

      if (!force && cache.current.has(cacheKey)) {
        setText(cache.current.get(cacheKey) || '');
        setStreaming(false);
        setError(null);
        return;
      }

      const controller = new AbortController();
      abort.current = controller;

      setStreaming(true);
      setError(null);
      setFallback(false);
      // Deliberately not cleared: keeping the previous depth's text on screen
      // while the next one streams means the panel never flashes empty, which
      // is worse than briefly stale.
      let received = '';

      try {
        await streamExplain(
          { text: prompt, style: depth },
          {
            onText: (chunk) => {
              if (!alive.current || controller.signal.aborted) return;
              if (!received) setText('');
              received += chunk;
              setText(clean(received));
            },
            onDone: (info) => {
              if (!alive.current || controller.signal.aborted) return;
              setFallback(Boolean(info.fallback));
              if (received.trim()) cache.current.set(cacheKey, clean(received));
            },
            onError: (message) => {
              if (!alive.current || controller.signal.aborted) return;
              setError(message);
            },
          },
          controller.signal
        );
      } catch (err: any) {
        if (!alive.current || controller.signal.aborted) return;
        if (!received.trim()) {
          setError(
            err?.message ||
              'Could not fetch an explanation just now. The map’s own note is below.'
          );
          setShowNote(true);
        }
      } finally {
        if (alive.current && !controller.signal.aborted) setStreaming(false);
      }
    },
    [node, cacheKey, prompt, depth]
  );

  /* Explain on open, on depth change, and when the language changes. The delay
     absorbs the taps somebody makes finding the branch they meant. */
  useEffect(() => {
    if (!node) {
      abort.current?.abort();
      setText('');
      setError(null);
      setStreaming(false);
      return undefined;
    }

    const timer = setTimeout(() => run(), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [node, depth, language, run]);

  /* A new branch is a new panel: the previous explanation and the folded note
     both belong to the branch that is no longer open. */
  useEffect(() => {
    setShowNote(false);
    setText('');
    tts.stop();
    setSpeaking(false);
  }, [node?.id]);

  const speak = () => {
    if (speaking) {
      tts.stop();
      setSpeaking(false);
      return;
    }
    // The explanation if there is one, the map's own note only as a fallback —
    // the whole point is that the audio follows the explanation.
    const spoken = text.trim() || [node?.label, node?.detail].filter(Boolean).join('. ');
    if (!spoken) return;
    setSpeaking(true);
    tts.speak(spoken, {
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const activeDepth = DEPTHS.find((entry) => entry.key === depth) || DEPTHS[1];

  return (
    <Sheet
      visible={Boolean(node)}
      onClose={onClose}
      title={node?.label || ''}
      subtitle={
        node
          ? `Explained in ${languageLabel(language)} · ${node.childCount} ${node.childCount === 1 ? 'branch' : 'branches'} under it`
          : undefined
      }
      maxHeightRatio={0.86}
      footer={
        node ? (
          <View style={styles.footer}>
            <Button
              title="Go deeper"
              variant="secondary"
              size="md"
              loading={isExpanding}
              icon={<GitBranch size={15} color={COLORS.text} />}
              onPress={() => onExpandDeeper(node)}
              style={{ flex: 1 }}
              accessibilityLabel="Ask for more branches under this one"
            />
            <Button
              title="Ask about it"
              variant="primary"
              size="md"
              icon={<MessageSquare size={15} color={COLORS.textInverse} />}
              onPress={() => onAskAboutNode(node)}
              style={{ flex: 1 }}
            />
          </View>
        ) : null
      }
    >
      {node ? (
        <View>
          <Segmented
            options={DEPTHS.map((entry) => ({
              key: entry.key,
              label: entry.label,
              accessibilityLabel: `${entry.label} — ${entry.hint}`,
            }))}
            value={depth}
            onChange={setDepth}
          />
          <Text variant="caption" color={COLORS.textSubtle} style={styles.depthHint}>
            {activeDepth.hint}
          </Text>

          <View style={styles.explanation}>
            {!text && streaming ? (
              <View style={styles.waiting}>
                <ActivityIndicator size="small" color={COLORS.cyan} />
                <Text variant="bodySm" color={COLORS.textMuted} style={{ marginLeft: SPACING.sm }}>
                  Working out how to put this…
                </Text>
              </View>
            ) : text ? (
              <>
                <BionicText text={text} variant="body" />
                {streaming ? (
                  <Text variant="caption" color={COLORS.textSubtle} style={{ marginTop: SPACING.sm }}>
                    still writing…
                  </Text>
                ) : null}
              </>
            ) : error ? (
              <Text variant="bodySm" color={COLORS.error}>
                {error}
              </Text>
            ) : null}
          </View>

          {fallback ? (
            <Text variant="caption" color={COLORS.yellowDark} style={styles.fallback}>
              The AI engine was unavailable, so this came from the built-in offline engine — it is
              rougher than usual, and only writes English.
            </Text>
          ) : null}

          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.control, speaking ? styles.controlOn : null]}
              onPress={speak}
              disabled={!text && !node.detail}
              accessibilityRole="button"
              accessibilityLabel={speaking ? 'Stop reading this aloud' : 'Read this explanation aloud'}
              accessibilityState={{ selected: speaking, disabled: !text && !node.detail }}
            >
              {speaking ? (
                <VolumeX size={15} color={COLORS.magenta} />
              ) : (
                <Volume2 size={15} color={COLORS.cyan} />
              )}
              <Text
                variant="caption"
                weight="semibold"
                color={speaking ? COLORS.magenta : COLORS.cyan}
                style={{ marginLeft: 6 }}
              >
                {speaking ? 'Stop' : 'Read it to me'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.control}
              onPress={() => run({ force: true })}
              disabled={streaming}
              accessibilityRole="button"
              accessibilityLabel="Explain this again, differently"
              accessibilityState={{ disabled: streaming }}
            >
              <RotateCw size={15} color={streaming ? COLORS.textSubtle : COLORS.textMuted} />
              <Text
                variant="caption"
                color={streaming ? COLORS.textSubtle : COLORS.textMuted}
                style={{ marginLeft: 6 }}
              >
                Say it another way
              </Text>
            </TouchableOpacity>

            {onEditNode ? (
              <TouchableOpacity
                style={styles.control}
                onPress={() => onEditNode(node)}
                accessibilityRole="button"
                accessibilityLabel="Rename this branch or change its note"
              >
                <Pencil size={15} color={COLORS.textMuted} />
                <Text variant="caption" color={COLORS.textMuted} style={{ marginLeft: 6 }}>
                  Edit
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {node.detail ? (
            <View style={styles.noteBlock}>
              <TouchableOpacity
                onPress={() => setShowNote((prev) => !prev)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showNote }}
                accessibilityLabel={
                  showNote ? 'Hide the note on the map' : 'Show the note written on the map'
                }
                style={styles.noteToggle}
              >
                <Text variant="caption" color={COLORS.textSubtle}>
                  {showNote ? 'Hide the note on the map' : 'What the map itself says'}
                </Text>
              </TouchableOpacity>

              {showNote ? (
                <View style={styles.note}>
                  <Text variant="bodySm" color={COLORS.textMuted}>
                    {node.detail}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    depthHint: {
      marginTop: SPACING.sm,
      marginBottom: SPACING.lg,
      paddingHorizontal: SPACING.xs,
    },
    explanation: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.cyan,
      padding: SPACING.lg,
      minHeight: 96,
      justifyContent: 'center',
    },
    waiting: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    fallback: {
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    controls: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
      marginTop: SPACING.md,
    },
    control: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      backgroundColor: t.surface,
      minHeight: 44,
    },
    controlOn: {
      backgroundColor: t.magentaLight,
      borderColor: t.magenta,
    },
    noteBlock: {
      marginTop: SPACING.lg,
    },
    noteToggle: {
      alignSelf: 'flex-start',
      paddingVertical: SPACING.sm,
      minHeight: 40,
      justifyContent: 'center',
    },
    note: {
      backgroundColor: t.bg,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.md,
    },
    footer: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
  });
