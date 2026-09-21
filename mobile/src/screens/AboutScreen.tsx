/**
 * SETU Mobile — About.
 *
 * Not a credits page. Three things belong here and nothing else does: what this
 * app is for, what it does with your data, and how to tell whether it is
 * actually working right now.
 *
 * The privacy section is written plainly and put near the top on purpose. Part
 * of the audience for this app will not disclose a disability to an employer,
 * and "does this thing know who I am?" is a question they are entitled to have
 * answered without reading a policy.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { ExternalLink, Shield, Cpu, Globe, Heart } from 'lucide-react-native';

import { SPACING, RADIUS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useIdentity } from '../context/IdentityContext';
import { Screen } from '../components/Screen';
import { Section } from '../components/Section';
import { ListGroup, ListRow } from '../components/ListRow';
import { Text } from '../components/Typography';
import { APP_VERSION } from '../constants/config';
import { getApiBaseUrl } from '../services/api';
import { LANGUAGES } from '../constants/languages';
import { peekUserId } from '../services/identity';

export interface AboutScreenProps {
  navigation: any;
}

export const AboutScreen: React.FC<AboutScreenProps> = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { engineState, isDbConnected } = useIdentity();

  const [engine, setEngine] = useState(getApiBaseUrl());
  useEffect(() => setEngine(getApiBaseUrl()), []);

  const engineLine =
    engineState === 'ok'
      ? isDbConnected
        ? 'Reachable, with the database connected'
        : 'Reachable — results are kept on this phone only'
      : engineState === 'checking'
        ? 'Checking…'
        : engineState === 'nokey'
          ? 'Reachable, but no AI key is set on the server'
          : 'Not reachable — saved work still opens';

  const open = (url: string) => {
    Linking.openURL(url).catch(() => {
      /* no browser, or the link was refused — nothing useful to say about it */
    });
  };

  return (
    <Screen
      title="About SETU"
      subtitle={`Version ${APP_VERSION}`}
      leading="back"
      onBack={() => navigation.goBack()}
    >
      <View style={styles.lede}>
        <Text variant="titleSm" weight="bold">
          A bridge between dense pages and how your brain actually reads.
        </Text>
        <Text variant="bodySm" color={COLORS.textMuted} style={{ marginTop: SPACING.sm }}>
          SETU is built for people with ADHD, dyslexia, dyscalculia and dysgraphia — and for
          anyone having a day where reading is harder than usual. It reshapes text, explains
          things out loud in eleven languages, breaks tasks into steps small enough to start, and
          works the same on this phone, in a browser extension, and on the web.
        </Text>
      </View>

      <Section title="Your data" description="The short version, in full">
        <View style={styles.privacy}>
          <View style={styles.privacyRow}>
            <Shield size={16} color={COLORS.success} />
            <Text variant="bodySm" style={styles.privacyText}>
              There is no account. No email, no password, no name — nothing on the server can be
              tied back to a person.
            </Text>
          </View>
          <View style={styles.privacyRow}>
            <Shield size={16} color={COLORS.success} />
            <Text variant="bodySm" style={styles.privacyText}>
              This install has one random token, which is how your maps find their way back to
              you. You can replace it at any time from Settings.
            </Text>
          </View>
          <View style={styles.privacyRow}>
            <Shield size={16} color={COLORS.success} />
            <Text variant="bodySm" style={styles.privacyText}>
              What you write in Listen, and anything you park, stays on this phone. It is never
              sent anywhere.
            </Text>
          </View>
          <View style={styles.privacyRow}>
            <Shield size={16} color={COLORS.success} />
            <Text variant="bodySm" style={styles.privacyText}>
              Deleting everything is one button in Settings, and it really does delete everything,
              including the token.
            </Text>
          </View>
        </View>

        <Text variant="caption" color={COLORS.textSubtle} style={styles.tokenLine}>
          This install: {peekUserId()}
        </Text>
      </Section>

      <Section title="What it is talking to">
        <ListGroup>
          <ListRow
            icon={<Cpu size={18} color={COLORS.cyan} />}
            title="SETU engine"
            description={engineLine}
            value={engine.replace(/^https?:\/\//, '')}
          />
          <ListRow
            icon={<Globe size={18} color={COLORS.cyan} />}
            title="Languages"
            description="Written answers and the read-aloud voice change together"
            value={`${LANGUAGES.length}`}
            divider={false}
          />
        </ListGroup>

        <Text variant="caption" color={COLORS.textSubtle} style={styles.note}>
          The extension, the web app and this phone all talk to the same engine, so a map you make
          here opens there. Point this build at a different engine from Settings if you are
          running your own.
        </Text>
      </Section>

      <Section title="If things are hard right now">
        <View style={styles.crisis}>
          <Heart size={16} color={COLORS.magenta} />
          <View style={{ flex: 1, marginLeft: SPACING.sm }}>
            <Text variant="bodySm" weight="semibold">
              Tele-MANAS · 14416
            </Text>
            <Text variant="caption" color={COLORS.textMuted}>
              Free, 24/7, and answers in more than twenty Indian languages.
            </Text>
            <TouchableOpacity
              style={styles.callBtn}
              onPress={() => open('tel:14416')}
              accessibilityRole="button"
              accessibilityLabel="Call Tele-MANAS on 14416"
            >
              <Text variant="caption" weight="bold" color={COLORS.magenta}>
                Call 14416
              </Text>
              <ExternalLink size={12} color={COLORS.magenta} />
            </TouchableOpacity>
          </View>
        </View>

        <Text variant="caption" color={COLORS.textSubtle} style={styles.note}>
          SETU is not a clinical tool and does not diagnose anything. Listen is a place to put a
          thought, not therapy — and if what you write suggests you are in danger, it stops using
          the AI entirely and shows you these numbers instead.
        </Text>
      </Section>

      <Section title="Built with">
        <Text variant="bodySm" color={COLORS.textMuted}>
          Reviewed with Dr. Prakhar Jain, whose findings changed several things this app had
          assumed — that bigger fonts help (they largely do not), that mind maps work as text
          (they do not, unless spoken), and that maths has to be taught with countable objects
          rather than notation. Numbers, the spoken branches, and the honest labelling of bionic
          reading all come from that review.
        </Text>
        <Text variant="caption" color={COLORS.textSubtle} style={styles.note}>
          Built for Capgemini Hack4Positive 2026 · Disability Inclusion and Accessibility
        </Text>
      </Section>
    </Screen>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    lede: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderLeftWidth: 3,
      borderLeftColor: t.cyan,
      padding: SPACING.lg,
    },
    privacy: {
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    privacyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    privacyText: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
    tokenLine: {
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    note: {
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.xs,
    },
    crisis: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: t.magentaLight,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
    },
    callBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: SPACING.sm,
      minHeight: 40,
    },
  });
