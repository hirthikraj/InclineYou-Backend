import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';

/** The add-client and edit-client forms are the same shape — keep them one source. */
export function Field({
  label, value, onChangeText, placeholder, keyboardType, suffix,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'decimal-pad';
  suffix?: string;
}) {
  return (
    <View style={formStyles.fieldBlock}>
      <Text style={formStyles.label}>{label}</Text>
      <View style={formStyles.inputWrap}>
        <TextInput
          style={formStyles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#BBB"
          keyboardType={keyboardType ?? 'default'}
        />
        {suffix ? <Text style={formStyles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function Chip({
  label, selected, onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[formStyles.chip, selected && formStyles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[formStyles.chipText, selected && formStyles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const formStyles = StyleSheet.create({
  fieldBlock: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.body, marginBottom: 6 },
  sectionLabel: {
    fontSize: 15, fontWeight: '700', color: colors.ink,
    marginTop: 12, marginBottom: 14,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 12, height: 48,
  },
  input: { flex: 1, fontSize: 16, color: colors.ink },
  suffix: { fontSize: 14, color: colors.muted, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  chipText: { fontSize: 13, color: colors.body, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },

  saveBtn: {
    backgroundColor: colors.indigo, borderRadius: 10, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  offlineNote: {
    textAlign: 'center', fontSize: 12, color: '#999', marginTop: 14,
  },
});
