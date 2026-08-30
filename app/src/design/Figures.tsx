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
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Bar, Legend } from './Bar';
import { colors, maxFontScale, radius, space, tnum } from './tokens';

/**
 * Past this text scale the pair stops sitting side by side.
 *
 * A rupee figure has no spaces in it, so `Text` has nowhere to wrap and a
 * too-narrow column clips the number rather than growing — the one failure the
 * scaling rules in `tokens` say must never happen. At 130% "₹1,06,500" at 38px
 * no longer shares a 390pt row with "₹18,000" at 30px, so above it the two
 * figures stack and each gets the full width.
 */
const STACK_AT = 1.3;

/**
 * Which of the three tones a figure carries. `plain` is the default for
 * anything that is neither money in nor money out — a session count, a date.
 */
export type FigureTone = 'ok' | 'warn' | 'plain';

export interface FiguresProps {
  collected: string;
  owed: string;
  /**
   * The captions, when this pair is not the month's money.
   *
   * § 09 requires the client file's owed pair to be the same component with the
   * same numbers as the top of his book, so the pair is reused rather than
   * redrawn — and a reused pair needs to be able to say "He owes" and "Sessions
   * left" instead of "Collected" and "Still owed".
   */
  labels?: [string, string];
  /** Per-figure colour. Defaults to the money reading: in is ok, out is amber. */
  tones?: [FigureTone, FigureTone];
  /** A trailing run in quiet ink on the right-hand figure — "/16". */
  owedSuffix?: string;
  /** Replaces the "% in / % out" legend under the bar. */
  legend?: [string, string];
  /** Omits the bar entirely, for a pair whose two halves aren't one whole. */
  bar?: boolean;
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
  labels = ['Collected', 'Still owed'],
  tones,
  owedSuffix,
  legend,
  bar = true,
  collectedPart,
  owedPart,
  writtenOffPart = 0,
  onCollected,
  onOwed,
  style,
}: FiguresProps) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_AT;

  const clear = owedPart <= 0;
  // Zero owed is not a warning. Amber on ₹0 would be an alarm about nothing,
  // which is how a screen teaches people to ignore amber.
  const [leftTone, rightTone] = tones ?? ['ok', clear ? 'plain' : 'warn'];

  const segments = [
    { key: 'in', fraction: collectedPart, color: colors.ok },
    { key: 'out', fraction: owedPart, color: colors.warn },
    ...(writtenOffPart > 0
      ? [{ key: 'off', fraction: writtenOffPart, color: colors.lineStrong }]
      : []),
  ];

  return (
    <View style={[styles.card, style]}>
      <View style={[styles.row, stacked && styles.rowStacked]}>
        <Pressable
          onPress={onCollected}
          disabled={!onCollected}
          accessibilityRole={onCollected ? 'button' : undefined}
          accessibilityLabel={`${labels[0]} ${collected}`}
          style={({ pressed }) => [
            styles.fig,
            stacked && styles.figStacked,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.label} maxFontSizeMultiplier={maxFontScale.micro}>
            {labels[0]}
          </Text>
          <Text style={[styles.value, toneStyle(leftTone)]}>{collected}</Text>
        </Pressable>

        <Pressable
          onPress={onOwed}
          disabled={!onOwed}
          accessibilityRole={onOwed ? 'button' : undefined}
          accessibilityLabel={`${labels[1]} ${owed}`}
          style={({ pressed }) => [
            styles.fig,
            // Stacked, the right-hand figure is no longer on the right — it is
            // the second row, and ragging it to the far edge would leave the
            // two amounts on opposite sides of the card with nothing between.
            stacked ? styles.figStacked : styles.figRight,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[styles.label, !stacked && styles.labelRight]}
            maxFontSizeMultiplier={maxFontScale.micro}
          >
            {labels[1]}
          </Text>
          <Text style={[styles.value, styles.valueSmall, toneStyle(rightTone)]}>
            {owed}
            {owedSuffix ? <Text style={styles.suffix}>{owedSuffix}</Text> : null}
          </Text>
        </Pressable>
      </View>

      {bar ? <Bar segments={segments} style={styles.bar} /> : null}
      {bar ? (
        <Legend
          entries={[
            { key: 'in', label: legend ? legend[0] : `${pct(collectedPart)}% in`, color: colors.ok },
            { key: 'out', label: legend ? legend[1] : `${pct(owedPart)}% out`, color: colors.warn },
            ...(writtenOffPart > 0
              ? [{ key: 'off', label: `${pct(writtenOffPart)}% written off`, color: colors.lineStrong }]
              : []),
          ]}
        />
      ) : null}
    </View>
  );
}

function toneStyle(tone: FigureTone) {
  if (tone === 'ok') return styles.valueOk;
  if (tone === 'warn') return styles.valueWarn;
  return null;
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
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: space.s5 },
  fig: { minWidth: 0, flexShrink: 1 },
  figStacked: { flexShrink: 0, width: '100%' },
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
  suffix: { fontSize: 15, fontWeight: '700', color: colors.ink3, letterSpacing: 0 },
  bar: { marginTop: space.s4 },
});
