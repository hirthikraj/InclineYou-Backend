/**
 * `.tx-measures` — weight and waist, newest first, append-only.
 *
 * The delta is deliberately **not** ok-green or danger-red. −3.8 kg is progress
 * for a fat-loss client and a failure for somebody adding size, and the app does
 * not know which — so it does not get a colour opinion. Direction is carried by
 * the sign, which is unambiguous in every language this ships in.
 *
 * **Rows are not buttons.** A measurement cannot be edited or deleted; a wrong
 * reading is corrected by appending the right one, and the row it corrects says
 * so in its own sub-line. That sentence wraps rather than truncating — half of
 * "corrects the 95.6 kg entered two minutes earlier" is worse than none of it.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

export function Measures({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = React.Children.toArray(children);
  return (
    <View style={[styles.measures, style]}>
      {rows.map((row, i) => (
        <View key={i} style={i < rows.length - 1 ? styles.divider : undefined}>
          {row}
        </View>
      ))}
    </View>
  );
}

export interface MeasureProps {
  /** "Sun 9 Aug" — the day, in the shape a trainer reads a date. */
  when: string;
  /** "07:12", or "07:24 · replaced two minutes later". A sentence, so it wraps. */
  note?: string;
  value: string;
  unit: string;
  /** "−0.7", or "—" for the first reading. Never coloured. */
  delta: string;
  /** A superseded reading sits back, but stays. That IS append-only. */
  replaced?: boolean;
}

export function Measure({ when, note, value, unit, delta, replaced = false }: MeasureProps) {
  return (
    <View
      style={styles.measure}
      accessibilityRole="text"
      accessibilityLabel={`${when}. ${value} ${unit}. Change ${delta}.${note ? ` ${note}` : ''}`}
    >
      <View style={styles.when}>
        <Text style={[styles.day, replaced && styles.dayReplaced]}>{when}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <Text style={[styles.value, replaced && styles.valueReplaced]}>
        {value}
        <Text style={styles.unit}> {unit}</Text>
      </Text>
      <Text style={styles.delta}>{delta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  measures: {
    backgroundColor: colors.surface,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },

  measure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    width: '100%',
    minHeight: 58,
    paddingVertical: 11,
    paddingHorizontal: space.s4,
  },

  when: { flex: 1, minWidth: 0 },
  day: { fontSize: 14, fontWeight: '600', letterSpacing: -0.14, color: colors.ink, ...tnum },
  dayReplaced: { color: colors.ink2 },
  note: { fontSize: 11.5, lineHeight: 16, color: colors.ink3, marginTop: 3 },

  value: { flexShrink: 0, fontSize: 17, fontWeight: '800', letterSpacing: -0.34, color: colors.ink, ...tnum },
  valueReplaced: { color: colors.ink2 },
  unit: { fontSize: 11, fontWeight: '700', color: colors.ink3 },

  // Fixed width so the signs line up down the column; the eye reads a run of
  // deltas vertically, and a ragged right edge breaks that.
  delta: {
    flexShrink: 0,
    width: 46,
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink3,
    ...tnum,
  },
});
