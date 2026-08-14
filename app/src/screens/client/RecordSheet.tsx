/**
 * Screen 2b · "That's a new best".
 *
 * The one place in this product where the client's voice is allowed to be warmer
 * than the trainer's, because a personal record is the only event in the app
 * worth stopping for. Warmth here is **four words and a number** — not an
 * exclamation mark, not an emoji, and not a figure it hasn't earned.
 *
 * Gold displaces the accent for the length of this sheet: `--tx-pr` means a
 * personal record and nothing else, so the app's own colour steps back. And the
 * sheet still says what the old best was and when, because a record you cannot
 * check is not a record.
 *
 * It appears the instant the tick lands, offline, because the record was computed
 * on read rather than fetched.
 */

import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import type { PrCard } from '../../log/log';
import {
  Button,
  Callout,
  DoneMark,
  IconShare,
  Sheet,
  Stat,
  StatRail,
  colors,
  space,
} from '../../design';

export default function RecordSheet({
  record,
  coach,
  previous,
  reps,
  onClose,
  onHistory,
}: {
  record: PrCard | null;
  /** Their trainer's first name. The sheet names who else sees this. */
  coach: string;
  /**
   * "Was 40 kg on 5 August" — what it beat, and when.
   *
   * Passed in rather than taken from the card's own `why`, which is written for
   * the trainer and says "the heaviest set SHE has logged". This is her screen.
   * And the date matters: a record you cannot check is not a record.
   */
  previous: string | null;
  /** The reps that did it, for the second stat and the sentence. */
  reps: number | null;
  onClose: () => void;
  onHistory: (exerciseId: string) => void;
}) {
  if (!record) return null;

  // Epley, the one every lifter quotes. Only shown for a weighted set, because
  // a one-rep max on a bodyweight movement is a number with no meaning.
  const load = Number(record.value);
  const oneRm =
    Number.isFinite(load) && load > 0 && reps
      ? Math.round(load * (1 + reps / 30))
      : null;

  const share = () => {
    // A system share sheet with a plain line and the number. XRep posts
    // nothing anywhere, and this is the only place it hands anything to the OS.
    void Share.share({
      message: `New best: ${record.name} — ${record.value} ${record.unit}${record.was ? ` (${record.was})` : ''}`,
    });
  };

  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.mark}>
        <DoneMark tone="pr" label="New personal best" />
        <Text style={styles.title}>That&apos;s a new best</Text>
        <Text style={styles.body}>
          {record.name} · {record.value} {record.unit}
          {reps ? ` × ${reps}` : ''}.{' '}
          {previous ? `${previous.replace(/^Was/, 'Your last best was')}.` : 'Your first one on this.'}
        </Text>
      </View>

      <StatRail style={styles.rail}>
        <Stat label="Lifted" value={record.value} unit={record.unit} />
        <Stat label="Reps" value={reps ?? '—'} />
        {oneRm ? (
          <Stat label="Est. 1RM" value={String(oneRm)} unit="kg" />
        ) : (
          <Stat label="Beat" value={record.was.replace(/^was\s+/i, '') || '—'} />
        )}
      </StatRail>

      <Callout style={styles.note}>
        {coach} sees this on their phone. They may say something about it — that is the only
        automatic message XRep sends on a record.
      </Callout>

      <Button label="Back to the set" size="lg" block style={styles.primary} onPress={onClose} />
      <View style={styles.footRow}>
        <Button label="Share it" icon={IconShare} variant="text" onPress={share} />
        <Button
          label="See the history"
          variant="text"
          onPress={() => onHistory(record.exerciseId)}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', gap: space.s3, paddingVertical: space.s2 },
  title: { fontSize: 21, fontWeight: '700', letterSpacing: -0.42, color: colors.ink },
  body: { fontSize: 13.5, lineHeight: 20, color: colors.ink2, textAlign: 'center' },

  rail: { marginTop: space.s4 },
  note: { marginTop: space.s3 },
  primary: { marginTop: space.s4 },
  footRow: { flexDirection: 'row', justifyContent: 'center', gap: space.s4, marginTop: 4 },
});
