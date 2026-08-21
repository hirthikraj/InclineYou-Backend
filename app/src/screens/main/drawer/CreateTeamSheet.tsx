/**
 * 6e · name a team.
 *
 * One field, so a sheet rather than a screen. What earns the copy above it is
 * that creating a team is the first irreversible-feeling thing in this feature —
 * it isn't irreversible at all, but it *reads* that way, and a trainer who is
 * unsure what a team does to their clients will not tap the button. So the sheet
 * answers that before asking for anything: **nothing moves.**
 *
 * The name is offered as the gym's, not the trainer's, because that is what a
 * coach joining will recognise on the invitation.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Callout, Control, FieldLabel, Sheet, colors, space } from '../../../design';

export interface CreateTeamSheetProps {
  visible: boolean;
  /** Prefilled from the trainer's gym name when they have one. */
  suggestion?: string | null;
  busy?: boolean;
  onCreate: (name: string) => void;
  onClose: () => void;
}

export default function CreateTeamSheet({
  visible,
  suggestion,
  busy = false,
  onCreate,
  onClose,
}: CreateTeamSheetProps) {
  const [text, setText] = useState('');

  // Re-seeded on open so a cancelled attempt does not leave half a name behind.
  useEffect(() => {
    if (visible) setText(suggestion?.trim() ?? '');
  }, [visible, suggestion]);

  const name = text.trim();

  return (
    <Sheet visible={visible} onClose={onClose} title="Create a team">
      <Text style={styles.meta}>
        Your clients, your programs and your money book stay exactly as they are. A team only adds
        the coaches you invite.
      </Text>

      <FieldLabel>Team name</FieldLabel>
      <Control
        value={text}
        onChangeText={setText}
        placeholder="Iron House"
        autoFocus
        selectTextOnFocus
        maxLength={120}
        style={styles.control}
      />
      <Text style={styles.hint}>
        Use the gym or studio name — it’s what a coach will see on your invitation.
      </Text>

      <Callout style={styles.note}>
        You’ll be the owner. You can invite coaches, make one of them an admin, or hand the team
        over later.
      </Callout>

      <Button
        label="Create team"
        variant="primary"
        size="lg"
        block
        loading={busy}
        disabled={name.length === 0}
        onPress={() => onCreate(name)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  control: { marginBottom: space.s2 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.ink3, marginBottom: space.s4 },
  note: { marginBottom: space.s4 },
});
