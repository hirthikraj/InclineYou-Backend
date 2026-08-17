/**
 * `.tx-timefield` — a clock time, nudged rather than typed.
 *
 * Two buttons at the ends and a readout in the middle, the same shape as
 * `Stepper`, because it is the same gesture: a trainer setting hours is
 * standing on a floor, not sitting at a desk. A wheel picker asks for a scroll
 * and a confirm; this asks for taps, and the whole range a working day occupies
 * is at most a dozen of them from any sensible starting point.
 *
 * The step is 15 minutes, which is the smallest unit a gym schedule has ever
 * needed and the one that keeps 07:30 and 06:45 reachable. Presets still exist
 * for the common shapes — this is for the trainer whose day is not one of them.
 *
 * Clamped, never wrapped. Rolling 23:45 round to 00:00 turns "later" into
 * "much earlier" under a thumb that is holding the button down, and a working
 * day that ends before it starts is the one state this must not produce.
 *
 * `isBlocked` marks make the stepper skip: a nudge that lands on one keeps
 * going in the same direction until a free mark, and stays put when nothing
 * that way is free. The value already shown is never judged — a blocked value
 * can only be one that arrived from outside, and silently moving it would
 * save a different answer than the one on screen.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { IconMinus, IconPlus } from './icons';
import { colors, maxFontScale, radius, tap, tnum } from './tokens';

export const MINUTES_IN_DAY = 24 * 60;

/** "06:00", "21:30" — 24-hour, because a gym roster is written that way. */
export function formatMinute(minute: number): string {
  const m = Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(minute)));
  // 24:00 rather than 00:00: this is an end-of-day boundary, not a wrap.
  if (m === MINUTES_IN_DAY) return '24:00';
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export interface TimeFieldProps {
  /** Minutes from midnight. */
  value: number;
  onChange: (next: number) => void;
  /** Shown above the control. */
  label: string;
  step?: number;
  min?: number;
  max?: number;
  /** Marks the stepper must not land on — e.g. hours another client holds. */
  isBlocked?: (minute: number) => boolean;
  style?: StyleProp<ViewStyle>;
}

export default function TimeField({
  value,
  onChange,
  label,
  step = 15,
  min = 0,
  max = MINUTES_IN_DAY,
  isBlocked,
  style,
}: TimeFieldProps) {
  const nudge = (delta: number) => {
    // Snapped to the step grid off the *result*, so a value that arrived from a
    // preset at 06:00 and one hand-nudged to 06:07 both land on clean marks.
    const snapped = Math.round((value + delta) / step) * step;
    let next = Math.min(max, Math.max(min, snapped));
    // A blocked mark is skipped, in the direction of the nudge; a wall of
    // blocked marks to the edge means the nudge does nothing.
    while (isBlocked?.(next)) {
      next += delta < 0 ? -step : step;
      if (next < min || next > max) return;
    }
    onChange(next);
  };

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={style}>
      <Text style={styles.label} maxFontSizeMultiplier={maxFontScale.micro}>
        {label}
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => nudge(-step)}
          disabled={atMin}
          accessibilityRole="button"
          accessibilityLabel={`${label} earlier`}
          accessibilityState={{ disabled: atMin }}
          style={({ pressed }) => [styles.btn, pressed && !atMin && styles.pressed]}
        >
          <IconMinus size={19} color={atMin ? colors.inkOff : colors.ink} strokeWidth={2} />
        </Pressable>

        <Text
          style={styles.value}
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={maxFontScale.control}
        >
          {formatMinute(value)}
        </Text>

        <Pressable
          onPress={() => nudge(step)}
          disabled={atMax}
          accessibilityRole="button"
          accessibilityLabel={`${label} later`}
          accessibilityState={{ disabled: atMax }}
          style={({ pressed }) => [styles.btn, pressed && !atMax && styles.pressed]}
        >
          <IconPlus size={19} color={atMax ? colors.inkOff : colors.ink} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldLine,
    borderRadius: radius.r2,
    overflow: 'hidden',
  },
  btn: {
    width: tap.min,
    height: tap.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.fieldHover },
  value: {
    flex: 1,
    textAlign: 'center',
    fontSize: 19,
    fontWeight: '700',
    color: colors.ink,
    ...tnum,
  },
});
