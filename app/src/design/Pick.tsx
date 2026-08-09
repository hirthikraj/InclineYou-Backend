/**
 * `.tx-pick` — selection chips, the workhorse of the onboarding flow.
 *
 * Wrap, never scroll: in onboarding, hidden means unselected. A horizontal
 * strip quietly costs you every option past the fold.
 *
 * Two spec details that are easy to lose:
 *   · the check glyph only appears on a selected chip, and it must not resize
 *     the chip when it arrives — the layout is a flex row, so the label simply
 *     shifts by the icon's width, never reflows the wrap;
 *   · at a cap the remaining chips go to 38% and stop responding. Whatever
 *     renders them disabled must ALSO say why (see `Toast`) — a tap that
 *     silently does nothing reads as a broken button.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, tnum } from './tokens';
import { IconCheck } from './icons';

/**
 * Kept at 1.5 in both states. The CSS can switch 1px → 1.5px for free because
 * it draws the border as an inset shadow; an RN border is part of the box, so
 * changing it on selection would nudge the label half a pixel every tap.
 */
const CHIP_BORDER = 1.5;

export function Pick({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.pick, style]}>{children}</View>;
}

export interface PickChipProps {
  label: string;
  selected?: boolean;
  /** At a cap: dimmed and inert. Always pair with a visible reason. */
  disabled?: boolean;
  onPress: () => void;
}

export function PickChip({ label, selected = false, disabled = false, onPress }: PickChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipOn,
        disabled && styles.chipOff,
        pressed && !disabled && (selected ? styles.chipOnPressed : styles.chipPressed),
      ]}
    >
      {selected ? <IconCheck size={15} color={colors.accentText} strokeWidth={3} /> : null}
      <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

/** `+ Add your own` — dashed, accent-lettered, never looks selectable. */
export function PickAdd({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.chip,
        styles.add,
        disabled && styles.chipOff,
        pressed && !disabled && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipLabel, styles.addLabel]}>{label}</Text>
    </Pressable>
  );
}

/** `3/5` — live, and amber the moment it hits the cap. */
export function PickCount({ value, max }: { value: number; max: number }) {
  const full = value >= max;
  return (
    <Text style={[styles.count, full && styles.countFull]}>
      {value}/{max}
    </Text>
  );
}

const styles = StyleSheet.create({
  pick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 15,
    borderRadius: radius.r2,
    backgroundColor: colors.field,
    borderWidth: CHIP_BORDER,
    borderColor: colors.fieldLine,
  },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
  chipOff: { opacity: 0.38 },
  chipPressed: { backgroundColor: colors.fieldHover },
  chipOnPressed: { borderColor: colors.accentText },

  chipLabel: { fontSize: 14.5, fontWeight: '500', letterSpacing: -0.15, color: colors.ink2 },
  chipLabelOn: { fontWeight: '600', color: colors.accentText },

  // `borderStyle: 'dashed'` with a radius falls back to solid on some Android
  // builds. It still reads as the odd one out — no fill, accent lettering.
  add: { backgroundColor: 'transparent', borderColor: colors.fieldLineHover, borderStyle: 'dashed' },
  addLabel: { color: colors.accentText },

  count: { fontSize: 12.5, fontWeight: '600', color: colors.ink3, ...tnum },
  countFull: { color: colors.warn },
});
