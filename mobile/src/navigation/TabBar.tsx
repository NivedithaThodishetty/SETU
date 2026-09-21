/**
 * SETU Mobile — the bottom bar.
 *
 * Hand-rolled rather than the stock one for two reasons that both come from the
 * reading-size setting. The stock bar puts icon and label in a fixed-height
 * column, so at the largest text size the label either clips or pushes the icon
 * off; and it has no room for a centre action, which is where the thing you are
 * most likely to want next belongs.
 *
 * Four destinations and one action in the middle. The action is deliberately
 * not a fifth tab: it does not navigate, it opens the quick-actions sheet, and
 * making it look like a tab would teach the wrong thing about what it does.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { Sparkles, Network, LayoutGrid, BookOpen, Plus } from 'lucide-react-native';

import { SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { useShell } from '../context/ShellContext';
import { Text } from '../components/Typography';

const ICONS: Record<string, any> = {
  HomeTab: Sparkles,
  MapTab: Network,
  ToolsTab: LayoutGrid,
  LibraryTab: BookOpen,
};

const LABELS: Record<string, string> = {
  HomeTab: 'Home',
  MapTab: 'Map',
  ToolsTab: 'Tools',
  LibraryTab: 'Library',
};

export const TabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { sizeScale } = useAccessibility();
  const { openActions } = useShell();

  const iconSize = Math.round(20 * Math.min(sizeScale, 1.15));
  const labelSize = Math.round(10 * sizeScale);
  // Grows with the reading size instead of clipping: six fixed-height labels at
  // the largest setting is exactly where the old bar lost its bottom row.
  const rowHeight = Math.round(56 + (sizeScale - 1) * 40);

  const half = Math.ceil(state.routes.length / 2);

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const focused = state.index === index;
    const Icon = ICONS[route.name] || Sparkles;
    const label = LABELS[route.name] || route.name;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (focused || event.defaultPrevented) return;
      try {
        Haptics.selectionAsync();
      } catch (_) {
        /* haptics are a nicety, never a requirement */
      }
      navigation.navigate(route.name);
    };

    return (
      <TouchableOpacity
        key={route.key}
        style={[styles.tab, { height: rowHeight }]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
      >
        <View style={[styles.iconWrap, focused ? styles.iconWrapActive : null]}>
          <Icon size={iconSize} color={focused ? COLORS.cyan : COLORS.textMuted} />
        </View>
        <Text
          variant="caption"
          weight={focused ? 'semibold' : 'normal'}
          color={focused ? COLORS.cyan : COLORS.textMuted}
          style={{ fontSize: labelSize, marginTop: 2 }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, SPACING.xs) }]}>
      <View style={styles.row}>
        {state.routes.slice(0, half).map((route, index) => renderTab(route, index))}

        <TouchableOpacity
          style={[styles.action, { height: rowHeight }]}
          onPress={() => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch (_) {
              /* ignored */
            }
            openActions();
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Quick actions"
          accessibilityHint="Everything you can start right now, in one list"
        >
          <View style={styles.actionCircle}>
            <Plus size={20} color={COLORS.textInverse} />
          </View>
        </TouchableOpacity>

        {state.routes.slice(half).map((route, index) => renderTab(route, index + half))}
      </View>
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    bar: {
      backgroundColor: t.bg,
      borderTopWidth: 1,
      borderTopColor: t.dividerSubtle,
      ...(Platform.OS === 'ios' ? SHADOWS.sm : {}),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: SPACING.sm,
    },
    iconWrap: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 3,
      borderRadius: RADIUS.pill,
    },
    iconWrapActive: {
      backgroundColor: t.cyanLight,
    },
    action: {
      width: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: t.cyan,
      alignItems: 'center',
      justifyContent: 'center',
      ...SHADOWS.md,
    },
  });
