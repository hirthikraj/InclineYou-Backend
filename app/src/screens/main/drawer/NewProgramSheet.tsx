/**
 * Naming a new program, and laying out its week.
 *
 * § 02 draws the shelf (3a) and the program itself (3b) but never a build form,
 * and that is the right omission: **a program is a template**, and the thing
 * that makes one is putting exercises on days — which happens inside 3b. What
 * this sheet collects is everything that has to be true *before* an exercise can
 * be put anywhere: what it is called, how long it runs, and how many days a week
 * it trains.
 *
 * ── Why a count, and not weekdays ─────────────────────────────────────────
 *
 * A template's days are slots — Day 1, Day 2, Day 3 — because the same
 * three-day plan serves the client who trains Mon/Wed/Fri and the one who
 * trains Tue/Thu/Sat. Which weekday each slot lands on (and at what time) is
 * the client's preference, and it is asked where it belongs: on the assign
 * screen, per client. Asking for weekdays here would pin the template to one
 * client's week, which is the exact trap this layout exists to avoid.
 *
 * The days used to be inferred from the exercises, and that was a bug of its
 * own: a day existed only because an exercise was sitting on it, so the first
 * exercise went onto Day 1 and there was nowhere to put Day 2's first one.
 * Asking the count up front turns the empty days into real ones: 3b draws four
 * headers on a four-day program from the moment it is created, each with its
 * own **Add an exercise** under it.
 *
 * Weeks stays optional and says so. A trainer who has not decided should not be
 * blocked by a field, and "8 weeks" invented on their behalf would be a number
 * on the card that nobody chose.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

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
const WEEKS = [2, 4, 6, 8, 12];

/** The counts a week can hold. Seven is a chip because some clients do train daily. */
const DAY_COUNTS = [1, 2, 3, 4, 5, 6, 7];

export default function NewProgramSheet({
  visible,
  onCreate,
  onClose,
}: {
  visible: boolean;
  onCreate: (name: string, weeks: number | null, days: number[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState<number | null>(null);
  const [count, setCount] = useState(3);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setWeeks(null);
    setCount(3);
    setSaving(false);
  }, [visible]);

  const ready = name.trim().length > 0 && !saving;

  return (
    <Sheet visible={visible} onClose={onClose} title="New program">
      {/* The form scrolls; the Create button does not. With the keyboard up
          from the name field, the sheet is short enough that the button was
          being clipped off the bottom with no way to reach it. */}
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
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

        <Text style={styles.group}>How many days a week?</Text>
        <Seg>
          {DAY_COUNTS.map((n) => (
            <Chip key={n} label={String(n)} selected={count === n} onPress={() => setCount(n)} />
          ))}
        </Seg>
        <Text style={styles.hint}>
          {`Day 1 to Day ${count}, each with its own section to fill in. Which weekdays they land on is chosen per client when you assign it.`}
        </Text>

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
          {weeks === null
            ? 'Optional — leave it if you haven’t decided.'
            : `${weeks} weeks. Week 1 is the one you build; the rest repeat it until you copy it forward and change something.`}
        </Text>

        <Callout style={styles.note}>
          <CalloutStrong>A program is a template.</CalloutStrong> Assigning it copies it onto a
          client — and that is when its days get their weekdays and times, to suit that client’s
          week.
        </Callout>
      </ScrollView>

      <Button
        label="Create it"
        size="lg"
        block
        disabled={!ready}
        onPress={() => {
          setSaving(true);
          onCreate(
            name.trim(),
            weeks,
            Array.from({ length: count }, (_, i) => i + 1),
          );
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
  // `flexShrink` is what lets the form shrink into the sheet's height cap.
  // Without it the ScrollView takes its full content height and pushes the
  // Create button off the bottom of the screen.
  scroll: { flexShrink: 1 },
  hint: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: space.s2 },
  note: { marginTop: space.s4 },
  go: { marginTop: space.s4 },
});
