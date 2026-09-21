/**
 * SETU Mobile — the mind map canvas.
 *
 * Branch identity is carried by colour, and the colours have to come from the
 * live palette rather than the reference one. This drew from the static
 * `PLATE_COLORS` constant, which meant that on the two dark grounds the ink
 * plate — near-black by definition — was invisible, and a quarter of every map
 * simply had no visible connectors. `plateColorsFor` exists for exactly this
 * and is now what the canvas uses.
 *
 * Three appearance choices are honoured, all of them accommodations rather
 * than decoration:
 *
 *  - **Edge style.** Curves are pleasant and, for some readers with visual
 *    processing difficulty, genuinely harder to follow than a straight line
 *    or a right-angled one.
 *  - **Node size.** Compact fits more of the map on screen; comfortable gives
 *    the text room. Which is better depends on the person, not the map.
 *  - **Picture mode.** The clinical guidance was explicit: mind maps help this
 *    audience when they carry no text, or when the text is spoken on contact.
 *    Picture mode strips the notes off the map and moves them to the voice.
 *
 * Tapping a branch opens it. Long-pressing edits it — an affordance rather than
 * a button, because a pencil on every node is forty pencils.
 */

import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { MindMapNode, PlacedNode, PlacedEdge, MapEdgeStyle, MapNodeStyle } from '../types';
import { layoutTree } from '../utils/layout';
import { RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useTheme, useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { Text } from './Typography';
import { BionicText } from './BionicText';

export interface MindMapCanvasProps {
  rootNode: MindMapNode;
  selectedNodeId?: string | null;
  collapsedIds: Set<string>;
  onSelectNode: (node: PlacedNode) => void;
  onToggleCollapse: (nodeId: string) => void;
  onEditNode?: (node: PlacedNode) => void;

  edgeStyle?: MapEdgeStyle;
  nodeStyle?: MapNodeStyle;
  textScale?: number;
  /** Picture mode: labels only, detail moves to the read-aloud voice. */
  hideDetail?: boolean;
}

/** The SVG path for one connector, in the chosen style. */
function edgePath(edge: PlacedEdge, style: MapEdgeStyle): string {
  const { from, to } = edge;

  if (style === 'straight') {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }

  if (style === 'orthogonal') {
    // Turn at the midpoint rather than at either end, so sibling connectors
    // share a vertical spine instead of crossing each other.
    const midX = from.x + (to.x - from.x) / 2;
    return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  }

  const reach = Math.max(24, Math.abs(to.x - from.x) * 0.42);
  return `M ${from.x} ${from.y} C ${from.x + reach} ${from.y}, ${to.x - reach} ${to.y}, ${to.x} ${to.y}`;
}

export const MindMapCanvas: React.FC<MindMapCanvasProps> = ({
  rootNode,
  selectedNodeId,
  collapsedIds,
  onSelectNode,
  onToggleCollapse,
  onEditNode,
  edgeStyle = 'bezier',
  nodeStyle = 'comfortable',
  textScale = 1,
  hideDetail = false,
}) => {
  const COLORS = useThemeColors();
  const { plateColors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width: screenWidth } = useWindowDimensions();

  const compact = nodeStyle === 'compact';

  const { nodes, edges, width, height } = useMemo(
    () =>
      layoutTree(rootNode, collapsedIds, {
        showDetail: !hideDetail,
        compact,
        textScale,
      }),
    [rootNode, collapsedIds, hideDetail, compact, textScale]
  );

  const canvasWidth = Math.max(screenWidth - 32, width + 40);
  const canvasHeight = Math.max(340, height + 40);

  const buzz = (strength: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    try {
      Haptics.impactAsync(strength);
    } catch (_) {
      /* haptics are a nicety, never a requirement */
    }
  };

  return (
    <View style={styles.outer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ minWidth: canvasWidth }}
      >
        <ScrollView
          showsVerticalScrollIndicator
          contentContainerStyle={{ minHeight: canvasHeight, padding: SPACING.md }}
        >
          <View style={[styles.surface, { width: canvasWidth, height: canvasHeight }]}>
            <Svg style={StyleSheet.absoluteFill} width={canvasWidth} height={canvasHeight}>
              {edges.map((edge) => (
                <Path
                  key={edge.id}
                  d={edgePath(edge, edgeStyle)}
                  stroke={plateColors[edge.branch % plateColors.length]}
                  strokeWidth={edge.depth === 1 ? 2.2 : 1.5}
                  strokeOpacity={edge.depth === 1 ? 0.75 : 0.45}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </Svg>

            {nodes.map((node) => {
              const selected = selectedNodeId === node.id;
              const branchColor =
                node.depth === 0
                  ? plateColors[3] || COLORS.ink
                  : plateColors[node.branch % plateColors.length];

              return (
                <TouchableOpacity
                  key={node.id}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={
                    hideDetail
                      ? node.label
                      : [node.label, node.detail].filter(Boolean).join(', ')
                  }
                  accessibilityHint={
                    onEditNode
                      ? 'Opens this branch. Press and hold to rename it or add to it.'
                      : 'Opens this branch'
                  }
                  accessibilityState={{ selected }}
                  style={[
                    styles.node,
                    {
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      minHeight: node.height,
                      borderLeftColor: branchColor,
                    },
                    selected ? styles.nodeSelected : styles.nodeIdle,
                  ]}
                  onPress={() => {
                    buzz();
                    onSelectNode(node);
                  }}
                  onLongPress={
                    onEditNode
                      ? () => {
                          buzz(Haptics.ImpactFeedbackStyle.Medium);
                          onEditNode(node);
                        }
                      : undefined
                  }
                  delayLongPress={420}
                >
                  <BionicText
                    text={node.label}
                    variant={node.depth === 0 ? 'body' : 'bodySm'}
                    color={COLORS.text}
                    style={[styles.nodeLabel, { fontSize: undefined }]}
                  />

                  {!hideDetail && node.detail ? (
                    <Text
                      variant="caption"
                      color={COLORS.textMuted}
                      numberOfLines={3}
                      style={styles.nodeDetail}
                    >
                      {node.detail}
                    </Text>
                  ) : null}

                  {node.childCount > 0 ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={
                        node.collapsed
                          ? `Open ${node.childCount} branches under ${node.label}`
                          : `Fold away the branches under ${node.label}`
                      }
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={[
                        styles.badge,
                        { borderColor: branchColor },
                        node.collapsed
                          ? { backgroundColor: branchColor }
                          : styles.badgeOpen,
                      ]}
                      onPress={(event) => {
                        event.stopPropagation();
                        buzz();
                        onToggleCollapse(node.id);
                      }}
                    >
                      <Text
                        variant="caption"
                        weight="bold"
                        color={node.collapsed ? COLORS.textInverse : branchColor}
                        style={styles.badgeText}
                      >
                        {node.collapsed ? node.childCount : '−'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: t.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: t.dividerSubtle,
      overflow: 'hidden',
      minHeight: 320,
    },
    surface: {
      position: 'relative',
      backgroundColor: t.surface,
    },
    node: {
      position: 'absolute',
      backgroundColor: t.bg,
      borderRadius: RADIUS.md,
      borderLeftWidth: 3.5,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs + 4,
      justifyContent: 'center',
      ...SHADOWS.sm,
    },
    nodeIdle: {
      borderWidth: 1,
      borderColor: t.dividerSubtle,
    },
    nodeSelected: {
      borderWidth: 2,
      borderColor: t.cyan,
      shadowColor: t.cyan,
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    },
    nodeLabel: {
      fontWeight: '700',
      marginBottom: 2,
    },
    nodeDetail: {
      fontSize: 11,
      lineHeight: 14,
    },
    badge: {
      position: 'absolute',
      right: -10,
      top: '50%',
      marginTop: -10,
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    badgeOpen: {
      backgroundColor: t.bg,
    },
    badgeText: {
      fontSize: 10,
      lineHeight: 12,
    },
  });
