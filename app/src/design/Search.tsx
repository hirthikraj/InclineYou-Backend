/**
 * `.tx-search` — a filled pill with no border at rest.
 *
 * Deliberately unlike `Control`: search is not a form field you fill in and
 * submit, and giving it the same box invites people to treat it as one.
 */

import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInput as TextInputType,
  type ViewStyle,
} from 'react-native';
import { colors, radius } from './tokens';
import { IconSearch } from './icons';

export interface SearchProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<TextInputType | null>;
  /**
   * Turns the pill into a button that opens a search screen instead of a field
   * you type into. § 02 of the roster: results span clients, groups and
   * programs, and those can't be rendered inside the list you are standing on —
   * so the field on a list screen is an affordance, and the screen it pushes is
   * where the typing happens.
   */
  onPress?: () => void;
  /** Trailing control — the clear button on a live query. */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function Search({
  value,
  onChangeText,
  placeholder = 'Search',
  autoFocus = false,
  inputRef,
  onPress,
  trailing,
  style,
}: SearchProps) {
  const [focused, setFocused] = useState(false);

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        style={({ pressed }) => [styles.search, pressed && styles.pressed, style]}
      >
        <IconSearch size={18} color={colors.ink3} strokeWidth={1.9} />
        <Text style={styles.placeholder}>{placeholder}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.search, focused && styles.focused, style]}>
      <IconSearch size={18} color={colors.ink3} strokeWidth={1.9} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={styles.input}
      />
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 2,
    borderColor: 'transparent', // reserved, so focusing never resizes the pill
  },
  focused: { borderColor: colors.focus },
  pressed: { backgroundColor: colors.surface3 },
  input: { flex: 1, minWidth: 0, padding: 0, color: colors.ink, fontSize: 16 },
  placeholder: { flex: 1, minWidth: 0, color: colors.ink3, fontSize: 16 },
});
