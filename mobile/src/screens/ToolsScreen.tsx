/**
 * SETU Mobile — Tools.
 *
 * The eight cognitive modes used to share one screen with a horizontal strip of
 * tabs above them. That made them look like eight settings of one feature, and
 * it hid the accommodation: nothing on screen said that Numbers works
 * differently from Simplify, or that Practice produces a script rather than a
 * summary.
 *
 * They are separate tools with separate jobs, so they get a list — one row
 * each, each row saying what problem it solves and what you get back — and
 * opening one gives it the whole screen.
 *
 * A list rather than a grid of tiles, deliberately. Tiles buy density at the
 * cost of the sentence that explains what the thing does, and on a screen whose
 * entire purpose is that reading is effortful, cutting the explanation to fit
 * two columns is the wrong economy.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Camera, FileStack, ListChecks, Network, Search } from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useShell } from '../context/ShellContext';
import { Screen } from '../components/Screen';
import { Section } from '../components/Section';
import { ListGroup, ListRow } from '../components/ListRow';
import { Text } from '../components/Typography';
import { MODES, PlateKey } from '../constants/modeCatalog';

export interface ToolsScreenProps {
  navigation: any;
}

export const ToolsScreen: React.FC<ToolsScreenProps> = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { openActions } = useShell();

  const plate = (key: PlateKey) =>
    key === 'cyan'
      ? COLORS.cyan
      : key === 'magenta'
        ? COLORS.magenta
        : key === 'yellow'
          ? COLORS.yellowDark
          : COLORS.text;

  return (
    <Screen
      title="Tools"
      subtitle="Eight ways to make something easier"
      actions={[
        {
          key: 'search',
          label: 'Search everything SETU can do',
          icon: <Search size={18} color={COLORS.text} />,
          onPress: openActions,
        },
      ]}
    >
      <View style={styles.intro}>
        <Text variant="bodySm" color={COLORS.textMuted}>
          Each one opens on a worked example, so you can see what it does before you give it
          anything of your own. Nothing you paste in is tied to a name or an email.
        </Text>
      </View>

      <Section title="Cognitive tools" spacing="normal">
        <ListGroup>
          {MODES.map((mode, index) => (
            <ListRow
              key={mode.key}
              icon={<mode.icon size={19} color={plate(mode.plate)} />}
              title={mode.problem}
              description={`${mode.name} — ${mode.blurb}`}
              divider={index < MODES.length - 1}
              onPress={() => navigation.navigate('ModeWorkspace', { mode: mode.key })}
            />
          ))}
        </ListGroup>
      </Section>

      <Section
        title="Working with a whole document"
        description="Longer things, where the problem is the length rather than one paragraph"
      >
        <ListGroup>
          <ListRow
            icon={<Network size={19} color={COLORS.cyan} />}
            title="Draw a topic as a map"
            description="Research anything into branches you open — and hear explained — one at a time"
            onPress={() => navigation.navigate('MapTab')}
          />
          <ListRow
            icon={<Camera size={19} color={COLORS.cyan} />}
            title="Read a printed page"
            description="Point the camera at a letter, a form or a notice and get the text out of it"
            onPress={() => navigation.navigate('CameraOCR')}
          />
          <ListRow
            icon={<FileStack size={19} color={COLORS.cyan} />}
            title="Open a document"
            description="A PDF or Word file, read aloud, simplified, or asked questions of"
            onPress={() => navigation.navigate('LibraryTab', { tab: 'documents' })}
          />
          <ListRow
            icon={<ListChecks size={19} color={COLORS.cyan} />}
            title="Break something into three steps"
            description="For when the whole of it is the problem — never more than three at a time"
            divider={false}
            onPress={() => navigation.navigate('ModeWorkspace', { mode: 'chunk' })}
          />
        </ListGroup>
      </Section>

      <View style={styles.note}>
        <Text variant="caption" color={COLORS.textSubtle}>
          Every result can be copied, shared, or read aloud in any of the eleven languages SETU
          speaks. Change the language in Settings and everything follows — the words and the
          voice together.
        </Text>
      </View>
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    intro: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.md,
    },
    note: {
      marginTop: SPACING.xxl,
      paddingHorizontal: SPACING.xs,
    },
  });
