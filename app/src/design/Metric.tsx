/**
 * `.tx-metric` and `.tx-spark` — a headline number with its recent shape.
 *
 * The delta is the reason this is a card rather than a `Stat`. "118 sessions" is
 * a fact; "118, up 9%" is information, and the sparkline behind it is what stops
 * a trainer having to trust the percentage — a run that went up and then fell
 * off a cliff averages to "up 9%" too.
 *
 * **The sparkline has one colour.** No highlight on the last bar, no second
 * colour for a good week. A sparkline carries no legend, so a second colour
 * reads as a second category and the reader spends their attention working out
 * what it means. The rightmost bar is the current period by convention and needs
 * no extra emphasis.
 *
 * Bars are laid out with flex rather than measured, so the same component draws
 * seven days or thirty without being told which.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

/** Which way the delta points. `flat` is a real answer, not a missing one. */
export type Delta = 'up' | 'down' | 'flat';

export interface MetricProps {
  /** Uppercase micro label. "Sessions delivered". */
  label: string;
  value: string;
  /** "▲ 9%" is drawn from these two — the arrow is added here, not passed in. */
  delta?: { direction: Delta; text: string };
  /**
   * One entry per period, already normalised to 0…1. Normalising here would mean
   * this component decides what the maximum is, and for "clients training" the
   * honest maximum is the roster, not the tallest bar.
   */
  spark?: number[];
  /**
   * A real chart, or a sentence, inside the same card.
   *
   * For the one case the sparkline cannot serve: screen 17's volume block draws
   * a labelled eight-week `WeekBars`, because a trainer turns that one round to
   * show a client and an unlabelled run of bars is not something you can point
   * at. Mutually exclusive with `spark` in practice — two charts in one card is
   * two answers to one question.
   */
  children?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Below this a bar is a dot and the run reads as a dotted line. */
const MIN_BAR = 3;
const SPARK_H = 40;

const ARROW: Record<Delta, string> = { up: '▲', down: '▼', flat: '·' };

export default function Metric({
  label,
  value,
  delta,
  spark,
  children,
  onPress,
  style,
}: MetricProps) {
  const body = (
    <>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>

      <View style={styles.valueRow}>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
        {delta ? (
          <Text style={[styles.delta, DELTA_TONE[delta.direction]]} numberOfLines={1}>
            {ARROW[delta.direction]} {delta.text}
          </Text>
        ) : null}
      </View>

      {spark && spark.length ? (
        <View style={styles.spark}>
          {spark.map((fraction, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                // Clamped rather than trusted: a caller that hands us 1.4 should
                // draw a full bar, not one that overflows the card.
                { height: Math.max(MIN_BAR, Math.min(1, Math.max(0, fraction)) * SPARK_H) },
              ]}
            />
          ))}
        </View>
      ) : null}

      {children ? <View style={styles.extra}>{children}</View> : null}
    </>
  );

  if (!onPress) return <View style={[styles.card, style]}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[label, value, delta?.text].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      {body}
    </Pressable>
  );
}

const DELTA_TONE: Record<Delta, { color: string }> = {
  up: { color: colors.ok },
  down: { color: colors.danger },
  flat: { color: colors.ink3 },
};

const styles = StyleSheet.create({
  card: {
    padding: space.cardPad,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { backgroundColor: colors.surface2 },

  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
  },

  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.s2, marginTop: 9 },
  value: { fontSize: 26, fontWeight: '800', letterSpacing: -0.9, color: colors.ink, ...tnum },
  delta: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

  extra: { marginTop: 14 },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: SPARK_H, marginTop: 14 },
  bar: {
    flex: 1,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: colors.accent,
  },
});
