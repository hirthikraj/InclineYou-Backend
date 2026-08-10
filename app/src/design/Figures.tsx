/**
 * `.tx-money` — collected and still-owed, side by side.
 *
 * Those are the only two figures a trainer checks, so they are the only two
 * above the fold. The pair is deliberately unequal in size — collected is the
 * headline at 29px, owed answers "and what's left" at 23px — and the two
 * blocks align on their LABELS rather than their baselines, because aligning
 * the bottoms of differently-sized numbers reads as a misalignment.
 *
 * Both figures are tappable and both lead somewhere: collected filters the
 * ledger, owed opens the chase list. The bar underneath is the same target as
 * the figure above it, never a third one.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Bar, Legend } from './Bar';
import { colors, radius, space, tnum } from './tokens';

export interface FiguresProps {
  collected: string;
  owed: string;
  /** 0–1. The remainder of the track stays empty rather than being filled. */
  collectedPart: number;
  owedPart: number;
  /** Only drawn when something was actually let go. */
  writtenOffPart?: number;
  onCollected?: () => void;
  onOwed?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function Figures({
  collected,
  owed,
  collectedPart,
  owedPart,
  writtenOffPart = 0,
  onCollected,
  onOwed,
  style,
}: FiguresProps) {
  const clear = owedPart <= 0;

  const segments = [
    { key: 'in', fraction: collectedPart, color: colors.ok },
    { key: 'out', fraction: owedPart, color: colors.warn },
    ...(writtenOffPart > 0
      ? [{ key: 'off', fraction: writtenOffPart, color: colors.lineStrong }]
      : []),
  ];

  return (
    <View style={[styles.card, style]}>
      <View style={styles.row}>
        <Pressable
          onPress={onCollected}
          disabled={!onCollected}
          accessibilityRole={onCollected ? 'button' : undefined}
          accessibilityLabel={`Collected ${collected}`}
          style={({ pressed }) => [styles.fig, pressed && styles.pressed]}
        >
          <Text style={styles.label}>Collected</Text>
          <Text style={[styles.value, styles.valueOk]}>{collected}</Text>
        </Pressable>

        <Pressable
          onPress={onOwed}
          disabled={!onOwed}
          accessibilityRole={onOwed ? 'button' : undefined}
          accessibilityLabel={`Still owed ${owed}`}
          style={({ pressed }) => [styles.fig, styles.figRight, pressed && styles.pressed]}
        >
          <Text style={[styles.label, styles.labelRight]}>Still owed</Text>
          {/* Zero owed is not a warning. Amber on ₹0 would be an alarm about
              nothing, which is how a screen teaches people to ignore amber. */}
          <Text style={[styles.value, styles.valueSmall, !clear && styles.valueWarn]}>{owed}</Text>
        </Pressable>
      </View>

      <Bar segments={segments} style={styles.bar} />
      <Legend
        entries={[
          { key: 'in', label: `${pct(collectedPart)}% in`, color: colors.ok },
          { key: 'out', label: `${pct(owedPart)}% out`, color: colors.warn },
          ...(writtenOffPart > 0
            ? [{ key: 'off', label: `${pct(writtenOffPart)}% written off`, color: colors.lineStrong }]
            : []),
        ]}
      />
    </View>
  );
}

/** Rounded for display only — the bar itself uses the exact fraction. */
function pct(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.r3,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.cardPad,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.s4 },
  fig: { minWidth: 0, flexShrink: 1 },
  figRight: { alignItems: 'flex-end' },
  pressed: { opacity: 0.6 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 7,
  },
  labelRight: { textAlign: 'right' },
  value: { fontSize: 29, fontWeight: '800', letterSpacing: -1.02, color: colors.ink, ...tnum },
  valueSmall: { fontSize: 23, letterSpacing: -0.8 },
  valueOk: { color: colors.ok },
  valueWarn: { color: colors.warn },
  bar: { marginTop: space.s4 },
});
