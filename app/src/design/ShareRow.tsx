/**
 * `.tx-share` — whose money it actually is.
 *
 * The line no western app has. Indian gyms take 50–70% of personal-training
 * fees, so a screen that shows ₹1,06,500 collected and stops there is telling
 * a trainer a number that isn't theirs.
 *
 * Rendered only when there IS a gym. An independent trainer keeps all of it,
 * and a full lime bar saying "your share: everything" is decoration.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconBuilding } from './icons';
import { colors, radius, space, tap, tnum } from './tokens';

export default function ShareRow({
  yours,
  /** 0–1 — the trainer's slice. The rest of the track is the gym's. */
  fraction,
  onPress,
  style,
}: {
  yours: string;
  fraction: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const mine = Math.max(0, Math.min(1, fraction));

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Your share ${yours}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      <IconBuilding size={19} color={colors.ink2} />
      <View style={styles.bar}>
        <View style={[styles.mine, { flex: mine }]} />
        <View style={[styles.theirs, { flex: 1 - mine }]} />
      </View>
      <View style={styles.figure}>
        <Text style={styles.label}>Your share</Text>
        <Text style={styles.value}>{yours}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    width: '100%',
    minHeight: tap.min,
    paddingVertical: 12,
    paddingHorizontal: space.s3,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { backgroundColor: colors.surface2 },
  bar: {
    flex: 1,
    minWidth: 0,
    height: 8,
    borderRadius: radius.r1,
    backgroundColor: colors.surface3,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  mine: { backgroundColor: colors.accent },
  theirs: { backgroundColor: colors.surface3 },
  figure: { flexShrink: 0, alignItems: 'flex-end' },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  value: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.ink,
    marginTop: 3,
    ...tnum,
  },
});
