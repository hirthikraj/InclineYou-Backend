/**
 * `.tx-pad` and `.tx-amount` — entering an amount.
 *
 * A keypad rather than a text field, for two reasons. The number is the whole
 * point of the sheet, so it deserves the screen; and the OS numeric keyboard
 * on Android is a full QWERTY with a number row on a good third of the devices
 * this ships to, which puts a decimal point and a comma next to the 0.
 *
 * `000` rather than a decimal key: this is rupees, and a trainer types 4000,
 * not 4000.00. Amounts stay whole — a paisa of drift in a ledger is the end of
 * the ledger.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconBackspace } from './icons';
import { colors, maxFontScale, radius, tap, tnum } from './tokens';

/** `.tx-amount` — the figure being typed. */
export function Amount({
  value,
  size = 34,
  style,
}: {
  /** Already grouped — "9,000". The ₹ is drawn separately at a smaller size. */
  value: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.amount, style]}>
      <Text style={[styles.rupee, { fontSize: Math.round(size * 0.59) }]}>₹</Text>
      <Text style={[styles.figure, { fontSize: size }]}>{value}</Text>
    </View>
  );
}

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | 'back';

const KEYS: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'];

export default function Keypad({
  onKey,
  style,
}: {
  onKey: (key: Key) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pad, style]}>
      {KEYS.map((key) => {
        const quiet = key === '000' || key === 'back';
        return (
          <Pressable
            key={key}
            onPress={() => onKey(key)}
            accessibilityRole="button"
            accessibilityLabel={key === 'back' ? 'Backspace' : key}
            style={({ pressed }) => [
              styles.key,
              quiet ? styles.keyQuiet : styles.keyFilled,
              pressed && styles.keyPressed,
            ]}
          >
            {key === 'back' ? (
              <IconBackspace size={20} color={colors.ink2} />
            ) : (
              <Text
                style={[styles.keyLabel, quiet && styles.keyLabelQuiet]}
                maxFontSizeMultiplier={maxFontScale.control}
              >
                {key}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Applies a key to a whole-rupee amount.
 *
 * Capped at seven digits: ₹99,99,999 is well past anything a personal trainer
 * collects in one payment, and without a cap a stuck key turns the sheet into
 * nonsense.
 */
export function applyKey(current: number, key: Key): number {
  if (key === 'back') return Math.floor(current / 10);
  const digits = key === '000' ? '000' : key;
  const next = Number(`${current}${digits}`);
  if (!Number.isFinite(next) || next > 9_999_999) return current;
  return next;
}

const styles = StyleSheet.create({
  amount: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  rupee: { fontWeight: '700', color: colors.ink3, ...tnum },
  figure: { fontWeight: '800', letterSpacing: -1.36, color: colors.ink, ...tnum },

  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: {
    // Three across, with two 8px gutters shared out.
    width: '31.5%',
    flexGrow: 1,
    minHeight: tap.gym,
    borderRadius: radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyFilled: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  keyQuiet: { backgroundColor: 'transparent' },
  keyPressed: { backgroundColor: colors.surface3 },
  keyLabel: { fontSize: 23, fontWeight: '700', color: colors.ink, ...tnum },
  keyLabelQuiet: { fontSize: 17, color: colors.ink2 },
});
