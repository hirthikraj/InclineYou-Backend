/**
 * `.tx-done__mark` — the restrained success moment.
 *
 * 88px, one 420ms spring, no particles. Finishing a form is not an achievement;
 * the celebration belongs on the first booking and the first payout, where the
 * trainer actually earned something. Overspending it here devalues both.
 *
 * The scale-in is skipped when the OS asks for reduced motion.
 */

import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from './tokens';
import { IconCheck } from './icons';

const SIZE = 88;
const POP_MS = 420;

/**
 * `accent` is the app's own success; `pr` is a personal record and nothing else.
 *
 * Gold displaces the accent for the length of a record moment — rule 7 of the
 * system reserves `--tx-pr` for exactly one meaning, so a gold mark anywhere
 * else would spend it.
 */
export type DoneTone = 'accent' | 'pr';

export default function DoneMark({
  tone = 'accent',
  label = 'Setup complete',
  style,
}: {
  tone?: DoneTone;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        scale.setValue(1);
        opacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }),
        Animated.timing(opacity, { toValue: 1, duration: POP_MS, useNativeDriver: true }),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [scale, opacity]);

  return (
    <Animated.View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.mark,
        tone === 'pr' && styles.markPr,
        { opacity, transform: [{ scale }] },
        style,
      ]}
    >
      {/* Dark ink on the lime, light ink on the gold — the two fills invert
          between themes and the check has to follow each one. */}
      <IconCheck
        size={42}
        color={tone === 'pr' ? colors.inkInverse : colors.accentInk}
        strokeWidth={2.6}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mark: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 46,
    shadowOffset: { width: 0, height: 0 },
  },
  markPr: { backgroundColor: colors.pr, shadowColor: colors.pr },
});
