/**
 * "They didn't train."
 *
 * Three outcomes and exactly one difference between them: a **no-show costs a
 * session** and both kinds of cancellation do not. That single fact is what the
 * trainer is actually deciding, so it is written inside each option rather than
 * in a confirmation afterwards — the same shape the diary's sheet uses, because
 * a decision about somebody's money should read identically wherever it is made.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { CancelledBy } from '../../../db/diary';
import { List, Row, Sheet, Tag, colors, space } from '../../../design';

export default function NotTrainedSheet({
  visible,
  clientName,
  scheduledId,
  onClose,
  onDone,
}: {
  visible: boolean;
  clientName: string;
  /** Null when the log was opened without a booking — there is nothing to close. */
  scheduledId: string | null;
  onClose: () => void;
  onDone: (outcome: 'no_show' | 'cancelled', by?: CancelledBy) => void;
}) {
  const first = clientName.split(' ')[0];

  return (
    <Sheet visible={visible} onClose={onClose} title={`${first} didn't train`}>
      {scheduledId ? (
        <>
          <Text style={styles.meta}>
            Whatever is already logged stays logged. This is about the appointment and the pack.
          </Text>
          <List style={styles.list}>
            <Row
              grouped
              wrap
              title="No-show"
              subtitle="They didn't turn up and didn't say. The hour was held for them."
              onPress={() => onDone('no_show')}
              trailing={<Tag label="Costs a session" tone="warn" />}
            />
            <Row
              grouped
              wrap
              title={`${first} cancelled`}
              subtitle="They called it off in time."
              onPress={() => onDone('cancelled', 'client')}
              trailing={<Tag label="Costs nothing" />}
            />
            <Row
              grouped
              wrap
              title="You cancelled"
              subtitle="Your call, so it is not theirs to pay for."
              onPress={() => onDone('cancelled', 'trainer')}
              trailing={<Tag label="Costs nothing" />}
            />
          </List>
        </>
      ) : (
        <Text style={styles.meta}>
          This log was started without a booking, so there is no appointment to close and no pack to
          move. Discard it from the session menu if it should not have happened.
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 12.5, lineHeight: 19, color: colors.ink3 },
  list: { marginTop: space.s4 },
});
