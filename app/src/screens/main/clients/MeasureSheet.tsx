/**
 * 8b · New reading.
 *
 * Both fields are optional and either alone is a valid reading, because a
 * trainer with a tape measure in one hand does not always have a scale.
 *
 * **The last value sits in the message slot** so a typo like 8.42 or 842 is
 * obvious before it is saved — which is the cheapest possible defence for a list
 * that cannot be edited afterwards.
 *
 * Stamped now, and it says so: back-dating a reading would make the history a
 * thing somebody arranged rather than a thing that happened. The primary button
 * repeats the number it is about to commit.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { logBodyMetric } from '../../../db/clients';
import {
  Button,
  Callout,
  CalloutStrong,
  Control,
  FieldLabel,
  FieldMsg,
  Sheet,
  colors,
  space,
} from '../../../design';

export interface LastReading {
  value: number;
  unit: string;
  when: string;
}

export default function MeasureSheet({
  visible,
  clientId,
  lastWeight,
  lastWaist,
  onClose,
}: {
  visible: boolean;
  clientId: string;
  lastWeight: LastReading | null;
  lastWaist: LastReading | null;
  onClose: () => void;
}) {
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [saving, setSaving] = useState(false);
  const [stamp, setStamp] = useState(() => Date.now());

  useEffect(() => {
    if (!visible) return;
    setWeight('');
    setWaist('');
    setSaving(false);
    // Stamped when the sheet opens, not when it saves: the trainer read the
    // scale now, and a slow tap should not move the reading's time.
    setStamp(Date.now());
  }, [visible]);

  const w = Number(weight);
  const c = Number(waist);
  const hasWeight = weight.trim() !== '' && Number.isFinite(w) && w > 0;
  const hasWaist = waist.trim() !== '' && Number.isFinite(c) && c > 0;
  const ready = (hasWeight || hasWaist) && !saving;

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      if (hasWeight) await logBodyMetric(clientId, 'weight', w, 'kg', stamp);
      if (hasWaist) await logBodyMetric(clientId, 'waist', c, 'cm', stamp);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const label = hasWeight
    ? `Save ${w} kg`
    : hasWaist
      ? `Save ${c} cm`
      : 'Save';

  const when = new Date(stamp);
  const day = when.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Sheet visible={visible} onClose={onClose} title="New reading">
      <Text style={styles.stamp}>
        Stamped {day}, {when.toTimeString().slice(0, 5)} — you can&apos;t back-date it.
      </Text>

      <View style={styles.field}>
        <FieldLabel hint="optional">Weight</FieldLabel>
      </View>
      <Control
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        affix="kg"
        size="lg"
        accessibilityLabel="Weight in kilograms"
      />
      <FieldMsg>
        {lastWeight
          ? `Last reading ${lastWeight.value} kg, ${lastWeight.when}. One decimal is enough.`
          : 'First reading. One decimal is enough.'}
      </FieldMsg>

      <View style={styles.field}>
        <FieldLabel hint="optional">Waist</FieldLabel>
      </View>
      <Control
        value={waist}
        onChangeText={setWaist}
        keyboardType="decimal-pad"
        affix="cm"
        size="lg"
        accessibilityLabel="Waist in centimetres"
      />
      <FieldMsg>
        {lastWaist
          ? `Blank is fine — only the weight is saved. Last was ${lastWaist.value} cm.`
          : 'Blank is fine — only the weight is saved.'}
      </FieldMsg>

      <Callout style={styles.note}>
        <CalloutStrong>Saved readings can&apos;t be edited.</CalloutStrong> Type the wrong number and
        you fix it by adding another one — the first stays in the list, marked as replaced.
      </Callout>

      <Button
        label={label}
        size="lg"
        block
        disabled={!ready}
        onPress={() => void save()}
        style={styles.save}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stamp: { fontSize: 13.5, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  field: { marginTop: space.s3 },
  note: { marginTop: space.s4 },
  save: { marginTop: space.s4 },
});
