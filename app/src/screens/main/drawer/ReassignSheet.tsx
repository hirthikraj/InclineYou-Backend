/**
 * 6h · hand a client to another coach.
 *
 * ── Three things on one sheet, and the middle one is the whole feature ─────
 *
 * Pick a coach · decide what happens to the plan · say why. The plan question is
 * not a setting: "keep" and "start fresh" are two different handovers, and the
 * admin is the only person who knows which one this is. Covering a holiday keeps
 * the plan; moving a client to a specialist usually does not.
 *
 * ── The paragraph that has to be on screen ────────────────────────────────
 *
 * A handover moves the plan and keeps the history, and both halves surprise
 * somebody:
 *
 *   · the NEW coach opens an inherited client and finds no payments. They will
 *     read that as data loss unless they were told the money stayed with the
 *     coach who collected it;
 *   · the OLD coach expects their books to change and they do not. Their logged
 *     sessions and every rupee they took stay theirs, which is the correct answer
 *     and not an oversight.
 *
 * Saying it here is cheaper than either coach discovering it. The enforcement is
 * in `TeamClientService.reassign`, and the sentence and the code are meant to be
 * read against each other.
 *
 * ── Confirmed once, not twice ─────────────────────────────────────────────
 *
 * No Dialog on top of this sheet. A handover is reversible — hand them back, and
 * the log keeps both moves — so a second confirmation would be ceremony rather
 * than protection. What it gets instead is a button that names the outcome
 * ("Hand Meera to Priya") rather than saying "Confirm".
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  ChoiceCard,
  ChoiceGrid,
  Control,
  FieldLabel,
  IconLock,
  List,
  Radio,
  Row,
  Sheet,
  colors,
  space,
} from '../../../design';
import { reassignClient, TeamError } from '../../../api/team';
import { syncDatabase } from '../../../db/sync';
import type { TeamMemberCard } from '../../../team/team';

export interface ReassignSheetProps {
  visible: boolean;
  clientId: string;
  clientName: string;
  currentCoachId: string | null;
  currentCoachName: string | null;
  /** Active members, from the synced team list. */
  coaches: TeamMemberCard[];
  hasProgram: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

export default function ReassignSheet({
  visible,
  clientId,
  clientName,
  currentCoachId,
  currentCoachName,
  coaches,
  hasProgram,
  onClose,
  onDone,
}: ReassignSheetProps) {
  const [toTrainerId, setToTrainerId] = useState<string | null>(null);
  const [action, setAction] = useState<'keep' | 'clear'>('keep');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seeded on open so a cancelled handover never leaves a coach preselected
  // for the next client.
  useEffect(() => {
    if (!visible) return;
    setToTrainerId(null);
    setAction('keep');
    setNote('');
    setError(null);
  }, [visible]);

  // Whoever already has them is not a destination.
  const options = coaches.filter((coach) => coach.trainerId && coach.trainerId !== currentCoachId);
  const target = options.find((coach) => coach.trainerId === toTrainerId) ?? null;
  const targetName = target?.name?.trim().split(' ')[0] ?? 'them';
  const first = clientName.trim().split(' ')[0] || clientName;

  const submit = async () => {
    if (!toTrainerId) return;
    setBusy(true);
    setError(null);
    try {
      await reassignClient(clientId, toTrainerId, action, note);
      // Both sides of this device's picture change: the client leaves the
      // caller's own roster if it was theirs, and the moved rows are tombstoned.
      // Pulling now means the screen behind this sheet is already right.
      await syncDatabase('team');
      onDone(
        action === 'clear'
          ? `${first} is ${targetName}’s now. Their plan was cleared.`
          : `${first} is ${targetName}’s now, with their plan.`,
      );
    } catch (e) {
      setError(e instanceof TeamError ? e.message : 'Could not hand that client over.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={`Hand ${first} over`}>
      <Text style={styles.meta}>
        {currentCoachName
          ? `${currentCoachName.split(' ')[0]} coaches ${first} today.`
          : `Choose who coaches ${first} from now on.`}
      </Text>

      <FieldLabel>New coach</FieldLabel>
      {/* A list with a radio in the trailing slot rather than bare radio rows:
          each coach carries a second line — their roster size — and the app
          already reads selectable people as `Row`s everywhere else. */}
      <List style={styles.coaches}>
        {options.map((coach) => (
          <Row
            key={coach.id}
            grouped
            leading={<Avatar name={coach.name ?? ''} size="sm" />}
            title={coach.name?.trim() || coach.display}
            subtitle={coach.meta || undefined}
            selected={toTrainerId === coach.trainerId}
            trailing={<Radio checked={toTrainerId === coach.trainerId} />}
            onPress={() => setToTrainerId(coach.trainerId ?? null)}
          />
        ))}
      </List>

      {hasProgram ? (
        <>
          <FieldLabel>Their plan</FieldLabel>
          <ChoiceGrid style={styles.actions}>
            <ChoiceCard
              title="Keep it"
              subtitle={`${targetName} takes over the plan as it is`}
              selected={action === 'keep'}
              onPress={() => setAction('keep')}
            />
            <ChoiceCard
              title="Start fresh"
              subtitle={`${targetName} builds a new plan`}
              selected={action === 'clear'}
              onPress={() => setAction('clear')}
            />
          </ChoiceGrid>
        </>
      ) : null}

      <FieldLabel>Why (optional)</FieldLabel>
      <Control
        value={note}
        onChangeText={setNote}
        placeholder="Covering Tuesdays"
        maxLength={200}
        style={styles.note}
      />
      <Text style={styles.hint}>Both coaches see this on the client’s handover history.</Text>

      {/* The two surprises, named before they happen. */}
      <Callout icon={IconLock} style={styles.rule}>
        <CalloutStrong>The plan moves, the money doesn’t.</CalloutStrong> Sessions already logged and
        payments already taken stay with {currentCoachName?.split(' ')[0] ?? 'their current coach'} —
        {targetName === 'them' ? ' the new coach' : ` ${targetName}`} starts a fresh money book for{' '}
        {first}.
      </Callout>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={target ? `Hand ${first} to ${targetName}` : 'Choose a coach'}
        variant="primary"
        size="lg"
        block
        loading={busy}
        disabled={!toTrainerId || busy}
        onPress={submit}
        style={styles.submit}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  coaches: { gap: space.s2, marginBottom: space.s4 },
  actions: { marginBottom: space.s4 },
  note: { marginBottom: space.s2 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.ink3, marginBottom: space.s4 },
  rule: { marginBottom: space.s3 },
  error: { fontSize: 13, lineHeight: 20, color: colors.danger, marginBottom: space.s3 },
  submit: { marginTop: space.s2 },
});
