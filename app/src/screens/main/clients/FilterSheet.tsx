/**
 * 2d · Filter.
 *
 * Every chip carries the count it would produce and the button states the
 * result before you commit — "Show 4 clients". A filter that hides everything
 * without warning is indistinguishable from an empty screen, and the count is
 * what tells the two apart.
 *
 * Reset sits at the top, next to the title, where it doesn't compete with the
 * primary button for the thumb.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Chip,
  Seg,
  Sheet,
  colors,
  space,
} from '../../../design';
import { MODE_LABELS, type DeliveryMode } from '../../../home/mode';
import {
  NO_FILTERS,
  filterCount,
  passesFilters,
  type Batch,
  type Filters,
  type RosterRow,
} from '../../../clients/roster';

const BATCHES: { key: Batch; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'evening', label: 'Evening' },
  { key: 'night', label: 'Night' },
  { key: 'none', label: 'No batch' },
];

const MONEY: { key: Filters['money'][number]; label: string }[] = [
  { key: 'owes', label: 'Owes' },
  { key: 'paid', label: 'Paid up' },
  { key: 'ending', label: 'Pack ending' },
];

export default function FilterSheet({
  visible,
  rows,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  /** The segment's rows, so every count is the count this filter would leave. */
  rows: RosterRow[];
  value: Filters;
  onApply: (next: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(value);

  // The sheet is mounted for the length of its exit animation, so the draft is
  // reseeded on open rather than in an effect that would fight the close.
  const [seed, setSeed] = useState(visible);
  if (visible !== seed) {
    setSeed(visible);
    if (visible) setDraft(value);
  }

  const toggle = <K extends keyof Filters>(group: K, key: Filters[K][number]) =>
    setDraft((current) => {
      const list = current[group] as Filters[K][number][];
      const next = list.includes(key) ? list.filter((v) => v !== key) : [...list, key];
      return { ...current, [group]: next } as Filters;
    });

  /** What the chip would leave if it were the only thing switched on in its group. */
  const countWith = <K extends keyof Filters>(group: K, key: Filters[K][number]) =>
    rows.filter((r) => passesFilters(r, { ...NO_FILTERS, [group]: [key] } as Filters)).length;

  const result = rows.filter((r) => passesFilters(r, draft)).length;
  const applied = filterCount(draft);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>Filter</Text>
        {applied > 0 ? (
          <Text style={styles.reset} onPress={() => setDraft(NO_FILTERS)} accessibilityRole="button">
            Reset
          </Text>
        ) : null}
      </View>

      <Text style={[styles.label, styles.first]}>Where they train</Text>
      <Seg style={styles.seg}>
        {(['floor', 'remote'] as DeliveryMode[]).map((mode) => (
          <Chip
            key={mode}
            label={MODE_LABELS[mode]}
            count={countWith('mode', mode)}
            selected={draft.mode.includes(mode)}
            onPress={() => toggle('mode', mode)}
          />
        ))}
      </Seg>

      <Text style={styles.label}>Money</Text>
      <Seg style={styles.seg}>
        {MONEY.map((m) => (
          <Chip
            key={m.key}
            label={m.label}
            count={countWith('money', m.key)}
            selected={draft.money.includes(m.key)}
            onPress={() => toggle('money', m.key)}
          />
        ))}
      </Seg>

      <Text style={styles.label}>Batch</Text>
      <Seg style={styles.seg}>
        {BATCHES.map((b) => (
          <Chip
            key={b.key}
            label={b.label}
            count={countWith('batch', b.key)}
            selected={draft.batch.includes(b.key)}
            onPress={() => toggle('batch', b.key)}
          />
        ))}
      </Seg>

      <Button
        label={`Show ${result} client${result === 1 ? '' : 's'}`}
        size="lg"
        block
        style={styles.cta}
        onPress={() => {
          onApply(draft);
          onClose();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.38, color: colors.ink },
  reset: { fontSize: 13, fontWeight: '700', color: colors.accentText, paddingVertical: 8 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: 18,
  },
  first: { marginTop: 14 },
  seg: { marginTop: space.s2 },
  cta: { marginTop: 22 },
});
