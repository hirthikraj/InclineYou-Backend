/**
 * Naming a new program, and laying out its week.
 *
 * § 02 draws the shelf (3a) and the program itself (3b) but never a build form,
 * and that is the right omission: **a program is a template**, and the thing
 * that makes one is putting exercises on days — which happens inside 3b. What
 * this sheet collects is everything that has to be true *before* an exercise can
 * be put anywhere: what it is called, how long it runs, and which days it runs
 * on.
 *
 * ── Why the days are asked for here ───────────────────────────────────────
 *
 * They used to be inferred, and that was the bug. A day existed only because an
 * exercise was sitting on it, so the first exercise went onto Monday, Monday
 * became the only day the program had, and there was nowhere to put Tuesday's
 * first exercise. Asking up front turns the empty days into real ones: 3b draws
 * four headers on a four-day program from the moment it is created, each with
 * its own **Add an exercise** under it.
 *
 * The count is asked first and the weekdays follow from it, because "four days a
 * week" is the sentence a trainer says and "Mon, Tue, Thu, Fri" is the detail
 * they adjust. The spread offered for each count is the ordinary one — rest days
 * between hard days — and every one of them is a chip they can move.
 *
 * Weeks stays optional and says so. A trainer who has not decided should not be
 * blocked by a field, and "8 weeks" invented on their behalf would be a number
 * on the card that nobody chose.
 */

import React, { useEffect, useMemo, useState } from 'react';
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

/** The counts a week can hold. Seven is a chip because some clients do train daily. */
const DAY_COUNTS = [2, 3, 4, 5, 6];

const WEEKDAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 7, label: 'Sun' },
];

/**
 * Where a given number of days usually falls.
 *
 * Rest between hard days, weekends kept for the counts that can afford them.
 * These are starting points and every one of them is a chip the trainer can
 * move — the sheet offers a spread rather than making them place five chips
 * from scratch to say a thing they say every day.
 */
const SPREAD: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  const [days, setDays] = useState<number[]>(SPREAD[3]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setWeeks(null);
    setDays(SPREAD[3]);
    setSaving(false);
  }, [visible]);

  /**
   * The count chip sets the spread; the weekday chips then move it.
   *
   * Tapping "4" after hand-picking Mon/Wed/Sat replaces the days, which is what
   * tapping a count means — it is the coarse control, and the fine one is right
   * underneath it.
   */
  const setCount = (count: number) => setDays(SPREAD[count] ?? SPREAD[3]);

  const toggleDay = (day: number) =>
    setDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );

  const spread = useMemo(
    () => days.map((d) => SHORT[d - 1]).filter(Boolean).join(', '),
    [days],
  );

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

      <Text style={styles.group}>How many days a week?</Text>
      <Seg>
        {DAY_COUNTS.map((n) => (
          <Chip
            key={n}
            label={`${n} days`}
            selected={days.length === n}
            onPress={() => setCount(n)}
          />
        ))}
      </Seg>

      <Seg style={styles.weekdays}>
        {WEEKDAYS.map(({ day, label }) => (
          <Chip
            key={day}
            label={label}
            selected={days.includes(day)}
            onPress={() => toggleDay(day)}
          />
        ))}
      </Seg>
      <Text style={styles.hint}>
        {days.length === 0
          ? 'Pick at least one day — the program needs somewhere to put its first exercise.'
          : `${days.length} day${days.length === 1 ? '' : 's'} a week · ${spread}. Each one gets its own section to fill in.`}
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
        client, so editing this later never changes a plan somebody is halfway through.
      </Callout>

      <Button
        label="Create it"
        size="lg"
        block
        disabled={!ready}
        onPress={() => {
          setSaving(true);
          onCreate(name.trim(), weeks, days);
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
  weekdays: { marginTop: space.s2 },
  hint: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: space.s2 },
  note: { marginTop: space.s4 },
  go: { marginTop: space.s4 },
});
