/**
 * `.tx-select` — a trigger that looks exactly like a field and opens a sheet.
 *
 * It is deliberately not a native picker: the option lists in this app are long
 * enough to need search, and a wheel picker on Android hides everything but
 * three rows. Looking like a field is the point — it sets the expectation that
 * tapping it is how you answer, not that it navigates away.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from './tokens';
import { IconChevronDown, type IconProps } from './icons';

export interface SelectProps {
  /** The chosen value, or null to show `placeholder` in ink-3. */
  value?: string | null;
  placeholder: string;
  onPress: () => void;
  /** Defaults to a chevron. A search glyph says "this opens a searchable list". */
  icon?: React.ComponentType<IconProps>;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Select({
  value,
  placeholder,
  onPress,
  icon: Icon = IconChevronDown,
  disabled = false,
  style,
}: SelectProps) {
  const empty = !value;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ?? placeholder}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.select,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text numberOfLines={1} style={[styles.value, empty && styles.empty]}>
        {value ?? placeholder}
      </Text>
      <Icon size={18} color={colors.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    height: 52,
    paddingHorizontal: 14,
    borderRadius: radius.r2,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldLine,
  },
  pressed: { backgroundColor: colors.fieldHover, borderColor: colors.fieldLineHover },
  disabled: { opacity: 0.45 },
  value: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '400', color: colors.ink },
  empty: { color: colors.ink3 },
});
