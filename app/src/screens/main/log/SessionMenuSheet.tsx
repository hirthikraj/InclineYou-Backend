/**
 * The session menu — §07's dots in the app bar.
 *
 * Four entries, and one list that only appears when there is something in it:
 * exercises swiped out of today. The toast that offered Undo is long gone by
 * then, and a decision made forty minutes ago should still be reversible from
 * somewhere obvious rather than only from the two seconds after it.
 *
 * Reordering is not here. §07 puts it on a long press and a drag of the card
 * itself, which is where a trainer will reach for it; a "Reorder" mode reached
 * through a menu is a second way to do the same thing, and the drag is better.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { LogView } from '../../../log/log';
import {
  Button,
  Danger,
  IconBadge,
  IconPlus,
  IconRepeat,
  List,
  Row,
  Sheet,
  colors,
  space,
} from '../../../design';

export default function SessionMenuSheet({
  visible,
  view,
  onClose,
  onAdd,
  onBests,
  onDiscard,
  onRestore,
}: {
  visible: boolean;
  view: LogView;
  onClose: () => void;
  onAdd: () => void;
  onBests: () => void;
  onDiscard: () => void;
  onRestore: (workoutExerciseId: string) => void;
}) {
  const checked = view.bests.length;
  const announced = view.records.filter((r) => r.announced).length;

  return (
    <Sheet visible={visible} onClose={onClose} title="This session">
      <List>
        <Row
          grouped
          wrap
          leading={<IconPlus size={18} color={colors.ink3} />}
          title="Add an exercise"
          subtitle="Into today's log only"
          onPress={onAdd}
        />
        <Row
          grouped
          wrap
          leading={<IconBadge size={18} color={colors.ink3} />}
          title="Today's bests"
          subtitle={
            checked
              ? `${checked} checked · ${announced} worth announcing`
              : 'Nothing to check yet'
          }
          onPress={onBests}
        />
      </List>

      {view.removed.length ? (
        <>
          <Text style={styles.label}>Taken out of today</Text>
          <List>
            {view.removed.map((exercise) => (
              <Row
                key={exercise.id}
                grouped
                wrap
                leading={<IconRepeat size={18} color={colors.ink3} />}
                title={exercise.name}
                subtitle={
                  exercise.started
                    ? `${exercise.summary} — the sets are still there`
                    : 'Nothing was logged against it'
                }
                onPress={() => onRestore(exercise.id)}
              />
            ))}
          </List>
        </>
      ) : null}

      <Danger title="Discard this session" style={styles.danger}>
        Every set logged this morning goes with it. The appointment stays in the diary — whether it
        counted is a separate question.
      </Danger>
      <Button
        label="Discard this session"
        variant="danger"
        block
        onPress={onDiscard}
        style={styles.discard}
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
  danger: { marginTop: space.s5 },
  discard: { marginTop: space.s3 },
});
