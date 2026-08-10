/**
 * `.tx-ledger` — the book itself.
 *
 * Chronological and two-directional: money in is green with a down arrow,
 * money out is red with an up arrow. That is the जमा / उधार convention
 * OkCredit taught ten million Indian shopkeepers, and inverting it to match a
 * western accounting app would be a self-inflicted wound.
 *
 * `BalanceMark` is the divider that carries a number. It is deliberately not
 * tappable — it is a fact about the rows around it, not a row of its own.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconArrowDown, IconArrowUp } from './icons';
import { colors, radius, space, tnum } from './tokens';

export function Ledger({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const items = React.Children.toArray(children);
  return (
    <View style={[styles.ledger, style]}>
      {items.map((child, i) => (
        <View key={i} style={i < items.length - 1 ? styles.divider : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

export interface LedgerRowProps {
  direction: 'in' | 'out';
  title: string;
  detail: string;
  amount: string;
  /** Second line under the amount — "−₹3,000 cut", "queued", "settled". */
  note?: string;
  /** Money already gone sits back. History, not an alarm. */
  settled?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function LedgerRow({
  direction,
  title,
  detail,
  amount,
  note,
  settled = false,
  onPress,
  onLongPress,
}: LedgerRowProps) {
  const Arrow = direction === 'in' ? IconArrowDown : IconArrowUp;
  const tone = direction === 'in' ? colors.ok : colors.danger;

  const inner = (
    <>
      <View
        style={[
          styles.dir,
          { backgroundColor: direction === 'in' ? colors.okSoft : colors.dangerSoft },
        ]}
      >
        <Arrow size={15} color={tone} />
      </View>
      <View style={styles.main}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.detail}>
          {detail}
        </Text>
      </View>
      <View style={styles.amountBox}>
        <Text style={[styles.amount, { color: tone }]}>{amount}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    </>
  );

  if (!onPress && !onLongPress) {
    return <View style={[styles.row, settled && styles.settled]}>{inner}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount}. ${detail}`}
      style={({ pressed }) => [styles.row, settled && styles.settled, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

/** `.tx-led__bal` — a running-balance divider. Never tappable. */
export function BalanceMark({
  label,
  value,
  clear = false,
}: {
  label: string;
  value: string;
  clear?: boolean;
}) {
  return (
    <View style={styles.bal} accessibilityRole="summary">
      <Text style={[styles.balLabel, clear && styles.balClear]}>{label}</Text>
      <Text style={[styles.balValue, clear && styles.balClear]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ledger: {
    backgroundColor: colors.surface,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    width: '100%',
    minHeight: 62,
    paddingVertical: 11,
    paddingHorizontal: space.s3,
  },
  pressed: { backgroundColor: colors.surface2 },
  settled: { opacity: 0.62 },

  dir: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 14.5, fontWeight: '600', letterSpacing: -0.15, color: colors.ink },
  detail: { fontSize: 11.5, color: colors.ink3, marginTop: 3 },

  amountBox: { flexShrink: 0, alignItems: 'flex-end' },
  amount: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, ...tnum },
  note: { fontSize: 10.5, color: colors.ink3, marginTop: 3, ...tnum },

  bal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingVertical: space.s2,
    paddingHorizontal: space.s3,
    backgroundColor: colors.surface2,
  },
  balLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  balValue: { fontSize: 14, fontWeight: '800', letterSpacing: -0.28, color: colors.ink, ...tnum },
  balClear: { color: colors.ok },
});
