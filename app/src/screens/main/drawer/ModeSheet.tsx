/**
 * 2b · Switch to my own training.
 *
 * **Two separate books on one login.** Most trainers train, and every competitor
 * in the teardown makes them keep a second app for it. The rule that makes it
 * safe is the one stated in the sheet: your own sets never appear in a client's
 * history, and switching takes one tap either way.
 *
 * ── What is honest about this sheet, and what is not yet built ─────────────
 *
 * The sheet is real: it reads and writes the mode, which is a device preference,
 * and the drawer's header reflects it. The **contents** of self mode — a log, a
 * PR list, the trainer's own programs — are not designed anywhere in this screen
 * set, and inventing a data model for them from a sheet's subtitle would be
 * guessing at the most structural decision in the feature.
 *
 * So switching lands on a screen that says exactly that, with one tap back. That
 * is a smaller lie than a mode that silently does nothing, and a much smaller one
 * than a schema invented to fill it.
 *
 * Closing the drawer cancels it, per the tap map — which is free here, because
 * nothing is written until Switch is pressed.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { setPrefs, type Mode } from '../../../settings/prefs';
import { usePrefs } from '../../../settings/usePrefs';
import {
  Button,
  Callout,
  IconDumbbell,
  IconShield,
  IconUsers,
  List,
  Radio,
  Row,
  Sheet,
  space,
} from '../../../design';

export interface ModeSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the chosen mode once it has been saved. */
  onSwitched: (mode: Mode) => void;
  /** How many clients are on the roster, for the coaching row's subtitle. */
  clients: number;
}

export default function ModeSheet({ visible, onClose, onSwitched, clients }: ModeSheetProps) {
  const { prefs } = usePrefs();
  const [choice, setChoice] = useState<Mode>(prefs.mode);

  // Re-seeded on open rather than held, so a sheet dismissed with the other mode
  // selected does not reopen already holding that choice.
  useEffect(() => {
    if (visible) setChoice(prefs.mode);
  }, [visible, prefs.mode]);

  const commit = async () => {
    await setPrefs({ mode: choice });
    onSwitched(choice);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Switch to your own training">
      <List style={styles.list}>
        <Row
          grouped
          wrap
          minHeight={68}
          leading={<IconUsers size={19} />}
          title="Coaching"
          subtitle={`${clients} client${clients === 1 ? '' : 's'}, the diary, the money.${choice === 'coaching' ? " What you're in now." : ''}`}
          onPress={() => setChoice('coaching')}
          trailing={<Radio checked={choice === 'coaching'} />}
        />
        <Row
          grouped
          wrap
          minHeight={68}
          leading={<IconDumbbell size={19} />}
          title="My own training"
          subtitle="Your log, your PRs, your programs. No clients, no money."
          onPress={() => setChoice('self')}
          trailing={<Radio checked={choice === 'self'} />}
        />
      </List>

      <Callout icon={IconShield} style={styles.note}>
        Two separate books on one login. Your own sets never appear in a client&apos;s history, and
        switching takes one tap either way.
      </Callout>

      <Button
        label={choice === prefs.mode ? 'Already here' : 'Switch'}
        variant="primary"
        size="lg"
        block
        disabled={choice === prefs.mode}
        onPress={() => void commit()}
        style={styles.action}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: space.s2 },
  note: { marginTop: space.s4 },
  action: { marginTop: space.s4 },
});
