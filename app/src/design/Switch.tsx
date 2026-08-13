/**
 * `.tx-switch` — the toggle.
 *
 * Not React Native's `Switch`. That component renders the platform control,
 * which on Android means Material's colours and on iOS means a 51 × 31 pill with
 * a white knob — and this design system's switch is 50 × 30 with the brand lime
 * as its on state and the ink colour as its knob. A settings list where every
 * other row is a system control and this one is not would read as a mistake.
 *
 * The knob is animated rather than positioned, and the track colour crossfades
 * underneath it. Both are one `Animated.Value`, so a switch flipped twice
 * quickly moves from wherever it got to instead of jumping.
 *
 * The track colour cannot go on the native driver — `backgroundColor` is not a
 * transform or an opacity — so it is interpolated on the JS driver while the
 * knob rides the native one. Two drivers on one value is not allowed, which is
 * why there are two values here that are started together.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, curve, motion, radius } from './tokens';
import useReduceMotion from './useReduceMotion';

const TRACK_W = 50;
const TRACK_H = 30;
const KNOB = 24;
/** 3px inset each side: 50 − 24 − 3 − 3. */
const TRAVEL = TRACK_W - KNOB - 6;

export interface SwitchProps {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Spoken instead of the row's own label, when the row's label isn't enough. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export default function Switch({ value, onChange, disabled = false, label, style }: SwitchProps) {
  const reduced = useReduceMotion();
  const knob = useRef(new Animated.Value(value ? 1 : 0)).current;
  const track = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    const to = value ? 1 : 0;
    const duration = reduced ? 0 : motion.fast;
    const easing = Easing.bezier(...curve.standard);
    const run = Animated.parallel([
      Animated.timing(knob, { toValue: to, duration, easing, useNativeDriver: true }),
      Animated.timing(track, { toValue: to, duration, easing, useNativeDriver: false }),
    ]);
    run.start();
    return () => run.stop();
  }, [value, reduced, knob, track]);

  return (
    <Pressable
      onPress={disabled ? undefined : () => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      // The design gives the pill a 9px invisible margin on every side, which is
      // what takes a 50 × 30 control to a 68 × 48 target.
      hitSlop={9}
      style={[styles.track, disabled && styles.disabled, style]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.fill,
          {
            backgroundColor: track.interpolate({
              inputRange: [0, 1],
              outputRange: [colors.surface3, colors.accent],
            }),
          },
        ]}
      />
      <Animated.View
        style={[
          styles.knob,
          {
            backgroundColor: value ? colors.accentInk : colors.ink,
            transform: [
              { translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) },
            ],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: radius.full,
    justifyContent: 'center',
    paddingHorizontal: 3,
    flexShrink: 0,
    // Clips nothing, but keeps the animated fill's corners honest on Android.
    overflow: 'hidden',
  },
  fill: { borderRadius: radius.full },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
  disabled: { opacity: 0.4 },
});
