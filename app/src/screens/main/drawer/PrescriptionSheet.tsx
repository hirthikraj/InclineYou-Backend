/**
 * The numbers, asked at the moment an exercise is added.
 *
 * They used to be invented — every add wrote 3 × 10 · 60s and the trainer fixed
 * it afterwards, row by row. Asking here costs one sheet and saves that whole
 * second pass, and it is the only place a *timed* exercise can be said at all:
 * "3 × 45s plank" has no honest spelling in a reps field.
 *
 * ── Reps or Time ───────────────────────────────────────────────────────────
 *
 * A toggle rather than a guess. The library's log types know weight-and-reps
 * from reps, but nothing in the data says "this one is a hold" — the trainer
 * does, per prescription, which is also why the same exercise can be reps in
 * one program and time in another (a weighted plank and a max hold are both
 * planks).
 *
 * Everything is prefilled so the fast path is still fast: a trainer who wants
 * 3 × 10 · 60s taps Add and is done — same two taps as before, now with the
 * numbers on show instead of implied.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Chip,
  Control,
  FieldLabel,
  Seg,
  Sheet,
  colors,
  space,
} from '../../../design';

export interface Prescription {
  sets: number | null;
  reps: number | null;
  /** Set instead of reps on a timed prescription, never alongside. */
  durationSeconds: number | null;
  restSeconds: number | null;
}

export interface PrescriptionSheetProps {
  visible: boolean;
  /** The exercise being prescribed — the sheet's title. */
  name: string;
  onAdd: (prescription: Prescription) => void;
  onClose: () => void;
}

const num = (text: string): number | null => {
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export default function PrescriptionSheet({ visible, name, onAdd, onClose }: PrescriptionSheetProps) {
  const [mode, setMode] = useState<'reps' | 'time'>('reps');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [seconds, setSeconds] = useState('30');
  const [rest, setRest] = useState('60');

  // Re-seeded on open, so one exercise's numbers never leak onto the next.
  useEffect(() => {
    if (!visible) return;
    setMode('reps');
    setSets('3');
    setReps('10');
    setSeconds('30');
    setRest('60');
  }, [visible]);

  const timed = mode === 'time';

  return (
    <Sheet visible={visible} onClose={onClose} title={name}>
      <Text style={styles.meta}>
        The default the plan asks for — you can tweak it per client after assigning.
      </Text>

      <Seg style={styles.mode}>
        <Chip label="Reps" selected={!timed} onPress={() => setMode('reps')} />
        <Chip label="Time" selected={timed} onPress={() => setMode('time')} />
      </Seg>

      <View style={styles.fields}>
        <View style={styles.field}>
          <FieldLabel>Sets</FieldLabel>
          <Control
            value={sets}
            onChangeText={setSets}
            keyboardType="number-pad"
            placeholder="3"
            accessibilityLabel="Sets"
          />
        </View>
        {timed ? (
          <View style={styles.field}>
            <FieldLabel>Time</FieldLabel>
            <Control
              value={seconds}
              onChangeText={setSeconds}
              keyboardType="number-pad"
              placeholder="30"
              affix="sec"
              accessibilityLabel="Seconds per set"
            />
          </View>
        ) : (
          <View style={styles.field}>
            <FieldLabel>Reps</FieldLabel>
            <Control
              value={reps}
              onChangeText={setReps}
              keyboardType="number-pad"
              placeholder="10"
              accessibilityLabel="Reps"
            />
          </View>
        )}
        <View style={styles.field}>
          <FieldLabel>Rest</FieldLabel>
          <Control
            value={rest}
            onChangeText={setRest}
            keyboardType="number-pad"
            placeholder="60"
            affix="sec"
            accessibilityLabel="Rest seconds"
          />
        </View>
      </View>

      <Button
        label="Add it"
        variant="primary"
        size="lg"
        block
        onPress={() =>
          onAdd({
            sets: num(sets),
            reps: timed ? null : num(reps),
            durationSeconds: timed ? num(seconds) : null,
            restSeconds: num(rest),
          })
        }
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  mode: { marginBottom: space.s4 },
  fields: { flexDirection: 'row', gap: space.s2, marginBottom: space.s5 },
  field: { flex: 1 },
});
