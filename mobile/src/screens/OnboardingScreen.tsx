/**
 * SETU Mobile — first run.
 *
 * Three questions and a skip button. Every one of them is a setting the user
 * could reach later in Settings; they are asked up front because the people this
 * is built for are the least likely to go hunting through a preferences screen,
 * and the app is close to unusable for some of them at the defaults.
 *
 * Language sits at the top of the first step rather than in its own step. It is
 * shown in native script, so somebody who cannot read the English question can
 * still recognise their own language and fix the rest afterwards.
 *
 * (original outline)
 * -------------------------------------------
 * Faithfully follows the Broadsheet Design Guidelines:
 * Step 1: Cognitive barrier selection (ADHD, Dyslexia, Autistic, Overwhelmed, Rather not say)
 * Step 2: Live readable typography preview (Typeface, Size scale, Bionic toggle)
 * Step 3: Motion sensitivity preference (Let things move vs Keep it still)
 */

import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import {
  Zap,
  BookOpen,
  Boxes,
  Waves,
  MoreHorizontal,
  Wind,
  PauseCircle,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from 'lucide-react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text, Heading, Kicker } from '../components/Typography';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { BionicText } from '../components/BionicText';
import { useAccessibility } from '../context/AccessibilityContext';
import { ReadingProfile, FontStyleOption, TextSizeOption, MotionOption } from '../types';
import { LANGUAGES } from '../constants/languages';

export interface OnboardingScreenProps {
  onComplete: () => void;
}

const PROFILE_OPTIONS: {
  id: ReadingProfile;
  label: string;
  hint: string;
  icon: any;
}[] = [
  {
    id: 'adhd',
    label: 'ADHD',
    hint: 'Attention slides off dense pages',
    icon: Zap,
  },
  {
    id: 'dyslexia',
    label: 'Dyslexia',
    hint: 'Letters move or swap',
    icon: BookOpen,
  },
  {
    id: 'autistic',
    label: 'Autistic',
    hint: 'Ambiguity and clutter cost energy',
    icon: Boxes,
  },
  {
    id: 'overwhelmed',
    label: 'Just overwhelmed',
    hint: 'Too much, too fast, too often',
    icon: Waves,
  },
  {
    id: 'general',
    label: 'Rather not say',
    hint: 'Show me everything',
    icon: MoreHorizontal,
  },
];

/**
 * Only what the phone can actually render.
 *
 * This list used to name Atkinson Hyperlegible, which is not bundled with the
 * app and never was — picking it changed nothing at all. Naming a real
 * dyslexia typeface and then not shipping it is worse than not offering one,
 * because the reader concludes the accommodation does not work for them.
 * Settings offers letter spacing instead, which does more of the same job and
 * works with whatever font is installed.
 */
const FONT_OPTIONS: { id: FontStyleOption; label: string; hint: string }[] = [
  { id: 'serif', label: 'Serif', hint: 'Strokes on the ends of letters' },
  { id: 'sans', label: 'Sans', hint: 'Plainer letterforms, no strokes' },
  { id: 'system', label: 'Your phone’s', hint: 'Follows your own system settings' },
];

const SIZE_OPTIONS: { id: TextSizeOption; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal (1.0×)', hint: 'Standard density' },
  { id: 'comfortable', label: 'Comfortable (1.1×)', hint: 'Room to breathe' },
  { id: 'large', label: 'Large (1.22×)', hint: 'Maximum legibility' },
];

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const {
    profile,
    font,
    size,
    motion,
    bionic,
    setProfile,
    setFont,
    setSize,
    setMotion,
    toggleBionic,
    completeOnboarding,
    language,
    setLanguage,
  } = useAccessibility();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleToggleProfile = (id: ReadingProfile) => {
    if (id === 'general') {
      setProfile(['general']);
      return;
    }
    const current = profile.filter((p) => p !== 'general');
    if (current.includes(id)) {
      const next = current.filter((p) => p !== id);
      setProfile(next.length ? next : ['general']);
    } else {
      setProfile([...current, id]);
    }
  };

  const handleFinish = async () => {
    await completeOnboarding();
    onComplete();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header with Step Indicator */}
        <View style={styles.header}>
          <Text variant="title" weight="bold" color={COLORS.text}>
            SETU
          </Text>

          <View style={styles.stepProgressContainer}>
            <Text variant="caption" color={COLORS.textMuted} style={styles.stepCounter}>
              Step {step} of 3
            </Text>
            <View style={styles.pipsRow}>
              <View style={[styles.pip, step >= 1 ? styles.pipActive : styles.pipInactive]} />
              <View style={[styles.pip, step >= 2 ? styles.pipActive : styles.pipInactive]} />
              <View style={[styles.pip, step >= 3 ? styles.pipActive : styles.pipInactive]} />
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* STEP 1 */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <Kicker color={COLORS.cyan}>Your language</Kicker>
              <Heading variant="titleLg" style={styles.stepHeading}>
                भाषा · மொழி · Language
              </Heading>
              <Text variant="bodySm" color={COLORS.textMuted} style={styles.stepSub}>
                SETU will answer and read aloud in whichever you pick.
              </Text>

              <View style={styles.languageWrap}>
                {LANGUAGES.map((item) => {
                  const selected = language === item.code;
                  return (
                    <TouchableOpacity
                      key={item.code}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${item.name}, ${item.native}`}
                      onPress={() => setLanguage(item.code)}
                      style={[
                        styles.languageChip,
                        selected ? styles.languageChipSelected : null,
                      ]}
                    >
                      <Text
                        variant="bodySm"
                        weight={selected ? 'bold' : 'normal'}
                        color={selected ? COLORS.cyanDark : COLORS.text}
                      >
                        {item.native}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Kicker color={COLORS.cyan} style={{ marginTop: SPACING.xl }}>
                Profile
              </Kicker>
              <Heading variant="titleLg" style={styles.stepHeading}>
                What tends to get in your way?
              </Heading>
              <Text variant="body" color={COLORS.textMuted} style={styles.stepSub}>
                Pick anything that fits — or none of it. It only changes which tools SETU
                puts in front of you first, and you can change it whenever you like.
              </Text>

              <View style={styles.optionsStack}>
                {PROFILE_OPTIONS.map((item) => {
                  const isSelected = profile.includes(item.id);
                  const IconComp = item.icon;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      style={[
                        styles.profileOption,
                        isSelected ? styles.optionSelected : styles.optionUnselected,
                      ]}
                      onPress={() => handleToggleProfile(item.id)}
                    >
                      <View
                        style={[
                          styles.iconBox,
                          isSelected ? styles.iconBoxSelected : styles.iconBoxUnselected,
                        ]}
                      >
                        <IconComp
                          size={20}
                          color={isSelected ? COLORS.cyanDark : COLORS.textMuted}
                        />
                      </View>
                      <View style={styles.optionTextCol}>
                        <Text
                          variant="body"
                          weight="semibold"
                          color={isSelected ? COLORS.cyanDark : COLORS.text}
                        >
                          {item.label}
                        </Text>
                        <Text variant="caption" color={COLORS.textMuted}>
                          {item.hint}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.footerActions}>
                <Button
                  title="Continue"
                  variant="primary"
                  size="lg"
                  fullWidth
                  icon={<ArrowRight size={18} color={COLORS.textInverse} />}
                  iconPosition="right"
                  onPress={() => setStep(2)}
                />
                <Button
                  title="Skip all this"
                  variant="ghost"
                  size="md"
                  fullWidth
                  style={styles.skipBtn}
                  onPress={handleFinish}
                />
              </View>
            </View>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <Kicker color={COLORS.cyan}>Reading Comfort</Kicker>
              <Heading variant="titleLg" style={styles.stepHeading}>
                Make this paragraph easy to read.
              </Heading>
              <Text variant="body" color={COLORS.textMuted} style={styles.stepSub}>
                Change the settings until the sample below feels comfortable. Whatever you
                land on is what the whole app uses.
              </Text>

              {/* Live Sample Card */}
              <Card elevated style={styles.sampleCard}>
                <Kicker color={COLORS.cyan} style={{ marginBottom: 6 }}>
                  Live Reading Sample
                </Kicker>
                <BionicText
                  text="Attention is the part that changed everything. Instead of reading a sentence word by word and hoping to remember the start by the time it reaches the end, the model looks at every word at once and decides, for each one, which of the others actually matter to it."
                  variant="body"
                  color={COLORS.text}
                />
              </Card>

              {/* Bionic Reading Toggle */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.bionicToggleCard,
                  bionic ? styles.optionSelected : styles.optionUnselected,
                ]}
                onPress={toggleBionic}
              >
                <Sparkles size={18} color={bionic ? COLORS.cyanDark : COLORS.textMuted} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text
                    variant="bodySm"
                    weight="semibold"
                    color={bionic ? COLORS.cyanDark : COLORS.text}
                  >
                    Bionic Anchor Reading ({bionic ? 'Enabled' : 'Disabled'})
                  </Text>
                  <Text variant="caption" color={COLORS.textMuted}>
                    Bolds initial word anchors to accelerate reading speed
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Typeface Selection */}
              <Text variant="bodySm" weight="semibold" style={styles.sectionLabel}>
                Typeface
              </Text>
              <View style={styles.optionsStack}>
                {FONT_OPTIONS.map((f) => (
                  <Button
                    key={f.id}
                    variant="option"
                    selected={font === f.id}
                    title={f.label}
                    subtitle={f.hint}
                    fullWidth
                    style={{ marginBottom: SPACING.xs }}
                    onPress={() => setFont(f.id)}
                  />
                ))}
              </View>

              {/* Text Size Selection */}
              <Text variant="bodySm" weight="semibold" style={styles.sectionLabel}>
                Text Size
              </Text>
              <View style={styles.optionsStack}>
                {SIZE_OPTIONS.map((s) => (
                  <Button
                    key={s.id}
                    variant="option"
                    selected={size === s.id}
                    title={s.label}
                    subtitle={s.hint}
                    fullWidth
                    style={{ marginBottom: SPACING.xs }}
                    onPress={() => setSize(s.id)}
                  />
                ))}
              </View>

              <View style={styles.footerActionsRow}>
                <Button
                  title="Back"
                  variant="secondary"
                  size="lg"
                  icon={<ArrowLeft size={18} color={COLORS.text} />}
                  onPress={() => setStep(1)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Continue"
                  variant="primary"
                  size="lg"
                  icon={<ArrowRight size={18} color={COLORS.textInverse} />}
                  iconPosition="right"
                  onPress={() => setStep(3)}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <Kicker color={COLORS.cyan}>Motion & Animations</Kicker>
              <Heading variant="titleLg" style={styles.stepHeading}>
                Should things move?
              </Heading>
              <Text variant="body" color={COLORS.textMuted} style={styles.stepSub}>
                Maps can grow into place, or simply appear. If motion makes you queasy or
                pulls your attention away, turn it off — nothing is lost either way.
              </Text>

              <View style={styles.optionsStack}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.motionCard,
                    motion === 'movement' ? styles.optionSelected : styles.optionUnselected,
                  ]}
                  onPress={() => setMotion('movement')}
                >
                  <Wind
                    size={22}
                    color={motion === 'movement' ? COLORS.cyanDark : COLORS.textMuted}
                  />
                  <View style={styles.optionTextCol}>
                    <Text
                      variant="body"
                      weight="semibold"
                      color={motion === 'movement' ? COLORS.cyanDark : COLORS.text}
                    >
                      Let things move
                    </Text>
                    <Text variant="caption" color={COLORS.textMuted}>
                      Branches smoothly grow and transition into place as they arrive
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.motionCard,
                    motion === 'reduced' ? styles.optionSelected : styles.optionUnselected,
                  ]}
                  onPress={() => setMotion('reduced')}
                >
                  <PauseCircle
                    size={22}
                    color={motion === 'reduced' ? COLORS.cyanDark : COLORS.textMuted}
                  />
                  <View style={styles.optionTextCol}>
                    <Text
                      variant="body"
                      weight="semibold"
                      color={motion === 'reduced' ? COLORS.cyanDark : COLORS.text}
                    >
                      Keep it still
                    </Text>
                    <Text variant="caption" color={COLORS.textMuted}>
                      Everything appears at once without motion or animations
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/*
                What happens to what you type, said once, before you type it.

                This is not a consent gate and does not pretend to be one — there
                is no account to attach a consent record to, and a checkbox that
                does nothing would be worse than this paragraph. What it does is
                make sure nobody reaches the first screen believing the app is
                offline when it is not. It names the three things that matter:
                there is a server, there is no account, and the check-in journal
                is the one thing that never leaves the phone.
              */}
              <View style={styles.privacyNote}>
                <ShieldCheck size={16} color={COLORS.textMuted} />
                <Text variant="caption" color={COLORS.textMuted} style={styles.privacyText}>
                  Before you start: SETU sends what you give it — text, photos of pages, recordings
                  — to its engine to be worked on, and keeps a copy of your maps, summaries and
                  settings there under a random ID made on this phone. There is no account and no
                  name. Your check-in journal and parking lot never leave this device. All of it is
                  in Settings, and you can erase this phone's copy there at any time.
                </Text>
              </View>

              <View style={styles.footerActionsRow}>
                <Button
                  title="Back"
                  variant="secondary"
                  size="lg"
                  icon={<ArrowLeft size={18} color={COLORS.text} />}
                  onPress={() => setStep(2)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Draw my first map"
                  variant="primary"
                  size="lg"
                  icon={<Sparkles size={18} color={COLORS.textInverse} />}
                  iconPosition="right"
                  onPress={handleFinish}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: t.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: t.dividerSubtle,
  },
  stepProgressContainer: {
    alignItems: 'flex-end',
  },
  stepCounter: {
    marginBottom: 4,
  },
  pipsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  pip: {
    width: 28,
    height: 4,
    borderRadius: 2,
  },
  pipActive: {
    backgroundColor: t.cyan,
  },
  pipInactive: {
    backgroundColor: t.divider,
  },
  scrollContent: {
    paddingVertical: SPACING.lg,
    paddingBottom: SPACING.huge,
  },
  stepContainer: {
    flex: 1,
  },
  stepHeading: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  stepSub: {
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  languageWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  languageChip: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: t.divider,
    backgroundColor: t.surface,
  },
  languageChipSelected: {
    borderWidth: 1.5,
    borderColor: t.cyan,
    backgroundColor: t.cyanLight,
  },
  optionsStack: {
    marginBottom: SPACING.lg,
  },
  profileOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
    minHeight: 64,
  },
  motionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.md,
    minHeight: 70,
  },
  bionicToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.md,
  },
  optionSelected: {
    backgroundColor: t.cyanLight,
    borderWidth: 1.5,
    borderColor: t.cyan,
  },
  optionUnselected: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: t.divider,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  iconBoxSelected: {
    backgroundColor: 'transparent',
  },
  iconBoxUnselected: {
    backgroundColor: t.surface,
  },
  optionTextCol: {
    flex: 1,
  },
  sampleCard: {
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  sectionLabel: {
    marginBottom: SPACING.xs,
    marginTop: SPACING.xs,
  },
  footerActions: {
    marginTop: SPACING.md,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: t.surfaceAlt,
    borderWidth: 1,
    borderColor: t.dividerSubtle,
  },
  privacyText: {
    flex: 1,
  },
  footerActionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  skipBtn: {
    marginTop: SPACING.xs,
  },
});
