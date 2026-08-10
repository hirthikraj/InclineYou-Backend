/**
 * `.tx-months` — the month scroller.
 *
 * Each chip carries its own total, because the point of the strip is not to
 * pick a month but to compare them: "May was ₹94k and June was ₹1.1L" is the
 * whole reason a trainer scrolls it. A strip of bare month names would need a
 * tap per month to answer the same question.
 *
 * It scrolls to the selected month on mount rather than animating there, so
 * arriving on the screen never looks like a glitch.
 */

import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, maxFontScale, radius, space, tap, tnum } from './tokens';

export interface MonthChip {
  key: string;
  label: string;
  total: string;
}

const CHIP_W = 70;

export default function Months({
  months,
  selected,
  onSelect,
  style,
}: {
  months: MonthChip[];
  selected: string;
  onSelect: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const scroller = useRef<ScrollView>(null);
  const index = months.findIndex((m) => m.key === selected);

  useEffect(() => {
    if (index < 0) return;
    // Centre-ish, clamped at zero. Not animated: this fires on mount.
    const x = Math.max(0, index * (CHIP_W + 6) - CHIP_W);
    scroller.current?.scrollTo({ x, animated: false });
  }, [index]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.track}
      style={style}
    >
      {months.map((month) => {
        const on = month.key === selected;
        return (
          <Pressable
            key={month.key}
            onPress={() => onSelect(month.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${month.label}, ${month.total}`}
            style={({ pressed }) => [
              styles.chip,
              on && styles.chipOn,
              pressed && !on && styles.chipPressed,
            ]}
          >
            <Text
              style={[styles.label, on && styles.labelOn]}
              maxFontSizeMultiplier={maxFontScale.micro}
            >
              {month.label}
            </Text>
            <Text
              style={[styles.total, on && styles.totalOn]}
              maxFontSizeMultiplier={maxFontScale.micro}
            >
              {month.total}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 6, paddingRight: space.inset },
  chip: {
    minHeight: tap.min,
    minWidth: CHIP_W,
    paddingHorizontal: 14,
    borderRadius: radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipPressed: { backgroundColor: colors.surface2 },
  label: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  labelOn: { color: colors.accentInk },
  total: { fontSize: 13, fontWeight: '800', letterSpacing: -0.26, color: colors.ink, ...tnum },
  totalOn: { color: colors.accentInk },
});
