/**
 * SETU Mobile — editing a branch.
 *
 * A researched map is a draft, not an answer. People correct a wrong label,
 * add the thing the model missed, and cut the branch that went nowhere — and a
 * map you cannot correct is one you stop trusting the moment you find the first
 * mistake in it.
 *
 * Editing works with the engine unreachable, because the map is held locally
 * and only mirrored to the server. That matters more than it sounds: the moment
 * somebody most wants to fix a map is while they are reading it, which is often
 * exactly when they are on a train.
 *
 * Deleting a branch takes its children with it and says so before doing it.
 * Losing a subtree to a mis-tap on a phone is not recoverable here — there is
 * no undo stack, on purpose, because an undo stack is another thing to explain.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Plus, Save, Trash2 } from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Sheet } from './Sheet';
import { Text } from './Typography';
import { Input } from './Input';
import { Button } from './Button';
import { VoiceInputButton } from './VoiceInputButton';
import { PlacedNode } from '../types';

export interface NodeEdit {
  label: string;
  detail: string;
}

export interface NodeEditorSheetProps {
  node: PlacedNode | null;
  onClose: () => void;
  onSave: (nodeId: string, edit: NodeEdit) => void;
  onAddChild: (nodeId: string, edit: NodeEdit) => void;
  onDelete: (nodeId: string) => void;
  /** The root cannot be deleted — a map with no root is not a map. */
  isRoot?: boolean;
}

export const NodeEditorSheet: React.FC<NodeEditorSheetProps> = ({
  node,
  onClose,
  onSave,
  onAddChild,
  onDelete,
  isRoot = false,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const [label, setLabel] = useState('');
  const [detail, setDetail] = useState('');
  const [childLabel, setChildLabel] = useState('');

  useEffect(() => {
    setLabel(node?.label || '');
    setDetail(node?.detail || '');
    setChildLabel('');
  }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;

  const dirty = label.trim() !== (node.label || '') || detail.trim() !== (node.detail || '');

  const save = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onSave(node.id, { label: trimmed, detail: detail.trim() });
    onClose();
  };

  const addChild = () => {
    const trimmed = childLabel.trim();
    if (!trimmed) return;
    onAddChild(node.id, { label: trimmed, detail: '' });
    setChildLabel('');
  };

  const confirmDelete = () => {
    const count = node.childCount;
    Alert.alert(
      `Remove “${node.label}”?`,
      count > 0
        ? `The ${count} ${count === 1 ? 'branch' : 'branches'} under it will go too. This cannot be undone.`
        : 'This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onDelete(node.id);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Sheet
      visible={Boolean(node)}
      onClose={onClose}
      title="Edit this branch"
      subtitle="Changes are saved on this phone straight away"
      maxHeightRatio={0.85}
      footer={
        <View style={styles.footer}>
          {!isRoot ? (
            <Button
              title="Remove"
              variant="ghost"
              size="md"
              icon={<Trash2 size={15} color={COLORS.error} />}
              onPress={confirmDelete}
              accessibilityLabel={`Remove the branch ${node.label}`}
            />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Button
            title="Save"
            variant="primary"
            size="md"
            disabled={!label.trim() || !dirty}
            icon={<Save size={15} color={COLORS.textInverse} />}
            onPress={save}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      <Input
        label="What this branch is called"
        value={label}
        onChangeText={setLabel}
        placeholder="A short name"
        accessibilityLabel="Branch name"
        trailingIcon={<VoiceInputButton onTranscript={setLabel} size={34} showError={false} />}
      />

      <Input
        label="The note on it"
        value={detail}
        onChangeText={setDetail}
        placeholder="One or two sentences. Leave it empty if the name says enough."
        multiline
        numberOfLines={4}
        accessibilityLabel="Note on this branch"
        trailingIcon={
          <VoiceInputButton
            onTranscript={(text) => setDetail((prev) => (prev ? `${prev} ${text}` : text))}
            size={34}
            showError={false}
          />
        }
      />

      <View style={styles.addBlock}>
        <Text variant="bodySm" weight="semibold">
          Add something under it
        </Text>
        <Text variant="caption" color={COLORS.textMuted} style={styles.addHint}>
          For the thing the research missed. You can ask the engine to go deeper instead — this is
          for when you already know what belongs here.
        </Text>

        <Input
          value={childLabel}
          onChangeText={setChildLabel}
          placeholder="A new branch under this one"
          returnKeyType="done"
          onSubmitEditing={addChild}
          accessibilityLabel="Name of the new branch"
          trailingIcon={<VoiceInputButton onTranscript={setChildLabel} size={34} showError={false} />}
        />

        <Button
          title="Add branch"
          variant="secondary"
          size="md"
          fullWidth
          disabled={!childLabel.trim()}
          icon={<Plus size={15} color={COLORS.text} />}
          onPress={addChild}
        />
      </View>
    </Sheet>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    addBlock: {
      marginTop: SPACING.lg,
      paddingTop: SPACING.lg,
      borderTopWidth: 1,
      borderTopColor: t.dividerSubtle,
    },
    addHint: {
      marginTop: 2,
      marginBottom: SPACING.md,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
  });
