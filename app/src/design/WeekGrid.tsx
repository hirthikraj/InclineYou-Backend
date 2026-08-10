/**
 * `.tx-wk` — seven columns of pips.
 *
 * Deliberately not a time grid. At 50px a column, an hour-accurate 06:00 and a
 * 06:30 are the same pixel, so positioning by time would be a lie drawn to
 * scale. Shape and load are the questions a week answers; exact times are what
 * the day view is for.
 *
 * A pip is 44px because it is a real target that opens the day.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, tnum } from './tokens';

export type PipKind = 'floor' | 'remote';

export interface WeekPipProps {
  id: string;
  time: string;
  name: string;
  kind: PipKind;
  done?: boolean;
}

export interface WeekColumnProps {
  at: number;
  label: string;
  date: number;
  today: boolean;
  closed: boolean;
  pips: WeekPipProps[];
}

export default function WeekGrid({
  columns,
  onDay,
  onPip,
  style,
}: {
  columns: WeekColumnProps[];
  onDay: (at: number) => void;
  onPip: (id: string, at: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView style={style} contentContainerStyle={styles.grid} horizontal={false}>
      <View style={styles.row}>
        {columns.map((column) => (
          <View key={column.at} style={styles.column}>
            <Pressable
              onPress={() => onDay(column.at)}
              accessibilityRole="button"
              accessibilityLabel={`${column.label} ${column.date}, ${column.pips.length} sessions`}
              style={[styles.head, column.today && styles.headToday]}
            >
              <Text style={styles.headLabel} maxFontSizeMultiplier={maxFontScale.micro}>
                {column.label}
              </Text>
              <Text
                style={[styles.headDate, column.today && styles.headDateToday]}
                maxFontSizeMultiplier={maxFontScale.micro}
              >
                {column.date}
              </Text>
            </Pressable>

            {column.pips.length === 0 ? (
              <View style={styles.off}>
                <Text style={styles.offText} maxFontSizeMultiplier={maxFontScale.micro}>
                  {column.closed ? 'off' : '—'}
                </Text>
              </View>
            ) : (
              column.pips.map((pip) => (
                <Pressable
                  key={pip.id}
                  onPress={() => onPip(pip.id, column.at)}
                  accessibilityRole="button"
                  accessibilityLabel={`${pip.time} ${pip.name}`}
                  style={[
                    styles.pip,
                    { borderLeftColor: pip.kind === 'remote' ? colors.remote : colors.accent },
                    pip.done && styles.pipDone,
                  ]}
                >
                  <Text style={styles.pipTime} maxFontSizeMultiplier={maxFontScale.micro}>
                    {pip.time}
                  </Text>
                  <Text
                    style={styles.pipName}
                    numberOfLines={1}
                    maxFontSizeMultiplier={maxFontScale.micro}
                  >
                    {pip.name}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** `.tx-legend` — what the colours on this screen mean. */
export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: item.color }]} />
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { paddingBottom: 4 },
  row: { flexDirection: 'row', gap: 5 },
  column: { flex: 1, minWidth: 0, gap: 4 },
  head: {
    alignItems: 'center',
    paddingTop: 7,
    paddingBottom: 8,
    borderTopLeftRadius: radius.r2,
    borderTopRightRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  headToday: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
  headLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.68,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  headDate: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 2, ...tnum },
  headDateToday: { color: colors.accentText },

  pip: {
    minHeight: 44,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: radius.r1,
    backgroundColor: colors.surface2,
    borderLeftWidth: 2,
    justifyContent: 'center',
  },
  pipDone: { opacity: 0.55 },
  pipTime: { fontSize: 9.5, fontWeight: '800', color: colors.ink, ...tnum },
  pipName: { fontSize: 9, fontWeight: '700', color: colors.ink2, marginTop: 1 },

  off: {
    minHeight: 44,
    borderRadius: radius.r1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offText: { fontSize: 9, fontWeight: '700', color: colors.ink3 },

  legend: { flexDirection: 'row', gap: 20, marginTop: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 7, height: 7, borderRadius: 2 },
  legendLabel: { fontSize: 11, fontWeight: '600', color: colors.ink2 },
});
