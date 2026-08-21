/**
 * The seat limit, raised or lowered. Owner only.
 *
 * It exists because without it the seat limit is a wall with no door: a team
 * that fills up can neither invite nor explain itself, and the trainer's only
 * recourse would be to ask us to change an environment variable. A limit the
 * product enforces and does not let you edit is a bug with a number on it.
 *
 * Lowering below the current headcount is allowed, and the server allows it too:
 * it only gates the next accept. Refusing would mean an owner who is downsizing
 * has to remove a coach before they are permitted to say so.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Control, FieldLabel, FieldMsg, Sheet, colors, space } from '../../../design';

export interface SeatsSheetProps {
  visible: boolean;
  current: number | null;
  /** Active coaches right now — what a new limit has to be read against. */
  inUse: number;
  busy?: boolean;
  onSave: (seats: number) => void;
  onClose: () => void;
}

export default function SeatsSheet({
  visible,
  current,
  inUse,
  busy = false,
  onSave,
  onClose,
}: SeatsSheetProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) setText(current == null ? '' : String(current));
  }, [visible, current]);

  const seats = Number.parseInt(text.replace(/\D/g, ''), 10);
  const valid = Number.isFinite(seats) && seats >= 1 && seats <= 500;

  return (
    <Sheet visible={visible} onClose={onClose} title="Team seats">
      <Text style={styles.meta}>
        How many coaches can be in the team at once, counting you. A coach only takes a seat when
        they accept — you can invite more people than you have seats.
      </Text>

      <FieldLabel>Seats</FieldLabel>
      <Control
        value={text}
        onChangeText={setText}
        keyboardType="number-pad"
        autoFocus
        selectTextOnFocus
        maxLength={3}
        style={styles.control}
      />
      {valid && seats < inUse ? (
        <FieldMsg tone="warn">
          {inUse} coaches are already in the team. Nobody is removed — you just can’t add anyone
          until it drops below {seats}.
        </FieldMsg>
      ) : (
        <FieldMsg>{inUse} of them used right now.</FieldMsg>
      )}

      <Button
        label="Save"
        variant="primary"
        size="lg"
        block
        loading={busy}
        disabled={!valid || seats === current}
        onPress={() => onSave(seats)}
        style={styles.save}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  control: { marginBottom: space.s2 },
  save: { marginTop: space.s4 },
});
