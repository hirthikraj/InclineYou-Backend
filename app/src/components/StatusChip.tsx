import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tones, type Tone } from '../theme';
import type { StatusChip as Chip } from '../db/clientStatus';

export function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <Text style={[styles.chipText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Renders a client's derived chips; `max` keeps dense list rows from wrapping forever. */
export function StatusChipRow({ chips, max }: { chips: Chip[]; max?: number }) {
  const shown = max != null ? chips.slice(0, max) : chips;
  const hidden = chips.length - shown.length;

  return (
    <View style={styles.row}>
      {shown.map((c) => (
        <StatusChip key={c.key} label={c.label} tone={c.tone} />
      ))}
      {hidden > 0 ? <Text style={styles.more}>+{hidden}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipText: { fontSize: 11, fontWeight: '600' },
  more: { fontSize: 11, color: '#888', fontWeight: '600' },
});
