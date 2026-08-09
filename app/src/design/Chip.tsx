/**
 * `.tx-chip` — a 36px filter toggle with a live count.
 *
 * Distinct from `PickChip` in `Pick.tsx`, which is the 48px onboarding
 * selection chip. They look related on purpose and are never interchangeable:
 * this one filters a list that is already on screen, that one answers a
 * question. Different height, different type, different job.
 *
 * The count is part of the chip because a filter that hides everything without
 * warning is indistinguishable from an empty screen. "Remote 0" says the
 * filter works and there is genuinely nothing behind it.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, space, tnum } from './tokens';

export function Seg({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.seg, style]}>{children}</View>;
}

export interface ChipProps {
  label: string;
  /** Rendered after the label in dimmer ink. Omit for a chip that isn't a filter. */
  count?: number;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function Chip({ label, count, selected = false, onPress, style }: ChipProps) {
  const fg = selected ? colors.accentText : colors.ink2;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      // The chip reads 36px and responds at 48 — the CSS does this with an
      // inset pseudo-element, RN with hit slop.
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipOn,
        pressed && styles.chipPressed,
        style,
      ]}
    >
      <Text style={[styles.label, { color: fg }]} maxFontSizeMultiplier={maxFontScale.control}>
        {label}
      </Text>
      {count === undefined ? null : (
        <Text
          style={[styles.count, { color: selected ? colors.accentText : colors.ink3 }]}
          maxFontSizeMultiplier={maxFontScale.control}
        >
          {count}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s1 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    // Resting size, not a cap — the chips sit in a wrapping row, so growing is
    // free here and clipping a filter's label never is.
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: space.s3,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
  chipPressed: { opacity: 0.75 },

  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.99,
    textTransform: 'uppercase',
  },
  count: { fontSize: 11, fontWeight: '700', ...tnum },
});
