/**
 * Screen 17 · § 3b — swap, don't skip.
 *
 * The rack was busy. That is a Tuesday, not an exception, and an app that scores
 * it as non-adherence is wrong about the gym it is being used in.
 *
 * ── A swap has a scope, and that is the whole point ───────────────────────
 *
 * Today, this client's program, or the template. Three different decisions, and
 * every competitor collapses them into one. Each option states its own blast
 * radius on its own row, before the tap — including the one that reaches four
 * other people, because a change that size should never be discovered
 * afterwards.
 *
 * ── What the plan learns ──────────────────────────────────────────────────
 *
 * Nothing, silently. Three identical swaps and XRep asks once whether the
 * program should change. Asking is the design: an app that quietly rewrites a
 * trainer's programming has taken their job.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { swapExercise, type SwapScope } from '../../../db/log';
import { buildPicker, type LogExerciseView, type LogInput } from '../../../log/log';
import {
  Button,
  IconSwap,
  List,
  Radio,
  Row,
  Search,
  Sheet,
  Tag,
  Timeline,
  TimelineItem,
  colors,
  space,
} from '../../../design';

export default function SwapSheet({
  swap,
  input,
  clientId,
  clientName,
  already,
  clientCount,
  onClose,
  onDone,
  onRefused,
}: {
  /** The card being replaced, and what with when the picker chose first. */
  swap: { target: LogExerciseView; to: string | null } | null;
  input: LogInput;
  clientId: string;
  clientName: string;
  /**
   * Everything already in today's log.
   *
   * Excluded for the same reason the add sheet excludes it: one exercise, one
   * card. Offering the deadlift as a replacement when the deadlift is already
   * open two rows up would create a second card the unique index refuses on
   * push — a swap that appears to work and then quietly does not.
   */
  already: Set<string>;
  /** How many clients are on the same template. The third option's blast radius. */
  clientCount: number;
  onClose: () => void;
  onDone: (name: string) => void;
  /** A swap the writes refused — sets already logged against it. */
  onRefused: (message: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [scope, setScope] = useState<SwapScope>('today');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const chosen = swap?.to ?? picked;

  const picker = useMemo(
    () =>
      swap
        ? buildPicker(
            input,
            clientId,
            clientName,
            query,
            // Recents until somebody types. The rack was busy, and what they
            // have already done on the machine that is free is the answer
            // nine times out of ten.
            query.trim() ? 'all' : 'recent',
            already,
          )
        : null,
    [input, clientId, clientName, query, swap, already],
  );

  if (!swap) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const chosenName = input.exercises.find((e) => e.id === chosen)?.name ?? null;

  const commit = async () => {
    if (!chosen) return;
    setSaving(true);
    try {
      await swapExercise({ workoutExerciseId: swap.target.id, toExerciseId: chosen, scope });
      onDone(chosenName ?? 'That exercise');
      setPicked(null);
      setScope('today');
      setQuery('');
    } catch (e) {
      onRefused(e instanceof Error ? e.message : 'That swap could not be made.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * ── Two steps, not one tall sheet ───────────────────────────────────────
   *
   * The design's 3b opens with the replacement already chosen, because in the
   * design you get here from the picker in 3a. Reached from the exercise menu
   * there is no picker yet, and putting one at the top of the same sheet made a
   * sheet taller than the 88% ceiling — at which point the picker, being the
   * only shrinkable child, collapsed to nothing and the sheet asked "what are
   * they doing instead?" with no way to answer.
   *
   * So: choose, then scope. Each step is short, and the second step is exactly
   * the sheet the design drew.
   */
  if (!chosen) {
    return (
      <Sheet visible onClose={onClose} title="Swap, don't skip">
        <Text style={styles.meta}>What are they doing instead of {swap.target.name}?</Text>
        <Search
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          style={styles.search}
        />
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {picker?.rows.length ? (
            <List>
              {picker.rows.map((row) => (
                <Row
                  key={row.id}
                  grouped
                  wrap
                  title={row.name}
                  subtitle={row.meta}
                  onPress={() => setPicked(row.id)}
                />
              ))}
            </List>
          ) : (
            <Text style={styles.none}>
              {query.trim()
                ? 'Nothing matches that.'
                : `Nothing logged with ${clientName.split(' ')[0]} yet — search the library.`}
            </Text>
          )}
        </ScrollView>
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={onClose} title="Swap, don't skip">
      <List style={styles.chosen}>
        <Row
          grouped
          leading={<IconSwap size={20} color={colors.ink3} />}
          title={chosenName ?? 'That exercise'}
          subtitle={`Instead of ${swap.target.name}`}
          onPress={swap.to ? undefined : () => setPicked(null)}
          trailing={
            swap.target.value.bottom === 'planned' ? (
              <Tag label={swap.target.value.top} />
            ) : undefined
          }
        />
      </List>

      <Text style={styles.label}>How far does this go</Text>
      <List style={styles.scopes}>
        <Row
          grouped
          wrap
          leading={<Radio checked={scope === 'today'} />}
          title="Just today"
          subtitle={`The ${swap.target.name.toLowerCase()} is back next week`}
          onPress={() => setScope('today')}
        />
        <Row
          grouped
          wrap
          leading={<Radio checked={scope === 'program'} />}
          title="Rest of this program"
          subtitle="Every remaining day, for this client only"
          onPress={() => setScope('program')}
        />
        <Row
          grouped
          wrap
          leading={<Radio checked={scope === 'template'} />}
          title="In the template too"
          subtitle={
            clientCount > 1
              ? `Everyone on this program · ${clientCount} people`
              : 'The template, and anyone already on it'
          }
          onPress={() => setScope('template')}
        />
      </List>

      <Text style={styles.label}>What the plan learns</Text>
      <Timeline style={styles.timeline}>
        <TimelineItem
          index={1}
          state="now"
          label="Today, as a swap"
          meta={`Counted in their volume. The ${swap.target.name.toLowerCase()} is not marked skipped, and adherence does not move.`}
        />
        <TimelineItem
          index={2}
          state="todo"
          label="Third swap in a row"
          meta="XRep asks once whether the program should change. Never silently."
          last
        />
      </Timeline>

      <Button
        label={scope === 'today' ? 'Swap for today' : scope === 'program' ? 'Swap for the rest of the program' : 'Swap in the template too'}
        variant="primary"
        size="lg"
        block
        disabled={!chosen}
        loading={saving}
        onPress={() => void commit()}
        style={styles.action}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 12.5, lineHeight: 19, color: colors.ink3 },
  search: { marginTop: space.s3 },
  /**
   * A fixed height, not a cap.
   *
   * `maxHeight` collapsed it to nothing: this sheet is tall enough to hit the
   * 88% ceiling, and once the sheet stops growing a shrinkable child with only a
   * maximum takes zero. The picker disappeared and the sheet asked "what are
   * they doing instead?" with nothing to answer it.
   */
  // `flexShrink: 0` as well as a height: React Native's ScrollView sets
  // flexShrink on its own container, so a height alone is not a floor when the
  // sheet runs out of room.
  list: { marginTop: space.s3, height: 320, flexShrink: 0 },
  chosen: { marginTop: space.s3 },
  none: { fontSize: 13, color: colors.ink3, paddingVertical: space.s5, textAlign: 'center' },
  label: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: space.s5,
    marginBottom: space.s2,
  },
  scopes: {},
  timeline: { marginTop: space.s1 },
  action: { marginTop: space.s4 },
});
