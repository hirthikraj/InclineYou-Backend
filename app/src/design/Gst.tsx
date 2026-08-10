/**
 * `.tx-gst` — turnover against the ₹20 lakh line.
 *
 * Services cross into GST at ₹20 lakh a year in India. Nobody in the category
 * warns about this because nobody in the category is built for India, and late
 * registration carries a penalty — so the warning has to fire a month BEFORE
 * the line, not after, at which point it is just bad news.
 *
 * The track turns amber on the run rate, not on the total: being at ₹5 lakh in
 * August with a ₹22 lakh trajectory is the moment worth knowing about.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

export default function Gst({
  turnover,
  projected,
  /** 0–1 of the ₹20 lakh line. */
  fraction,
  near,
  fromLabel,
  note,
  onPress,
  style,
}: {
  turnover: string;
  projected: string;
  fraction: number;
  near: boolean;
  fromLabel: string;
  note: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const width = `${Math.max(1, Math.min(100, fraction * 100))}%` as const;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Turnover this year ${turnover}, on track for ${projected}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>Turnover this year</Text>
        <Text style={styles.figures}>{`${turnover} so far · ${projected} on track`}</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width }, near && styles.fillNear]} />
      </View>

      <View style={styles.marks}>
        <Text style={styles.mark}>{fromLabel}</Text>
        <Text style={styles.mark}>GST line · ₹20L</Text>
      </View>

      <Text style={styles.note}>{note}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.cardPad,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { backgroundColor: colors.surface2 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.s3 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.22, color: colors.ink, flexShrink: 1 },
  figures: { fontSize: 11, fontWeight: '700', color: colors.ink3, flexShrink: 0, ...tnum },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface3,
    marginTop: space.s3,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.accent },
  fillNear: { backgroundColor: colors.warn },
  marks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.s2 },
  mark: { fontSize: 10.5, color: colors.ink3, ...tnum },
  note: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: space.s3 },
});
