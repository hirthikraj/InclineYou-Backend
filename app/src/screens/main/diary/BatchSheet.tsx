/**
 * The batch sheet — who's in, who's missing, capacity, and the whole batch done.
 *
 * `agent/design system/screens/xrepdiary.html` § 05, the tap map: *"Batch row
 * → Batch sheet — who's in, who's missing, capacity, mark the whole batch
 * done"*.
 *
 * "Who's missing" is the half that earns the sheet. A batch of ten with six in
 * it is not a problem a trainer solves by staring at 6/10 — it is solved by
 * seeing the four regulars who aren't booked and tapping one.
 *
 * **Mark the whole batch done is one action and eight pack deductions**, one per
 * attendee, each undoable on its own for 24 hours — because a batch is eight
 * sessions that happen to share a room, and one person leaving early is not a
 * reason the other seven didn't train.
 *
 * Tapping an attendee opens **their** session, not their file: the agenda folded
 * their row into the batch, so this is the only way left to mark one person a
 * no-show or undo what the batch did to them. Folding the row away must not fold
 * the decision away with it.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DiaryBatch } from '../../../diary/diary';
import type { RosterRow } from '../../../clients/roster';
import {
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  IconCheck,
  IconUserAdd,
  List,
  Pack,
  Row,
  SectionHead,
  Sheet,
  Tag,
  colors,
  space,
} from '../../../design';

export default function BatchSheet({
  batch,
  regulars,
  onAdd,
  onDoneAll,
  onOpenAttendee,
  onClose,
}: {
  batch: DiaryBatch | null;
  /** Clients who usually train at this hour and are not in it. */
  regulars: RosterRow[];
  onAdd: () => void;
  onDoneAll: (batch: DiaryBatch) => void;
  /** Opens that attendee's own session — where a no-show or a cancel is marked. */
  onOpenAttendee: (sessionId: string) => void;
  onClose: () => void;
}) {
  const missing = useMemo(
    () => regulars.filter((r) => !batch?.people.some((p) => p.id === r.id)).slice(0, 4),
    [regulars, batch],
  );

  if (!batch) return null;

  const short = batch.shortBy !== null;

  return (
    <Sheet visible onClose={onClose} title={batch.name}>
      <Text style={styles.when}>
        {batch.time} {batch.meridiem} · {batch.booked} of {batch.capacity} places taken
      </Text>

      <View style={styles.cap}>
        <Pack remaining={batch.booked} total={batch.capacity} cap min={batch.minSize} />
        <Text style={[styles.capLine, short && styles.capShort]}>
          {short
            ? `${batch.shortBy} short of the ${batch.minSize} you need to run it`
            : `Room for ${batch.capacity - batch.booked} more`}
        </Text>
      </View>

      <SectionHead label="Who's in" count={batch.people.length} first />
      {batch.people.length ? (
        <List style={styles.group}>
          {batch.people.map((person) => (
            <Row
              key={person.id}
              grouped
              title={person.name}
              leading={<Avatar name={person.name} size="sm" />}
              trailing={
                person.state === 'done' ? (
                  <Tag label="Done" tone="ok" />
                ) : person.state === 'no_show' ? (
                  <Tag label="No-show" tone="danger" />
                ) : (
                  <Tag label="Booked" tone="info" />
                )
              }
              onPress={() => onOpenAttendee(person.sessionId)}
            />
          ))}
        </List>
      ) : (
        <Text style={styles.none}>Nobody is booked in yet.</Text>
      )}

      {missing.length ? (
        <>
          <SectionHead label="Who's missing" count={missing.length} />
          <List style={styles.group}>
            {missing.map((row) => (
              <Row
                key={row.id}
                grouped
                title={row.name}
                subtitle={row.line}
                leading={<Avatar name={row.name} size="sm" />}
                onPress={onAdd}
              />
            ))}
          </List>
          <Text style={styles.hint}>
            They usually train around now and have nothing booked in this slot.
          </Text>
        </>
      ) : null}

      <Button
        label="Add someone"
        icon={IconUserAdd}
        variant="secondary"
        block
        onPress={onAdd}
        style={styles.add}
      />

      {!batch.settled ? (
        <>
          <Button
            label={`Mark all ${batch.booked} done`}
            icon={IconCheck}
            size="lg"
            block
            disabled={batch.booked === 0}
            onPress={() => onDoneAll(batch)}
            style={styles.done}
          />
          <Callout style={styles.note}>
            That is <CalloutStrong>{batch.booked} packs, one each</CalloutStrong>. Anyone who
            didn&apos;t turn up is marked from their own row, and every one of them is undoable for
            24 hours.
          </Callout>
        </>
      ) : (
        <Callout style={styles.note}>
          Every attendee is closed off. Undo any of them from their own row for 24 hours.
        </Callout>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  when: { fontSize: 13.5, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },

  cap: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginBottom: space.s4 },
  capLine: { flex: 1, fontSize: 13, color: colors.ink2 },
  capShort: { color: colors.warn, fontWeight: '600' },

  group: { marginBottom: space.s2 },
  none: { fontSize: 13, color: colors.ink3, paddingVertical: space.s3 },
  hint: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: 2 },

  add: { marginTop: space.s4 },
  done: { marginTop: space.s3 },
  note: { marginTop: space.s3 },
});
