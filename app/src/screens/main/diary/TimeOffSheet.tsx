/**
 * 5b · Time off.
 *
 * Blocking a week when six sessions are already in it is the real case, so the
 * sheet leads with that number rather than with a date picker.
 *
 * "Leave them, I'll sort it out" is the honest default of the three, because a
 * block only stops *new* bookings — it has never had any business cancelling
 * something a client already agreed to. Cancelling is offered, and it says
 * plainly that no pack is deducted.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  Button,
  Callout,
  IconPause,
  Radio,
  Row,
  Sheet,
  colors,
  space,
} from '../../../design';
import { sessionsInRange, type DiaryInput } from '../../../diary/diary';

export type BlockChoice = 'keep' | 'cancel';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function TimeOffSheet({
  visible,
  input,
  from,
  to,
  onBlock,
  onClose,
}: {
  visible: boolean;
  input: DiaryInput;
  from: number;
  to: number;
  onBlock: (choice: BlockChoice, sessionIds: string[]) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<BlockChoice>('keep');

  const [seed, setSeed] = useState(visible);
  if (visible !== seed) {
    setSeed(visible);
    if (visible) setChoice('keep');
  }

  const affected = useMemo(() => sessionsInRange(input, from, to), [input, from, to]);
  const count = affected.length;

  const a = new Date(from);
  const b = new Date(to - 1);
  const span =
    a.getMonth() === b.getMonth() && a.getDate() !== b.getDate()
      ? `${a.getDate()} – ${b.getDate()} ${MONTH_SHORT[b.getMonth()]}`
      : a.getDate() === b.getDate()
        ? `${a.getDate()} ${MONTH_SHORT[a.getMonth()]}`
        : `${a.getDate()} ${MONTH_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTH_SHORT[b.getMonth()]}`;

  return (
    <Sheet visible={visible} onClose={onClose} title={`Block out ${span}`}>
      {count > 0 ? (
        <Text style={styles.sub}>
          <Text style={styles.strong}>
            {count} session{count === 1 ? ' is' : 's are'}
          </Text>{' '}
          already booked in that time.
        </Text>
      ) : (
        <Text style={styles.sub}>Nothing is booked in that time.</Text>
      )}

      {count > 0 ? (
        <>
          <Row
            title="Leave them, I'll sort it out"
            subtitle="The block only stops new bookings"
            minHeight={68}
            leading={<Radio checked={choice === 'keep'} />}
            onPress={() => setChoice('keep')}
          />
          <Row
            title="Just cancel them"
            subtitle="No pack is deducted. They get a message."
            minHeight={68}
            style={styles.spaced}
            leading={<Radio checked={choice === 'cancel'} />}
            onPress={() => setChoice('cancel')}
          />
        </>
      ) : null}

      <Callout icon={IconPause} style={styles.note}>
        A block stops new bookings inside it. Your own booking always ignores it.
      </Callout>

      <Button
        label={
          count > 0 && choice === 'cancel'
            ? `Block and cancel ${count}`
            : count > 0
              ? `Block · keep ${count}`
              : 'Block this time'
        }
        size="lg"
        block
        style={styles.cta}
        onPress={() => onBlock(choice, affected.map((s) => s.id))}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 13.5, color: colors.ink3, marginBottom: space.s4 },
  strong: { color: colors.ink, fontWeight: '700' },
  spaced: { marginTop: space.s2 },
  note: { marginTop: space.s4 },
  cta: { marginTop: space.s4 },
});
