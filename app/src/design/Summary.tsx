/**
 * `.tx-summary` — four figures that close a session, two by two.
 *
 * Hairline-divided in a 2 × 2 grid: the shape of a receipt, on purpose. It is
 * deliberately not `StatRail`, which is three tappable cells — this block is
 * read-only, and borrowing a tappable component's affordance for something that
 * does nothing is how a screen teaches people to stop tapping.
 *
 * The records figure is the only one allowed to be gold, and only when it isn't
 * zero. "0 records" in gold is a celebration of nothing.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

export interface SummaryFigure {
  label: string;
  value: string;
  /** Smaller trailing unit — "kg", "min". */
  unit?: string;
  /** Gold. Records only, and only above zero. */
  gold?: boolean;
}

export default function Summary({
  figures,
  style,
}: {
  /** Four, in reading order. Fewer works; more wraps and stops being a receipt. */
  figures: SummaryFigure[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.grid, style]}>
      {figures.map((figure, i) => {
        const lastRow = i >= figures.length - (figures.length % 2 === 0 ? 2 : 1);
        return (
          <View
            key={figure.label}
            style={[styles.cell, i % 2 === 0 && styles.cellLeft, !lastRow && styles.cellTop]}
            accessibilityLabel={`${figure.label}: ${figure.value}${figure.unit ?? ''}`}
          >
            <Text style={styles.label} numberOfLines={1}>
              {figure.label}
            </Text>
            <Text style={[styles.value, figure.gold && styles.gold]} numberOfLines={1}>
              {figure.value}
              {figure.unit ? <Text style={styles.unit}> {figure.unit}</Text> : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cell: { width: '50%', paddingVertical: 13, paddingHorizontal: space.cardPad },
  cellLeft: { borderRightWidth: 1, borderRightColor: colors.line },
  cellTop: { borderBottomWidth: 1, borderBottomColor: colors.line },

  label: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.14,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  value: {
    marginTop: 7,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.69,
    color: colors.ink,
    ...tnum,
  },
  gold: { color: colors.pr },
  unit: { fontSize: 12, fontWeight: '700', color: colors.ink3 },
});
