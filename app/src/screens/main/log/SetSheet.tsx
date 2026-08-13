/**
 * Screen 17 · § 2a and § 2c — one set, in full.
 *
 * Load and reps live in the row and are typed with the numeric keypad. This
 * sheet is for the two things the row has no width for and no competitor asks
 * for: **RPE and a note**. They are what the trainer knows and the client's own
 * app never records, and they are the reason a log written by a coach is worth
 * more than a log written by a lifter.
 *
 * A sheet rather than a screen, because you are holding a phone in one hand.
 *
 * ── Nothing here asks "are you sure" ──────────────────────────────────────
 *
 * Delete is on this sheet and it goes straight through, with an undo behind it.
 * §09: undo after, never confirm before. A trainer logs twenty sets a session
 * and twenty confirmations is a different app.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { logSet, updateSet } from '../../../db/log';
import {
  Button,
  Callout,
  Control,
  FieldLabel,
  IconShield,
  Rpe,
  Sheet,
  Stepper,
  colors,
  space,
} from '../../../design';
import { usePrefs } from '../../../settings/usePrefs';

export interface SetSpec {
  workoutId: string;
  exerciseId: string;
  exerciseName: string;
  logType: 'weight_reps' | 'reps';
  setNumber: number;
  /** Null when the row has not been ticked yet — saving from here logs it. */
  setId: string | null;
  load: string;
  reps: string;
  rpe: number | null;
  note: string | null;
  /** Opened by tapping the note under the row rather than long-pressing the row. */
  focusNote?: boolean;
  onDelete?: () => void;
}

export default function SetSheet({
  spec,
  onClose,
  onSaved,
}: {
  spec: SetSpec | null;
  onClose: () => void;
  onSaved?: (setNumber: number) => void;
}) {
  const { prefs } = usePrefs();

  const [load, setLoad] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seeded whenever a different set opens the sheet. Keyed on the set number
  // as well as the id, because an un-ticked row has no id and two of them in the
  // same exercise would otherwise share their state.
  useEffect(() => {
    if (!spec) return;
    setLoad(spec.load);
    setReps(spec.reps);
    setRpe(spec.rpe);
    setNote(spec.note ?? '');
  }, [spec?.setId, spec?.setNumber, spec?.exerciseId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!spec) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const save = async () => {
    setSaving(true);
    try {
      const loadValue = Number.parseFloat(load);
      const repsValue = Number.parseInt(reps, 10);
      const values = {
        loadKg: spec.logType === 'reps' || !Number.isFinite(loadValue) ? null : loadValue,
        reps: Number.isFinite(repsValue) ? repsValue : null,
        rpe,
        notes: note.trim() || null,
      };

      if (spec.setId) await updateSet(spec.setId, values);
      else await logSet(spec.workoutId, spec.exerciseId, spec.setNumber, values);

      onSaved?.(spec.setNumber);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} title={`Set ${spec.setNumber} · ${spec.exerciseName}`}>
      <Text style={styles.meta}>
        Change it now or change it in November. The record is worked out when it is read.
      </Text>

      {spec.logType === 'weight_reps' ? (
        <View style={styles.field}>
          <FieldLabel>Load</FieldLabel>
          <Stepper
            value={load}
            onChange={setLoad}
            step={prefs.plateStepKg}
            unit="kg"
            decimal
            label="Load in kilograms"
          />
          <Text style={styles.hint}>{plateLine(load, prefs.plateStepKg)}</Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <FieldLabel>Reps</FieldLabel>
        <Stepper value={reps} onChange={setReps} step={1} label="Reps" />
      </View>

      <View style={styles.field}>
        <View style={styles.rpeHead}>
          <FieldLabel>RPE</FieldLabel>
          <Text style={styles.optional}>Optional</Text>
        </View>
        <Rpe value={rpe} onChange={setRpe} />
      </View>

      <View style={styles.field}>
        <FieldLabel>What happened</FieldLabel>
        <Control
          size="area"
          multiline
          value={note}
          onChangeText={setNote}
          placeholder="Right shoulder tight — dropped 2.5 kg"
          maxLength={240}
          autoFocus={spec.focusNote}
          accessibilityLabel="Note on this set"
        />
        <Text style={styles.hint}>
          Two lines under the set, then it trails off. {note.trim().length} of 240.
        </Text>
      </View>

      <Callout icon={IconShield} style={styles.callout}>
        A set note is coaching, not a message. It stays in their log, where you will read it next
        week with the same set under your thumb — WhatsApp is for talking to them.
      </Callout>

      <Button
        label={`Save set ${spec.setNumber}`}
        variant="primary"
        size="lg"
        block
        loading={saving}
        onPress={() => void save()}
        style={styles.save}
      />

      {spec.onDelete ? (
        <Button
          label="Delete this set"
          variant="text"
          block
          onPress={() => {
            spec.onDelete?.();
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * "20 kg bar · 15 a side."
 *
 * Strong ships a plate calculator screen. This is the same maths as one line of
 * text, which is all a trainer standing at the rack needs — they already know
 * the plates, and the number is the only thing worth recording. Nothing here is
 * a control.
 */
const BAR_KG = 20;

function plateLine(load: string, step: number): string {
  const total = Number.parseFloat(load);
  if (!Number.isFinite(total) || total <= 0) return 'Whatever was on the bar.';
  if (total < BAR_KG) return 'Under bar weight — dumbbells or a machine, then.';
  const perSide = (total - BAR_KG) / 2;
  if (perSide === 0) return `${BAR_KG} kg bar · empty`;
  // Only claimed when it divides by the gym's smallest plate. A number that
  // cannot be loaded is worse than no number.
  const clean = Math.abs(perSide / step - Math.round(perSide / step)) < 1e-9;
  return clean
    ? `${BAR_KG} kg bar · ${trim(perSide)} a side`
    : `${BAR_KG} kg bar · ${trim(perSide)} a side, if you have the plates`;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '');
}

const styles = StyleSheet.create({
  meta: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginBottom: space.s4 },
  field: { marginBottom: space.s4 },
  rpeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optional: { fontSize: 12, color: colors.ink3, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.ink3, marginTop: 6 },
  callout: { marginBottom: space.s4 },
  save: { marginBottom: space.s2 },
});
