/**
 * Screens 18–24 · § 05 — Payments. A bill, not a book.
 *
 * The trainer's Money tab has two directions: payments in, the gym's cut out, a
 * running balance and a GST line. A client's has one, so this is not a ledger —
 * every row is a payment they made, and painting those as debits would put every
 * settled receipt in danger red, which in this system means overdue. Receipts are
 * green and tagged Paid.
 *
 * ── UPI Intent, never Collect ─────────────────────────────────────────────
 *
 * Intent runs at 92–95% success against Collect's 6–15 points lower, and NPCI's
 * February 2026 guidance restricts manual VPA entry on mobile anyway. So there is
 * **no field to type a VPA into**, on either side of this app, and the trainer's
 * own VPA is never printed: the deep link carries it and the client's UPI app
 * confirms his name before they authorise.
 *
 * InclineYou never holds, moves or confirms this money, and every screen that could
 * imply otherwise says so instead. "I paid cash" tells the trainer over WhatsApp;
 * the balance does not move until he marks it received, because we cannot read
 * anybody's bank and a wrong guess destroys the book.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import type { ClientTabsParamList } from '../../navigation/ClientTabs';
import { useShell } from '../../navigation/AppShell';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import { buildPayments, coachFirstName } from '../../client/client';
import { whatsappUri } from '../../money/money';
import PaySheet from './PaySheet';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Card,
  Chip,
  Coach,
  Empty,
  IconBell,
  IconButton,
  IconCash,
  IconChevron,
  IconMenu,
  IconRupee,
  List,
  Row,
  SectionHead,
  Seg,
  Tag,
  Toast,
  colors,
  space,
  tnum,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;
type Rt = RouteProp<ClientTabsParamList, 'PaymentsTab'>;

export default function PaymentsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const shell = useShell();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);

  const [payOpen, setPayOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [at] = useState(() => Date.now());

  const view = useMemo(
    () => (clientId ? buildPayments(input, clientId, at) : null),
    [input, clientId, at],
  );

  // Today's "₹9,000 due" row lands here with the sheet already open — the tap
  // was made with the intention already formed, one tap earlier.
  useEffect(() => {
    if (route.params?.pay) setPayOpen(true);
  }, [route.params?.pay]);

  if (!clientId || !view) return null;

  const coach = view.coach;
  const first = coachFirstName(coach);

  const message = (text: string) => {
    const uri = whatsappUri(coach?.phone ?? null, text);
    if (uri) void Linking.openURL(uri);
    else setNotice(`We don't have a number for ${first} on this phone.`);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Payments"
          subtitle={view.subtitle}
          leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
          actions={
            <IconButton
              icon={IconBell}
              label="Notifications"
              bare
              onPress={() => navigation.navigate('Notifications')}
            />
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* The trainer's screen leads with collected and still-owed; this leads
            with the same pair inverted, so the debt is never the only number. */}
        <Card>
          <View style={styles.pair}>
            <View>
              <Text style={styles.figLabel}>You owe</Text>
              <Text style={[styles.figValue, view.owed > 0 && styles.figWarn]}>
                {view.owedLabel}
              </Text>
            </View>
            <View style={styles.figRight}>
              <Text style={styles.figLabel}>Paid so far</Text>
              <Text style={styles.figValue}>{view.paidSoFar}</Text>
            </View>
          </View>
          {view.dueLine ? <Text style={styles.due}>{view.dueLine}</Text> : null}
        </Card>

        {view.owed > 0 ? (
          <>
            {/* The design's own 56px accent button, not a row wearing accent:
                a row's subtitle is ink3, and ink3 on the lime is a sentence
                nobody can read. The line under it says the same thing where
                there is contrast to say it in. */}
            <Button
              label={`Pay by UPI · ${view.owedLabel}`}
              icon={IconRupee}
              size="lg"
              block
              style={styles.upi}
              onPress={() => setPayOpen(true)}
            />
            <Text style={styles.quiet}>
              Opens GPay, PhonePe, Paytm — whichever you have. There is no UPI ID to type in, here
              or anywhere.
            </Text>

            <Seg style={styles.chips}>
              <Chip
                label="Pay part of it"
                onPress={() => setPayOpen(true)}
              />
              {/* A chip, not a primary: it tells them, it does not move the balance. */}
              <Chip
                label="I paid cash"
                icon={IconCash}
                onPress={() =>
                  message(
                    `Hi ${first}, I paid ${view.owedLabel} in cash. Could you mark it received?`,
                  )
                }
              />
            </Seg>

            <Callout style={styles.note}>
              {first} collects this themselves.{' '}
              <CalloutStrong>InclineYou never holds your money</CalloutStrong> — it keeps the book,
              which is why they mark each payment received.
            </Callout>
          </>
        ) : (
          <Callout tone="accent" style={styles.note}>
            <CalloutStrong>Nothing owing.</CalloutStrong> When {first} sells you the next pack it
            will show up here, with the date it is due.
          </Callout>
        )}

        {coach ? (
          <Coach
            label="You pay"
            name={coach.name}
            detail={coach.gymName}
            action={{
              label: `Ask ${first} about it`,
              onPress: () => message(`Hi ${first}, a question about my payments —`),
            }}
            onCall={coach.phone ? () => void Linking.openURL(`tel:${coach.phone}`) : undefined}
            style={styles.coach}
          />
        ) : null}

        <SectionHead
          label="What you've paid"
          count={view.receipts.length || undefined}
          action={
            view.receipts.length
              ? { label: 'Receipts', onPress: () => navigation.navigate('Receipts') }
              : undefined
          }
        />
        {view.receipts.length ? (
          <List style={styles.group}>
            {view.receipts.slice(0, 4).map((receipt) => (
              <Row
                key={receipt.id}
                grouped
                title={receipt.amount}
                subtitle={receipt.detail}
                onPress={() => navigation.navigate('Receipts')}
                trailing={
                  <View style={styles.receiptTail}>
                    <Tag label="Paid" tone="ok" />
                    <IconChevron size={18} color={colors.ink3} />
                  </View>
                }
              />
            ))}
          </List>
        ) : (
          <Empty
            compact
            icon={IconRupee}
            title="No receipts yet"
            body={`Every receipt here is issued by ${first}. Once they mark a payment received it appears, with its number.`}
          />
        )}
      </ScrollView>

      <PaySheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        view={view}
        coachFirst={first}
      />

      {notice ? (
        <View style={styles.toastDock} pointerEvents="box-none">
          <Toast action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>{notice}</Toast>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  pair: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  figRight: { alignItems: 'flex-end' },
  figLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  figValue: { fontSize: 30, fontWeight: '800', letterSpacing: -1.05, color: colors.ink, marginTop: 6, ...tnum },
  figWarn: { color: colors.warn },
  due: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: 14 },

  upi: { marginTop: space.s2 },
  quiet: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: 8 },
  chips: { marginTop: space.s3 },
  note: { marginTop: space.s3 },
  coach: { marginTop: space.s3 },

  group: { marginBottom: space.s2 },
  receiptTail: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },

  toastDock: { paddingHorizontal: space.inset, paddingBottom: space.s2 },
});
