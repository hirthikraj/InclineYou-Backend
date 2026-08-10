/**
 * `.tx-segmented` — two to four exclusive views.
 *
 * Not `Chip`: chips filter a list that stays on screen and read as multi-select.
 * This swaps what the screen *is*, so it gets the single-choice affordance —
 * one filled pill inside a track, and no state where nothing is chosen.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, tap } from './tokens';

export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
}

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.button, on && styles.buttonOn]}
          >
            <Text
              style={[styles.label, on && styles.labelOn]}
              maxFontSizeMultiplier={maxFontScale.control}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: radius.r2 + 3,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.fieldLine,
  },
  button: {
    flex: 1,
    minHeight: tap.min - 4,
    borderRadius: radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOn: { backgroundColor: colors.accent },
  label: { fontSize: 14, fontWeight: '600', letterSpacing: -0.14, color: colors.ink2 },
  labelOn: { color: colors.accentInk, fontWeight: '700' },
});
