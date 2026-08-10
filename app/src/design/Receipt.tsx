/**
 * `.tx-receipt` — a labelled key/value block.
 *
 * Used for the receipt after a payment, for the export summary shown before
 * anything leaves the phone, and for the message preview on the reminder
 * sheet. All three are the same thing: a short, quotable set of facts on a
 * bordered card, with the last row separated by a dashed rule when it is a
 * total.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

export function Receipt({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ReceiptRow({
  label,
  value,
  total = false,
}: {
  label: string;
  value: string;
  /** The last line. Dashed rule above, and the value gets its own weight. */
  total?: boolean;
}) {
  return (
    <View style={[styles.row, total && styles.rowTotal]}>
      <Text style={[styles.label, total && styles.labelTotal]}>{label}</Text>
      <Text style={[styles.value, total && styles.valueTotal]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.cardPad,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingVertical: 7,
  },
  rowTotal: {
    borderTopWidth: 1,
    // RN has no dashed border on a single edge that renders reliably across
    // both platforms, so the total is separated by a solid strong hairline.
    borderTopColor: colors.lineStrong,
    marginTop: 7,
    paddingTop: 12,
  },
  label: { fontSize: 13, color: colors.ink3, flexShrink: 1 },
  labelTotal: { fontSize: 14, color: colors.ink2 },
  value: { fontSize: 13, fontWeight: '600', color: colors.ink, textAlign: 'right', ...tnum },
  valueTotal: { fontSize: 19, fontWeight: '800', letterSpacing: -0.38 },
});
