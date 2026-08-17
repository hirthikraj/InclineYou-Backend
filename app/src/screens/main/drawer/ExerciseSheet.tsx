/**
 * 3e · Your own exercise.
 *
 * Name, muscles, equipment, and how it's logged.
 *
 * **How it's logged cannot be changed later.** Hevy has the identical rule — "once
 * a custom exercise has been saved… you cannot edit the type" — for the identical
 * reason: every set already recorded against it would stop making sense. A
 * bodyweight exercise logged as reps that later becomes weight × reps leaves
 * forty rows with a null weight and no way to tell whether that means zero or
 * unknown.
 *
 * The callout says so *before* the save, not after. A constraint discovered by
 * hitting it is a bug report; a constraint stated with its reason is a design
 * somebody trusts. It is also the only field on this sheet that is permanent, so
 * it is the only one that gets a callout.
 *
 * Enforcement is not here. `db/training.ts` has no function that can write
 * `logType` on an existing row, and the server refuses to update the column. This
 * sheet is where the trainer is *told*.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { createExercise, type LogType } from '../../../db/training';
import { useAuth } from '../../../store/AuthContext';
import {
  Button,
  Callout,
  CalloutStrong,
  ChoiceCard,
  ChoiceGrid,
  Chip,
  Control,
  IconLock,
  Seg,
  Sheet,
  colors,
  space,
  type,
} from '../../../design';

/**
 * The muscle and equipment lists the sheet offers.
 *
 * Short and fixed rather than pulled from the 1,324-row library. The library's
 * vocabulary is consistent now — one lower-case target muscle per row — but it is
 * also the wrong vocabulary for this sheet: nineteen muscles and twenty-eight
 * kinds of equipment, in the anatomist's words ("pectorals", "levator scapulae",
 * "leverage machine"). A chip row of forty-seven options is not a control, and a
 * trainer naming their own movement thinks "chest", not "pectorals".
 *
 * A trainer whose exercise works something not listed gets it from the name,
 * which is what they will search on anyway.
 */
const MUSCLES = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
];

const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Band', 'Kettlebell'];

export interface ExerciseSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}

export default function ExerciseSheet({ visible, onClose, onCreated }: ExerciseSheetProps) {
  const { trainerId } = useAuth();

  const [name, setName] = useState('');
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [logType, setLogType] = useState<LogType>('weight_reps');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setMuscles([]);
    setEquipment(null);
    setLogType('weight_reps');
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = async () => {
    if (!trainerId) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await createExercise({ trainerId, name: trimmed, muscles, equipment, logType });
      reset();
      onCreated(trimmed);
    } catch {
      setError('Could not save that. It stays here until it works.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={close} title="Your own exercise">
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Control
          value={name}
          onChangeText={setName}
          placeholder="Landmine press · half kneel"
          autoCapitalize="sentences"
          style={styles.control}
        />

        <Text style={styles.label}>What it works</Text>
        <Seg style={styles.seg}>
          {MUSCLES.map((muscle) => (
            <Chip
              key={muscle}
              label={muscle}
              selected={muscles.includes(muscle)}
              onPress={() =>
                setMuscles((list) =>
                  list.includes(muscle) ? list.filter((m) => m !== muscle) : [...list, muscle],
                )
              }
            />
          ))}
        </Seg>

        <Text style={styles.label}>Equipment</Text>
        <Seg style={styles.seg}>
          {EQUIPMENT.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={equipment === item}
              // One only, and tapping the chosen one clears it — equipment is
              // genuinely optional and there has to be a way back to none.
              onPress={() => setEquipment((current) => (current === item ? null : item))}
            />
          ))}
        </Seg>

        <Text style={styles.label}>How it&apos;s logged</Text>
        <ChoiceGrid>
          <ChoiceCard
            title="Weight × reps"
            subtitle="The usual"
            selected={logType === 'weight_reps'}
            onPress={() => setLogType('weight_reps')}
          />
          <ChoiceCard
            title="Reps only"
            subtitle="Bodyweight"
            selected={logType === 'reps'}
            onPress={() => setLogType('reps')}
          />
        </ChoiceGrid>

        <Callout icon={IconLock} style={styles.note}>
          <CalloutStrong>You can&apos;t change this later.</CalloutStrong> Hevy has the same rule, for
          the same reason — every set already logged against it would stop making sense.
        </Callout>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={saving ? 'Saving…' : 'Save · yours to reuse'}
          variant="primary"
          size="lg"
          block
          loading={saving}
          disabled={!name.trim() || saving}
          onPress={() => void save()}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 460 },
  control: { marginBottom: space.s4 },
  label: { ...type.micro, color: colors.ink3, marginTop: space.s4, marginBottom: space.s2 },
  seg: {},
  note: { marginTop: space.s4 },
  error: { ...type.bodySm, color: colors.danger, marginTop: space.s3 },
  footer: { marginTop: space.s4 },
});
