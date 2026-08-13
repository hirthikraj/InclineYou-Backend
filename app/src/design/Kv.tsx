/**
 * `.tx-kv` — a list of facts about one record, where the FIGURE is the content
 * and the label is the caption.
 *
 * The inverse of `Setting`, which is a 15px title with a quiet value beside it.
 * Used for the overview's five figures, the pack's terms, and the locked fields
 * in Edit.
 *
 * **Every row goes somewhere, or says why it doesn't.** A number on a client's
 * file that cannot be tapped is a dead end the trainer has to leave the file to
 * chase — so a row with an `onPress` is a button, and a row without one carries
 * its reason in the sub-line instead of sitting there inert.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

export function Kv({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const rows = React.Children.toArray(children);
  return (
    <View style={[styles.kv, style]}>
      {rows.map((row, i) => (
        <View key={i} style={i < rows.length - 1 ? styles.divider : undefined}>
          {row}
        </View>
      ))}
    </View>
  );
}

export interface KvRowProps {
  /** Uppercase micro caption. "Next session", "Adherence". */
  label: string;
  /** The figure. Always the biggest thing in the row. */
  value: string;
  /** A trailing run in quiet ink — "/16", "kg". Part of the figure, not a unit tag. */
  suffix?: string;
  /** The line under the figure: when it was, what it was, why it's locked. */
  detail?: string;
  /** A lock glyph, a streak strip — anything that belongs beside the caption. */
  leading?: React.ReactNode;
  tone?: string;
  onPress?: () => void;
}

export function KvRow({ label, value, suffix, detail, leading, tone, onPress }: KvRowProps) {
  const inner = (
    <>
      <View style={styles.k}>
        {leading}
        <Text style={styles.kText}>{label}</Text>
      </View>
      <View style={styles.v}>
        <Text style={[styles.value, tone ? { color: tone } : null]}>
          {value}
          {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </>
  );

  if (!onPress) return <View style={styles.row}>{inner}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${value}${suffix ?? ''}${detail ? `. ${detail}` : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kv: {
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
    minHeight: 56,
    paddingVertical: 11,
    paddingHorizontal: space.s4,
  },
  rowPressed: { backgroundColor: colors.surface2 },

  k: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  kText: {
    flexShrink: 1,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },

  v: { flexShrink: 0, maxWidth: '62%', alignItems: 'flex-end' },
  value: { fontSize: 16, fontWeight: '800', letterSpacing: -0.32, color: colors.ink, ...tnum },
  suffix: { fontSize: 11.5, fontWeight: '700', color: colors.ink3 },
  detail: { fontSize: 11.5, lineHeight: 16, color: colors.ink3, marginTop: 3, textAlign: 'right' },
});
