/**
 * Screen 06 · Money · FR-6.
 *
 * `agent/design system/screens/inclineyoumoney.html`.
 *
 * Nine platforms were torn down and every coaching one builds this screen as a
 * payment processor — a Stripe balance, payouts, failed charges. InclineYou can't
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
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  dueLabel,
  monthKey,
  rupees,
  rupeesShort,
  signed,
  startOfMonthAt,
  type ChaseRow,
  type LedgerEntry,
} from '../../../money/money';
import { logReminder, recordPayment, undoPayment } from '../../../db/money';
import { syncDatabase } from '../../../db/sync';
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
  Legend,
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
/**
 * Which half of the book is showing. §06's tap map: "Collected figure — tap —
 * filters the ledger to money in." A filter rather than a navigation, because
 * the question it answers is about the rows already on the screen.
 */
type Flow = 'all' | 'in';

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
  const { pendingCount, phase } = useSyncState();
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
  const [flow, setFlow] = useState<Flow>('all');

  const scroller = useRef<ScrollView>(null);
  /**
   * §06: "Year / Month toggle — switches the whole screen. Each remembers its
   * scroll." One ScrollView serves both, so the offsets are parked here and put
   * back on the switch — otherwise coming back from the year chart drops you
   * wherever the year happened to be, halfway down a ledger you never left.
   */
  const offsets = useRef<Record<View2, number>>({ month: 0, year: 0 });
  const offset = useRef(0);

  const swap = (next: View2) => {
    if (next === view) return;
    offsets.current[view] = offset.current;
    setView(next);
    const back = offsets.current[next];
    // After the new body has laid out, or there is nothing yet to scroll to.
    requestAnimationFrame(() => scroller.current?.scrollTo({ y: back, animated: false }));
  };

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

  // A filter that outlives the month it was applied to is a screen lying about
  // what it shows — the trainer moved to July and never asked to keep money out
  // hidden there.
  useEffect(() => setFlow('all'), [anchor]);

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
          offsets.current = { month: 0, year: 0 };
          scroller.current?.scrollTo({ y: 0, animated: true });
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

  /**
   * A ledger line, reopened as the receipt it came from.
   *
   * `undoable` is carried through rather than assumed: the sheet's Undo is a
   * real delete, and §06 allows it for 24 hours. A receipt opened from three
   * months back must not hand a trainer that button.
   */
  const receiptFor = (entry: LedgerEntry): ReceiptDetails | null => {
    const payment = input.payments.find((p) => p.id === entry.id);
    if (!payment) return null;
    const client = input.clients.find((c) => c.id === payment.clientId);
    const pkg = input.packages.find((p) => p.id === payment.packageId);
    return {
      paymentId: payment.id,
      receiptNo: payment.receiptNo ?? '—',
      clientName: client?.name ?? entry.title,
      phone: client?.phone ?? null,
      forWhat: pkg?.sessionsTotal ? `${pkg.sessionsTotal}-session pack` : 'Training',
      method: payment.method,
      upiReference: payment.upiReference ?? null,
      amount: payment.amount,
      gymShare: payment.gymShareAmount ?? 0,
      at: entry.at,
      undoable: entry.undoable === true,
    };
  };

  // §06's tap map: an entry opens its receipt. It opened the client's whole
  // book instead, which is what the long-press menu is for.
  const onEntry = (entry: LedgerEntry) => {
    if (entry.kind === 'settlement') {
      navigation.navigate('MoneyGym');
      return;
    }
    if (entry.kind === 'payment') {
      const details = receiptFor(entry);
      if (details) {
        setReceipt(details);
        return;
      }
    }
    if (entry.clientId) navigation.navigate('MoneyBook', { clientId: entry.clientId });
  };

  const onMenu = (key: EntryMenuKey, entry: LedgerEntry) => {
    setMenu(null);

    if (key === 'undo' || key === 'delete') {
      // §06, twice over: "Delete asks, always." A deleted payment shortens a
      // client's pack, so this is the one gesture on the screen that interrupts
      // — and it was going straight through without a word.
      Alert.alert(
        key === 'undo' ? 'Undo this payment?' : 'Delete this entry?',
        'It comes out of the book, and their pack goes back to what it was before.',
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: key === 'undo' ? 'Undo' : 'Delete',
            style: 'destructive',
            onPress: () => {
              void undoPayment(entry.id)
                .then(() => setNotice('Removed from the book.'))
                .catch(() => setNotice('Could not remove that.'));
            },
          },
        ],
      );
      return;
    }

    // Two verbs that both silently navigated to the client's book — and did
    // nothing at all on an entry with no client. Each says what it does now.
    if (key === 'receipt') {
      const details = receiptFor(entry);
      if (details) setReceipt(details);
      else setNotice('That entry has no receipt to send.');
      return;
    }
    if (key === 'edit') setNotice('Editing an entry is coming — undo and re-record for now.');
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
            if (!found) return;
            setAnchor(found.at);
            // §06: "Month chip — tap — loads that month." From the year view
            // that has to mean the month view too, or the chip moves its pill
            // and nothing else on the screen changes.
            setView('month');
          }}
        />
      ) : null}

      <Segmented options={VIEWS} value={view} onChange={swap} style={styles.segmented} />
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
            body="InclineYou doesn't take payments. It keeps the book — cash, UPI into your own account, or money the gym collected for you."
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
            <CalloutStrong>The money never touches InclineYou</CalloutStrong>, which also means we
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

  /** What the ledger is showing, once the Collected figure has had its say. */
  const rows = flow === 'in' ? month.ledger.filter((e) => e.direction === 'in') : month.ledger;
  /** Whether the chase list is hiding anyone behind its top three. */
  const hidden = month.chase.length - 3;
  /** Whether the calendar action has anywhere to bring you back from. */
  const away = anchor !== thisMonth || view !== 'month';

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
      {/* `ok` and `warn` — the same two the month's split bar uses. The chart
          read lime for "Collected" one toggle away from green for the same
          word, and lime on the light canvas is 1.5:1, under the 3:1 a chart
          has to clear. */}
      <Legend
        entries={[
          { key: 'in', label: 'Collected', color: colors.ok },
          { key: 'out', label: 'Still owed', color: colors.warn },
        ]}
      />

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
        onCollected={month.collected > 0 ? () => setFlow(flow === 'in' ? 'all' : 'in') : undefined}
        onOwed={month.owed > 0 ? () => navigation.navigate('MoneyOwed') : undefined}
      />

      {month.hisaabClear ? (
        <Callout tone="accent" icon={IconCheck} style={styles.clear}>
          <CalloutStrong tone="accent">Everything clear.</CalloutStrong> Every client is paid up for{' '}
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
          {/* Inert. It carried `onPress`, which draws GroupHead's collapse
              chevron — a glyph promising the rows fold away, on a header that
              left the screen instead. The way to the rest is the button below. */}
          <GroupHead
            label="Needs chasing"
            count={month.chase.length}
            tone="alert"
            style={styles.head}
          />
          <List>
            {month.chase.slice(0, 3).map((row) => (
              <Row
                key={row.packageId}
                grouped
                severity={row.severity}
                title={row.name}
                // `dueLabel`, not a hand-rolled ternary: that one said "1 days
                // late", and said "due today" about a pack due next Friday.
                subtitle={`${rupees(row.amount)} · ${dueLabel(row.dueAt, now)}`}
                leading={<Avatar name={row.name} size="sm" />}
                trailing={
                  <Button label="Remind" size="sm" variant="ghost" onPress={() => setRemind(row)} />
                }
                onPress={() => navigation.navigate('MoneyBook', { clientId: row.clientId })}
              />
            ))}
          </List>
          {/* The header counts twelve and the list shows three. Without this the
              other nine are a number with no door. */}
          {hidden > 0 ? (
            <Button
              label={`See all ${month.chase.length} who owe you`}
              variant="ghost"
              block
              style={styles.seeAll}
              onPress={() => navigation.navigate('MoneyOwed')}
            />
          ) : null}
        </>
      ) : null}

      <GroupHead
        label={flow === 'in' ? `${month.ledgerLabel} · money in` : month.ledgerLabel}
        count={rows.length}
        style={styles.head}
      />
      {/* A filter with no visible way out is a screen a trainer reads as broken.
          Tapping Collected again clears it, and so does this. */}
      {flow === 'in' ? (
        <Button
          label="Show everything"
          variant="ghost"
          block
          style={styles.seeAll}
          onPress={() => setFlow('all')}
        />
      ) : null}
      {rows.length === 0 ? (
        <Text style={styles.blank}>
          {flow === 'in'
            ? 'No money came in this month.'
            : 'Nothing came in or went out this month.'}
        </Text>
      ) : (
        <Ledger>
          {rows.map((entry) => (
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
              {/* Only when there is somewhere to come back from. It used to sit
                  there on this month, in month view, doing nothing at all. */}
              {away ? (
                <IconButton
                  icon={IconCalendar}
                  label="Back to this month"
                  bare
                  onPress={() => {
                    setAnchor(thisMonth);
                    setView('month');
                    offsets.current = { month: 0, year: 0 };
                    scroller.current?.scrollTo({ y: 0, animated: true });
                  }}
                />
              ) : null}
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

      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.body}
        scrollEventThrottle={64}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
        }}
        refreshControl={
          // The book is local and always current; what a pull actually asks for
          // is "push what's queued and pull what the rest of my devices did".
          // Offline it is a no-op, so it says so rather than spinning.
          <RefreshControl
            refreshing={phase === 'syncing'}
            tintColor={colors.ink3}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
            onRefresh={() => {
              if (offline) {
                setNotice('Still offline. Everything you record is saved on this phone.');
                return;
              }
              void syncDatabase('money-pull').catch(() => setNotice('Could not sync just now.'));
            }}
          />
        }
      >
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
        <Toast
          style={styles.toast}
          duration={4200}
          onDismiss={() => setNotice(null)}
          action={{ label: 'Dismiss', onPress: () => setNotice(null) }}
        >
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
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
  seeAll: { marginTop: space.s2 },

  year: { marginBottom: space.s2 },
  rail: { marginTop: space.s4 },
  export: { marginTop: space.s3 },

  empty: { marginTop: 20 },
  // Was a fixed 290px. Inside the screen inset (20) and Empty's own padding
  // (20) that overflows every phone narrower than 370dp — an iPhone SE clipped
  // the first button a new trainer ever sees.
  emptyActions: { gap: space.s2, alignSelf: 'stretch', maxWidth: 290 },
  note: { marginTop: space.s6 },
  // Absolute, not a flex child. Parked in the layout it shortened the scroll
  // view the moment it appeared, so recording a payment made the ledger behind
  // it jump — the one thing a book must never do.
  toast: {
    position: 'absolute',
    left: space.inset,
    right: space.inset,
    bottom: space.s3,
  },
});
