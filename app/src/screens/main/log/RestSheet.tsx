/**
 * The exercise menu — §07's dots on the open card, plus the rest setting.
 *
 * ── Rest is per exercise, and that is not a detail ────────────────────────
 *
 * §09 makes it a rule: 90 seconds after a bench set and 20 after a curl is one
 * trainer, not two preferences. Strong got this right and it is the reason its
 * autostart is usable; every app that made rest a single global number made it
 * a number people turn off.
 *
 * "Stick it to the plan" is the long press §07 describes, given a switch here
 * instead. A long press that silently changes next Monday is a gesture with a
 * consequence nobody can see; a switch says which of the two things is
 * happening before it happens.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { setExerciseRest } from '../../../db/log';
import type { LogExerciseView } from '../../../log/log';
import {
  Button,
  Check,
  IconBan,
  IconEye,
  IconSwap,
  List,
  Row,
  Sheet,
  Stepper,
  colors,
  space,
} from '../../../design';

export default function RestSheet({
  exercise,
  onClose,
  onSwap,
  onRemove,
  onOpenExercise,
}: {
  exercise: LogExerciseView | null;
  onClose: () => void;
  onSwap: (exercise: LogExerciseView) => void;
  onRemove: (exercise: LogExerciseView) => void;
  onOpenExercise: (exercise: LogExerciseView) => void;
}) {
  const [rest, setRest] = useState('');
  const [stick, setStick] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    setRest(exercise.restSeconds != null ? String(exercise.restSeconds) : '');
    setStick(false);
  }, [exercise?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!exercise) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const saveRest = async () => {
    setSaving(true);
    try {
      const seconds = Number.parseInt(rest, 10);
      await setExerciseRest(exercise.id, Number.isFinite(seconds) && seconds > 0 ? seconds : null, stick);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} title={exercise.name}>
      <List>
        <Row
          grouped
          wrap
          leading={<IconSwap size={18} color={exercise.started ? colors.inkOff : colors.ink3} />}
          title="Swap it for something else"
          subtitle={
            exercise.started
              ? 'Sets are already logged against this one — add the new exercise instead'
              : 'The rack was busy. That is data, not a failure.'
          }
          // Offered only while it can still be honoured. A swap after the fact
          // would take the card away and leave the sets behind it.
          onPress={exercise.started ? undefined : () => onSwap(exercise)}
        />
        <Row
          grouped
          wrap
          leading={<IconEye size={18} color={colors.ink3} />}
          title="Open the exercise"
          subtitle="Their records, their history, and how to do it"
          onPress={() => onOpenExercise(exercise)}
        />
        <Row
          grouped
          wrap
          leading={<IconBan size={18} color={colors.ink3} />}
          title="Remove from today"
          subtitle={
            exercise.started
              ? 'The sets already logged come back with it if you undo'
              : 'Nothing has been logged against it'
          }
          onPress={() => onRemove(exercise)}
        />
      </List>

      <Text style={styles.label}>Rest after each set</Text>
      <Stepper
        value={rest}
        onChange={setRest}
        step={15}
        unit="s"
        max={600}
        label="Rest in seconds"
      />
      <Text style={styles.hint}>
        Zero, or empty, means no timer for this one. It starts on its own when a set is ticked.
      </Text>

      <Pressable
        onPress={() => setStick((s) => !s)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: stick }}
        style={styles.stick}
      >
        <Check checked={stick} />
        <Text style={styles.stickLabel}>
          Keep it for next time too — writes {rest ? `${rest}s` : 'no rest'} onto this exercise in
          their program.
        </Text>
      </Pressable>

      <Button
        label="Save rest"
        variant="primary"
        size="lg"
        block
        loading={saving}
        onPress={() => void saveRest()}
        style={styles.action}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: space.s5,
    marginBottom: space.s2,
  },
  hint: { fontSize: 12, lineHeight: 18, color: colors.ink3, marginTop: 6 },
  stick: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3, marginTop: space.s4 },
  stickLabel: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.ink2 },
  action: { marginTop: space.s5 },
});
