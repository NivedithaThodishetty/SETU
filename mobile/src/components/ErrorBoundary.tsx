/**
 * SETU Mobile — crash guard.
 *
 * A white screen is the single worst outcome for this audience: there is no
 * error to read, no obvious action, and nothing to do except assume you broke
 * it. This keeps the app on screen, says what happened in plain words, and
 * offers one button that reliably works.
 *
 * Deliberately not a debugging surface. The stack trace is available for a
 * developer running a dev build, and is kept out of the way otherwise.
 *
 * Everything here uses React Native's own `Text` and a statically imported
 * palette rather than SETU's themed components, because the provider tree is
 * exactly what may have just failed.
 */

import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshCw, TriangleAlert } from 'lucide-react-native';

import { BROADSHEET } from '../constants/themes';
import { RADIUS, SPACING } from '../constants/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // No crash reporter is wired up, and adding one would mean shipping user
    // content off-device — which this app promises not to do. The dev console
    // is the honest place for this.
    if (__DEV__) console.error('[SETU] Unhandled error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      // The palette is imported statically rather than read from context: the
      // theme provider may be the thing that just failed.
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.iconBubble}>
            <TriangleAlert size={26} color={BROADSHEET.magenta} />
          </View>

          <Text style={styles.heading}>Something went wrong on this screen</Text>

          <Text style={styles.body}>
            This is on us, not on you. Nothing you saved has been lost — your maps, notes and
            settings are all still on this phone.
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Try this screen again"
            style={styles.button}
            onPress={() => this.setState({ error: null })}
          >
            <RefreshCw size={16} color={BROADSHEET.textInverse} />
            <Text style={styles.buttonLabel}>Try again</Text>
          </TouchableOpacity>

          {__DEV__ ? <Text style={styles.debug}>{String(error?.message || error)}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BROADSHEET.bg,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BROADSHEET.magentaLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  heading: {
    fontFamily: 'serif',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: 'bold',
    color: BROADSHEET.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  body: {
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 23,
    color: BROADSHEET.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: SPACING.xl,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 48,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    backgroundColor: BROADSHEET.cyan,
  },
  buttonLabel: {
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: 'bold',
    color: BROADSHEET.textInverse,
  },
  debug: {
    marginTop: SPACING.xxl,
    fontSize: 11,
    color: BROADSHEET.textSubtle,
    textAlign: 'center',
  },
});

export default ErrorBoundary;
