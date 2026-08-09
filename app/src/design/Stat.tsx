/**
 * `.tx-stat` / `.tx-rail` — three numbers, each of them a destination.
 *
 * The rail is fixed at three across. Four would drop each cell under the width
 * a five-digit rupee figure needs at 23px, and the whole point of the amber
 * cell is that a trainer can read "₹18k pending" without stopping.
 *
 * Only the money-owed cell takes the warn treatment. If two cells are amber
 * neither is a warning.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

export function StatRail({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.rail, style]}>{children}</View>;
}

export interface StatProps {
  label: string;
  value: string | number;
  /** Smaller trailing unit — "/6", "kg". Same line, dimmer, 12px. */
  unit?: string;
  tone?: 'default' | 'warn';
  onPress?: () => void;
}

export default function Stat({ label, value, unit, tone = 'default', onPress }: StatProps) {
  const warn = tone === 'warn';

  const inner = (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, warn && styles.valueWarn]} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </Text>
    </>
  );

  if (!onPress) return <View style={[styles.stat, warn && styles.statWarn]}>{inner}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${unit ?? ''}`}
      style={({ pressed }) => [styles.stat, warn && styles.statWarn, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', gap: space.cardGap },

  stat: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    padding: 12,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'space-between',
  },
  statWarn: { borderColor: colors.warnSoft, backgroundColor: colors.surface },
  pressed: { backgroundColor: colors.surface2 },

  label: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.14,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  value: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.69,
    color: colors.ink,
    marginTop: 8,
    ...tnum,
  },
  valueWarn: { color: colors.warn },
  unit: { fontSize: 12, fontWeight: '700', color: colors.ink3 },
});
