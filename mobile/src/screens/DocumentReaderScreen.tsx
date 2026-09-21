/**
 * SETU Mobile — reading a whole document.
 *
 * A document that has been uploaded used to be a row in the Library that
 * offered its six actions through an `Alert`. On Android an alert with more
 * than three buttons silently drops the rest, so half of what you could do with
 * a document was invisible on the platform this app actually ships to.
 *
 * It is a screen now, which also makes room for the two things the web app has
 * and mobile did not: the extracted text itself, readable and read-aloud-able,
 * and asking the document a question rather than only summarising it.
 *
 * Everything here works from the copy the engine already extracted. If the
 * engine is unreachable the text is still shown and still read aloud — only the
 * questions and the map need the network.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import {
  Volume2,
  VolumeX,
  Waves,
  GraduationCap,
  Network,
  Send,
  Trash2,
  FileText,
  Copy,
  Check,
} from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Screen } from '../components/Screen';
import { Section } from '../components/Section';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { BionicText } from '../components/BionicText';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { api } from '../services/api';
import { tts } from '../services/tts';
import { copyToClipboard } from '../services/exportUtils';
import { formatFileSize } from '../utils/formatters';

interface DocumentRecord {
  id?: string;
  _id?: string;
  originalName?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  extractedText?: string;
  summary?: string;
  keyPoints?: string[];
  createdAt?: string;
}

export interface DocumentReaderScreenProps {
  route?: any;
  navigation: any;
}

/** How much of the body text to show before offering the rest. */
const PREVIEW_CHARS = 1400;

export const DocumentReaderScreen: React.FC<DocumentReaderScreenProps> = ({
  route,
  navigation,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const passed: DocumentRecord = route?.params?.document || {};
  const documentId = passed.id || passed._id || route?.params?.documentId || '';

  const [doc, setDoc] = useState<DocumentRecord>(passed);
  const [speaking, setSpeaking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);

  const name = doc.originalName || doc.name || 'Document';
  const body = doc.extractedText || '';
  const tooLong = body.length > PREVIEW_CHARS;
  const shown = expanded || !tooLong ? body : `${body.slice(0, PREVIEW_CHARS).trimEnd()}…`;

  /* The list view carries a trimmed record — enough to draw a row, not enough
     to read. Fetch the full one, but never block on it: what was passed in is
     already worth showing. */
  const hydrate = useCallback(async () => {
    if (!documentId || doc.extractedText) return;
    const full = await api.getFile(documentId);
    if (!mounted.current || !full) return;
    const record = (full as any).file || (full as any).document || full;
    if (record && typeof record === 'object') setDoc((prev) => ({ ...prev, ...record }));
  }, [documentId, doc.extractedText]);

  useEffect(() => {
    mounted.current = true;
    hydrate();
    return () => {
      mounted.current = false;
      tts.stop();
    };
  }, [hydrate]);

  const toggleSpeak = () => {
    if (speaking) {
      tts.stop();
      setSpeaking(false);
      return;
    }
    const spoken = body || doc.summary || '';
    if (!spoken) return;
    setSpeaking(true);
    tts.speak(spoken, {
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;

    setAsking(true);
    setError(null);
    setAnswer(null);

    try {
      const response = await api.queryFile(documentId, text);
      const reply =
        (response as any)?.answer ||
        (response as any)?.reply ||
        (response as any)?.text ||
        'The engine did not send an answer back.';
      if (mounted.current) setAnswer(String(reply));
    } catch (err: any) {
      if (mounted.current) {
        setError(
          err?.message ||
            'Could not ask the document that just now. Your question is still in the box.'
        );
      }
    } finally {
      if (mounted.current) setAsking(false);
    }
  };

  const asMap = async () => {
    const result = await api.mindMapFromFile(documentId).catch(() => null);
    navigation.navigate('MainTabs', {
      screen: 'MapTab',
      params: (result as any)?.root ? { selectedMap: result } : { initialTopic: name },
    });
  };

  const remove = () => {
    Alert.alert(
      'Delete this document?',
      `"${name}" will be removed from the engine. Anything you have already made from it stays.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await api.deleteFile(documentId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const copyText = async () => {
    const ok = await copyToClipboard(body || doc.summary || '');
    if (!ok) {
      setError('Could not copy that to the clipboard.');
      return;
    }
    setCopied(true);
    setTimeout(() => mounted.current && setCopied(false), 1800);
  };

  return (
    <Screen
      title={name}
      subtitle={[doc.mimeType, doc.size ? formatFileSize(doc.size) : null]
        .filter(Boolean)
        .join(' · ')}
      leading="back"
      onBack={() => navigation.goBack()}
      actions={[
        {
          key: 'speak',
          label: speaking ? 'Stop reading aloud' : 'Read this document aloud',
          icon: speaking ? (
            <VolumeX size={18} color={COLORS.magenta} />
          ) : (
            <Volume2 size={18} color={COLORS.text} />
          ),
          onPress: toggleSpeak,
          active: speaking,
        },
        {
          key: 'copy',
          label: 'Copy the text',
          icon: copied ? (
            <Check size={18} color={COLORS.success} />
          ) : (
            <Copy size={18} color={COLORS.text} />
          ),
          onPress: copyText,
        },
      ]}
    >
      {doc.summary ? (
        <View style={styles.summary}>
          <Text variant="kicker" color={COLORS.cyan}>
            The short version
          </Text>
          <BionicText text={doc.summary} variant="body" style={{ marginTop: SPACING.xs }} />
        </View>
      ) : null}

      {doc.keyPoints?.length ? (
        <Section title="What it says">
          {doc.keyPoints.map((point, index) => (
            <View key={`point-${index}`} style={styles.pointRow}>
              <View style={styles.pointDot} />
              <Text variant="bodySm" style={{ flex: 1 }}>
                {point}
              </Text>
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="What would you like to do with it?">
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.action}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate('ModeWorkspace', { mode: 'simplify', initialInput: body })
            }
            accessibilityRole="button"
            accessibilityLabel="Put this document in plain language"
          >
            <Waves size={20} color={COLORS.cyan} />
            <Text variant="caption" weight="semibold" style={styles.actionLabel}>
              Plain language
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.action}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate('ModeWorkspace', { mode: 'learn', initialInput: body })
            }
            accessibilityRole="button"
            accessibilityLabel="Make study notes and quiz me on this document"
          >
            <GraduationCap size={20} color={COLORS.magenta} />
            <Text variant="caption" weight="semibold" style={styles.actionLabel}>
              Study and quiz
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.action}
            activeOpacity={0.8}
            onPress={asMap}
            accessibilityRole="button"
            accessibilityLabel="Draw this document as a mind map"
          >
            <Network size={20} color={COLORS.cyan} />
            <Text variant="caption" weight="semibold" style={styles.actionLabel}>
              Draw as a map
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.action}
            activeOpacity={0.8}
            onPress={remove}
            accessibilityRole="button"
            accessibilityLabel="Delete this document"
          >
            <Trash2 size={20} color={COLORS.error} />
            <Text variant="caption" weight="semibold" color={COLORS.error} style={styles.actionLabel}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </Section>

      {/* Asking the document itself, rather than pasting a chunk of it into a
          mode. This is the one thing here that genuinely needs the engine. */}
      <Section
        title="Ask it something"
        description="The answer comes from this document, not from the internet"
      >
        <Input
          placeholder="What is the deadline in this letter?"
          value={question}
          onChangeText={setQuestion}
          returnKeyType="send"
          onSubmitEditing={ask}
          accessibilityLabel="Ask a question about this document"
          trailingIcon={<VoiceInputButton onTranscript={setQuestion} size={34} />}
        />

        <Button
          title="Ask"
          variant="primary"
          size="md"
          loading={asking}
          disabled={!question.trim() || !documentId}
          icon={<Send size={15} color={COLORS.textInverse} />}
          onPress={ask}
          fullWidth
        />

        {error ? (
          <View style={styles.error}>
            <Text variant="bodySm" color={COLORS.error}>
              {error}
            </Text>
          </View>
        ) : null}

        {answer ? (
          <View style={styles.answer}>
            <BionicText text={answer} variant="body" />
            <TouchableOpacity
              style={styles.answerSpeak}
              onPress={() => tts.speak(answer)}
              accessibilityRole="button"
              accessibilityLabel="Read this answer aloud"
            >
              <Volume2 size={14} color={COLORS.cyan} />
              <Text variant="caption" color={COLORS.cyan} style={{ marginLeft: 4 }}>
                Read it to me
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Section>

      {body ? (
        <Section title="The document itself">
          <View style={styles.body}>
            <BionicText text={shown} variant="body" />
          </View>

          {tooLong ? (
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={() => setExpanded((prev) => !prev)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? 'Show less of the document' : 'Show the whole document'}
            >
              <Text variant="caption" weight="semibold" color={COLORS.cyan}>
                {expanded
                  ? 'Show less'
                  : `Show the rest — about ${Math.ceil((body.length - PREVIEW_CHARS) / 1000)}k more characters`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </Section>
      ) : (
        <View style={styles.noBody}>
          <FileText size={20} color={COLORS.textSubtle} />
          <Text variant="bodySm" color={COLORS.textMuted} style={{ flex: 1, marginLeft: SPACING.sm }}>
            The engine has not sent the text of this document. It may still be processing, or the
            file may be a scan with no text layer — try the camera scanner instead, which reads
            printed pages directly.
          </Text>
        </View>
      )}
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    summary: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.cyan,
      padding: SPACING.lg,
    },
    pointRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    pointDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: t.cyan,
      marginTop: 8,
    },
    actionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    action: {
      flexGrow: 1,
      flexBasis: '46%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      paddingVertical: SPACING.lg,
      minHeight: 80,
    },
    actionLabel: {
      marginTop: SPACING.xs,
      textAlign: 'center',
    },
    error: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.errorLight,
    },
    answer: {
      marginTop: SPACING.md,
      padding: SPACING.lg,
      borderRadius: RADIUS.lg,
      backgroundColor: t.surface,
      borderLeftWidth: 3,
      borderLeftColor: t.cyan,
    },
    answerSpeak: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.md,
      minHeight: 40,
    },
    body: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.lg,
    },
    moreBtn: {
      alignSelf: 'center',
      paddingVertical: SPACING.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    noBody: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: SPACING.xxl,
      padding: SPACING.lg,
      borderRadius: RADIUS.lg,
      backgroundColor: t.surface,
    },
  });
