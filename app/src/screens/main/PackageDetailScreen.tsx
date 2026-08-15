/**
 * One pack, and the money against it.
 *
 * Three things stacked in the order a trainer needs them: how many sessions are
 * left, what the pack is, and who has paid what. The counter is first and it is
 * large because it is the only number anybody opens this screen for mid-day —
 * the rest is bookkeeping and can wait for the scroll.
 *
 * ── Collecting ────────────────────────────────────────────────────────────
 *
 * A UPI deep link, not a payment gateway. XRep never touches the money: the
 * link opens the client's own UPI app with the amount filled in, and the
 * trainer marks it received when it lands. That is a locked decision, and it is
 * why "Mark it paid" sits next to the link rather than behind a webhook —
 * without the trainer's confirmation this app has no way of knowing.
 *
 * Cash and gym-collected money skip the link entirely and are recorded straight
 * as received, because they already have been.
 */

import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../navigation/MainStack';
import { observePackages, observePayments, createPayment, confirmPayment } from '../../db/packages';
import { getTrainerProfile } from '../../api/payments';
import { rupees } from '../../home/time';
import type PackageModel from '../../db/models/Package';
import type PaymentModel from '../../db/models/Payment';
import {
  AppBar,
  Button,
  Control,
  Empty,
  FieldLabel,
  IconBack,
  IconButton,
  IconCash,
  IconQr,
  IconShare,
  IconWallet,
  Kv,
  KvRow,
  List,
  Pack,
  Reveal,
  Row,
  SectionHead,
  Sheet,
  Skeleton,
  SkeletonCard,
  Tag,
  Toast,
  colors,
  space,
  type TagTone,
} from '../../design';

type Props = NativeStackScreenProps<MainStackParamList, 'PackageDetail'>;

const TYPE_LABEL: Record<string, string> = {
  session_pack: 'Session pack',
  monthly: 'Monthly',
};

const STATUS: Record<string, { label: string; tone: TagTone }> = {
  active: { label: 'Running', tone: 'accent' },
  overdue: { label: 'Overdue', tone: 'danger' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const METHOD_LABEL: Record<string, string> = {
  upi_intent: 'UPI',
  front_office: 'At the desk',
  cash: 'Cash',
};

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PackageDetailScreen({ route, navigation }: Props) {
  const { packageId, clientId } = route.params;

  const [pkg, setPkg] = useState<PackageModel | null>(null);
  const [payments, setPayments] = useState<PaymentModel[]>([]);
  const [ready, setReady] = useState(false);

  /** The trainer's own VPA. Null until the profile call lands, or if it fails. */
  const [vpa, setVpa] = useState<string | null>(null);
  const [trainer, setTrainer] = useState('Trainer');

  const [collecting, setCollecting] = useState(false);
  const [confirming, setConfirming] = useState<PaymentModel | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const packs = observePackages(clientId).subscribe((all) => {
      setPkg(all.find((p) => p.id === packageId) ?? null);
      setReady(true);
    });
    const paid = observePayments(packageId).subscribe(setPayments);
    return () => { packs.unsubscribe(); paid.unsubscribe(); };
  }, [packageId, clientId]);

  // Best-effort. Without it the UPI link cannot be built, and the sheet says so
  // rather than the button silently doing nothing.
  useEffect(() => {
    getTrainerProfile()
      .then((t) => { setVpa(t.upiVpa); setTrainer(t.name); })
      .catch(() => setVpa(null));
  }, []);

  const upiUrl = (): string | null => {
    if (!pkg || !vpa) return null;
    const params = [
      `pa=${encodeURIComponent(vpa)}`,
      `pn=${encodeURIComponent(trainer)}`,
      `am=${pkg.amount}`,
      'cu=INR',
      `tn=${encodeURIComponent('Training fee')}`,
    ];
    return `upi://pay?${params.join('&')}`;
  };

  const shareLink = async () => {
    const url = upiUrl();
    if (!url) return;
    setCollecting(false);
    try {
      await Share.share({ message: url });
    } catch {
      setNotice('Could not open the share sheet.');
    }
  };

  const openUpiApp = async () => {
    const url = upiUrl();
    if (!url) return;
    setCollecting(false);
    try {
      await Linking.openURL(url);
    } catch {
      setNotice('No UPI app on this phone to open it with.');
    }
  };

  /**
   * Cash and gym money, recorded and confirmed in one go.
   *
   * The two writes are deliberate rather than one: `createPayment` is the row,
   * `confirmPayment` is the trainer saying it arrived, and every other path
   * through this screen separates them. Collapsing them here would give cash a
   * shape nothing else in the book has.
   */
  const recordReceived = async () => {
    if (!pkg) return;
    setBusy(true);
    setCollecting(false);
    try {
      const payment = await createPayment({
        trainerId: pkg.trainerId,
        clientId: pkg.clientId,
        packageId: pkg.id,
        amount: pkg.amount,
        method: 'front_office',
        collectedBy: 'gym',
      });
      await confirmPayment(payment.id);
      setNotice(`${rupees(pkg.amount)} recorded.`);
    } catch {
      setNotice('Could not record that payment.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await confirmPayment(confirming.id, reference.trim() || undefined);
      setConfirming(null);
      setReference('');
    } catch {
      setNotice('Could not mark that paid.');
    } finally {
      setBusy(false);
    }
  };

  if (ready && !pkg) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Pack"
            leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          />
        </View>
        <Empty
          icon={IconWallet}
          title="That pack is gone"
          body="It was removed, probably from another device. Payments already recorded against it stay in the book."
          style={styles.empty}
        />
      </SafeAreaView>
    );
  }

  const isPack = pkg?.type === 'session_pack';
  const status = pkg ? (STATUS[pkg.status] ?? { label: pkg.status, tone: 'neutral' as TagTone }) : null;
  const settled = payments.some((p) => p.status !== 'pending');

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={pkg ? (TYPE_LABEL[pkg.type] ?? pkg.type) : 'Pack'}
          subtitle={pkg ? rupees(pkg.amount) : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={status ? <Tag label={status.label} tone={status.tone} /> : undefined}
        />
      </View>

      <Reveal ready={ready} skeleton={<PackSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {pkg ? (
            <>
              {isPack ? (
                <Pack
                  remaining={pkg.sessionsRemaining ?? 0}
                  total={pkg.sessionsTotal ?? undefined}
                  style={styles.counter}
                />
              ) : null}

              <Kv style={styles.kv}>
                <KvRow label="Price" value={rupees(pkg.amount)} />
                {isPack ? (
                  <KvRow
                    label="Sessions"
                    value={String(pkg.sessionsTotal ?? '—')}
                    detail={`${pkg.sessionsRemaining ?? 0} still to deliver`}
                  />
                ) : null}
                {day(pkg.startDate) ? <KvRow label="Starts" value={day(pkg.startDate) as string} /> : null}
                {day(pkg.endDate) ? <KvRow label="Ends" value={day(pkg.endDate) as string} /> : null}
                {day(pkg.dueDate) ? (
                  <KvRow
                    label="Payment due"
                    value={day(pkg.dueDate) as string}
                    tone={pkg.status === 'overdue' ? colors.danger : undefined}
                  />
                ) : null}
              </Kv>

              {settled ? null : (
                <Button
                  label={`Collect ${rupees(pkg.amount)}`}
                  icon={IconQr}
                  variant="primary"
                  size="lg"
                  block
                  onPress={() => setCollecting(true)}
                  style={styles.collect}
                />
              )}

              <SectionHead label="Payments" count={payments.length} />
              {payments.length === 0 ? (
                <Empty
                  compact
                  icon={IconCash}
                  title="Nothing paid yet"
                  body="Send the UPI link, or record it here if the money came in some other way."
                  style={styles.emptyPayments}
                />
              ) : (
                <List>
                  {payments.map((payment) => (
                    <Row
                      key={payment.id}
                      grouped
                      title={rupees(payment.amount)}
                      subtitle={[
                        METHOD_LABEL[payment.method] ?? payment.method,
                        payment.collectedBy === 'gym' ? 'gym collected' : 'you collected',
                        payment.upiReference ? `ref ${payment.upiReference}` : null,
                      ].filter(Boolean).join(' · ')}
                      dim={payment.status === 'pending'}
                      trailing={
                        payment.status === 'pending' ? (
                          <Button
                            label="Mark paid"
                            variant="secondary"
                            size="sm"
                            onPress={() => { setConfirming(payment); setReference(''); }}
                          />
                        ) : (
                          <Tag label="Received" tone="ok" />
                        )
                      }
                    />
                  ))}
                </List>
              )}

              <Text style={styles.fine}>
                XRep never handles the money. The link opens their UPI app with the amount filled
                in — you mark it received when it lands.
              </Text>
            </>
          ) : null}
        </ScrollView>
      </Reveal>

      <Sheet
        visible={collecting}
        onClose={() => setCollecting(false)}
        title={pkg ? `Collect ${rupees(pkg.amount)}` : 'Collect'}
      >
        {vpa ? (
          <>
            <Text style={styles.meta}>Paying into {vpa}.</Text>
            <Button
              label="Send them the link"
              icon={IconShare}
              variant="primary"
              size="lg"
              block
              onPress={() => void shareLink()}
            />
            <Button
              label="Open a UPI app here"
              icon={IconQr}
              variant="secondary"
              block
              onPress={() => void openUpiApp()}
              style={styles.sheetSecond}
            />
          </>
        ) : (
          <Text style={styles.meta}>
            No UPI ID saved yet, so there is no link to send. Add one under Getting paid and it
            appears here.
          </Text>
        )}

        <Button
          label="They paid cash, or the gym took it"
          icon={IconCash}
          variant="ghost"
          block
          loading={busy}
          onPress={() => void recordReceived()}
          style={styles.sheetSecond}
        />
      </Sheet>

      <Sheet
        visible={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Mark it paid"
      >
        <Text style={styles.meta}>
          {confirming ? `${rupees(confirming.amount)} received.` : ''} The reference is optional —
          it is only there so you can find the transaction again later.
        </Text>
        <View style={styles.field}>
          <FieldLabel>UTR or reference</FieldLabel>
          <Control
            value={reference}
            onChangeText={setReference}
            placeholder="Optional"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <Button
          label="Mark it paid"
          variant="primary"
          size="lg"
          block
          loading={busy}
          onPress={() => void confirm()}
        />
      </Sheet>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function PackSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading this pack">
      <SkeletonCard height={92} style={styles.counter} />
      <SkeletonCard height={168} />
      <Skeleton height={52} style={styles.skelButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  counter: { marginTop: space.s4 },
  kv: { marginTop: space.s4 },
  collect: { marginTop: space.s5 },
  emptyPayments: { marginBottom: space.s2 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s4 },
  empty: { marginTop: space.s7 },

  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  sheetSecond: { marginTop: space.s2 },
  field: { marginBottom: space.s5 },

  skelButton: { marginTop: space.s5, borderRadius: 8 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
