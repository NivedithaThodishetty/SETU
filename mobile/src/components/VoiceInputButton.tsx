/**
 * SETU Mobile — dictation button.
 *
 * Tap to start, tap to stop, then the clip goes to Sarvam Saaras and comes back
 * as text. Three states are visible rather than two, because the gap between
 * "stopped recording" and "text appeared" is several seconds on a slow
 * connection and an unexplained pause reads as a broken button.
 */

import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Mic, Square } from 'lucide-react-native';

import { Palette } from '../constants/themes';
import { RADIUS, SPACING } from '../constants/theme';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useVoiceInput } from '../services/stt';
import { Text } from './Typography';

export interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  size?: number;
  /** Show a wordy label beside the icon. Off inside compact input rows. */
  showLabel?: boolean;
  label?: string;
  /** Surface transcription errors under the button rather than swallowing them. */
  showError?: boolean;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  size = 44,
  showLabel = false,
  label = 'Speak',
  showError = true,
}) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { status, available, error, toggle, cancel } = useVoiceInput(onTranscript);

  // Leaving the microphone open after the screen goes away is both a privacy
  // problem and a battery one.
  useEffect(() => () => {
    cancel();
  }, [cancel]);

  const isRecording = status === 'recording';
  const isBusy = status === 'transcribing';
  const isOff = available === false;

  const accessibilityLabel = isRecording
    ? 'Stop recording and turn it into text'
    : isBusy
      ? 'Turning your recording into text'
      : isOff
        ? 'Dictation unavailable — the speech engine is not switched on'
        : 'Start dictation';

  const iconSize = Math.round(size * 0.44);

  return (
    <View style={showLabel ? styles.wrapper : undefined}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: isBusy, busy: isBusy, selected: isRecording }}
        activeOpacity={0.7}
        disabled={isBusy}
        onPress={toggle}
        style={[
          styles.button,
          showLabel ? styles.buttonWithLabel : { width: size, height: size, borderRadius: size / 2 },
          isRecording ? styles.recording : isOff ? styles.unavailable : styles.idle,
        ]}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={COLORS.cyan} />
        ) : isRecording ? (
          <Square size={iconSize} color={COLORS.magenta} fill={COLORS.magenta} />
        ) : (
          <Mic size={iconSize} color={isOff ? COLORS.textSubtle : COLORS.cyan} />
        )}

        {showLabel ? (
          <Text
            variant="caption"
            weight="semibold"
            color={isRecording ? COLORS.magenta : isOff ? COLORS.textSubtle : COLORS.cyan}
            style={{ marginLeft: 6 }}
          >
            {isRecording ? 'Stop' : isBusy ? 'Writing it down…' : label}
          </Text>
        ) : null}
      </TouchableOpacity>

      {showError && error ? (
        <Text variant="caption" color={COLORS.magenta} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    wrapper: {
      alignItems: 'flex-start',
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonWithLabel: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
      minHeight: 40,
    },
    idle: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.divider,
    },
    recording: {
      backgroundColor: t.magentaLight,
      borderWidth: 1.5,
      borderColor: t.magenta,
    },
    unavailable: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
    },
    error: {
      marginTop: 4,
      maxWidth: 260,
    },
  });

export default VoiceInputButton;
