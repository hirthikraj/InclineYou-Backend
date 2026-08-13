/**
 * `.tx-stepper` — a number with a button at each end.
 *
 * The two buttons sit at the far ends of the control rather than beside each
 * other, because this is used one-handed at arm's length with a client waiting.
 * 56px each, which §09 requires of anything used mid-session, and the value in
 * the middle stays directly editable — a gloved thumb beats a keypad by 2.5 kg
 * at a time, and a keypad beats a thumb when the jump is from 20 to 60.
 *
 * `step` is the gym's, not the app's: the smallest plate in the room is 1.25 kg
 * in some gyms and 2.5 in others.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { IconMinus, IconPlus } from './icons';
import { colors, radius, tap, tnum } from './tokens';

export interface StepperProps {
  value: string;
  onChange: (next: string) => void;
  step?: number;
  /** "kg". Omitted for a count. */
  unit?: string;
  min?: number;
  max?: number;
  decimal?: boolean;
  label: string;
  style?: StyleProp<ViewStyle>;
}

export default function Stepper({
  value,
  onChange,
  step = 1,
  unit,
  min = 0,
  max = 9999,
  decimal = false,
  label,
  style,
}: StepperProps) {
  const nudge = (delta: number) => {
    const current = Number.parseFloat(value);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.min(max, Math.max(min, base + delta));
    // Rounded to one place: 2.5 steps off an odd starting value are the only way
    // this ever produces a float tail, and "52.500000000000004 kg" is a bug the
    // trainer sees.
    onChange(decimal ? String(Math.round(next * 10) / 10) : String(Math.round(next)));
  };

  return (
    <View style={[styles.stepper, style]}>
      <Pressable
        onPress={() => nudge(-step)}
        accessibilityRole="button"
        accessibilityLabel={`${step}${unit ? ` ${unit}` : ''} less`}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <IconMinus size={20} color={colors.ink2} />
      </Pressable>

      <View style={styles.middle}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          inputMode={decimal ? 'decimal' : 'numeric'}
          selectTextOnFocus
          accessibilityLabel={label}
          style={styles.value}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>

      <Pressable
        onPress={() => nudge(step)}
        accessibilityRole="button"
        accessibilityLabel={`${step}${unit ? ` ${unit}` : ''} more`}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <IconPlus size={19} color={colors.ink2} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: tap.gym,
    borderRadius: radius.r2,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldLine,
    overflow: 'hidden',
  },
  button: { width: tap.gym, height: tap.gym, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.surface2 },

  middle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  value: {
    minWidth: 64,
    textAlign: 'right',
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    paddingVertical: 0,
    ...tnum,
  } as TextStyle,
  unit: { fontSize: 13, fontWeight: '500', color: colors.ink3 },
});
