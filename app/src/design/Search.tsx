/**
 * `.tx-search` — a filled pill with no border at rest.
 *
 * Deliberately unlike `Control`: search is not a form field you fill in and
 * submit, and giving it the same box invites people to treat it as one.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
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
  style?: StyleProp<ViewStyle>;
}

export default function Search({
  value,
  onChangeText,
  placeholder = 'Search',
  autoFocus = false,
  inputRef,
  style,
}: SearchProps) {
  const [focused, setFocused] = useState(false);

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
  input: { flex: 1, minWidth: 0, padding: 0, color: colors.ink, fontSize: 16 },
});
