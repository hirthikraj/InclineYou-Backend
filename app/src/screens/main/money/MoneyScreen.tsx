/**
 * Screen 06 · Money · FR-6.
 *
 * `agent/design system/screens/xrepmoney.html`.
 *
 * Nine platforms were torn down and every coaching one builds this screen as a
 * payment processor — a Stripe balance, payouts, failed charges. Train X can't
 * and shouldn't: the money arrives as cash in a gym, UPI straight into the
 * trainer's own bank, or at the gym's counter. So this is a **book, not a
 * dashboard**, and the right thing to copy is not Stripe. It's OkCredit — the
 * digital bahi khata ten million Indian shopkeepers already understand.
 *
 * Two figures above the fold, then the line no western app has: your share.
 * Then three people to chase, then the ledger. Nothing here holds, moves or
 * confirms money, and every screen that could imply otherwise says so instead.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import type { AppTabsParamList } from '../../../navigation/AppTabs';
import { useShell } from '../../../navigation/AppShell';
import { useMoney } from '../../../money/useMoney';
import {
  buildMonth,
  buildMonths,
  buildYear,
  monthKey,
  rupees,
  rupeesShort,
  signed,
  startOfMonthAt,
  type ChaseRow,
  type LedgerEntry,
} from '../../../money/money';
import { logReminder, recordPayment, undoPayment } from '../../../db/money';
import { useSyncState } from '../../../db/useSync';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Avatar,
  Banner,
  Button,
  Callout,
  CalloutStrong,
  Empty,
  Figures,
  GroupHead,
  Gst,
  IconButton,
  IconCalendar,
  IconCheck,
  IconCloudOff,
  IconDownload,
  IconMenu,
  IconPlus,
  IconShield,
  IconWallet,
  Ledger,
  LedgerRow,
  List,
  Months,
  Reveal,
  Row,
  Segmented,
  ShareRow,
  Stat,
  StatRail,
  Toast,
  YearBars,
  colors,
  space,
} from '../../../design';
import MoneySkeleton from './MoneySkeleton';
import RecordSheet, { type RecordResult } from './RecordSheet';
import ReceiptSheet, { type ReceiptDetails } from './ReceiptSheet';
import RemindSheet from './RemindSheet';
import UpiSheet from './UpiSheet';
import ExportSheet from './ExportSheet';
import EntryMenu, { type EntryMenuKey } from './EntryMenu';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type View2 = 'month' | 'year';

const VIEWS = [
  { key: 'month' as const, label: 'Month' },
  { key: 'year' as const, label: 'Year' },
];

export default function MoneyScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<AppTabsParamList, 'MoneyTab'>>();
  const shell = useShell();
  const focused = useIsFocused();
  const { trainerId } = useAuth();
  const network = useNetworkState();
  const { pendingCount } = useSyncState();
  const { input, now, ready } = useMoney(focused);

  const [anchor, setAnchor] = useState(() => startOfMonthAt(Date.now()));
  const [view, setView] = useState<View2>('month');
  const [recording, setRecording] = useState<{ clientId?: string; packageId?: string } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null);
  const [remind, setRemind] = useState<ChaseRow | null>(null);
  const [upi, setUpi] = useState<ChaseRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState<LedgerEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const scroller = useRef<ScrollView>(null);

  /**
   * The + sheet's "Record a payment" lands here with the sheet already open.
   *
   * An effect rather than an initial state, because the tab is already mounted
   * whenever the + is pressed from anywhere in the app — a navigate to a live
   * screen changes its params and nothing else. The param is cleared once
   * consumed, or coming back to the tab later would reopen the sheet.
   */
  const wantsRecord = route.params?.record === true;
  useEffect(() => {
    if (!wantsRecord) return;
    setRecording({});
    navigation.setParams({ record: undefined } as never);
  }, [wantsRecord, navigation]);

  const offline = network.isConnected === false || network.isInternetReachable === false;

  const month = useMemo(() => buildMonth(input, anchor, now), [input, anchor, now]);
  const months = useMemo(() => buildMonths(input, now), [input, now]);
  const year = useMemo(() => buildYear(input, anchor, now), [input, anchor, now]);

  const thisMonth = startOfMonthAt(now);
  // "No money in the book yet" replaces the whole screen, so it is the most
  // expensive thing here to get wrong for a frame.
  const nothingEver = ready && months.every((m) => m.billed === 0);

  /* ------------------------------------------------------------- tab press */

  useFocusEffect(
    useCallback(() => {
      // §06: tapping Money scrolls to top, then comes back to this month on a
      // second tap. Both belong to the screen, which is why the tab bar emits.
      const unsubscribe = (
        navigation as unknown as { addListener: (e: string, cb: () => void) => () => void }
      ).addListener('tabPress', () => {
        if (anchor !== thisMonth || view !== 'month') {
          setAnchor(thisMonth);
          setView('month');
        } else {
          scroller.current?.scrollTo({ y: 0, animated: true });
        }
      });
      return unsubscribe;
    }, [navigation, anchor, thisMonth, view]),
  );

  /* --------------------------------------------------------------- writing */

  const record = async (result: RecordResult) => {
    if (!trainerId) return;
    setRecording(null);
    const client = input.clients.find((c) => c.id === result.clientId);
    const pkg = input.packages.find((p) => p.id === result.packageId);
    try {
      const payment = await recordPayment({
        trainerId,
        clientId: result.clientId,
        packageId: result.packageId,
        amount: result.amount,
        method: result.method,
        gymShareAmount: result.gymShareAmount,
        sharePercent: result.sharePercent,
      });
      setReceipt({
        paymentId: payment.id,
        receiptNo: payment.receiptNo,
        clientName: client?.name ?? 'Client',
        phone: client?.phone ?? null,
        forWhat: pkg?.sessionsTotal ? `${pkg.sessionsTotal}-session pack` : 'Training',
        method: result.method,
        amount: result.amount,
        gymShare: result.gymShareAmount,
        at: Date.now(),
      });
    } catch {
      setNotice('Could not record that.');
    }
  };

  const undo = async () => {
    if (!receipt) return;
    const id = receipt.paymentId;
    setReceipt(null);
    try {
      await undoPayment(id);
      setNotice('Taken back. Nothing was recorded.');
    } catch {
      setNotice('Could not undo that.');
    }
  };

  const onEntry = (entry: LedgerEntry) => {
    if (entry.kind === 'settlement') {
      navigation.navigate('MoneyGym');
      return;
    }
    if (entry.clientId) navigation.navigate('MoneyBook', { clientId: entry.clientId });
  };

  const onMenu = (key: EntryMenuKey, entry: LedgerEntry) => {
    setMenu(null);
    if (key === 'undo' || key === 'delete') {
      void undoPayment(entry.id)
        .then(() => setNotice('Removed from the book.'))
        .catch(() => setNotice('Could not remove that.'));
      return;
    }
    if (entry.clientId) navigation.navigate('MoneyBook', { clientId: entry.clientId });
  };

  /* ---------------------------------------------------------------- header */

  const header = (
    <>
      {offline ? (
        <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
          {pendingCount > 0
            ? `Offline — the book is on this phone. ${pendingCount} change${
                pendingCount === 1 ? '' : 's'
              } waiting to sync.`
            : 'Offline — the book is on this phone. Recording still works.'}
        </Banner>
      ) : null}

      {months.length > 1 ? (
        <Months
          style={styles.months}
          selected={monthKey(anchor)}
          months={months.map((m) => ({ key: m.key, label: m.label, total: rupeesShort(m.billed) }))}
          onSelect={(key) => {
            const found = months.find((m) => m.key === key);
            if (found) setAnchor(found.at);
          }}
        />
      ) : null}

      <Segmented options={VIEWS} value={view} onChange={setView} style={styles.segmented} />
    </>
  );

  /* ------------------------------------------------------------ 1c · first run */

  if (nothingEver) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Money"
            subtitle="Nothing recorded yet"
            leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
          />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Empty
            icon={IconWallet}
            title="No money in the book yet"
            body="Train X doesn't take payments. It keeps the book — cash, UPI into your own account, or money the gym collected for you."
            style={styles.empty}
            action={
              <View style={styles.emptyActions}>
                <Button
                  label="Record a payment"
                  size="lg"
                  block
                  icon={IconPlus}
                  onPress={() => setRecording({})}
                />
                <Button
                  label="Set up a pack"
                  variant="ghost"
                  block
                  icon={IconWallet}
                  onPress={() => navigation.navigate('MoneyPacks')}
                />
              </View>
            }
          />
          <Callout icon={IconShield} style={styles.note}>
            Your UPI ID goes on reminders so clients can pay you directly.{' '}
            <CalloutStrong>The money never touches Train X</CalloutStrong>, which also means we
            never hold it, and there's nothing to withdraw.
          </Callout>
        </ScrollView>

        <RecordSheet
          visible={recording !== null}
          input={input}
          onRecord={(result) => void record(result)}
          onClose={() => setRecording(null)}
        />
        <ReceiptSheet
          visible={receipt !== null}
          receipt={receipt}
          gym={input.gym}
          onUndo={() => void undo()}
          onClose={() => setReceipt(null)}
        />
      </SafeAreaView>
    );
  }

  /* -------------------------------------------------------------- 5b · year */

  const yearBody = () => (
    <>
      <YearBars
        style={styles.year}
        bars={year.bars}
        onSelect={(key) => {
          const found = months.find((m) => m.key === key);
          if (found) {
            setAnchor(found.at);
            setView('month');
          }
        }}
      />
      <View style={styles.legend}>
        <Legend color={colors.accent} label="Collected" />
        <Legend color={colors.warn} label="Still owed" />
      </View>

      <StatRail style={styles.rail}>
        <Stat label="Best month" value={rupeesShort(year.best)} />
        <Stat label="Average" value={rupeesShort(year.average)} />
        <Stat label="Written off" value={rupeesShort(year.writtenOff)} tone={year.writtenOff > 0 ? 'warn' : 'default'} />
      </StatRail>

      <Gst
        style={styles.gst}
        turnover={rupeesShort(year.gst.turnover)}
        projected={rupeesShort(year.gst.projected)}
        fraction={year.gst.fraction}
        near={year.gst.near}
        fromLabel={year.gst.fromLabel}
        note={year.gst.note}
      />

      <Button
        label="Export the year for your CA"
        variant="ghost"
        block
        icon={IconDownload}
        style={styles.export}
        onPress={() => setExporting(true)}
      />
    </>
  );

  /* ------------------------------------------------------------- 1a · month */

  const monthBody = () => (
    <>
      <Figures
        style={styles.figures}
        collected={rupees(month.collected)}
        owed={rupees(month.owed)}
        collectedPart={month.parts.collected}
        owedPart={month.parts.owed}
        writtenOffPart={month.parts.writtenOff}
        onOwed={month.owed > 0 ? () => navigation.navigate('MoneyOwed') : undefined}
      />

      {month.hisaabClear ? (
        <Callout tone="accent" icon={IconCheck} style={styles.clear}>
          <CalloutStrong tone="accent">Hisaab clear.</CalloutStrong> Every client is paid up for{' '}
          {month.label}.
        </Callout>
      ) : null}

      {month.share ? (
        <ShareRow
          style={styles.share}
          yours={rupees(month.share.yours)}
          fraction={month.share.collected > 0 ? month.share.yours / month.share.collected : 1}
          onPress={() => navigation.navigate('MoneyGym')}
        />
      ) : null}

      {month.chase.length > 0 ? (
        <>
          <GroupHead
            label="Needs chasing"
            count={month.chase.length}
            tone="alert"
            style={styles.head}
            onPress={() => navigation.navigate('MoneyOwed')}
          />
          <List>
            {month.chase.slice(0, 3).map((row) => (
              <Row
                key={row.packageId}
                grouped
                severity={row.severity}
                title={row.name}
                subtitle={`${rupees(row.amount)} · ${
                  row.late > 0 ? `${row.late} days late` : 'due today'
                }`}
                leading={<Avatar name={row.name} size="sm" />}
                trailing={
                  <Button label="Remind" size="sm" variant="ghost" onPress={() => setRemind(row)} />
                }
                onPress={() => navigation.navigate('MoneyBook', { clientId: row.clientId })}
              />
            ))}
          </List>
        </>
      ) : null}

      <GroupHead label={month.ledgerLabel} count={month.ledger.length} style={styles.head} />
      {month.ledger.length === 0 ? (
        <Text style={styles.blank}>Nothing came in or went out this month.</Text>
      ) : (
        <Ledger>
          {month.ledger.map((entry) => (
            <LedgerRow
              key={entry.id}
              direction={entry.direction}
              title={entry.title}
              detail={entry.detail}
              amount={signed(entry.amount, entry.direction)}
              note={entry.note}
              settled={entry.settled}
              onPress={() => onEntry(entry)}
              onLongPress={entry.kind === 'payment' ? () => setMenu(entry) : undefined}
            />
          ))}
        </Ledger>
      )}

      <Gst
        style={styles.gst}
        turnover={rupeesShort(year.gst.turnover)}
        projected={rupeesShort(year.gst.projected)}
        fraction={year.gst.fraction}
        near={year.gst.near}
        fromLabel={year.gst.fromLabel}
        note={year.gst.note}
        onPress={() => setView('year')}
      />
    </>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Money"
          subtitle={view === 'year' ? year.subtitle : month.subtitle}
          leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
          actions={
            <>
              <IconButton
                icon={IconCalendar}
                label="Back to this month"
                bare
                onPress={() => {
                  setAnchor(thisMonth);
                  setView('month');
                }}
              />
              <IconButton
                icon={IconDownload}
                label="Export"
                bare
                onPress={() => setExporting(true)}
              />
            </>
          }
        />
      </View>

      <ScrollView ref={scroller} contentContainerStyle={styles.body}>
        {/* The month strip and the switcher are built from the same unread
            tables, so on a cold read the skeleton replaces the whole body
            rather than sitting under a strip of empty chips. */}
        <Reveal ready={ready} skeleton={<MoneySkeleton share={input.gym.name !== null} />}>
          {header}
          <View style={styles.viewBody}>{view === 'year' ? yearBody() : monthBody()}</View>
        </Reveal>
      </ScrollView>

      <RecordSheet
        visible={recording !== null}
        input={input}
        clientId={recording?.clientId}
        packageId={recording?.packageId}
        onRecord={(result) => void record(result)}
        onClose={() => setRecording(null)}
      />
      <ReceiptSheet
        visible={receipt !== null}
        receipt={receipt}
        gym={input.gym}
        onUndo={() => void undo()}
        onClose={() => setReceipt(null)}
      />
      <RemindSheet
        visible={remind !== null}
        row={remind}
        gym={input.gym}
        onSent={(row) => {
          if (trainerId) void logReminder(trainerId, row.clientId);
          setRemind(null);
          setNotice(`Reminded ${row.name.split(' ')[0]}.`);
        }}
        onShowUpi={(row) => {
          setRemind(null);
          setUpi(row);
        }}
        onClose={() => setRemind(null)}
      />
      <UpiSheet
        visible={upi !== null}
        row={upi}
        gym={input.gym}
        onRecord={(row) => {
          setUpi(null);
          setRecording({ clientId: row.clientId, packageId: row.packageId });
        }}
        onClose={() => setUpi(null)}
      />
      <ExportSheet
        visible={exporting}
        input={input}
        anchor={anchor}
        onClose={() => setExporting(false)}
      />
      <EntryMenu entry={menu} onPick={onMenu} onClose={() => setMenu(null)} />

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

/** The year chart's key. Two entries, so it does not earn a component. */
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  banner: { marginBottom: space.s2 },
  months: { marginTop: 10, marginHorizontal: -space.inset, paddingLeft: space.inset },
  segmented: { marginTop: space.s3 },
  viewBody: { marginTop: space.s4 },

  figures: { marginBottom: space.s2 },
  clear: { marginTop: space.s3 },
  share: { marginTop: 10 },
  head: { marginHorizontal: -space.inset, marginTop: space.s2 },
  blank: { fontSize: 13, color: colors.ink3, paddingVertical: space.s3 },
  gst: { marginTop: space.s4 },

  year: { marginBottom: space.s2 },
  legend: { flexDirection: 'row', gap: space.s5, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 7, height: 7, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: '600', color: colors.ink2 },
  rail: { marginTop: space.s4 },
  export: { marginTop: space.s3 },

  empty: { marginTop: 20 },
  emptyActions: { gap: space.s2, width: 290 },
  note: { marginTop: space.s6 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
