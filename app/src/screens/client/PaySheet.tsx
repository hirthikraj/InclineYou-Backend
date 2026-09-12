/**
 * Screen 5b · Pay by UPI.
 *
 * One 56px accent button and **no VPA field anywhere on the screen**. A typed VPA
 * is the largest single cause of failed collections, and NPCI's February 2026
 * guidance restricts the field on mobile regardless — so Intent is the only path,
 * and the payee's ID never appears as text.
 *
 * The verified block names who is being paid without printing their ID, which is
 * what the trainer's own profile privacy rule already promises. Their UPI app
 * shows the same name back before they authorise, and that confirmation is the
 * check that matters.
 *
 * Part payment is a keypad, and the remainder is stated in amber before anything
 * commits — because "₹4,000 now" without "₹5,000 still owed" is how a client comes
 * away thinking they have settled.
 */

import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { PaymentsView } from '../../client/client';
import { rupees, upiUri } from '../../money/money';
import {
  Amount,
  Button,
  Callout,
  CalloutStrong,
  IconChevron,
  IconQr,
  IconRupee,
  Keypad,
  List,
  Row,
  Sheet,
  Tag,
  applyKey,
  colors,
  space,
  tnum,
} from '../../design';

export default function PaySheet({
  visible,
  onClose,
  view,
  coachFirst,
}: {
  visible: boolean;
  onClose: () => void;
  view: PaymentsView;
  coachFirst: string;
}) {
  /** Null means "the whole balance"; a number means a part payment being typed. */
  const [part, setPart] = useState<number | null>(null);
  /**
   * Said inside the sheet, not as a toast.
   *
   * A toast belongs to the screen behind this and the sheet covers it — so the
   * one message this sheet has to be able to deliver, "nothing opened", would be
   * invisible at the exact moment it matters.
   */
  const [notice, setNotice] = useState<string | null>(null);

  const coach = view.coach;
  const amount = part ?? view.owed;
  const remainder = Math.max(0, view.owed - amount);

  const pay = async () => {
    const uri = upiUri(
      { name: coach?.gymName ?? null, percent: null, upiVpa: coach?.upiVpa ?? null, trainerName: coach?.name ?? '' },
      amount,
      'Training fee',
    );
    if (!uri) {
      // No VPA on the trainer's profile yet. That is his to fix, and saying so
      // is better than a button that does nothing.
      setNotice(
        `${coachFirst} hasn't added a UPI ID yet, so there is nothing to open. Pay them the way you usually do and tell them here.`,
      );
      return;
    }
    try {
      await Linking.openURL(uri);
    } catch {
      // Intent falls back to a QR when no UPI app is installed — and this app
      // cannot draw one without a new dependency, so it says so plainly rather
      // than failing silently.
      setNotice('No UPI app opened. Pay in cash or by bank transfer and tell them here.');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={`Pay ${coachFirst}`}>
      {part === null ? (
        <>
          <Text style={styles.amount}>{view.owedLabel}</Text>
          {view.dueLine ? <Text style={styles.due}>{view.dueLine}</Text> : null}

          {coach ? (
            <View style={styles.verified}>
              <View style={styles.verifiedRow}>
                <Text style={styles.verifiedName}>{coach.name}</Text>
                <Tag label="Your trainer" tone="ok" />
              </View>
              <Text style={styles.verifiedNote}>
                Your UPI app will show this name before you confirm. Check it matches.
              </Text>
            </View>
          ) : null}

          <Button
            label={`Pay by UPI · ${rupees(amount)}`}
            icon={IconRupee}
            size="lg"
            block
            style={styles.primary}
            onPress={() => void pay()}
          />
          {notice ? (
            <Text style={styles.notice}>{notice}</Text>
          ) : (
            <Text style={styles.quiet}>
              Opens GPay, PhonePe, Paytm — whichever you have. There is no UPI ID to type in, here
              or anywhere.
            </Text>
          )}

          <List style={styles.list}>
            <Row
              grouped
              minHeight={56}
              leading={<IconQr size={18} color={colors.ink3} />}
              title="No UPI app on this phone?"
              subtitle={`Pay ${coachFirst} in cash or by bank transfer and tell them — they mark it received.`}
              wrap
              onPress={() =>
                setNotice(
                  `Pay ${coachFirst} in cash or by bank transfer, then tell them — they mark it received and your receipt comes from them.`,
                )
              }
            />
            <Row
              grouped
              minHeight={56}
              leading={<IconRupee size={18} color={colors.ink3} />}
              title="Pay part of it"
              subtitle="Type an amount, and the rest stays owed"
              onPress={() => setPart(0)}
              trailing={<IconChevron size={18} color={colors.ink3} />}
            />
          </List>

          <Callout style={styles.note}>
            This goes straight to {coachFirst}&apos;s bank.{' '}
            <CalloutStrong>InclineYou never holds it and can&apos;t confirm it</CalloutStrong> — they
            mark it received when it lands, and your receipt comes from them.
          </Callout>
        </>
      ) : (
        <>
          <Amount value={part.toLocaleString('en-IN')} size={42} />
          <Text style={[styles.remainder, remainder > 0 && styles.remainderWarn]}>
            {remainder > 0
              ? `${rupees(amount)} now, ${rupees(remainder)} still owed`
              : `${rupees(amount)} — that settles it`}
          </Text>
          <Keypad onKey={(key) => setPart((current) => applyKey(current ?? 0, key))} />
          <Button
            label={`Pay ${rupees(amount)}`}
            size="lg"
            block
            disabled={amount <= 0}
            style={styles.primary}
            onPress={() => void pay()}
          />
          <Button label="Back" variant="text" block onPress={() => setPart(null)} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  amount: { fontSize: 42, fontWeight: '800', letterSpacing: -1.6, color: colors.ink, marginTop: 4, ...tnum },
  due: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: 8 },

  verified: {
    marginTop: space.s4,
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.okSoft,
  },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  verifiedName: { fontSize: 15, fontWeight: '700', color: colors.ok },
  verifiedNote: { fontSize: 12.5, lineHeight: 19, color: colors.ink2, marginTop: 6 },

  primary: { marginTop: space.s4 },
  quiet: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: 8 },
  notice: { fontSize: 12.5, lineHeight: 19, color: colors.warn, marginTop: 8 },
  list: { marginTop: space.s4 },
  note: { marginTop: space.s3 },

  remainder: { fontSize: 13, color: colors.ink3, marginTop: 8, marginBottom: space.s3 },
  remainderWarn: { color: colors.warn },
});
