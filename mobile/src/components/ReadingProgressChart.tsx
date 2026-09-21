/**
 * SETU Mobile — reading progress over time.
 *
 * WHY A CHART AT ALL
 * ------------------
 * A single band is a snapshot and reads as a verdict. A line across several
 * sittings is the thing a parent or a teacher can actually act on: it separates
 * "reading slowly" from "not improving", and those call for completely different
 * responses. It is also the honest way to present a provisional measure — a
 * trend survives noisy norms far better than any one number does.
 *
 * THE PART THAT IS EASY TO GET WRONG
 * ----------------------------------
 * A line drawn in SVG is invisible to a screen reader. Shipping one without an
 * alternative inside an accessibility product would be the same class of defect
 * the audit raised against the mind map, so the chart carries a spoken summary
 * and the numbers are also rendered as a readable list underneath. The list is
 * not a fallback that appears when something fails — it is always there, because
 * some readers simply prefer numbers to a shape, and a chart is a poor way to
 * read an exact value.
 *
 * The y-axis deliberately starts at zero. Cropping it would exaggerate a
 * four-word improvement into a dramatic climb, and a chart about a child's
 * reading is the last place to flatter the data.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { RADIUS, SPACING } from '../constants/theme';
import { Palette } from '../constants/themes';
import { useThemeColors, useThemedStyles } from '../context/ThemeContext';
import { ReadingSeriesPoint } from '../types';
import { Text } from './Typography';

const HEIGHT = 180;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

interface Props {
  series: ReadingSeriesPoint[];
  width: number;
}

const shortDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

export const ReadingProgressChart: React.FC<Props> = ({ series, width }) => {
  const COLORS = useThemeColors();
  const styles = useThemedStyles(makeStyles);

  const geometry = useMemo(() => {
    const points = series.filter((p) => Number.isFinite(p.wcpm));
    if (points.length < 2) return null;

    /*
     * Round the ceiling up to the next ten so the gridline label is a number a
     * person reads rather than "63.4", and so two charts taken a week apart are
     * comparable at a glance instead of silently rescaling.
     */
    const peak = Math.max(...points.map((p) => p.wcpm));
    const top = Math.max(20, Math.ceil(peak / 10) * 10);

    const plotWidth = width - PAD_LEFT - PAD_RIGHT;
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const coords = points.map((point, index) => ({
      ...point,
      x: PAD_LEFT + (plotWidth * index) / (points.length - 1),
      y: PAD_TOP + plotHeight * (1 - point.wcpm / top),
    }));

    const path = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');

    return { coords, path, top, plotHeight };
  }, [series, width]);

  if (!geometry) {
    return (
      <View style={styles.empty}>
        <Text variant="bodySm" color={COLORS.textMuted}>
          {series.length === 1
            ? 'One reading so far. A second one, a few weeks apart, is what turns this into a trend.'
            : 'No readings yet. The chart appears once there are two to draw a line between.'}
        </Text>
      </View>
    );
  }

  const { coords, path, top } = geometry;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const change = Math.round(last.wcpm - first.wcpm);

  /*
   * The spoken version of the picture.
   *
   * Deliberately says the direction and the size of the change rather than
   * reading out every point — the list below carries the exact values, and a
   * screen-reader user should not have to sit through eleven numbers to learn
   * that reading got faster.
   */
  const spoken =
    `Reading speed over ${coords.length} check-ins. ` +
    `${Math.round(first.wcpm)} words per minute on ${shortDate(first.at)}, ` +
    `${Math.round(last.wcpm)} on ${shortDate(last.at)}. ` +
    (change > 0
      ? `Up ${change} words per minute.`
      : change < 0
      ? `Down ${Math.abs(change)} words per minute.`
      : 'Unchanged.');

  return (
    <View>
      <View accessible accessibilityRole="image" accessibilityLabel={spoken}>
        <Svg width={width} height={HEIGHT}>
          {/* Baseline and ceiling, so the scale is legible without a full grid. */}
          <Line
            x1={PAD_LEFT}
            y1={HEIGHT - PAD_BOTTOM}
            x2={width - PAD_RIGHT}
            y2={HEIGHT - PAD_BOTTOM}
            stroke={COLORS.divider}
            strokeWidth={1}
          />
          <Line
            x1={PAD_LEFT}
            y1={PAD_TOP}
            x2={width - PAD_RIGHT}
            y2={PAD_TOP}
            stroke={COLORS.dividerSubtle}
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <SvgText x={4} y={PAD_TOP + 4} fontSize={10} fill={COLORS.textSubtle}>
            {String(top)}
          </SvgText>
          <SvgText x={4} y={HEIGHT - PAD_BOTTOM + 4} fontSize={10} fill={COLORS.textSubtle}>
            0
          </SvgText>

          <Path d={path} stroke={COLORS.cyan} strokeWidth={2.5} fill="none" />

          {coords.map((c) => (
            <Circle
              key={c.at}
              cx={c.x}
              cy={c.y}
              r={4}
              fill={COLORS.bg}
              stroke={COLORS.cyan}
              strokeWidth={2.5}
            />
          ))}

          {/* Only the ends are labelled — intermediate dates collide on a phone. */}
          <SvgText x={PAD_LEFT} y={HEIGHT - 8} fontSize={10} fill={COLORS.textSubtle}>
            {shortDate(first.at)}
          </SvgText>
          <SvgText
            x={width - PAD_RIGHT}
            y={HEIGHT - 8}
            fontSize={10}
            fill={COLORS.textSubtle}
            textAnchor="end"
          >
            {shortDate(last.at)}
          </SvgText>
        </Svg>
      </View>

      <Text variant="caption" color={COLORS.textMuted} style={{ marginTop: SPACING.xs }}>
        Words read correctly per minute.
      </Text>

      {/* The same data as text. Always present, not a fallback. */}
      <View style={styles.table}>
        {coords.map((c) => (
          <View key={`row-${c.at}`} style={styles.row}>
            <Text variant="caption" color={COLORS.textMuted} style={styles.rowDate}>
              {shortDate(c.at)}
            </Text>
            <Text variant="bodySm" weight="semibold">
              {Math.round(c.wcpm)} wcpm
            </Text>
            <Text variant="caption" color={COLORS.textMuted}>
              {Math.round((c.accuracy || 0) * 100)}% accurate
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const makeStyles = (t: Palette) =>
  StyleSheet.create({
    empty: {
      paddingVertical: SPACING.md,
    },
    table: {
      marginTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: t.dividerSubtle,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.xs,
      borderBottomWidth: 1,
      borderBottomColor: t.dividerSubtle,
      borderRadius: RADIUS.sm,
    },
    rowDate: {
      minWidth: 44,
    },
  });
