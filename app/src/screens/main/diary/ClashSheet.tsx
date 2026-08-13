/**
 * 3c · Clash.
 *
 * Three ways out before the escape hatch, and the escape hatch is real:
 * §07 says double-booking warns but never blocks. Two clients on one floor at
 * once is a normal Tuesday in an Indian gym, and an app that forbids it is an
 * app that gets worked around.
 *
 * The batch option the design draws is built but **off for the MVP launch**
 * (`BATCHES_ENABLED`). It is hidden rather than shown-and-refused, for the
 * reason it was absent in the first place: an option that cannot be honoured is
 * worse than one that was never offered.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  Button,
  Callout,
  CalloutStrong,
  IconAlert,
  List,
  Row,
  Sheet,
  colors,
  space,
} from '../../../design';
import { clockParts } from '../../../home/time';
import { BATCHES_ENABLED, type DiaryItem } from '../../../diary/diary';

export interface ClashChoice {
  kind: 'later' | 'move-theirs' | 'anyway' | 'batch';
  at: number;
}

export default function ClashSheet({
  visible,
  clash,
  wanted,
  nextFree,
  onChoose,
  onClose,
}: {
  visible: boolean;
  /** Who is already on the floor. */
  clash: DiaryItem | null;
  /** The slot the trainer asked for. */
  wanted: number;
  /** The next free slot after it, if there is one. */
  nextFree: number | null;
  onChoose: (choice: ClashChoice) => void;
  onClose: () => void;
}) {
  if (!clash) return null;

  const at = clockParts(wanted);
  const from = clockParts(clash.at);
  const to = clockParts(clash.endsAt);
  const free = nextFree === null ? null : clockParts(nextFree);
  const firstName = clash.clientName.split(/\s+/)[0] ?? clash.clientName;

  return (
    <Sheet visible={visible} onClose={onClose} title="That slot is taken">
      <Text style={styles.sub}>
        {from.time} – {to.time} {to.meridiem} already has {clash.clientName} on the floor.
      </Text>

      <List style={styles.list}>
        {free && nextFree !== null ? (
          <Row
            grouped
            minHeight={56}
            title={`Book at ${free.time} ${free.meridiem} instead`}
            subtitle="Next free slot"
            onPress={() => onChoose({ kind: 'later', at: nextFree })}
          />
        ) : null}
        {BATCHES_ENABLED ? (
          <Row
            grouped
            minHeight={56}
            title="Make it a batch of 2"
            subtitle={`${firstName} and them, together`}
            onPress={() => onChoose({ kind: 'batch', at: clash.at })}
          />
        ) : null}
        {free && nextFree !== null ? (
          <Row
            grouped
            minHeight={56}
            title={`Move ${firstName} to ${free.time} ${free.meridiem}`}
            subtitle="They'll get a WhatsApp about it"
            onPress={() => onChoose({ kind: 'move-theirs', at: nextFree })}
          />
        ) : null}
        <Row
          grouped
          minHeight={56}
          title={`Book both at ${at.time} ${at.meridiem} anyway`}
          subtitle="Two on the floor at once"
          onPress={() => onChoose({ kind: 'anyway', at: wanted })}
        />
      </List>

      <Callout icon={IconAlert} style={styles.note}>
        <CalloutStrong>Double-booking is allowed</CalloutStrong> — you know your floor better than
        we do. Both sessions will show a clash marker.
      </Callout>

      <Button label="Cancel" variant="ghost" block style={styles.cta} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 13.5, color: colors.ink3, marginBottom: space.s4 },
  list: { marginBottom: space.s2 },
  note: { marginTop: space.s2 },
  cta: { marginTop: space.s3 },
});
