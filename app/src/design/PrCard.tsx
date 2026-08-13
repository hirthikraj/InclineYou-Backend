/**
 * `.tx-pr` — the record, and the only place gold appears in this app.
 *
 * A record is the one thing in a training log a client will read twice, so it is
 * the one moment the app is allowed to be loud. The card **states the number it
 * beat**, because "PR" on its own is a sticker rather than information.
 *
 * ── One glow per screen ───────────────────────────────────────────────────
 *
 * The CSS enforces this with `:has(.tx-card--live)`. React Native has no such
 * selector, so the rule is a prop: the exercise card gives up its glow when a
 * record lands, and `quiet` here is what the card wears when something else on
 * the screen is already live. If two things glow, nothing is live.
 *
 * `quiet` is also the treatment for a record that is real but below the shout
 * threshold — one more rep at a warm-up weight. Same gold, no halo, smaller
 * figure. Kept in her history, kept off her phone.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconBadge } from './icons';
import { colors, radius, space, tnum } from './tokens';

export interface PrCardProps {
  /** "Set 3" — which set did it. */
  setLabel: string;
  /** The new number. */
  value: string;
  unit: string;
  /** "was 52.5 kg". Struck through: the old number is the whole meaning of the new one. */
  was: string;
  /** "+2.5". */
  delta: string;
  /** Why it counts, in a sentence. */
  why: string;
  /** Real, but not worth a shout. Loses the halo and the big figure. */
  quiet?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function PrCard({
  setLabel,
  value,
  unit,
  was,
  delta,
  why,
  quiet = false,
  onPress,
  style,
}: PrCardProps) {
  const inner = (
    <>
      <View style={styles.head}>
        <IconBadge size={15} color={colors.pr} />
        <Text style={styles.headLabel}>{quiet ? 'Record · not announced' : 'Personal record'}</Text>
        <Text style={styles.headWhich}>{setLabel}</Text>
      </View>

      <View style={styles.figure}>
        <Text style={[styles.value, quiet && styles.valueQuiet]}>
          {value}
          <Text style={styles.unit}> {unit}</Text>
        </Text>
        <Text style={styles.was}>{was}</Text>
        <Text style={styles.delta}>{delta}</Text>
      </View>

      <Text style={styles.why}>{why}</Text>
    </>
  );

  const shell = [styles.card, quiet ? styles.quiet : styles.loud, style];

  if (!onPress) return <View style={shell}>{inner}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Personal record, ${value} ${unit}, ${was}. ${why}`}
      style={({ pressed }) => [...shell, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.cardPad,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.prSoft,
    overflow: 'hidden',
  },
  // The halo is the gold soft token used as a shadow colour — no new value, and
  // on Android the elevation is what carries it.
  loud: {
    shadowColor: colors.pr,
    shadowOpacity: 0.35,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  quiet: {},
  pressed: { backgroundColor: colors.surface2 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.pr,
  },
  headWhich: {
    marginLeft: 'auto',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.63,
    textTransform: 'uppercase',
    color: colors.ink3,
  },

  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 11 },
  value: { fontSize: 30, fontWeight: '800', letterSpacing: -1.05, color: colors.ink, ...tnum },
  valueQuiet: { fontSize: 23, letterSpacing: -0.69 },
  unit: { fontSize: 14, fontWeight: '700', color: colors.ink3 },
  was: {
    fontSize: 14,
    color: colors.ink3,
    textDecorationLine: 'line-through',
    ...tnum,
  },
  delta: { marginLeft: 'auto', fontSize: 15, fontWeight: '800', color: colors.pr, ...tnum },

  why: { marginTop: 9, fontSize: 12.5, lineHeight: 19, color: colors.ink3 },
});
