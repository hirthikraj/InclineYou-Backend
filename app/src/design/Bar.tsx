/**
 * `.tx-bar` / `.tx-legend` — one stacked bar and the key that makes it readable.
 *
 * The legend is not optional decoration. A two-colour bar with no labels is a
 * chart, and § 08 is explicit that charts are a detail-screen thing; what makes
 * this allowed on home is that each segment states its own rupee figure, so the
 * bar is a picture of two numbers you can already read.
 *
 * Each legend entry is tappable through to the money screen filtered to that
 * segment (§ 04).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

export interface BarSegment {
  key: string;
  /** 0–1. Segments are rendered in order and are not normalised for you. */
  fraction: number;
  color: string;
}

export function Bar({ segments, style }: { segments: BarSegment[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.bar, style]}>
      {segments
        .filter((s) => s.fraction > 0)
        .map((s) => (
          <View
            key={s.key}
            style={{ width: `${Math.min(100, s.fraction * 100)}%`, backgroundColor: s.color }}
          />
        ))}
    </View>
  );
}

export interface LegendEntry {
  key: string;
  label: string;
  color: string;
  onPress?: () => void;
}

export function Legend({ entries, style }: { entries: LegendEntry[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.legend, style]}>
      {entries.map((e) => {
        const inner = (
          <>
            <View style={[styles.swatch, { backgroundColor: e.color }]} />
            <Text style={styles.legendText}>{e.label}</Text>
          </>
        );
        if (!e.onPress) {
          return (
            <View key={e.key} style={styles.legendItem}>
              {inner}
            </View>
          );
        }
        return (
          <Pressable
            key={e.key}
            onPress={e.onPress}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            style={({ pressed }) => [styles.legendItem, pressed && styles.pressed]}
          >
            {inner}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 7,
    borderRadius: radius.r1,
    backgroundColor: colors.surface3,
    overflow: 'hidden',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s5, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.6 },
  swatch: { width: 7, height: 7, borderRadius: 2, flexShrink: 0 },
  legendText: { fontSize: 11, fontWeight: '600', color: colors.ink2, ...tnum },
});
