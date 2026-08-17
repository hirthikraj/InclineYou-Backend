/**
 * Which plan day lands on which weekday — the mapping step of an apply.
 *
 * A template's days are ordinal slots and the default layout puts Day 1 on the
 * earliest weekday picked. That is the common week, not the only one: a client
 * who wants legs fresh on Monday maps Day 3 there, and this list is where the
 * trainer says so. One row per landed weekday, one chip per plan day.
 *
 * Picking a day already used elsewhere SWAPS the two rows rather than erroring:
 * the mapping is a permutation by construction — every plan day lands exactly
 * once — so there is never an invalid state to warn about, only a different
 * order. Shared by the add-client plan step and the shelf's assign screen,
 * because they are the same question at two moments.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, Seg, colors, space } from '../design';

export default function DayMapList({
  rows,
  days,
  labels,
  map,
  onChange,
}: {
  /** One label per landed weekday, week order — "Monday · 7:00 am". */
  rows: string[];
  /** The template's ordinal day slots, ascending — e.g. [1, 2, 3]. */
  days: number[];
  /** Trainer-authored day names, keyed by slot: {3: 'Legs'}. */
  labels?: Record<number, string>;
  /** `map[i]` is the plan day landing on `rows[i]`. Always a permutation of `days`. */
  map: number[];
  onChange: (next: number[]) => void;
}) {
  const pick = (row: number, day: number) => {
    if (map[row] === day) return;
    const next = [...map];
    const other = next.indexOf(day);
    if (other >= 0) next[other] = next[row];
    next[row] = day;
    onChange(next);
  };

  return (
    <View>
      {rows.map((label, i) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Seg>
            {days.map((day) => (
              <Chip
                key={day}
                label={labels?.[day] ? `Day ${day} · ${labels[day]}` : `Day ${day}`}
                selected={map[i] === day}
                onPress={() => pick(i, day)}
              />
            ))}
          </Seg>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: space.s3 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginBottom: space.s2 },
});
