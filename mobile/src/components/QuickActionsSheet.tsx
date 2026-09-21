/**
 * SETU Mobile — quick actions.
 *
 * The mobile answer to the web command palette. The web version is a search
 * box because a keyboard is already under the reader's hands; on a phone,
 * making someone type to find a feature is worse than showing it, so this is a
 * searchable *list* that is useful before a single character is typed.
 *
 * What it is really for: every tool in SETU starts with "I have a thing —
 * some text, a page, a sum, a feeling — and I do not know where it goes."
 * Grouping by that question rather than by feature name means the answer is
 * findable by someone who does not yet know what the feature is called.
 */

import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Search,
  PlayCircle,
  Waves,
  GraduationCap,
  Users,
  MessageCircle,
  PenTool,
  Route,
  Calculator,
  Network,
  Camera,
  Heart,
  Wind,
  Timer,
  Pin,
  BookOpen,
  TrendingUp,
  Settings as SettingsIcon,
  Type,
  BookMarked,
  Moon,
} from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useShell } from '../context/ShellContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { useFocus } from '../context/FocusContext';
import { Sheet } from './Sheet';
import { Input } from './Input';
import { Text } from './Typography';
import { navigate, navigateTab } from '../navigation/navigationRef';
import { CognitiveModeKey } from '../types';

interface QuickAction {
  id: string;
  group: 'Make something easier' | 'Look at it differently' | 'Take care of yourself' | 'Adjust reading';
  label: string;
  hint: string;
  icon: any;
  /** Extra words that should match this action in search but are not shown. */
  keywords?: string;
  run: () => void;
}

const MODE_ICONS: Record<CognitiveModeKey, any> = {
  start: PlayCircle,
  simplify: Waves,
  learn: GraduationCap,
  meet: Users,
  practice: MessageCircle,
  write: PenTool,
  guide: Route,
  numbers: Calculator,
};

const MODE_ROWS: { key: CognitiveModeKey; label: string; hint: string; keywords: string }[] = [
  {
    key: 'start',
    label: 'I cannot get started',
    hint: 'Start — turns it into one ten-minute action',
    keywords: 'stuck freeze procrastinate avoid paralysis begin',
  },
  {
    key: 'simplify',
    label: 'This text is too dense',
    hint: 'Simplify — plain language, nothing dropped',
    keywords: 'legal jargon policy notice rewrite plain grade',
  },
  {
    key: 'learn',
    label: 'I need to learn this',
    hint: 'Learn — notes, an outline, and a quiz',
    keywords: 'study revise exam quiz notes lecture',
  },
  {
    key: 'meet',
    label: 'I missed what was decided',
    hint: 'Meet — actions, owners and deadlines from a transcript',
    keywords: 'meeting minutes transcript action items standup',
  },
  {
    key: 'practice',
    label: 'I have to say something hard',
    hint: 'Practice — rehearse it in a few tones first',
    keywords: 'conversation rehearse script difficult ask boss',
  },
  {
    key: 'write',
    label: 'Is my writing clear?',
    hint: 'Write — reading level and the sentences that lose people',
    keywords: 'draft email edit clarity passive voice check',
  },
  {
    key: 'guide',
    label: 'I do not know the steps',
    hint: 'Guide — numbered steps with a signal at each one',
    keywords: 'process how to workflow instructions form apply',
  },
  {
    key: 'numbers',
    label: 'The numbers will not sit still',
    hint: 'Numbers — the sum as countable things, one step at a time',
    keywords: 'maths math dyscalculia percentage split bill arithmetic',
  },
];

export const QuickActionsSheet: React.FC = () => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isActionsOpen, closeShell, openParking } = useShell();
  const { font, size, setFont, setSize, theme, setTheme, bionic, toggleBionic, readingRuler, toggleReadingRuler } =
    useAccessibility();
  const { isActive, startSession } = useFocus();

  const [query, setQuery] = useState('');

  const actions = useMemo<QuickAction[]>(() => {
    const close = (fn: () => void) => () => {
      closeShell();
      fn();
    };

    const modeActions: QuickAction[] = MODE_ROWS.map((row) => ({
      id: `mode-${row.key}`,
      group: 'Make something easier',
      label: row.label,
      hint: row.hint,
      icon: MODE_ICONS[row.key],
      keywords: row.keywords,
      run: close(() => navigate('ModeWorkspace', { mode: row.key })),
    }));

    return [
      ...modeActions,

      {
        id: 'map',
        group: 'Look at it differently',
        label: 'Draw a topic as a map',
        hint: 'Research anything into branches you open one at a time',
        icon: Network,
        keywords: 'mindmap research diagram topic explain branches',
        run: close(() => navigateTab('MapTab')),
      },
      {
        id: 'scan',
        group: 'Look at it differently',
        label: 'Read a printed page',
        hint: 'Point the camera at a letter, a form, or a notice',
        icon: Camera,
        keywords: 'ocr camera photo scan document letter bill',
        run: close(() => navigate('CameraOCR')),
      },
      {
        id: 'library',
        group: 'Look at it differently',
        label: 'Open something I kept',
        hint: 'Maps, results and documents from before',
        icon: BookOpen,
        keywords: 'saved history documents files summaries',
        run: close(() => navigateTab('LibraryTab')),
      },

      {
        id: 'listen',
        group: 'Take care of yourself',
        label: 'Say it to someone',
        hint: 'A listener that does not judge, and never scores you',
        icon: Heart,
        keywords: 'vent frustrated anxious sad journal reflect support',
        run: close(() => navigate('Listen')),
      },
      {
        id: 'breathe',
        group: 'Take care of yourself',
        label: 'Settle for a minute',
        hint: 'A slow breathing guide, no talking required',
        icon: Wind,
        keywords: 'calm breathe panic overwhelmed anxiety ground',
        run: close(() => navigate('Breathe')),
      },
      {
        id: 'focus',
        group: 'Take care of yourself',
        label: isActive ? 'Focus session is running' : 'Focus for 25 minutes',
        hint: isActive ? 'Open Momentum to see how it is going' : 'Runs while you use other apps',
        icon: Timer,
        keywords: 'pomodoro timer concentrate work session',
        run: close(() => {
          if (isActive) navigate('Momentum');
          else startSession();
        }),
      },
      {
        id: 'parking',
        group: 'Take care of yourself',
        label: 'Park a thought',
        hint: 'Put it down so you can finish what you were doing',
        icon: Pin,
        keywords: 'remember note distraction interrupt idea capture',
        run: () => {
          closeShell();
          setTimeout(openParking, 220);
        },
      },
      {
        id: 'momentum',
        group: 'Take care of yourself',
        label: 'See how I am doing',
        hint: 'Points, streak and milestones',
        icon: TrendingUp,
        keywords: 'progress streak points rewards milestones stats',
        run: close(() => navigate('Momentum')),
      },

      {
        id: 'bionic',
        group: 'Adjust reading',
        label: bionic ? 'Turn off bold word starts' : 'Bold the start of each word',
        hint: 'Some readers find it helps the eye land; many do not',
        icon: Type,
        keywords: 'bionic bold reading aid letters',
        run: close(toggleBionic),
      },
      {
        id: 'ruler',
        group: 'Adjust reading',
        label: readingRuler ? 'Put the reading ruler away' : 'Show the reading ruler',
        hint: 'Isolates one line so the rest stops competing',
        icon: BookMarked,
        keywords: 'ruler line focus guide track place',
        run: close(toggleReadingRuler),
      },
      {
        id: 'font',
        group: 'Adjust reading',
        label: font === 'sans' ? 'Back to the reading serif' : 'Switch to the sans typeface',
        hint: 'Plainer letterforms, with no strokes on the ends',
        icon: Type,
        keywords: 'font typeface sans serif letterforms',
        run: close(() => setFont(font === 'sans' ? 'serif' : 'sans')),
      },
      {
        id: 'size',
        group: 'Adjust reading',
        label: size === 'large' ? 'Set text back to normal' : 'Make the text larger',
        hint: size === 'large' ? 'Currently at the largest size' : 'Everything grows, including the buttons',
        icon: Type,
        keywords: 'text size bigger larger zoom scale',
        run: close(() => setSize(size === 'large' ? 'normal' : 'large')),
      },
      {
        id: 'dark',
        group: 'Adjust reading',
        label: theme === 'velvet' ? 'Back to the paper ground' : 'Switch to the dark ground',
        hint: 'Six grounds in all, in Settings',
        icon: Moon,
        keywords: 'dark mode night theme velvet contrast colour',
        run: close(() => setTheme(theme === 'velvet' ? 'broadsheet' : 'velvet')),
      },
      {
        id: 'settings',
        group: 'Adjust reading',
        label: 'All settings',
        hint: 'Typeface, ground, tint, language, voice and privacy',
        icon: SettingsIcon,
        keywords: 'settings preferences options configure',
        run: close(() => navigate('Settings')),
      },
    ];
  }, [
    closeShell,
    openParking,
    isActive,
    startSession,
    bionic,
    toggleBionic,
    readingRuler,
    toggleReadingRuler,
    font,
    setFont,
    size,
    setSize,
    theme,
    setTheme,
  ]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.hint} ${action.keywords || ''}`.toLowerCase().includes(needle)
    );
  }, [actions, query]);

  const grouped = useMemo(() => {
    const order: QuickAction['group'][] = [
      'Make something easier',
      'Look at it differently',
      'Take care of yourself',
      'Adjust reading',
    ];
    return order
      .map((group) => ({ group, items: filtered.filter((action) => action.group === group) }))
      .filter((section) => section.items.length > 0);
  }, [filtered]);

  const close = () => {
    setQuery('');
    closeShell();
  };

  return (
    <Sheet
      visible={isActionsOpen}
      onClose={close}
      title="What do you need?"
      subtitle="Described by the problem, not the feature name"
      maxHeightRatio={0.88}
    >
      <Input
        placeholder="Search — try “stuck”, “too long”, “calm”"
        value={query}
        onChangeText={setQuery}
        leadingIcon={<Search size={16} color={COLORS.textSubtle} />}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search quick actions"
      />

      {grouped.length === 0 ? (
        <Text variant="bodySm" color={COLORS.textMuted} style={styles.noResults}>
          Nothing matches “{query.trim()}”. Clear the search to see everything again.
        </Text>
      ) : null}

      {grouped.map((section) => (
        <View key={section.group} style={styles.group}>
          <Text variant="kicker" color={COLORS.textSubtle} style={styles.groupLabel}>
            {section.group}
          </Text>

          {section.items.map((action) => {
            const Icon = action.icon;
            return (
              <TouchableOpacity
                key={action.id}
                activeOpacity={0.75}
                onPress={action.run}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={action.hint}
              >
                <View style={styles.rowIcon}>
                  <Icon size={18} color={COLORS.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySm" weight="semibold">
                    {action.label}
                  </Text>
                  <Text variant="caption" color={COLORS.textMuted}>
                    {action.hint}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </Sheet>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    group: {
      marginBottom: SPACING.lg,
    },
    groupLabel: {
      marginBottom: SPACING.xs,
      paddingHorizontal: SPACING.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.md,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      marginBottom: SPACING.xs,
      minHeight: 56,
      gap: SPACING.md,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noResults: {
      paddingVertical: SPACING.xl,
      textAlign: 'center',
    },
  });
