/**
 * `.tx-avail__row` — one weekday's working hours.
 *
 * A split shift drawn as a split shift: two pills, not a range from 06:00 to
 * 21:00 that claims the trainer is available for lunch. A closed day says
 * Closed in flat ink rather than showing an empty row, because "no hours" is a
 * decision and an empty row looks like a bug.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, space, tnum } from './tokens';
import { IconChevron } from './icons';

export default function AvailRow({
  day,
  windows,
  onPress,
  style,
}: {
  day: string;
  /** Already formatted, e.g. "06:00 – 11:00". Empty means closed. */
  windows: string[];
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const closed = windows.length === 0;

  const inner = (
    <>
      <Text style={styles.day} maxFontSizeMultiplier={maxFontScale.micro}>
        {day}
      </Text>
      <View style={styles.bars}>
        {closed ? (
          <View style={[styles.bar, styles.barOff]}>
            <Text style={[styles.barText, styles.barTextOff]}>Closed</Text>
          </View>
        ) : (
          // Keyed by position, not by the label: these are formatted strings
          // with no identity of their own, they never reorder, and two windows
          // can legitimately read the same after a merge upstream fails.
          windows.map((window, i) => (
            <View key={`${i}-${window}`} style={styles.bar}>
              <Text style={styles.barText}>{window}</Text>
            </View>
          ))
        )}
      </View>
      {onPress ? <IconChevron size={17} color={colors.ink3} strokeWidth={1.8} /> : null}
    </>
  );

  if (!onPress) return <View style={[styles.row, style]}>{inner}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${day}, ${closed ? 'closed' : windows.join(' and ')}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    width: '100%',
    paddingVertical: 4,
  },
  pressed: { opacity: 0.7 },
  day: {
    width: 38,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  bars: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  bar: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
  },
  barOff: { backgroundColor: colors.surface2 },
  barText: { fontSize: 11.5, fontWeight: '700', color: colors.accentText, ...tnum },
  barTextOff: { color: colors.ink3 },
});
