/**
 * SETU Mobile — Camera, Document Scanner & OCR Screen
 * ---------------------------------------------------
 * Captures photos of physical book pages, lecture notes, legal notices, or documents
 * and extracts text via backend OCR for instant plain language simplification,
 * mind map generation, and text-to-speech audio.
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  Image as ImageIcon,
  Sparkles,
  Waves,
  Network,
  GraduationCap,
  Volume2,
  VolumeX,
  RotateCcw,
  FileText,
} from 'lucide-react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text, Kicker } from '../components/Typography';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Card, Tag } from '../components/Card';
import { BionicText } from '../components/BionicText';
import { api } from '../services/api';
import { tts } from '../services/tts';
import * as Haptics from 'expo-haptics';

export interface CameraOcrScreenProps {
  navigation: any;
}

export const CameraOcrScreen: React.FC<CameraOcrScreenProps> = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [summaryText, setSummaryText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  };

  const handleTakePhoto = async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert(
          'Camera Permission',
          'Camera access is required to capture documents and book pages for cognitive simplification.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setImageUri(asset.uri);
        await processImage(asset.uri, asset.base64);
      }
    } catch (err) {
      console.warn('Error launching camera:', err);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setImageUri(asset.uri);
        await processImage(asset.uri, asset.base64);
      }
    } catch (err) {
      console.warn('Error picking image:', err);
    }
  };

  const processImage = async (uri: string, base64?: string | null) => {
    setIsProcessing(true);
    setExtractedText('');
    setSummaryText('');
    setError(null);

    try {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (_) {}

      // Call OCR endpoint
      let extracted = '';
      if (base64) {
        const res = await api.describeImage(
          `data:image/jpeg;base64,${base64}`,
          'Extract all readable text from this document accurately and provide a plain language summary.'
        );
        extracted = res.extractedText || res.description;
      } else {
        const doc = await api.uploadFile(uri, 'image/jpeg', 'scanned_doc.jpg');
        extracted = doc.extractedText || doc.summary;
      }

      // Never invent a document. An earlier build filled this in with a canned
      // paragraph when OCR failed, which is the single worst thing this screen
      // could do: somebody scans a hospital letter or a tenancy notice, cannot
      // read it themselves, and is shown confident text that came from nowhere.
      // An honest failure is recoverable; a fabricated one is not.
      if (!extracted || !extracted.trim()) {
        setError(
          'No text could be read from that image. Try again with more light, holding the page flat and filling the frame.'
        );
        return;
      }

      setExtractedText(extracted.trim());
      setSummaryText('Here is what was on the page. Pick what you want done with it.');
    } catch (err: any) {
      setError(
        err?.message ||
          'Could not reach the engine to read that page. Your photo is still here — try again in a moment.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleSpeak = () => {
    if (isSpeaking) {
      tts.stop();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      tts.speak(extractedText, {
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  const handleSendToSimplify = () => {
    navigation.navigate('ModeWorkspace', { mode: 'simplify', initialInput: extractedText });
  };

  const handleSendToMindMap = () => {
    // The map takes a topic, not a wall of scanned text — the first line is
    // almost always the letterhead or the title, which is what you want mapped.
    navigation.navigate('MainTabs', {
      screen: 'MapTab',
      params: { initialTopic: extractedText.slice(0, 80) },
    });
  };

  const handleSendToLearn = () => {
    navigation.navigate('ModeWorkspace', { mode: 'learn', initialInput: extractedText });
  };

  return (
    <Screen
      title="Scan a page"
      subtitle="Letters, forms, notices, book pages"
      leading="back"
      onBack={() => navigation.goBack()}
    >
        <View style={styles.header}>
          <Text variant="bodySm" color={COLORS.textMuted}>
            Point the camera at anything printed. SETU pulls the words out, and then you can have
            it in plain language, read aloud, or drawn as a map.
          </Text>
        </View>

        {/* Capture Action Buttons */}
        <View style={styles.captureRow}>
          <Button
            title="Take photo"
            variant="primary"
            size="lg"
            icon={<Camera size={20} color={COLORS.textInverse} />}
            onPress={handleTakePhoto}
            style={{ flex: 1 }}
          />
          <Button
            title="Pick image"
            variant="secondary"
            size="lg"
            icon={<ImageIcon size={20} color={COLORS.text} />}
            onPress={handlePickImage}
            style={{ flex: 1 }}
          />
        </View>

        {/* Image Preview */}
        {imageUri && (
          <Card elevated style={styles.previewCard}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => {
                setImageUri(null);
                setExtractedText('');
              }}
            >
              <RotateCcw size={14} color={COLORS.textMuted} />
              <Text variant="caption" color={COLORS.textMuted} style={{ marginLeft: 4 }}>
                Clear photo
              </Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <Card elevated style={styles.processingCard}>
            <ActivityIndicator size="large" color={COLORS.cyan} />
            <Text variant="body" weight="semibold" style={{ marginTop: SPACING.sm }}>
              Extracting text from document…
            </Text>
            <Text variant="caption" color={COLORS.textMuted}>
              Running optical character recognition & semantic analysis
            </Text>
          </Card>
        )}

        {error ? (
          <Card elevated style={styles.resultSection}>
            <Kicker color={COLORS.magenta}>Nothing readable came back</Kicker>
            <Text variant="bodySm" style={{ marginTop: 4 }}>
              {error}
            </Text>
          </Card>
        ) : null}

        {/* Extracted Text & Cognitive Actions */}
        {extractedText ? (
          <View style={styles.resultSection}>
            <View style={styles.resultHeader}>
              <Kicker color={COLORS.cyan}>Extracted Content</Kicker>
              <TouchableOpacity style={styles.ttsBtn} onPress={handleToggleSpeak}>
                {isSpeaking ? (
                  <VolumeX size={15} color={COLORS.magenta} />
                ) : (
                  <Volume2 size={15} color={COLORS.cyan} />
                )}
                <Text
                  variant="caption"
                  color={isSpeaking ? COLORS.magenta : COLORS.cyan}
                  weight="semibold"
                  style={{ marginLeft: 4 }}
                >
                  {isSpeaking ? 'Stop Audio' : 'Read Aloud'}
                </Text>
              </TouchableOpacity>
            </View>

            <Card plateColor={COLORS.cyan} elevated style={styles.extractedCard}>
              <BionicText text={extractedText} variant="body" />
            </Card>

            {/* Transform Action Grid */}
            <Text variant="bodySm" weight="bold" style={styles.actionGridTitle}>
              Transform Extracted Text:
            </Text>

            <View style={styles.actionButtonsStack}>
              <Button
                title="Simplify in plain language"
                variant="primary"
                size="md"
                fullWidth
                icon={<Waves size={16} color={COLORS.textInverse} />}
                onPress={handleSendToSimplify}
                style={{ marginBottom: SPACING.xs }}
              />
              <Button
                title="Generate interactive mind map"
                variant="secondary"
                size="md"
                fullWidth
                icon={<Network size={16} color={COLORS.cyan} />}
                onPress={handleSendToMindMap}
                style={{ marginBottom: SPACING.xs }}
              />
              <Button
                title="Generate study notes & quiz"
                variant="secondary"
                size="md"
                fullWidth
                icon={<GraduationCap size={16} color={COLORS.magenta} />}
                onPress={handleSendToLearn}
              />
            </View>
          </View>
        ) : null}
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
  header: {
    marginBottom: SPACING.md,
  },
  captureRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  previewCard: {
    padding: SPACING.sm,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: RADIUS.sm,
    backgroundColor: t.bg,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  processingCard: {
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SPACING.md,
  },
  resultSection: {
    marginTop: SPACING.xs,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  ttsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: t.surface,
  },
  extractedCard: {
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  actionGridTitle: {
    marginBottom: SPACING.sm,
  },
  actionButtonsStack: {
    gap: SPACING.xs,
  },
});
