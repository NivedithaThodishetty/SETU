/**
 * SETU Mobile — Library.
 *
 * Everything SETU has made or been given, on three shelves: maps, saved
 * results, and documents.
 *
 * Documents are the shelf that matters most in practice. The thing a person
 * cannot read is usually a PDF somebody sent them — a tenancy agreement, a
 * hospital letter, a school circular — and the whole job is getting it in here
 * and back out in plain language. The picker takes anything the phone will hand
 * over, because the engine already rejects what it cannot parse and a picker
 * that hides your file is a dead end with no explanation.
 *
 * A document used to offer its actions through an `Alert` with six buttons.
 * Android silently drops everything past the third, so half of what you could
 * do with a document was invisible on the platform this app ships to. Opening
 * one is a screen now.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import {
  Search,
  Upload,
  Trash2,
  RotateCcw,
  FileText,
  Network,
  Layers,
  Share2,
  Volume2,
  Plus,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useTheme, useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { EmptyState } from '../components/EmptyState';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Tag } from '../components/Card';
import { getSavedMindMaps, deleteMindMap, restoreReferenceLibrary } from '../services/storage';
import { getSavedSummaries, deleteSummary, SavedSummary } from '../services/summaryStorage';
import { api } from '../services/api';
import { tts } from '../services/tts';
import { mapToMarkdown, modeResultToMarkdown, shareText } from '../services/exportUtils';
import { MindMapDocument } from '../types';
import { formatRelativeDate, formatFileSize, truncateText } from '../utils/formatters';
import { modeFor } from '../constants/modeCatalog';

export interface LibraryScreenProps {
  route?: any;
  navigation: any;
}

type Shelf = 'maps' | 'results' | 'documents';

interface LibraryDocument {
  id?: string;
  _id?: string;
  originalName?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  extractedText?: string;
  summary?: string;
  createdAt?: string;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ route, navigation }) => {
  const COLORS = useThemeColors();
  const { plateColors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [shelf, setShelf] = useState<Shelf>(route?.params?.tab || 'maps');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [maps, setMaps] = useState<MindMapDocument[]>([]);
  const [results, setResults] = useState<SavedSummary[]>([]);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);

  const [uploading, setUploading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  useEffect(() => {
    if (route?.params?.tab) {
      setShelf(route.params.tab);
      navigation.setParams?.({ tab: undefined });
    }
  }, [route?.params?.tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const [storedMaps, storedResults] = await Promise.all([
        getSavedMindMaps(),
        getSavedSummaries(),
      ]);
      setMaps(storedMaps);
      setResults(storedResults);
    } catch (_) {
      /* local reads that fail leave the previous list, which is still useful */
    }

    // Documents live on the engine, because parsing a PDF is not something a
    // phone should be doing. A null means unreachable, which is a different
    // thing from having none — say so rather than showing an empty shelf.
    const files = await api.listFiles();
    if (files === null) {
      setDocumentsError('Cannot reach the engine, so your documents are not listed right now.');
    } else {
      setDocumentsError(null);
      setDocuments(
        Array.isArray(files) ? files : (files as any).files || (files as any).documents || []
      );
    }
  }, []);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const buzz = (type: 'warn' | 'ok' = 'ok') => {
    try {
      Haptics.notificationAsync(
        type === 'warn'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      );
    } catch (_) {
      /* haptics are a nicety */
    }
  };

  const needle = query.trim().toLowerCase();

  const shownMaps = useMemo(
    () =>
      maps.filter(
        (map) =>
          !needle ||
          `${map.topic} ${map.summary}`.toLowerCase().includes(needle)
      ),
    [maps, needle]
  );

  const shownResults = useMemo(
    () =>
      results.filter(
        (entry) =>
          !needle || `${entry.modeName} ${entry.input}`.toLowerCase().includes(needle)
      ),
    [results, needle]
  );

  const shownDocuments = useMemo(
    () =>
      documents.filter(
        (doc) =>
          !needle ||
          `${doc.originalName || doc.name || ''} ${doc.summary || ''}`
            .toLowerCase()
            .includes(needle)
      ),
    [documents, needle]
  );

  const addDocument = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;

      const asset = picked.assets[0];
      setUploading(true);
      setDocumentsError(null);

      const uploaded = await api.uploadFile(
        asset.uri,
        asset.mimeType || 'application/octet-stream',
        asset.name || 'document'
      );

      buzz('ok');
      await load();
      setShelf('documents');
      if (uploaded) navigation.navigate('DocumentReader', { document: uploaded });
    } catch (error: any) {
      setDocumentsError(error?.message || 'That document could not be read.');
    } finally {
      setUploading(false);
    }
  };

  const confirmDeleteMap = (id: string, topic: string) => {
    Alert.alert(`Remove “${topic}”?`, 'It will be gone from this phone and from the engine.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          buzz('warn');
          setMaps(await deleteMindMap(id));
        },
      },
    ]);
  };

  const confirmDeleteResult = (id: string, modeName: string) => {
    Alert.alert(`Remove this ${modeName} result?`, 'This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          buzz('warn');
          setResults(await deleteSummary(id));
        },
      },
    ]);
  };

  const restore = async () => {
    setMaps(await restoreReferenceLibrary());
    buzz('ok');
  };

  return (
    <Screen
      title="Library"
      subtitle="Everything you have made or been given"
      refreshing={refreshing}
      onRefresh={onRefresh}
      actions={[
        {
          key: 'add',
          label: 'Add a document',
          icon: <Plus size={18} color={COLORS.text} />,
          onPress: addDocument,
        },
      ]}
      headerBelow={
        <View>
          <Segmented<Shelf>
            options={[
              { key: 'maps', label: `Maps${maps.length ? ` (${maps.length})` : ''}` },
              { key: 'results', label: `Results${results.length ? ` (${results.length})` : ''}` },
              {
                key: 'documents',
                label: `Docs${documents.length ? ` (${documents.length})` : ''}`,
              },
            ]}
            value={shelf}
            onChange={setShelf}
          />
          <Input
            placeholder="Search everything here…"
            value={query}
            onChangeText={setQuery}
            leadingIcon={<Search size={16} color={COLORS.textSubtle} />}
            containerStyle={styles.search}
            accessibilityLabel="Search your library"
          />
        </View>
      }
    >
      {/* ---------------------------------------------------------------- Maps */}
      {shelf === 'maps' ? (
        shownMaps.length === 0 ? (
          <EmptyState
            icon={<Network size={28} color={COLORS.textSubtle} />}
            title={needle ? 'Nothing matches that' : 'No maps yet'}
            body={
              needle
                ? 'Try a shorter search, or clear it to see everything.'
                : 'Ask a question on the Map tab and SETU researches it into branches you can open one at a time.'
            }
            actionLabel={needle ? 'Clear the search' : 'Draw your first map'}
            onAction={() => (needle ? setQuery('') : navigation.navigate('MapTab'))}
          />
        ) : (
          <View style={styles.stack}>
            {shownMaps.map((map, index) => {
              const id = map.id || map._id || '';
              return (
                <TouchableOpacity
                  key={id || index}
                  activeOpacity={0.85}
                  style={[
                    styles.card,
                    { borderLeftColor: plateColors[index % plateColors.length] },
                  ]}
                  onPress={() => navigation.navigate('MapTab', { selectedMap: map })}
                  accessibilityRole="button"
                  accessibilityLabel={`Open the map for ${map.topic}`}
                >
                  <View style={styles.cardTop}>
                    <Tag
                      label={map.sourceType === 'seed' ? 'Reference' : 'Yours'}
                      variant={map.sourceType === 'seed' ? 'neutral' : 'cyan'}
                    />
                    <Text variant="caption" color={COLORS.textSubtle}>
                      {map.createdAt ? formatRelativeDate(map.createdAt) : 'recently'} ·{' '}
                      {map.totalTopics || 12} branches
                    </Text>
                  </View>

                  <Text variant="body" weight="bold" style={styles.cardTitle}>
                    {map.topic}
                  </Text>
                  <Text variant="caption" color={COLORS.textMuted} numberOfLines={2}>
                    {truncateText(map.summary, 120)}
                  </Text>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.cardAction}
                      onPress={() => tts.speak(`${map.topic}. ${map.summary}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`Read the summary of ${map.topic} aloud`}
                    >
                      <Volume2 size={15} color={COLORS.cyan} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cardAction}
                      onPress={() => shareText(mapToMarkdown(map), map.topic, 'md')}
                      accessibilityRole="button"
                      accessibilityLabel={`Share ${map.topic}`}
                    >
                      <Share2 size={15} color={COLORS.cyan} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cardAction}
                      onPress={() => confirmDeleteMap(id, map.topic)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${map.topic}`}
                    >
                      <Trash2 size={15} color={COLORS.textSubtle} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.restore}
              onPress={restore}
              accessibilityRole="button"
              accessibilityLabel="Put the reference maps back"
              accessibilityHint="Restores the example maps SETU ships with, without touching your own"
            >
              <RotateCcw size={14} color={COLORS.textMuted} />
              <Text variant="caption" color={COLORS.textMuted} style={{ marginLeft: 6 }}>
                Put the reference maps back
              </Text>
            </TouchableOpacity>
          </View>
        )
      ) : null}

      {/* ------------------------------------------------------------- Results */}
      {shelf === 'results' ? (
        shownResults.length === 0 ? (
          <EmptyState
            icon={<Layers size={28} color={COLORS.textSubtle} />}
            title={needle ? 'Nothing matches that' : 'No saved results yet'}
            body={
              needle
                ? 'Try a shorter search, or clear it to see everything.'
                : 'Anything you run through a tool is kept here, so you can come back to it without running it again.'
            }
            actionLabel={needle ? 'Clear the search' : 'Open the tools'}
            onAction={() => (needle ? setQuery('') : navigation.navigate('ToolsTab'))}
          />
        ) : (
          <View style={styles.stack}>
            {shownResults.map((entry) => {
              const definition = modeFor(entry.modeKey);
              return (
                <TouchableOpacity
                  key={entry.id}
                  activeOpacity={0.85}
                  style={[styles.card, { borderLeftColor: COLORS.cyan }]}
                  onPress={() =>
                    navigation.navigate('ModeWorkspace', {
                      mode: entry.modeKey,
                      initialInput: entry.input,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Open this ${entry.modeName} result again`}
                >
                  <View style={styles.cardTop}>
                    <Tag label={entry.modeName} variant="cyan" />
                    <Text variant="caption" color={COLORS.textSubtle}>
                      {formatRelativeDate(entry.createdAt)}
                    </Text>
                  </View>

                  <Text variant="bodySm" weight="semibold" numberOfLines={2} style={styles.cardTitle}>
                    {truncateText(entry.input, 110) || definition.problem}
                  </Text>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.cardAction}
                      onPress={() =>
                        shareText(
                          modeResultToMarkdown(entry.modeKey, entry.result, entry.input),
                          `SETU ${entry.modeName}`,
                          'md'
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Share this ${entry.modeName} result`}
                    >
                      <Share2 size={15} color={COLORS.cyan} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cardAction}
                      onPress={() => confirmDeleteResult(entry.id, entry.modeName)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove this ${entry.modeName} result`}
                    >
                      <Trash2 size={15} color={COLORS.textSubtle} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )
      ) : null}

      {/* ----------------------------------------------------------- Documents */}
      {shelf === 'documents' ? (
        <View>
          <Button
            title={uploading ? 'Reading it…' : 'Add a document'}
            variant="secondary"
            size="md"
            fullWidth
            loading={uploading}
            icon={<Upload size={16} color={COLORS.text} />}
            onPress={addDocument}
            accessibilityLabel="Add a PDF, Word file or text file"
          />

          {documentsError ? (
            <View style={styles.docError}>
              <Text variant="caption" color={COLORS.error}>
                {documentsError}
              </Text>
            </View>
          ) : null}

          <View style={[styles.stack, { marginTop: SPACING.lg }]}>
            {shownDocuments.length === 0 ? (
              <EmptyState
                icon={<FileText size={28} color={COLORS.textSubtle} />}
                title={needle ? 'Nothing matches that' : 'No documents yet'}
                body={
                  needle
                    ? 'Try a shorter search, or clear it to see everything.'
                    : 'Add the PDF or letter you cannot get through. SETU pulls the text out, and then you can have it in plain language, read aloud, drawn as a map, or ask it questions.'
                }
                actionLabel={needle ? 'Clear the search' : 'Add one'}
                onAction={() => (needle ? setQuery('') : addDocument())}
              />
            ) : (
              shownDocuments.map((doc, index) => {
                const id = doc.id || doc._id || String(index);
                const name = doc.originalName || doc.name || 'Document';
                return (
                  <TouchableOpacity
                    key={id}
                    activeOpacity={0.85}
                    style={[styles.card, { borderLeftColor: COLORS.cyan }]}
                    onPress={() => navigation.navigate('DocumentReader', { document: doc })}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${name}`}
                    accessibilityHint="Read it, simplify it, map it, or ask it a question"
                  >
                    <View style={styles.cardTop}>
                      <FileText size={15} color={COLORS.cyan} />
                      <Text variant="caption" color={COLORS.textSubtle}>
                        {[
                          doc.size ? formatFileSize(doc.size) : null,
                          doc.createdAt ? formatRelativeDate(doc.createdAt) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>

                    <Text variant="bodySm" weight="semibold" numberOfLines={1} style={styles.cardTitle}>
                      {name}
                    </Text>
                    {doc.summary ? (
                      <Text variant="caption" color={COLORS.textMuted} numberOfLines={2}>
                        {truncateText(doc.summary, 120)}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      ) : null}
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    search: {
      marginTop: SPACING.sm,
      marginBottom: 0,
    },
    stack: {
      gap: SPACING.sm,
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      borderLeftWidth: 3,
      padding: SPACING.lg,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    cardTitle: {
      marginBottom: 2,
    },
    cardActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: SPACING.xs,
      marginTop: SPACING.sm,
    },
    cardAction: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bg,
    },
    restore: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.lg,
      minHeight: 48,
    },
    docError: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.md,
      backgroundColor: t.errorLight,
    },
  });
