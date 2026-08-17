/**
 * 3c · The receipt.
 *
 * Numbered, sendable, and with a footer that says the hard thing: **this is
 * not a tax invoice.** Services cross into GST at ₹20 lakh a year and this
 * trainer is under it, so a receipt is all that's required — and saying so is
 * more useful than a fake invoice number that would be worth nothing if it
 * were ever looked at.
 *
 * Undo sits next to Save, not hidden behind a long-press, because the moment
 * you notice you typed 9,000 instead of 900 is the moment this sheet is open.
 */

import React from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Callout,
  IconAlert,
  IconCheck,
  IconSend,
  Receipt,
  ReceiptRow,
  Sheet,
  colors,
  radius,
  space,
} from '../../../design';
import { methodLabel, rupees, whatsappUri, type GymProfile } from '../../../money/money';

export interface ReceiptDetails {
  paymentId: string;
  receiptNo: string;
  clientName: string;
  phone: string | null;
  forWhat: string;
  method: string;
  upiReference?: string | null;
  amount: number;
  gymShare: number;
  at: number;
}

export default function ReceiptSheet({
  visible,
  receipt,
  gym,
  onUndo,
  onClose,
}: {
  visible: boolean;
  receipt: ReceiptDetails | null;
  gym: GymProfile;
  onUndo: () => void;
  onClose: () => void;
}) {
  if (!receipt) return null;

  // Money that came over the gym's counter got its receipt at the counter —
  // the trainer just marks it done here, and the gym pays them their part.
  // So the confirmation talks in the trainer's money: the counter's full
  // figure is a line item, not the headline.
  const gymCollected = receipt.method === 'gym_front_office';
  const take = Math.max(0, receipt.amount - receipt.gymShare);

  const text = receiptText(receipt, gym);

  const send = async () => {
    const url = whatsappUri(receipt.phone, text);
    if (url) {
      try {
        await Linking.openURL(url);
        return;
      } catch {
        // WhatsApp missing. Fall through to the OS share sheet rather than
        // telling somebody their receipt can't be sent.
      }
    }
    await Share.share({ message: text });
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        {/* 52px and ok-green, not the 88px accent DoneMark. Recording a payment
            is a confirmation, not the celebration at the end of onboarding. */}
        <View style={styles.tick}>
          <IconCheck size={24} color={colors.okFillInk} strokeWidth={3} />
        </View>
        <Text style={styles.title}>{rupees(gymCollected ? take : receipt.amount)} recorded</Text>
      </View>

      <Receipt>
        <ReceiptRow label="Client" value={receipt.clientName} />
        <ReceiptRow label="For" value={receipt.forWhat} />
        <ReceiptRow
          label="Method"
          value={
            receipt.upiReference
              ? `${methodLabel(receipt.method)} · ref ${receipt.upiReference}`
              : methodLabel(receipt.method)
          }
        />
        <ReceiptRow label="Date" value={stamp(receipt.at)} />
        <ReceiptRow label="Receipt no." value={receipt.receiptNo} />
        {gymCollected ? (
          <>
            <ReceiptRow label="Paid at the counter" value={rupees(receipt.amount)} />
            {receipt.gymShare > 0 ? (
              <ReceiptRow label="Gym keeps" value={`−${rupees(receipt.gymShare)}`} />
            ) : null}
            <ReceiptRow label="Yours" value={rupees(take)} total />
          </>
        ) : (
          <>
            {receipt.gymShare > 0 ? (
              <ReceiptRow label="Gym's share" value={`−${rupees(receipt.gymShare)}`} />
            ) : null}
            <ReceiptRow label="Received" value={rupees(receipt.amount)} total />
          </>
        )}
      </Receipt>

      <View style={styles.actions}>
        {gymCollected ? null : (
          <Button
            label="Send them the receipt"
            block
            icon={IconSend}
            onPress={() => void send()}
          />
        )}
        <Button label="Undo" variant="ghost" block onPress={onUndo} />
      </View>

      <Callout icon={IconAlert} style={styles.legal}>
        Not a tax invoice. You're under the ₹20 lakh GST line, so a receipt is all that's needed —
        we'll tell you when that changes.
      </Callout>
    </Sheet>
  );
}

/** What actually lands in the client's WhatsApp. Plain, and it reads as a receipt. */
function receiptText(r: ReceiptDetails, gym: GymProfile): string {
  const from = gym.trainerName ? ` — ${gym.trainerName}` : '';
  return [
    `Received ${rupees(r.amount)} from ${r.clientName}.`,
    `For: ${r.forWhat}`,
    `Method: ${methodLabel(r.method)}${r.upiReference ? ` (ref ${r.upiReference})` : ''}`,
    `Date: ${stamp(r.at)}`,
    `Receipt no: ${r.receiptNo}`,
    `Thank you!${from}`,
  ].join('\n');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function stamp(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  const meridiem = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hour}:${String(
    d.getMinutes(),
  ).padStart(2, '0')} ${meridiem}`;
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', marginBottom: space.s4 },
  tick: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.okFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.38, color: colors.ink, marginTop: space.s3 },
  actions: { gap: space.s2, marginTop: space.s4 },
  legal: { marginTop: space.s3 },
});
