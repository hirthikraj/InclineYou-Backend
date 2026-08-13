/**
 * Naming a new program.
 *
 * § 02 draws the shelf (3a) and the program itself (3b) but never a build form,
 * and that is the right omission: **a program is a template**, and the thing
 * that makes one is adding exercises to days — which happens inside 3b. So all
 * this asks for is the two facts 3a's card needs before it can draw the new
 * program at all: what it is called, and how long it runs.
 *
 * Weeks is optional and says so. A trainer who has not decided yet should not be
 * blocked by a field, and "8 weeks" invented on their behalf would be a number
 * on the card that nobody chose.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import {
  Button,
  Callout,
  CalloutStrong,
  Chip,
  Control,
  FieldLabel,
  FieldMsg,
  Seg,
  Sheet,
  colors,
  space,
} from '../../../design';

/** The lengths a trainer actually writes. Anything else is typed at a desk. */
const WEEKS = [4, 6, 8, 12];

export default function NewProgramSheet({
  visible,
  onCreate,
  onClose,
}: {
  visible: boolean;
  onCreate: (name: string, weeks: number | null) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setWeeks(null);
    setSaving(false);
  }, [visible]);

  const ready = name.trim().length > 0 && !saving;

  return (
    <Sheet visible={visible} onClose={onClose} title="New program">
      <FieldLabel>What do you call it?</FieldLabel>
      <Control
        value={name}
        onChangeText={setName}
        placeholder="Push / Pull / Legs"
        autoCapitalize="words"
        autoFocus
        accessibilityLabel="Program name"
      />
      <FieldMsg>The name your clients will see on their plan.</FieldMsg>

      <Text style={styles.group}>How long does it run?</Text>
      <Seg>
        {WEEKS.map((n) => (
          <Chip
            key={n}
            label={`${n} weeks`}
            selected={weeks === n}
            onPress={() => setWeeks(weeks === n ? null : n)}
          />
        ))}
      </Seg>
      <Text style={styles.hint}>
        {weeks === null ? 'Optional — leave it if you haven’t decided.' : `${weeks} weeks of the same shape.`}
      </Text>

      <Callout style={styles.note}>
        <CalloutStrong>A program is a template.</CalloutStrong> Assigning it copies it onto a
        client, so editing this later never changes a plan somebody is halfway through.
      </Callout>

      <Button
        label="Create it"
        size="lg"
        block
        disabled={!ready}
        onPress={() => {
          setSaving(true);
          onCreate(name.trim(), weeks);
        }}
        style={styles.go}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: space.s5,
    marginBottom: space.s2,
  },
  hint: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: space.s2 },
  note: { marginTop: space.s4 },
  go: { marginTop: space.s4 },
});
