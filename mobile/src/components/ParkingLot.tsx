/**
 * SETU Mobile — the parking lot.
 *
 * The direct accommodation for the one memory finding from the clinical review:
 * long-term memory in this group is intact, working memory is not. The problem
 * is never "I forgot how to do this", it is "I cannot hold that while I finish
 * this". Offloading beats any amount of reminding.
 *
 * Everything about it is built to cost nothing to use — one tap from anywhere,
 * the field already focused, one tap to file, and you are back where you were.
 * A note that takes three taps to write is a note nobody writes, and the thought
 * is gone by then anyway.
 *
 * It used to carry its own floating button, which put a third circular control
 * in the bottom-right corner alongside the focus banner and the quick-actions
 * key. Opening it is now the shell's job — from the side menu or from quick
 * actions — so the corner is quiet again and this component only owns the notes.
 *
 * Notes never leave the phone.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Plus, Trash2, X } from 'lucide-react-native';

import { Palette } from '../constants/themes';
import { RADIUS, SPACING } from '../constants/theme';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useShell } from '../context/ShellContext';
import {
  clearDoneNotes,
  deleteParkedNote,
  getParkedNotes,
  parkNote,
  toggleParkedNote,
} from '../services/localStore';
import { award } from '../services/progress';
import { ParkedNote } from '../types';
import { Text, Kicker } from './Typography';
import { VoiceInputButton } from './VoiceInputButton';

export const ParkingLot: React.FC = () => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const { isParkingOpen, closeShell } = useShell();
  const [notes, setNotes] = useState<ParkedNote[]>([]);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Focus the field once the modal has actually mounted; focusing during the
  // same frame is dropped on Android. The whole point of the parking lot is that
  // the thought goes down before it evaporates, so a keyboard that needs a
  // second tap defeats it.
  useEffect(() => {
    if (!isParkingOpen) return undefined;
    const timer = setTimeout(() => inputRef.current?.focus(), 160);
    return () => clearTimeout(timer);
  }, [isParkingOpen]);

  // Re-read on open so a note parked from another surface is already here.
  useEffect(() => {
    if (isParkingOpen) getParkedNotes().then(setNotes);
  }, [isParkingOpen]);

  const file = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setNotes(await parkNote(text));
    award('noteParked');
    inputRef.current?.focus();
  }, [draft]);

  return (
    <Modal
      visible={isParkingOpen}
      animationType="slide"
      transparent
      onRequestClose={closeShell}
    >
      <Pressable style={styles.backdrop} onPress={closeShell} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={[styles.sheet, { paddingBottom: SPACING.lg + insets.bottom }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Kicker color={COLORS.cyan}>Parking lot</Kicker>
              <Text variant="titleSm" weight="bold">
                Put it down for now
              </Text>
            </View>
            <TouchableOpacity
              onPress={closeShell}
            accessibilityRole="button"
            accessibilityLabel="Close the parking lot"
              style={styles.iconButton}
            >
              <X size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <Text variant="caption" color={COLORS.textMuted} style={{ marginBottom: SPACING.sm }}>
            Anything that just interrupted you. It stays on this phone, and you can come back to
            it when you are finished with what you were doing.
          </Text>

          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={file}
              returnKeyType="done"
              blurOnSubmit={false}
              placeholder="Remind me to check the invoice date…"
              placeholderTextColor={COLORS.textSubtle}
              style={styles.input}
              accessibilityLabel="What do you want to park?"
              multiline
            />
            <VoiceInputButton
              onTranscript={(text) => setDraft((prev) => (prev ? `${prev} ${text}` : text))}
              size={36}
              showError={false}
            />
            <TouchableOpacity
              onPress={file}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Park this thought"
              style={[styles.fileButton, !draft.trim() ? styles.fileButtonDisabled : null]}
            >
              <Plus size={18} color={COLORS.textInverse} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {notes.length === 0 ? (
              <Text variant="bodySm" color={COLORS.textMuted} style={styles.empty}>
                Nothing parked. That is a perfectly good state to be in.
              </Text>
            ) : (
              notes.map((note) => (
                <View key={note.id} style={styles.noteRow}>
                  <TouchableOpacity
                    onPress={async () => setNotes(await toggleParkedNote(note.id))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: note.done }}
                    accessibilityLabel={note.text}
                    style={[styles.checkbox, note.done ? styles.checkboxDone : null]}
                  >
                    {note.done ? <Check size={13} color={COLORS.textInverse} /> : null}
                  </TouchableOpacity>

                  <Text
                    variant="bodySm"
                    color={note.done ? COLORS.textSubtle : COLORS.text}
                    style={[{ flex: 1 }, note.done ? styles.noteDone : null]}
                  >
                    {note.text}
                  </Text>

                  <TouchableOpacity
                    onPress={async () => setNotes(await deleteParkedNote(note.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete: ${note.text}`}
                    style={styles.iconButton}
                  >
                    <Trash2 size={15} color={COLORS.textSubtle} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          {notes.some((note) => note.done) ? (
            <TouchableOpacity
              onPress={async () => setNotes(await clearDoneNotes())}
              accessibilityRole="button"
              style={styles.clearDone}
            >
              <Text variant="caption" weight="semibold" color={COLORS.cyan}>
                Clear the ones you have done
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
  </Modal>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheetWrap: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: t.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: SPACING.lg,
      maxHeight: '82%',
      borderTopWidth: 1,
      borderColor: t.divider,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: SPACING.xs,
    },
    iconButton: {
      minWidth: 40,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: SPACING.sm,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 110,
      backgroundColor: t.surface,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: t.divider,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      color: t.text,
      fontSize: 15,
    },
    fileButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.cyan,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileButtonDisabled: {
      backgroundColor: t.surfaceAlt,
    },
    list: {
      marginTop: SPACING.md,
    },
    empty: {
      paddingVertical: SPACING.xl,
      textAlign: 'center',
    },
    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: t.dividerSubtle,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: RADIUS.sm,
      borderWidth: 1.5,
      borderColor: t.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxDone: {
      backgroundColor: t.success,
      borderColor: t.success,
    },
    noteDone: {
      textDecorationLine: 'line-through',
    },
    clearDone: {
      alignSelf: 'center',
      paddingVertical: SPACING.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
  });

export default ParkingLot;
