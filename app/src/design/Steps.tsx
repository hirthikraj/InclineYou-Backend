/**
 * `.tx-steps` / `.tx-steps__label` / `.tx-skip` — the onboarding app bar's
 * progress and its escape hatch.
 *
 * A segmented bar rather than dots or a numbered stepper: dots read as a
 * swipeable carousel, and numbered steppers stop fitting past four labels at
 * 360dp — the Android volume width.
 *
 * The current segment is half-filled. The CSS does it with a hard-stop
 * gradient; RN has no gradients without a native dependency, so it is a
 * surface-3 track with an accent child at the same 55%.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, tnum } from './tokens';

/** The share of the current segment that reads as done. Straight from the CSS. */
const NOW_FILL = '55%';

export interface StepsProps {
  /** How many segments in total. */
  count: number;
  /** 0-based. Everything before it is done, everything after is to do. */
  current: number;
}

export function Steps({ count, current }: StepsProps) {
  return (
    <View
      style={styles.steps}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: count, now: current + 1 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.seg, i < current && styles.segDone]}>
          {i === current ? <View style={styles.segNow} /> : null}
        </View>
      ))}
    </View>
  );
}

/** `1 / 6` — the count in words, for anyone who reads the bar as decoration. */
export function StepsLabel({ current, count }: { current: number; count: number }) {
  return (
    <Text style={styles.label}>
      {current + 1} / {count}
    </Text>
  );
}

/**
 * `.tx-skip` — top-right in the app bar, NEVER beside the primary CTA. That is
 * where thumb momentum lives, and a skip placed there collects accidental taps
 * that look exactly like intent.
 */
export function SkipButton({ label = 'Skip for now', onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
    >
      <Text style={styles.skipLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  steps: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  seg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface3,
    overflow: 'hidden',
  },
  segDone: { backgroundColor: colors.accent },
  segNow: { width: NOW_FILL, height: '100%', backgroundColor: colors.accent },

  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.ink3,
    ...tnum,
  },

  skip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: radius.r2,
  },
  skipPressed: { backgroundColor: colors.surface2 },
  skipLabel: { fontSize: 14, fontWeight: '500', color: colors.ink3 },
});
