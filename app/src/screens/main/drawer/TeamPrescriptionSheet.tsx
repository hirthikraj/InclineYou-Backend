/**
 * Editing one exercise on somebody else's plan.
 *
 * A sibling of `PrescriptionSheet` rather than a flag on it, and the difference
 * is not cosmetic. That one composes a new prescription with sensible defaults;
 * this one arrives **seeded with what the coach already wrote**, because an admin
 * covering a session is adjusting a decision somebody else made and needs to see
 * it before they change it. Defaulting to 3 × 10 here would quietly overwrite a
 * considered 5 × 5.
 *
 * It also says whose plan it is. "Changing Priya's plan for Meera" is the one
 * piece of context that stops an admin editing the wrong client's Tuesday — and
 * it is the sentence that makes the audit row unsurprising when Priya reads it.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Callout,
  Control,
  FieldLabel,
  IconAlert,
  Segmented,
  Sheet,
  colors,
  space,
} from '../../../design';
import type { TeamPrescription, TeamProgramExercise } from '../../../api/team';

export interface TeamPrescriptionSheetProps {
  visible: boolean;
  /** Null while adding; the row being edited otherwise. */
  row: TeamProgramExercise | null;
  /** The exercise's name — the sheet's title, for an add as well as an edit. */
  exerciseName: string;
  coachName: string | null;
  clientName: string;
  busy?: boolean;
  onSave: (prescription: TeamPrescription) => void;
  onClose: () => void;
}

const int = (text: string): number | null => {
  const parsed = Number.parseInt(text.replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export default function TeamPrescriptionSheet({
  visible,
  row,
  exerciseName,
  coachName,
  clientName,
  busy = false,
  onSave,
  onClose,
}: TeamPrescriptionSheetProps) {
  const [mode, setMode] = useState<'reps' | 'time'>('reps');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [seconds, setSeconds] = useState('30');
  const [rest, setRest] = useState('60');
  const [load, setLoad] = useState('');
  const [notes, setNotes] = useState('');

  // Seeded from the row on every open, so one exercise's numbers never leak onto
  // the next and an edit always starts from what is actually prescribed.
  useEffect(() => {
    if (!visible) return;
    const timed = row?.durationSeconds != null;
    setMode(timed ? 'time' : 'reps');
    setSets(row?.sets != null ? String(row.sets) : '3');
    setReps(row?.reps != null ? String(row.reps) : '10');
    setSeconds(row?.durationSeconds != null ? String(row.durationSeconds) : '30');
    setRest(row?.restSeconds != null ? String(row.restSeconds) : '60');
    setLoad(row?.targetLoad != null ? String(row.targetLoad) : '');
    setNotes(row?.notes ?? '');
  }, [visible, row]);

  const timed = mode === 'time';

  const save = () => {
    const parsedLoad = Number.parseFloat(load.replace(/[^0-9.]/g, ''));
    onSave({
      sets: int(sets),
      // Exactly one of these is sent, and the other is left alone rather than
      // nulled: a timed hold that briefly looked like reps would be a lie about
      // what the coach prescribed, and the server COALESCEs, so sending null
      // means "unchanged" here.
      reps: timed ? null : int(reps),
      durationSeconds: timed ? int(seconds) : null,
      restSeconds: int(rest),
      targetLoad: Number.isFinite(parsedLoad) && parsedLoad > 0 ? parsedLoad : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={exerciseName}>
      <Text style={styles.meta}>
        {coachName
          ? `${coachName.split(' ')[0]}’s plan for ${clientName.split(' ')[0]}`
          : `${clientName.split(' ')[0]}’s plan`}
      </Text>

      <Segmented<'reps' | 'time'>
        options={[
          { key: 'reps', label: 'Reps' },
          { key: 'time', label: 'Hold' },
        ]}
        value={mode}
        onChange={setMode}
        style={styles.mode}
      />

      <View style={styles.pair}>
        <View style={styles.half}>
          <FieldLabel>Sets</FieldLabel>
          <Control value={sets} onChangeText={setSets} keyboardType="number-pad" maxLength={2} />
        </View>
        <View style={styles.half}>
          <FieldLabel>{timed ? 'Seconds' : 'Reps'}</FieldLabel>
          <Control
            value={timed ? seconds : reps}
            onChangeText={timed ? setSeconds : setReps}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
      </View>

      <View style={styles.pair}>
        <View style={styles.half}>
          <FieldLabel>Rest</FieldLabel>
          <Control
            value={rest}
            onChangeText={setRest}
            keyboardType="number-pad"
            maxLength={3}
            affix="s"
          />
        </View>
        <View style={styles.half}>
          <FieldLabel>Target load</FieldLabel>
          <Control
            value={load}
            onChangeText={setLoad}
            keyboardType="decimal-pad"
            maxLength={6}
            affix="kg"
          />
        </View>
      </View>

      <FieldLabel>Note</FieldLabel>
      <Control
        value={notes}
        onChangeText={setNotes}
        placeholder="Shoulder — go easy"
        maxLength={200}
        style={styles.notes}
      />

      {/* Not a warning about danger — a statement of fact. The coach will see
          this change and who made it, and knowing that in advance is what keeps
          an admin from treating somebody else's plan as scratch paper. */}
      <Callout icon={IconAlert} style={styles.rule}>
        {coachName ? coachName.split(' ')[0] : 'The coach'} will see this change and that you made
        it.
      </Callout>

      <Button
        label={row ? 'Save the change' : 'Add to the plan'}
        variant="primary"
        size="lg"
        block
        loading={busy}
        onPress={save}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s3 },
  mode: { marginBottom: space.s4 },
  pair: { flexDirection: 'row', gap: space.s3, marginBottom: space.s3 },
  half: { flex: 1 },
  notes: { marginBottom: space.s4 },
  rule: { marginBottom: space.s4 },
});
