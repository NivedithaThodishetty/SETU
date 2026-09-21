/**
 * SETU Mobile — Settings.
 *
 * For most apps settings are somewhere you visit once. Here they *are* the
 * product: the typeface, the ground, the tint, the language and the voice are
 * the accommodations, and people change them as their day and their eyes
 * change. Everything takes effect immediately; there is no save button anywhere
 * on this screen.
 *
 * What changed from the previous version is the shape rather than the contents.
 * It was one 900-line scroll of pill buttons in eleven different rows, which is
 * a lot of screen to read to find the one control you came for. Now it is
 * grouped, each group is a labelled list, and each control carries a sentence
 * saying what it actually does — including, in two cases, that the evidence for
 * it is weak.
 *
 * Two things that were dishonest are fixed. The typeface list offered Atkinson
 * Hyperlegible, Lexend and OpenDyslexic; none was bundled, so all three rendered
 * as the serif. And there was no letter-spacing control, which has better
 * evidence behind it than any of those fonts.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Volume2, Trash2, Check, TrendingUp, Info, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { useIdentity } from '../context/IdentityContext';
import { Screen } from '../components/Screen';
import { Section } from '../components/Section';
import { Segmented } from '../components/Segmented';
import { ListGroup, ListRow } from '../components/ListRow';
import { Sheet } from '../components/Sheet';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { clearAllLocalData, restoreReferenceLibrary } from '../services/storage';
import { api } from '../services/api';
import { tts } from '../services/tts';
import {
  FontStyleOption,
  TextSizeOption,
  MotionOption,
  SpacingOption,
  LetterSpacingOption,
  ThemeOption,
  SarvamVoice,
} from '../types';
import { LANGUAGES, languageSample, languageLabel } from '../constants/languages';
import { COLOR_OVERLAYS, OVERLAY_LABELS, THEME_LABELS, paletteFor } from '../constants/themes';
import { DEFAULT_API_URL, isCustomApiUrl, APP_VERSION } from '../constants/config';

const THEME_ORDER: ThemeOption[] = [
  'broadsheet',
  'cream',
  'pastel',
  'sage',
  'velvet',
  'contrast',
];

const SPEECH_RATES = [0.75, 1.0, 1.25, 1.5];

export interface SettingsScreenProps {
  navigation: any;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const {
    font,
    size,
    motion,
    spacing,
    letterSpacing,
    theme,
    bionic,
    readingRuler,
    speakOnTap,
    rewards,
    speechRate,
    speechPitch,
    colorOverlay,
    colorOverlayOpacity,
    language,
    voice,
    customApiUrl,
    setFont,
    setSize,
    setMotion,
    setSpacing,
    setLetterSpacing,
    setTheme,
    toggleBionic,
    toggleReadingRuler,
    toggleSpeakOnTap,
    toggleRewards,
    setSpeechRate,
    setSpeechPitch,
    setColorOverlay,
    setLanguage,
    setVoice,
    setCustomApiUrl,
  } = useAccessibility();

  const { userId, engineState, isDbConnected, checkHealth, resetIdentity } = useIdentity();

  const [languageOpen, setLanguageOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);

  const [apiUrlInput, setApiUrlInput] = useState(customApiUrl);
  const [voices, setVoices] = useState<SarvamVoice[]>([]);
  const [naturalVoice, setNaturalVoice] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => setApiUrlInput(customApiUrl), [customApiUrl]);

  // The speaker list is a property of whichever engine we are pointed at, so it
  // is re-asked whenever the address changes rather than fetched once at mount.
  useEffect(() => {
    let cancelled = false;
    setNaturalVoice(null);
    tts.probeNaturalVoice(true).then(async (available) => {
      if (cancelled) return;
      setNaturalVoice(available);
      setVoices(available ? await tts.getVoiceCatalogue() : []);
    });
    return () => {
      cancelled = true;
    };
  }, [customApiUrl]);

  const buzz = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {
      /* haptics are a nicety */
    }
  };

  const saveEngine = async () => {
    buzz();
    await setCustomApiUrl(apiUrlInput.trim());
    await checkHealth();
    setEngineOpen(false);
  };

  const testEngine = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.healthAi();
      setTestResult(
        result?.ok
          ? `Working. ${result.provider || 'Gemini'}, model ${result.model || 'active'}.`
          : `Reachable, but the AI did not answer: ${result?.reason || 'no reason given'}.`
      );
    } catch (error: any) {
      setTestResult(error?.message || 'Could not reach that address at all.');
    } finally {
      setTesting(false);
    }
  };

  /**
   * Erase the copy held on this phone.
   *
   * The wording here is careful on purpose, and it used to be wrong. The button
   * said "Delete all data" and the dialog said "permanently delete all stored
   * mind maps, custom settings, and conversation logs" — but maps, summaries,
   * settings and progress are mirrored to the engine as they are written, and
   * this clears AsyncStorage only. So the old copy promised a purge and
   * delivered a local wipe.
   *
   * Worse than the inaccuracy: `AsyncStorage.clear()` also discards the
   * anonymous device id, which is the only handle the server copy is filed
   * under. Pressing it left the data on the server AND made it unreachable, so
   * a user who wanted it gone ended up in the one state where it can never be
   * deleted. The id is therefore preserved across the wipe, and the dialog says
   * plainly what stays behind.
   */
  const handleClearAllData = async () => {
    Alert.alert(
      'Erase this phone’s copy',
      'This clears the mind maps, summaries, settings, check-in journal and parking lot held on this device, and puts the app back to a fresh state.\n\n' +
        'It does not delete the copies already sent to the SETU engine. Those stay filed under your anonymous device ID, which is kept so they remain reachable rather than orphaned.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase local copy',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } catch (_) {}
            await clearAllLocalData({ keepIdentity: true });
            await restoreReferenceLibrary();
            Alert.alert(
              'Local copy erased',
              'This device is back to a fresh state. Your anonymous ID was kept, so anything already on the engine is still yours.'
            );
          },
        },
      ]
    );
  };

  const newIdentity = () => {
    Alert.alert(
      'Give this phone a new token?',
      'Your maps and settings stay exactly where they are. Anything already stored on the engine under the old token becomes unreachable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New token',
          onPress: async () => {
            await resetIdentity();
          },
        },
      ]
    );
  };

  const currentVoice = voices.find((entry) => entry.id === voice);
  const engineStatus =
    engineState === 'ok'
      ? isDbConnected
        ? 'Working, database connected'
        : 'Working'
      : engineState === 'checking'
        ? 'Checking…'
        : engineState === 'nokey'
          ? 'Reachable, no AI key'
          : 'Not reachable';

  return (
    <Screen
      title="Settings"
      subtitle="Nothing here needs saving"
      leading="back"
      onBack={() => navigation.goBack()}
    >
      {/* ------------------------------------------------------------ Reading */}
      <Section title="How text looks" description="Changes apply everywhere, straight away" spacing="none">
        <Text variant="bodySm" weight="semibold" style={styles.label}>
          Typeface
        </Text>
        <Segmented<FontStyleOption>
          options={[
            { key: 'serif', label: 'Serif' },
            { key: 'sans', label: 'Sans' },
            { key: 'hyper', label: 'Hyperlegible' },
            { key: 'lexend', label: 'Lexend' },
            { key: 'system', label: 'Your phone’s' },
          ]}
          value={font}
          onChange={setFont}
        />
        <Text variant="caption" color={COLORS.textSubtle} style={styles.hint}>
          “Your phone’s” follows whatever you have set in the system accessibility settings,
          including a font you installed yourself.
        </Text>

        <Text variant="bodySm" weight="semibold" style={styles.label}>
          Text size
        </Text>
        <Segmented<TextSizeOption>
          options={[
            { key: 'normal', label: 'Normal' },
            { key: 'comfortable', label: 'Comfortable' },
            { key: 'large', label: 'Large' },
          ]}
          value={size}
          onChange={setSize}
        />

        <Text variant="bodySm" weight="semibold" style={styles.label}>
          Space between lines
        </Text>
        <Segmented<SpacingOption>
          options={[
            { key: 'normal', label: 'Normal' },
            { key: 'relaxed', label: 'Relaxed' },
            { key: 'spacious', label: 'Spacious' },
          ]}
          value={spacing}
          onChange={setSpacing}
        />

        <Text variant="bodySm" weight="semibold" style={styles.label}>
          Space between letters
        </Text>
        <Segmented<LetterSpacingOption>
          options={[
            { key: 'normal', label: 'Normal' },
            { key: 'wide', label: 'Wide' },
            { key: 'wider', label: 'Wider' },
          ]}
          value={letterSpacing}
          onChange={setLetterSpacing}
        />
        <Text variant="caption" color={COLORS.textSubtle} style={styles.hint}>
          More room between letters has better evidence behind it for dyslexic readers than any
          particular typeface. Worth trying before anything else here.
        </Text>

        <Text variant="bodySm" weight="semibold" style={styles.label}>
          Movement
        </Text>
        <Segmented<MotionOption>
          options={[
            { key: 'movement', label: 'Let things move' },
            { key: 'reduced', label: 'Keep it still' },
          ]}
          value={motion}
          onChange={setMotion}
        />
      </Section>

      {/* ------------------------------------------------------------- Colour */}
      <Section title="The colour of the page" description="Not a light and dark switch — six grounds">
        <View style={styles.swatches}>
          {THEME_ORDER.map((option) => {
            const palette = paletteFor(option);
            const selected = theme === option;
            return (
              <TouchableOpacity
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${THEME_LABELS[option].name}. ${THEME_LABELS[option].blurb}`}
                onPress={() => setTheme(option)}
                style={[styles.swatch, selected ? styles.swatchOn : null]}
              >
                <View style={[styles.chip, { backgroundColor: palette.bg }]}>
                  <View style={[styles.ink, { backgroundColor: palette.text }]} />
                  <View style={[styles.ink, { backgroundColor: palette.cyan }]} />
                  {selected ? <Check size={12} color={palette.text} /> : null}
                </View>
                <Text
                  variant="caption"
                  weight={selected ? 'bold' : 'normal'}
                  color={selected ? COLORS.text : COLORS.textMuted}
                  align="center"
                >
                  {THEME_LABELS[option].name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text variant="caption" color={COLORS.textSubtle} style={styles.hint}>
          {THEME_LABELS[theme].blurb}
        </Text>
      </Section>

      {/* --------------------------------------------------------------- Tint */}
      <Section
        title="A tint over the screen"
        description="If text seems to shimmer or swim, a colour film often settles it"
      >
        <View style={styles.swatches}>
          {Object.keys(COLOR_OVERLAYS).map((key) => {
            const tint = COLOR_OVERLAYS[key];
            const selected = (colorOverlay || 'none') === key;
            return (
              <TouchableOpacity
                key={key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${OVERLAY_LABELS[key]} tint`}
                onPress={() => setColorOverlay(key)}
                style={[styles.swatch, selected ? styles.swatchOn : null]}
              >
                <View
                  style={[
                    styles.chip,
                    { backgroundColor: tint || COLORS.surface, justifyContent: 'center' },
                  ]}
                >
                  {selected ? <Check size={12} color={COLORS.text} /> : null}
                </View>
                <Text
                  variant="caption"
                  color={selected ? COLORS.text : COLORS.textMuted}
                  align="center"
                >
                  {OVERLAY_LABELS[key]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {colorOverlay && colorOverlay !== 'none' ? (
          <View style={styles.strengthRow}>
            <Text variant="caption" color={COLORS.textMuted} style={{ marginRight: SPACING.sm }}>
              Strength
            </Text>
            {[0.08, 0.12, 0.2, 0.3].map((value) => {
              const selected = Math.abs((colorOverlayOpacity || 0.12) - value) < 0.01;
              return (
                <TouchableOpacity
                  key={`tint-${value}`}
                  onPress={() => setColorOverlay(colorOverlay, value)}
                  style={[styles.strengthChip, selected ? styles.strengthChipOn : null]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${Math.round(value * 100)} percent`}
                >
                  <Text
                    variant="caption"
                    weight={selected ? 'bold' : 'normal'}
                    color={selected ? COLORS.cyanDark : COLORS.textMuted}
                  >
                    {Math.round(value * 100)}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text variant="caption" color={COLORS.textSubtle} style={styles.hint}>
            Which colour helps is personal, and there is no way to work it out except by trying a
            few. Nothing bad happens if none of them do.
          </Text>
        )}
      </Section>

      {/* ------------------------------------------------------- Reading aids */}
      <Section title="Reading aids">
        <ListGroup>
          <ListRow
            title="Bold the start of each word"
            description="Some readers keep their place better with it. The evidence is weak, so it is off by default — keep it only if it genuinely helps you."
            toggle
            toggled={bionic}
            onToggle={toggleBionic}
          />
          <ListRow
            title="Reading ruler"
            description="A movable band that isolates one line, so your eye cannot skip or repeat one in a dense paragraph."
            toggle
            toggled={readingRuler}
            onToggle={toggleReadingRuler}
          />
          <ListRow
            title="Speak a mind map branch when it opens"
            description="A map of silent text is still a wall of words. The audio is what makes the diagram readable."
            toggle
            toggled={speakOnTap}
            onToggle={toggleSpeakOnTap}
            divider={false}
          />
        </ListGroup>
      </Section>

      {/* ------------------------------------------------------ Language, voice */}
      <Section
        title="Language and voice"
        description="One choice covers both — what SETU writes, and what it says"
      >
        <ListGroup>
          <ListRow
            title="Language"
            description="Setting only the voice gives you a Hindi speaker reading English sentences"
            value={languageLabel(language)}
            onPress={() => setLanguageOpen(true)}
          />
          <ListRow
            title="Voice"
            description={
              naturalVoice === null
                ? 'Checking which voices this engine has…'
                : naturalVoice
                  ? 'A natural voice from the engine'
                  : 'This engine has no natural voice, so your phone’s own synthesiser is used'
            }
            value={
              naturalVoice === false
                ? 'Phone voice'
                : currentVoice?.label || (naturalVoice ? 'Engine default' : '—')
            }
            onPress={naturalVoice ? () => setVoiceOpen(true) : undefined}
            disabled={naturalVoice !== true}
          />
          <ListRow
            title="Reading pace"
            divider={false}
            trailing={
              <View style={styles.paceRow}>
                {SPEECH_RATES.map((rate) => (
                  <TouchableOpacity
                    key={`rate-${rate}`}
                    onPress={() => setSpeechRate(rate)}
                    style={[styles.paceChip, speechRate === rate ? styles.paceChipOn : null]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: speechRate === rate }}
                    accessibilityLabel={`${rate} times speed`}
                  >
                    <Text
                      variant="caption"
                      weight={speechRate === rate ? 'bold' : 'normal'}
                      color={speechRate === rate ? COLORS.cyanDark : COLORS.textMuted}
                    >
                      {rate}×
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />
        </ListGroup>

        <View style={styles.pitchRow}>
          <Text variant="caption" color={COLORS.textMuted} style={{ marginRight: SPACING.sm }}>
            Pitch
          </Text>
          {[
            { value: 0.8, label: 'Lower' },
            { value: 1.0, label: 'Natural' },
            { value: 1.2, label: 'Higher' },
          ].map((entry) => {
            const selected = Math.abs(speechPitch - entry.value) < 0.01;
            return (
              <TouchableOpacity
                key={`pitch-${entry.value}`}
                onPress={() => setSpeechPitch(entry.value)}
                style={[styles.strengthChip, selected ? styles.strengthChipOn : null]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${entry.label} pitch`}
              >
                <Text
                  variant="caption"
                  weight={selected ? 'bold' : 'normal'}
                  color={selected ? COLORS.cyanDark : COLORS.textMuted}
                >
                  {entry.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Button
          title="Hear how that sounds"
          variant="secondary"
          size="md"
          fullWidth
          icon={<Volume2 size={16} color={COLORS.text} />}
          onPress={() => {
            buzz();
            // Spoken in the chosen language, so the test demonstrates the thing
            // being configured rather than an English sentence in a Tamil voice.
            tts.speak(languageSample(language));
          }}
          style={{ marginTop: SPACING.md }}
        />
      </Section>

      {/* ----------------------------------------------------------- Momentum */}
      <Section title="Points and streaks">
        <ListGroup>
          <ListRow
            icon={<TrendingUp size={18} color={COLORS.cyan} />}
            title="Show points and milestones"
            description="Counting carries on either way — turning this off only hides the notifications."
            toggle
            toggled={rewards}
            onToggle={toggleRewards}
          />
          <ListRow
            title="Open Momentum"
            description="Your points, streak and the milestones you have hit"
            onPress={() => navigation.navigate('Momentum')}
            divider={false}
          />
        </ListGroup>
      </Section>

      {/*
        ------------------------------------------------------------- Engine

        This row is the ONLY way to reach the engine sheet, and therefore the
        only way to point the app at a different backend from inside the app.
        Without it the sheet below still renders and still works — it is simply
        unreachable, which is worse than missing, because the code reads as
        though the feature is present.
      */}
      <Section title="The engine">
        <ListGroup>
          <ListRow
            title="Connection"
            description={isCustomApiUrl(customApiUrl) ? customApiUrl : 'The one this build ships with'}
            value={engineStatus}
            onPress={() => setEngineOpen(true)}
          />
          <ListRow
            icon={<Info size={18} color={COLORS.textMuted} />}
            title="About SETU"
            description="What it does with your data, and what it is talking to"
            onPress={() => navigation.navigate('About')}
            divider={false}
          />
        </ListGroup>
      </Section>

      {/* --------------------------------------------------------- Your data */}
      <Section
        title="Your data"
        description="No accounts and no logins — just a random token made on this phone"
      >
        {/*
          What this paragraph has to do is say where the data actually is.

          It used to say the identity was "a local anonymous token shared
          transparently across local engine requests", which reads as though
          nothing leaves the phone. Maps, summaries, settings and progress are
          all mirrored to the engine under this ID as they are written. Someone
          deciding whether to type something into this app is entitled to know
          that in one sentence, on this screen, rather than inferring it.
        */}
        <Text variant="caption" color={COLORS.textMuted} style={{ marginBottom: SPACING.md }}>
          This random ID is the only thing identifying you, and it is created on this phone. Your
          mind maps, summaries, settings and progress are copied to the SETU engine under it, so
          they survive a reinstall. Your check-in journal and parking lot are not: those stay on
          this device only.
        </Text>

        <Text variant="bodySm" weight="bold" style={{ marginBottom: SPACING.md }}>
          {userId || 'loading…'}
        </Text>

        <ListGroup>
          <ListRow
            icon={<RefreshCw size={18} color={COLORS.textMuted} />}
            title="Give this phone a new token"
            description="Your maps and settings stay. Anything on the engine under the old one becomes unreachable."
            onPress={newIdentity}
          />
          <ListRow
            icon={<Trash2 size={18} color={COLORS.error} />}
            title="Erase this phone's copy"
            description="Maps, results, notes and preferences. The token is kept, so anything already on the engine stays reachable."
            tone="danger"
            onPress={handleClearAllData}
            divider={false}
          />
        </ListGroup>

        {/*
          Typeface attribution.

          The three faces are redistributed inside the app, and the SIL Open
          Font Licence asks that the notice travel with them. The full text is
          at assets/fonts/NOTICE.txt; this is the acknowledgement a user can
          actually see. The last sentence is here for the same reason it is in
          that file — the app offers Hyperlegible because some readers find it
          more comfortable, not because a typeface treats anything.
        */}
        <Text variant="caption" color={COLORS.textSubtle} style={{ marginTop: SPACING.md }}>
          Typefaces: Atkinson Hyperlegible (Braille Institute of America), Lexend, and Source Serif
          4 (Adobe) — all under the SIL Open Font License 1.1. A typeface is a comfort setting here,
          not a treatment; the accommodation with evidence behind it is the letter spacing above.
        </Text>
      </Section>

      <Text variant="caption" color={COLORS.textSubtle} align="center" style={styles.version}>
        SETU {APP_VERSION} · built for Hack4Positive 2026
      </Text>

      {/* ------------------------------------------------------------- Sheets */}
      <Sheet
        visible={languageOpen}
        onClose={() => setLanguageOpen(false)}
        title="Language"
        subtitle="Answers and the read-aloud voice change together"
      >
        {LANGUAGES.map((entry, index) => (
          <ListRow
            key={entry.code}
            title={entry.native}
            description={entry.name}
            selectable
            selected={language === entry.code}
            divider={index < LANGUAGES.length - 1}
            onPress={async () => {
              await setLanguage(entry.code);
              setLanguageOpen(false);
              tts.speak(languageSample(entry.code));
            }}
          />
        ))}
      </Sheet>

      <Sheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        title="Voice"
        subtitle="Each one speaks when you pick it, in your chosen language"
      >
        {voices.map((entry, index) => (
          <ListRow
            key={entry.id}
            title={entry.label}
            description={entry.note}
            selectable
            selected={voice === entry.id}
            divider={index < voices.length - 1}
            onPress={async () => {
              await setVoice(entry.id);
              tts.speak(languageSample(language));
            }}
          />
        ))}
      </Sheet>

      <Sheet
        visible={engineOpen}
        onClose={() => setEngineOpen(false)}
        title="The engine"
        subtitle="Only change this if you are running your own"
        footer={
          <View style={styles.engineFooter}>
            <Button
              title="Check it"
              variant="secondary"
              size="md"
              loading={testing}
              onPress={testEngine}
              style={{ flex: 1 }}
            />
            <Button
              title="Save"
              variant="primary"
              size="md"
              onPress={saveEngine}
              style={{ flex: 1 }}
            />
          </View>
        }
      >
        <View style={styles.engineStatus}>
          <Text variant="bodySm" weight="semibold">
            {engineStatus}
          </Text>
          <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: 2 }}>
            {isDbConnected
              ? 'Your maps are mirrored to the database, so a second device can catch up.'
              : 'Nothing is being mirrored — everything is kept on this phone only.'}
          </Text>
        </View>

        <Input
          label="Address"
          hint={
            isCustomApiUrl(customApiUrl)
              ? `Leave it empty to go back to ${DEFAULT_API_URL}`
              : `Currently using ${DEFAULT_API_URL}`
          }
          placeholder={DEFAULT_API_URL}
          value={apiUrlInput}
          onChangeText={setApiUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="Engine address"
        />

        {testResult ? (
          <Text variant="bodySm" color={COLORS.textMuted} style={styles.testResult}>
            {testResult}
          </Text>
        ) : null}

        <Text variant="caption" color={COLORS.textSubtle} style={styles.hint}>
          The extension, the web app and this phone all talk to the same engine by default, which
          is how a map you make here opens there.
        </Text>
      </Sheet>
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    label: {
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    hint: {
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    swatches: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    swatch: {
      width: 92,
      alignItems: 'center',
      padding: SPACING.sm,
      borderRadius: RADIUS.md,
      borderWidth: 1.5,
      borderColor: 'transparent',
      minHeight: 76,
    },
    swatchOn: {
      borderColor: t.cyan,
      backgroundColor: t.surface,
    },
    chip: {
      width: 52,
      height: 34,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: t.divider,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 3,
      marginBottom: 4,
    },
    ink: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    strengthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.md,
      gap: SPACING.xs,
    },
    strengthChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      backgroundColor: t.surface,
      minHeight: 40,
      justifyContent: 'center',
    },
    strengthChipOn: {
      backgroundColor: t.cyanLight,
      borderColor: t.cyanBorder,
    },
    paceRow: {
      flexDirection: 'row',
      gap: 3,
    },
    paceChip: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      backgroundColor: t.bg,
      minWidth: 40,
      alignItems: 'center',
    },
    paceChipOn: {
      backgroundColor: t.cyanLight,
      borderColor: t.cyanBorder,
    },
    pitchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.md,
      gap: SPACING.xs,
    },
    privacy: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.lg,
      marginBottom: SPACING.md,
    },
    engineStatus: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    engineFooter: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    testResult: {
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    version: {
      marginTop: SPACING.xxxl,
    },
  });
