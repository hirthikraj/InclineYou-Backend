/**
 * 2c · Something to show the client standing in front of you.
 *
 * The design draws a scannable UPI QR here. Rendering a real one needs a QR
 * encoder, which is a native dependency this build deliberately does not carry
 * — so instead of a decorative square that scans as nothing, this shows the
 * payment details at a size that can be read across a gym floor, and offers
 * the two things that do work today: send the UPI link, or open it.
 *
 * A fake QR would be worse than no QR. Someone would point a phone at it.
 *
 * The honest footnote stays either way: the amount is only a suggestion. Any
 * UPI app lets the payer change it before they send, which is true of every
 * UPI QR in India and which no app admits.
 */

import React, { useState } from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';
import {
  Callout,
  IconAlert,
  IconCheck,
  IconChevron,
  IconRupee,
  IconShare,
  List,
  Row,
  Sheet,
  colors,
  light,
  radius,
  space,
  tnum,
} from '../../../design';
import { rupees, upiUri, whatsappUri, type ChaseRow, type GymProfile } from '../../../money/money';

export default function UpiSheet({
  visible,
  row,
  gym,
  onRecord,
  onClose,
}: {
  visible: boolean;
  row: ChaseRow | null;
  gym: GymProfile;
  onRecord: (row: ChaseRow) => void;
  onClose: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  if (!row) return null;

  const link = upiUri(gym, row.amount, `Training · ${row.packLabel}`);
  const first = row.name.split(' ')[0];
  // No UPI ID means there is nothing to send and nothing to open. Both rows
  // stayed tappable and returned early in silence, which reads as a broken
  // sheet rather than as a missing setting.
  const payable = link != null;

  const sendLink = async () => {
    if (!link) return;
    const message = `Hi ${first}, here's the payment link for ${rupees(row.amount)}: ${link}\nOr pay to ${
      gym.upiVpa
    } from any UPI app.`;
    const wa = whatsappUri(row.phone, message);
    try {
      if (wa) await Linking.openURL(wa);
      else await Share.share({ message });
    } catch {
      await Share.share({ message });
    }
  };

  const openHere = async () => {
    if (!link) return;
    try {
      await Linking.openURL(link);
    } catch {
      setNotice('No UPI app on this phone. Send the link instead.');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={`Show this to ${first}`}>
      <Text style={styles.sub}>{`${rupees(row.amount)} · any UPI app can pay it`}</Text>

      {/* A light card, like the QR block in the design — it is meant to be held
          up and read, and dark-on-dark at arm's length is not readable. */}
      <View style={styles.plate}>
        <Text style={styles.plateLabel}>Pay to</Text>
        <Text style={styles.vpa} selectable>
          {gym.upiVpa ?? 'No UPI ID saved'}
        </Text>
        <Text style={styles.amount}>{rupees(row.amount)}</Text>
        {gym.trainerName ? <Text style={styles.plateName}>{gym.trainerName}</Text> : null}
      </View>

      <List style={styles.actions}>
        <Row
          grouped
          minHeight={54}
          title="Send the payment link"
          subtitle={
            payable
              ? "Opens their chat with the amount filled in"
              : 'Needs your UPI ID — add it in your profile'
          }
          leading={<IconShare size={19} color={payable ? colors.ink2 : colors.inkOff} />}
          trailing={payable ? <IconChevron size={18} color={colors.ink3} /> : undefined}
          onPress={payable ? () => void sendLink() : undefined}
        />
        <Row
          grouped
          minHeight={54}
          title="Open it on this phone"
          subtitle={
            payable
              ? "If they're paying from your phone"
              : 'Needs your UPI ID — add it in your profile'
          }
          leading={<IconRupee size={19} color={payable ? colors.ink2 : colors.inkOff} />}
          trailing={payable ? <IconChevron size={18} color={colors.ink3} /> : undefined}
          onPress={payable ? () => void openHere() : undefined}
        />
        {/* Always live. Money can arrive by any route — this sheet not being
            able to raise a link has nothing to do with whether they paid. */}
        <Row
          grouped
          minHeight={54}
          title={`${first} has paid — mark it received`}
          leading={<IconCheck size={19} color={colors.ink2} />}
          trailing={<IconChevron size={18} color={colors.ink3} />}
          onPress={() => onRecord(row)}
        />
      </List>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Callout icon={IconAlert} style={styles.note}>
        The amount is only a suggestion — they can change it in their own UPI app, so check what
        actually arrived before you mark it received.
      </Callout>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 13.5, color: colors.ink3, marginBottom: space.s4 },
  /* The plate is held up and read across a gym floor, so it stays light in
     both themes. That is a reason to reach for the LIGHT palette, not a reason
     to hard-code hex — `light.*` is what the system calls these exact inks, and
     it keeps the plate reskinning with everything else. */
  plate: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.s6,
    paddingHorizontal: space.s5,
    borderRadius: radius.r3,
    backgroundColor: light.surface,
  },
  plateLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: light.ink3,
  },
  vpa: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: light.ink,
    textAlign: 'center',
    marginTop: 2,
  },
  amount: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1.05,
    color: light.ink,
    marginTop: 6,
    ...tnum,
  },
  plateName: { fontSize: 12.5, color: light.ink2, marginTop: 2 },
  actions: { marginTop: space.s4 },
  notice: { fontSize: 12.5, color: colors.warn, marginTop: space.s2 },
  note: { marginTop: space.s3 },
});
