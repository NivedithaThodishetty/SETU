/**
 * SETU Mobile — the mind map.
 *
 * Turns a question into a branching map, then lets the reader open any branch
 * and have that idea *explained* — in their language, out loud — rather than
 * having the map's own note read back at them.
 *
 * The old screen stacked a search field, a tab switcher, a summary ribbon, the
 * canvas and a hint bar into one column, which left the map itself about half
 * the screen on a normal phone. The search field now lives behind a control in
 * the header, the summary is one line, and the canvas gets everything else.
 *
 * Branch audio is not a convenience. The clinical guidance for this project was
 * explicit that diagrams only work for this audience when paired with audio on
 * interaction: a map made of silent text is, for a reader whose difficulty is
 * decoding rather than eyesight, just a differently-shaped wall of words.
 *
 * Nothing here invents a map. A failed research call leaves whatever was open
 * still open and says what happened — a generic "Fundamentals / Applications"
 * tree looks like a researched answer, and a reader who cannot easily evaluate
 * text is exactly the reader who would take it as one.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import {
  Search,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Share2,
  Send,
  MessageSquare,
  Network,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { MindMapCanvas } from '../components/MindMapCanvas';
import { NodeInsightSheet } from '../components/NodeInsightSheet';
import { NodeEditorSheet, NodeEdit } from '../components/NodeEditorSheet';
import { MapAppearanceSheet } from '../components/MapAppearanceSheet';
import { StagedLoader } from '../components/StagedLoader';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { SEED_MIND_MAPS } from '../services/seedData';
import { api, streamChat } from '../services/api';
import { saveMindMap } from '../services/storage';
import { tts } from '../services/tts';
import { award } from '../services/progress';
import { copyToClipboard, mapToMarkdown, mapToOutline, shareText } from '../services/exportUtils';
import { MindMapDocument, MindMapNode, PlacedNode, ChatMessage } from '../types';

export interface MindMapScreenProps {
  route?: any;
  navigation: any;
}

/** Rewrite one node in a tree, leaving the rest untouched. */
function editNode(root: MindMapNode, id: string, edit: NodeEdit): MindMapNode {
  if (root.id === id) return { ...root, label: edit.label, detail: edit.detail };
  return { ...root, children: (root.children || []).map((child) => editNode(child, id, edit)) };
}

/** Attach children under one node. */
function attachChildren(root: MindMapNode, id: string, children: MindMapNode[]): MindMapNode {
  if (root.id === id) return { ...root, children: [...(root.children || []), ...children] };
  return {
    ...root,
    children: (root.children || []).map((child) => attachChildren(child, id, children)),
  };
}

/** Drop a node and everything under it. The root is never removable. */
function removeNode(root: MindMapNode, id: string): MindMapNode {
  return {
    ...root,
    children: (root.children || [])
      .filter((child) => child.id !== id)
      .map((child) => removeNode(child, id)),
  };
}

function countNodes(node?: MindMapNode | null): number {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countNodes(child), 0);
}

export const MindMapScreen: React.FC<MindMapScreenProps> = ({ route, navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { speakOnTap, preferences } = useAccessibility();

  const [map, setMap] = useState<MindMapDocument>(
    route?.params?.selectedMap || SEED_MIND_MAPS[0]
  );
  const [view, setView] = useState<'map' | 'ask'>('map');
  const [searchOpen, setSearchOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<PlacedNode | null>(null);
  const [editing, setEditing] = useState<PlacedNode | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [pictureMode, setPictureMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanding, setExpanding] = useState(false);
  const [speakingMap, setSpeakingMap] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);

  const chatScroll = useRef<ScrollView>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      tts.stop();
    };
  }, []);

  /* Params arrive from Home, the Library and the document reader. */
  useEffect(() => {
    const incoming = route?.params?.selectedMap;
    const initialTopic = route?.params?.initialTopic;

    if (incoming) {
      setMap(incoming);
      setCollapsed(new Set());
      setSelected(null);
      setMessages([]);
    } else if (initialTopic) {
      setSearchOpen(false);
      research(initialTopic);
    }
    // Clearing the params stops a tab switch from re-running the same research.
    if (incoming || initialTopic) navigation.setParams?.({ selectedMap: undefined, initialTopic: undefined });
  }, [route?.params?.selectedMap, route?.params?.initialTopic]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async (next: MindMapDocument) => {
    setMap(next);
    await saveMindMap(next);
  }, []);

  async function research(query?: string) {
    const value = (query ?? topic).trim();
    if (!value || researching) return;

    setResearching(true);
    setResearchError(null);
    setSelected(null);
    setCollapsed(new Set());
    setSearchOpen(false);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {
      /* haptics are a nicety */
    }

    try {
      // The engine returns the saved record itself, so the tree is on `root` —
      // reading a `map` property here yields undefined and draws nothing.
      const result = await api.mindMap(value);

      const next: MindMapDocument = {
        id: `map_${Date.now()}`,
        topic: value,
        summary: result.summary || `An overview of ${value}`,
        root: result.root,
        totalTopics: result.totalTopics || countNodes(result.root),
        sourceType: 'query',
        createdAt: new Date().toISOString(),
      };

      if (!alive.current) return;
      setTopic('');
      setMessages([]);
      // `persist` already mirrors the map to the engine through the storage
      // layer's fire-and-forget sync. Calling `saveMindMapToDb` here as well
      // wrote it twice, and — because that call rejects rather than resolving
      // to null — left an unhandled rejection behind every time the engine was
      // unreachable, which is exactly when it fired.
      await persist(next);
      award('mapCreated');
    } catch (error: any) {
      if (!alive.current) return;
      setResearchError(
        error?.message ||
          'Could not research that just now. The map already open is still yours to explore.'
      );
    } finally {
      if (alive.current) setResearching(false);
    }
  }

  const openNode = (node: PlacedNode) => {
    setSelected(node);
    // In picture mode the note is not on screen at all, so the audio is the
    // only way to reach it — speak the map's own note immediately while the
    // generated explanation streams in behind it.
    if (speakOnTap && pictureMode) {
      const spoken = [node.label, node.detail].filter(Boolean).join('. ');
      if (spoken) tts.speak(spoken, { quiet: true });
    }
  };

  const toggleCollapse = (nodeId: string) => {
    tts.stop();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const goDeeper = async (node: PlacedNode) => {
    setExpanding(true);
    try {
      const result = await api.expandNode(map.topic, node.label, node.detail);
      if (result?.children?.length) {
        const next: MindMapDocument = {
          ...map,
          root: attachChildren(map.root, node.id, result.children),
        };
        next.totalTopics = countNodes(next.root);
        await persist(next);
        award('branchExpanded');
      } else {
        setResearchError('The engine had nothing more to add under that branch.');
      }
    } catch (error: any) {
      // A placeholder branch labelled "<topic> deep dive" is not an expansion,
      // it is a lie shaped like one — and it would be saved into the map and
      // exported alongside real research.
      setResearchError(
        error?.message ||
          'Could not go deeper on that branch. Nothing on the map was changed.'
      );
    } finally {
      if (alive.current) {
        setExpanding(false);
        setSelected(null);
      }
    }
  };

  const saveNodeEdit = async (nodeId: string, edit: NodeEdit) => {
    const next = { ...map, root: editNode(map.root, nodeId, edit) };
    await persist(next);
    setSelected(null);
  };

  const addChild = async (nodeId: string, edit: NodeEdit) => {
    const child: MindMapNode = {
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: edit.label,
      detail: edit.detail,
      children: [],
    };
    const next = { ...map, root: attachChildren(map.root, nodeId, [child]) };
    next.totalTopics = countNodes(next.root);
    await persist(next);
  };

  const deleteNode = async (nodeId: string) => {
    const next = { ...map, root: removeNode(map.root, nodeId) };
    next.totalTopics = countNodes(next.root);
    await persist(next);
    setSelected(null);
  };

  const speakMap = () => {
    if (speakingMap) {
      tts.stop();
      setSpeakingMap(false);
      return;
    }
    const spoken = [
      map.topic,
      map.summary,
      ...(map.root?.children || []).map((child) =>
        [child.label, child.detail].filter(Boolean).join('. ')
      ),
    ]
      .filter(Boolean)
      .join('. ');
    if (!spoken) return;
    setSpeakingMap(true);
    tts.speak(spoken, {
      onDone: () => setSpeakingMap(false),
      onError: () => setSpeakingMap(false),
    });
  };

  const exportMap = () => {
    Alert.alert('Take this map with you', `“${map.topic}”`, [
      { text: 'Copy as plain text', onPress: () => copyToClipboard(mapToOutline(map)) },
      {
        text: 'Share as Markdown',
        onPress: () => shareText(mapToMarkdown(map), map.topic, 'md'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const send = async () => {
    const text = chatInput.trim();
    if (!text || sending) return;

    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, role: 'user', content: text, timestamp: new Date().toISOString() },
    ]);
    setChatInput('');
    setSending(true);

    const replyId = `a_${Date.now()}`;
    let received = false;

    try {
      await streamChat(
        {
          topic: map.topic,
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
        {
          onStatus: (data) => setStreamStatus(data?.message || null),

          onReply: (data) => {
            const chunk = String(data?.text || '');
            if (!chunk) return;
            received = true;
            setStreamStatus(null);

            setMessages((prev) => {
              if (!prev.find((m) => m.id === replyId)) {
                return [
                  ...prev,
                  {
                    id: replyId,
                    role: 'assistant',
                    content: chunk,
                    timestamp: new Date().toISOString(),
                    sources: data?.sources,
                  },
                ];
              }
              // A frame marked `final` carries the whole reply rather than a
              // delta, so appending it would duplicate everything before it.
              return prev.map((m) =>
                m.id === replyId
                  ? {
                      ...m,
                      content: data?.final ? chunk : `${m.content}${chunk}`,
                      sources: data?.sources || m.sources,
                    }
                  : m
              );
            });
          },

          // A turn can answer with a whole new map when the question turns out
          // to be a research request rather than a follow-up.
          onMap: (mapData) => {
            if (!mapData?.root) return;
            const next: MindMapDocument = {
              id: `map_${Date.now()}`,
              topic: mapData.topic || mapData.title || map.topic,
              summary: mapData.summary || '',
              root: mapData.root,
              totalTopics: mapData.totalTopics || countNodes(mapData.root),
              sourceType: 'query',
              createdAt: new Date().toISOString(),
            };
            setCollapsed(new Set());
            persist(next);
            award('mapCreated');
          },

          onError: (data) => {
            setStreamStatus(null);
            setMessages((prev) => [
              ...prev,
              {
                id: `err_${Date.now()}`,
                role: 'assistant',
                content:
                  (data as any)?.error ||
                  'The engine could not answer that one. Your question is still above.',
                timestamp: new Date().toISOString(),
              },
            ]);
          },
        }
      );

      if (!received) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: 'The engine did not send anything back. Try asking again in a moment.',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content:
            error?.message || 'Could not reach the engine. The map on screen is still yours.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      if (alive.current) {
        setStreamStatus(null);
        setSending(false);
      }
    }
  };

  return (
    <Screen
      title={map.topic}
      subtitle={`${map.totalTopics || countNodes(map.root)} branches${pictureMode ? ' · picture mode' : ''}`}
      scroll={false}
      avoidKeyboard
      contentStyle={styles.content}
      actions={[
        {
          key: 'search',
          label: 'Research a different topic',
          icon: searchOpen ? (
            <X size={18} color={COLORS.text} />
          ) : (
            <Search size={18} color={COLORS.text} />
          ),
          onPress: () => setSearchOpen((prev) => !prev),
          active: searchOpen,
        },
        {
          key: 'appearance',
          label: 'How the map is drawn',
          icon: <SlidersHorizontal size={18} color={COLORS.text} />,
          onPress: () => setAppearanceOpen(true),
        },
      ]}
      headerBelow={
        searchOpen ? (
          <View>
            <View style={styles.searchRow}>
              <Input
                placeholder="Research any topic into a map…"
                value={topic}
                onChangeText={setTopic}
                returnKeyType="search"
                onSubmitEditing={() => research()}
                autoFocus
                containerStyle={styles.searchInput}
                accessibilityLabel="Topic to research"
                trailingIcon={
                  <VoiceInputButton
                    onTranscript={(text) => {
                      setTopic(text);
                      research(text);
                    }}
                    size={34}
                  />
                }
              />
              <Button
                title="Draw"
                variant="primary"
                size="md"
                loading={researching}
                disabled={!topic.trim()}
                onPress={() => research()}
              />
            </View>
          </View>
        ) : (
          <Segmented
            options={[
              { key: 'map', label: 'The map', icon: <Network size={14} color={COLORS.cyan} /> },
              {
                key: 'ask',
                label: messages.length ? `Ask (${messages.length})` : 'Ask about it',
                icon: <MessageSquare size={14} color={COLORS.cyan} />,
              },
            ]}
            value={view}
            onChange={setView}
          />
        )
      }
    >
      {researchError ? (
        <TouchableOpacity
          style={styles.error}
          onPress={() => setResearchError(null)}
          accessibilityRole="button"
          accessibilityLabel={`${researchError}. Tap to dismiss.`}
        >
          <Text variant="caption" color={COLORS.error}>
            {researchError}
          </Text>
        </TouchableOpacity>
      ) : null}

      {researching ? (
        <View style={styles.loading}>
          <StagedLoader />
        </View>
      ) : view === 'map' ? (
        <View style={styles.mapPane}>
          <View style={styles.summaryRow}>
            <Text variant="caption" color={COLORS.textMuted} numberOfLines={2} style={{ flex: 1 }}>
              {map.summary}
            </Text>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={speakMap}
              accessibilityRole="button"
              accessibilityLabel={speakingMap ? 'Stop reading the map aloud' : 'Read the whole map aloud'}
            >
              {speakingMap ? (
                <VolumeX size={16} color={COLORS.magenta} />
              ) : (
                <Volume2 size={16} color={COLORS.cyan} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={exportMap}
              accessibilityRole="button"
              accessibilityLabel="Copy or share this map"
            >
              <Share2 size={16} color={COLORS.cyan} />
            </TouchableOpacity>
          </View>

          <MindMapCanvas
            rootNode={map.root}
            selectedNodeId={selected?.id}
            collapsedIds={collapsed}
            onSelectNode={openNode}
            onToggleCollapse={toggleCollapse}
            onEditNode={setEditing}
            edgeStyle={preferences.mapEdgeStyle}
            nodeStyle={preferences.mapNodeStyle}
            textScale={preferences.mapTextScale}
            hideDetail={pictureMode}
          />

          <Text variant="caption" color={COLORS.textSubtle} style={styles.hint}>
            Tap a branch to have it explained · hold one to edit it · tap the circle to fold it away
          </Text>
        </View>
      ) : (
        <View style={styles.chatPane}>
          <ScrollView
            ref={chatScroll}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              <View style={styles.chatEmpty}>
                <Text variant="bodySm" color={COLORS.textMuted} align="center">
                  Ask anything about “{map.topic}”. Answers come back in the language you have
                  chosen, and a question that turns out to be a new topic draws a new map instead.
                </Text>
              </View>
            ) : null}

            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.bubble,
                  message.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                ]}
              >
                <Text
                  variant="body"
                  color={message.role === 'user' ? COLORS.textInverse : COLORS.text}
                >
                  {message.content}
                </Text>
                {message.role === 'assistant' ? (
                  <TouchableOpacity
                    style={styles.bubbleSpeak}
                    onPress={() => tts.speak(message.content)}
                    accessibilityRole="button"
                    accessibilityLabel="Read this answer aloud"
                  >
                    <Volume2 size={13} color={COLORS.cyan} />
                    <Text variant="caption" color={COLORS.cyan} style={{ marginLeft: 4 }}>
                      Read it to me
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            {streamStatus ? (
              <View style={[styles.bubble, styles.bubbleAssistant]}>
                <Text variant="bodySm" color={COLORS.textMuted}>
                  {streamStatus}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.chatComposer}>
            <Input
              placeholder="Ask about this map…"
              value={chatInput}
              onChangeText={setChatInput}
              returnKeyType="send"
              onSubmitEditing={send}
              containerStyle={styles.chatInput}
              accessibilityLabel="Ask about this map"
              trailingIcon={<VoiceInputButton onTranscript={setChatInput} size={32} />}
            />
            <Button
              variant="primary"
              size="md"
              loading={sending}
              disabled={!chatInput.trim()}
              icon={<Send size={16} color={COLORS.textInverse} />}
              onPress={send}
              style={styles.sendBtn}
              accessibilityLabel="Send"
            />
          </View>
        </View>
      )}

      <NodeInsightSheet
        node={selected}
        map={map}
        isExpanding={expanding}
        onClose={() => setSelected(null)}
        onExpandDeeper={goDeeper}
        onEditNode={(node) => {
          setSelected(null);
          setEditing(node);
        }}
        onAskAboutNode={(node) => {
          setSelected(null);
          setView('ask');
          setChatInput(`Tell me more about “${node.label}”`);
        }}
      />

      <NodeEditorSheet
        node={editing}
        isRoot={editing?.id === map.root?.id}
        onClose={() => setEditing(null)}
        onSave={saveNodeEdit}
        onAddChild={addChild}
        onDelete={deleteNode}
      />

      <MapAppearanceSheet
        visible={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        pictureMode={pictureMode}
        onTogglePictureMode={setPictureMode}
      />
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    content: {
      paddingBottom: 0,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    searchInput: {
      flex: 1,
      marginBottom: 0,
    },
    error: {
      backgroundColor: t.errorLight,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    loading: {
      flex: 1,
      justifyContent: 'center',
    },
    mapPane: {
      flex: 1,
      paddingBottom: SPACING.sm,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.sm,
      gap: SPACING.xs,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.surface,
    },
    hint: {
      textAlign: 'center',
      paddingTop: SPACING.sm,
    },
    chatPane: {
      flex: 1,
      paddingBottom: SPACING.sm,
    },
    chatScroll: {
      flex: 1,
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
    },
    chatContent: {
      padding: SPACING.md,
    },
    chatEmpty: {
      paddingVertical: SPACING.xxxl,
      paddingHorizontal: SPACING.md,
    },
    bubble: {
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      marginBottom: SPACING.sm,
      maxWidth: '90%',
    },
    bubbleUser: {
      backgroundColor: t.cyan,
      alignSelf: 'flex-end',
      borderBottomRightRadius: 2,
    },
    bubbleAssistant: {
      backgroundColor: t.bg,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      borderBottomLeftRadius: 2,
    },
    bubbleSpeak: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.sm,
      minHeight: 36,
    },
    chatComposer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: SPACING.sm,
      gap: SPACING.sm,
    },
    chatInput: {
      flex: 1,
      marginBottom: 0,
    },
    sendBtn: {
      width: 52,
    },
  });
