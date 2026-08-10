/**
 * 2b · The reminder.
 *
 * The highest-value job on the screen, and the one every competitor turns into
 * an automated dunning email. In India the channel is WhatsApp, the instrument
 * is a UPI link, and the message has to come from the trainer — because the
 * relationship is personal and the debt is small.
 *
 * The message is shown in full and editable, with three tones. And the sheet
 * says the hard thing out loud: **Train X can't confirm the payment.** The
 * money goes straight to the trainer's bank, so they will still have to mark
 * it received. Pretending otherwise would be the one lie that breaks the book.
 */

import React, { useEffect, useState } from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Button,
  Callout,
  Chip,
  Control,
  IconAlert,
  IconMessage,
  IconQr,
  IconSend,
  Row,
  Seg,
  Sheet,
  colors,
  space,
} from '../../../design';
import {
  reminderText,
  rupees,
  upiUri,
  whatsappUri,
  type ChaseRow,
  type GymProfile,
  type Tone,
} from '../../../money/money';

export default function RemindSheet({
  visible,
  row,
  gym,
  onSent,
  onShowUpi,
  onClose,
}: {
  visible: boolean;
  row: ChaseRow | null;
  gym: GymProfile;
  /** Fired when WhatsApp is actually opened, so "reminded twice" stays true. */
  onSent: (row: ChaseRow) => void;
  onShowUpi: (row: ChaseRow) => void;
  onClose: () => void;
}) {
  const [tone, setTone] = useState<Tone>('polite');
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible || !row) return;
    setFailed(false);
    setTone('polite');
    setText(reminderText('polite', row, gym));
  }, [visible, row, gym]);

  if (!row) return null;

  const pick = (next: Tone) => {
    setTone(next);
    // "Write my own" keeps whatever is on screen — switching to it must not
    // wipe an edit somebody has already started.
    if (next !== 'custom') setText(reminderText(next, row, gym));
  };

  const open = async () => {
    const url = whatsappUri(row.phone, text);
    if (!url) {
      setFailed(true);
      return;
    }
    try {
      await Linking.openURL(url);
      onSent(row);
    } catch {
      // WhatsApp missing, or the user came straight back. Either way the OS
      // share sheet still gets the message somewhere useful.
      try {
        await Share.share({ message: text });
        onSent(row);
      } catch {
        setFailed(true);
      }
    }
  };

  const vpa = gym.upiVpa;
  const link = upiUri(gym, row.amount, `Training · ${row.packLabel}`);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Row
        title={`Remind ${row.name.split(' ')[0]}`}
        subtitle={`${rupees(row.amount)} · ${row.late > 0 ? `${row.late} days late` : 'due today'}`}
        leading={<Avatar name={row.name} size="lg" />}
        style={styles.who}
      />

      <Control
        value={text}
        onChangeText={(next) => {
          setText(next);
          setTone('custom');
        }}
        multiline
        size="area"
        accessibilityLabel="Reminder message"
      />

      <Seg style={styles.tones}>
        <Chip label="Polite" selected={tone === 'polite'} onPress={() => pick('polite')} />
        <Chip label="Firm" selected={tone === 'firm'} onPress={() => pick('firm')} />
        <Chip label="Write my own" selected={tone === 'custom'} onPress={() => pick('custom')} />
      </Seg>

      {vpa ? (
        <Row
          title="Show a UPI QR instead"
          subtitle={link ? 'For a client standing in front of you' : 'Add your UPI ID first'}
          minHeight={56}
          style={styles.qr}
          leading={<IconQr size={19} color={colors.ink2} />}
          onPress={() => onShowUpi(row)}
        />
      ) : (
        <Callout icon={IconMessage} style={styles.qr}>
          No UPI ID saved, so the message can't carry a payment link. Add one in your profile and
          every reminder after that will.
        </Callout>
      )}

      <Callout icon={IconAlert} style={styles.warn}>
        Train X can't confirm the payment — the money goes straight to your bank. You'll still need
        to mark it received when it lands.
      </Callout>

      {failed ? (
        <Text style={styles.failed}>
          {row.phone
            ? "Couldn't open WhatsApp. Check it's installed."
            : 'No phone number saved for this client.'}
        </Text>
      ) : null}

      <Button
        label="Open WhatsApp"
        size="lg"
        block
        icon={IconSend}
        disabled={!row.phone}
        style={styles.cta}
        onPress={() => void open()}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  who: { marginBottom: space.s3 },
  tones: { marginTop: space.s3 },
  qr: { marginTop: space.s3 },
  warn: { marginTop: space.s3 },
  failed: { fontSize: 12.5, color: colors.danger, marginTop: space.s2 },
  cta: { marginTop: space.s4 },
});
