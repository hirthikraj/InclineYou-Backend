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

export default function DoneMark({ style }: { style?: StyleProp<ViewStyle> }) {
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
      accessibilityLabel="Setup complete"
      style={[styles.mark, { opacity, transform: [{ scale }] }, style]}
    >
      <IconCheck size={42} color={colors.accentInk} strokeWidth={2.6} />
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
});
