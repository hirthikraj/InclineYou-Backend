/**
 * 6b · When it never arrives.
 *
 * Every ledger app lets you delete the entry, which hides the money and quietly
 * rewrites the client's pack. A write-off does neither: the debt leaves "still
 * owed", the row stays in the client's book, and the amount lands in the year's
 * written-off total — so next March the number is the truth.
 *
 * Each of the three options states what it does to **their pack** and to
 * **your year**, with the real figures substituted in. That second sentence is
 * what makes the decision honest rather than a shrug.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Amount,
  Button,
  Callout,
  IconShield,
  Keypad,
  Radio,
  Row,
  Sheet,
  applyKey,
  colors,
  space,
  type KeypadKey,
} from '../../../design';
import { dueLabel, rupees, type ChaseRow } from '../../../money/money';

export type WriteOffChoice =
  | { kind: 'keep' }
  | { kind: 'write-off' }
  | { kind: 'adjust'; amount: number };

export default function WriteOffSheet({
  visible,
  row,
  /** Sessions still on the pack — what they keep if you stop chasing. */
  sessionsLeft,
  /** The year's written-off total as it stands, before this decision. */
  writtenOffSoFar,
  onChoose,
  onClose,
}: {
  visible: boolean;
  row: ChaseRow | null;
  sessionsLeft: number | null;
  writtenOffSoFar: number;
  onChoose: (choice: WriteOffChoice) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<WriteOffChoice['kind']>('keep');
  const [typed, setTyped] = useState(0);

  const [seed, setSeed] = useState(visible);
  if (visible !== seed) {
    setSeed(visible);
    if (visible) {
      setKind('keep');
      setTyped(0);
    }
  }

  if (!row) return null;

  const first = row.name.split(' ')[0];
  const keeps =
    sessionsLeft != null && sessionsLeft > 0
      ? ` They keep their ${sessionsLeft} remaining session${sessionsLeft === 1 ? '' : 's'}.`
      : '';

  return (
    <Sheet visible={visible} onClose={onClose} title={`${first}'s ${rupees(row.amount)}`}>
      <Text style={styles.sub}>
        {dueLabel(row.dueAt, Date.now())} ·{' '}
        {row.reminders === 0
          ? 'not reminded'
          : `reminded ${row.reminders === 1 ? 'once' : `${row.reminders} times`}`}
      </Text>

      <View style={styles.stack}>
        <Row
          title="Keep chasing"
          subtitle={`Stays in still owed.${keeps}`}
          minHeight={70}
          wrap
          leading={<Radio checked={kind === 'keep'} />}
          onPress={() => setKind('keep')}
        />
        <Row
          title="Write it off"
          subtitle={`Leaves still owed and goes into written off. The entry stays in their book, and the year's written-off total becomes ${rupees(
            writtenOffSoFar + row.amount,
          )}.`}
          minHeight={70}
          wrap
          leading={<Radio checked={kind === 'write-off'} />}
          onPress={() => setKind('write-off')}
        />
        <Row
          title="Change the amount"
          subtitle="They agreed a smaller figure. The pack shortens to match."
          minHeight={70}
          wrap
          leading={<Radio checked={kind === 'adjust'} />}
          onPress={() => setKind('adjust')}
        />
      </View>

      {kind === 'adjust' ? (
        <>
          <View style={styles.amountBox}>
            <Amount value={rupees(typed).slice(1)} size={30} />
          </View>
          <Text style={styles.adjustNote}>
            {typed > 0 && typed < row.amount
              ? `${rupees(row.amount - typed)} of the original comes off the pack.`
              : typed >= row.amount
                ? 'That is not less than what is owed — nothing changes.'
                : 'What did they agree to instead?'}
          </Text>
          <Keypad style={styles.pad} onKey={(key: KeypadKey) => setTyped((n) => applyKey(n, key))} />
        </>
      ) : (
        <Callout icon={IconShield} style={styles.note}>
          Writing off is not deleting. Deleting would hide the money and quietly change their pack —
          a write-off keeps the history, so next March you can see what the year really was.
        </Callout>
      )}

      <Button
        label="Save"
        size="lg"
        block
        disabled={kind === 'adjust' && (typed <= 0 || typed >= row.amount)}
        style={styles.cta}
        onPress={() =>
          onChoose(kind === 'adjust' ? { kind: 'adjust', amount: typed } : { kind })
        }
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 13.5, color: colors.ink3, marginBottom: space.s4 },
  stack: { gap: space.cardGap },
  note: { marginTop: space.s4 },
  amountBox: { alignItems: 'center', marginTop: space.s4 },
  adjustNote: { fontSize: 12.5, color: colors.ink3, textAlign: 'center', marginTop: 4 },
  pad: { marginTop: space.s3 },
  cta: { marginTop: space.s4 },
});
