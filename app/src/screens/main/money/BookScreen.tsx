/**
 * 4a · One client's book — the screen that settles an argument.
 *
 * A running balance in reverse-chronological order, with the pack that created
 * each debt and the payment that cleared it, and a balance marker wherever the
 * account came back to zero. This is the screen a trainer turns their phone
 * around to show somebody, which is why the markers matter: you can point at
 * the exact moment it was clear.
 *
 * The last line is the one that counts — "paid 4 of 5 packs on time". Context
 * before judgement.
 */

import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useMoney } from '../../../money/useMoney';
import {
  buildBook,
  buildChase,
  buildYear,
  outstanding,
  rupees,
  signed,
  type ChaseRow,
  type LedgerEntry,
} from '../../../money/money';
import { adjustDebt, recordPayment, undoPayment, writeOff } from '../../../db/money';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  BalanceMark,
  Button,
  Callout,
  Empty,
  Figures,
  GroupHead,
  IconBack,
  IconButton,
  IconChart,
  IconSend,
  IconWallet,
  Ledger,
  LedgerRow,
  Toast,
  colors,
  space,
} from '../../../design';
import RecordSheet, { type RecordResult } from './RecordSheet';
import ReceiptSheet, { type ReceiptDetails } from './ReceiptSheet';
import RemindSheet from './RemindSheet';
import WriteOffSheet, { type WriteOffChoice } from './WriteOffSheet';
import EntryMenu, { type EntryMenuKey } from './EntryMenu';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function BookScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainStackParamList, 'MoneyBook'>>();
  const focused = useIsFocused();
  const { trainerId } = useAuth();
  const { input, now, ready } = useMoney(focused);

  const clientId = route.params.clientId;

  const [recording, setRecording] = useState(route.params.record === true);
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null);
  const [remind, setRemind] = useState<ChaseRow | null>(null);
  const [writingOff, setWritingOff] = useState<ChaseRow | null>(null);
  const [menu, setMenu] = useState<LedgerEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const book = useMemo(() => buildBook(input, clientId, now), [input, clientId, now]);
  const chase = useMemo(
    () => buildChase(input, now).filter((r) => r.clientId === clientId),
    [input, now, clientId],
  );
  const year = useMemo(() => buildYear(input, now, now), [input, now]);

  if (!book) {
    // Two different situations that look identical: the tables have not been
    // read yet, or this client really is gone. Only the second one gets a
    // sentence — telling a trainer their client has vanished, for one frame,
    // every time they open the screen, is a lie the screen tells itself.
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Book"
            leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          />
        </View>
        {ready ? (
          <Empty icon={IconWallet} title="That client isn't here any more" style={styles.empty} />
        ) : null}
      </SafeAreaView>
    );
  }

  const record = async (result: RecordResult) => {
    if (!trainerId) return;
    setRecording(false);
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
      const pkg = input.packages.find((p) => p.id === result.packageId);
      setReceipt({
        paymentId: payment.id,
        receiptNo: payment.receiptNo,
        clientName: book.name,
        phone: book.phone,
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

  const decide = async (choice: WriteOffChoice) => {
    const row = writingOff;
    setWritingOff(null);
    if (!row) return;
    try {
      if (choice.kind === 'write-off') {
        await writeOff(row.packageId, row.amount);
        setNotice(`${rupees(row.amount)} written off. It stays in the book.`);
      } else if (choice.kind === 'adjust') {
        const pkg = input.packages.find((p) => p.id === row.packageId);
        const paid = pkg ? pkg.amount - outstanding(pkg, input.payments) : 0;
        await adjustDebt(row.packageId, paid + choice.amount);
        setNotice(`Changed to ${rupees(choice.amount)} owed. The pack shortened to match.`);
      }
    } catch {
      setNotice('Could not save that.');
    }
  };

  /** The payment behind a ledger line, as the receipt it was issued with. */
  const receiptFor = (entry: LedgerEntry): ReceiptDetails | null => {
    const payment = input.payments.find((p) => p.id === entry.id);
    if (!payment) return null;
    const pkg = input.packages.find((p) => p.id === payment.packageId);
    return {
      paymentId: payment.id,
      receiptNo: payment.receiptNo ?? '—',
      clientName: book?.name ?? entry.title,
      phone: book?.phone ?? null,
      forWhat: pkg?.sessionsTotal ? `${pkg.sessionsTotal}-session pack` : 'Training',
      method: payment.method,
      upiReference: payment.upiReference ?? null,
      amount: payment.amount,
      gymShare: payment.gymShareAmount ?? 0,
      at: entry.at,
      // Undo is a real delete and §06 allows it for 24 hours. An old line
      // opens as a receipt to send, not as a payment to erase.
      undoable: entry.undoable === true,
    };
  };

  const openEntry = (entry: LedgerEntry) => {
    const details = receiptFor(entry);
    if (details) setReceipt(details);
    else if (entry.kind === 'debt') setNotice('That line is a pack sold, not a payment received.');
  };

  const onMenu = async (key: EntryMenuKey, entry: LedgerEntry) => {
    setMenu(null);
    if (key === 'undo' || key === 'delete') {
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
    // Was "Open the entry to send its receipt" — advice about a gesture that
    // did nothing. It opens the receipt.
    if (key === 'receipt') {
      const details = receiptFor(entry);
      if (details) setReceipt(details);
      else setNotice('That entry has no receipt to send.');
    }
    if (key === 'edit') setNotice('Editing an entry is coming — undo and re-record for now.');
  };

  const owedRow = chase[0] ?? null;
  const monthly = input.packages.some(
    (p) => p.clientId === clientId && p.status === 'active' && p.type === 'monthly',
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={book.name}
          subtitle={book.subtitle}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            owedRow ? (
              <IconButton icon={IconSend} label="Send a reminder" bare onPress={() => setRemind(owedRow)} />
            ) : null
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* `Figures`, not a private copy of it. § 09 asks for the same pair with
            the same numbers as the top of the money screen, and the component
            carries `labels`, `tones`, `owedSuffix` and `bar={false}` for this
            exact caller — the redrawn version here had drifted into its own
            metrics and could not stack under large text.

            The right-hand figure always says something now. A client with no
            pack used to get a blank half-card, which reads as a rendering bug
            rather than as "nothing sold yet". */}
        <Figures
          style={styles.headline}
          bar={false}
          collectedPart={0}
          owedPart={0}
          labels={[
            book.owed > 0 ? 'They owe' : 'Balance',
            book.sessionsLeft != null ? 'Sessions left' : 'Pack',
          ]}
          tones={[book.owed > 0 ? 'warn' : 'ok', 'plain']}
          collected={book.owed > 0 ? rupees(book.owed) : 'Clear'}
          owed={
            book.sessionsLeft != null
              ? String(book.sessionsLeft)
              : monthly
                ? 'Monthly'
                : 'None yet'
          }
          owedSuffix={
            book.sessionsLeft != null && book.sessionsTotal
              ? `/${book.sessionsTotal}`
              : undefined
          }
        />

        <View style={styles.actions}>
          <Button label="Record payment" style={styles.grow} onPress={() => setRecording(true)} />
          {owedRow ? (
            // No icon and a tighter basis: "Record payment" is a 14-character
            // uppercase label and it truncates if this side takes any more.
            <Button
              label="Remind"
              variant="ghost"
              style={styles.remind}
              onPress={() => setRemind(owedRow)}
            />
          ) : null}
        </View>

        <GroupHead label="The book" style={styles.head} />
        {book.rows.length === 0 ? (
          <Empty
            icon={IconWallet}
            compact
            title="Nothing in the book yet"
            body="No packs sold, no payments recorded."
          />
        ) : (
          <Ledger>
            {book.rows.map((row) =>
              row.kind === 'balance' ? (
                <BalanceMark
                  key={row.mark.id}
                  label={row.mark.label}
                  value={row.mark.value}
                  clear={row.mark.clear}
                />
              ) : (
                <LedgerRow
                  key={row.entry.id}
                  direction={row.entry.direction}
                  title={row.entry.title}
                  detail={row.entry.detail}
                  amount={signed(row.entry.amount, row.entry.direction)}
                  note={row.entry.note}
                  settled={row.entry.settled}
                  // §06: an entry opens its receipt. Every row in this book was
                  // tap-inert — only long-press did anything — so the ordinary
                  // gesture on the ordinary target was silently nothing.
                  onPress={() => openEntry(row.entry)}
                  onLongPress={
                    row.entry.kind === 'payment' ? () => setMenu(row.entry) : undefined
                  }
                />
              ),
            )}
          </Ledger>
        )}

        {owedRow ? (
          <Button
            label="It's not coming — write it off"
            variant="ghost"
            block
            style={styles.writeOff}
            onPress={() => setWritingOff(owedRow)}
          />
        ) : null}

        {book.record ? (
          <Callout icon={IconChart} style={styles.note}>
            {`${book.name.split(' ')[0]} has ${book.record}`}
          </Callout>
        ) : null}
      </ScrollView>

      <RecordSheet
        visible={recording}
        input={input}
        clientId={clientId}
        packageId={owedRow?.packageId}
        onRecord={(result) => void record(result)}
        onClose={() => setRecording(false)}
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
        onSent={() => {
          setRemind(null);
          setNotice('Reminder sent.');
        }}
        onShowUpi={() => setRemind(null)}
        onClose={() => setRemind(null)}
      />
      <WriteOffSheet
        visible={writingOff !== null}
        row={writingOff}
        sessionsLeft={book.sessionsLeft}
        writtenOffSoFar={year.writtenOff}
        onChoose={(choice) => void decide(choice)}
        onClose={() => setWritingOff(null)}
      />
      <EntryMenu entry={menu} onPick={(key, entry) => void onMenu(key, entry)} onClose={() => setMenu(null)} />

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
  empty: { marginTop: space.s7 },

  headline: { marginTop: space.s3 },
  actions: { flexDirection: 'row', gap: space.s2, marginTop: space.s3 },
  grow: { flex: 1 },
  remind: { flexGrow: 0, flexShrink: 0, flexBasis: 100 },

  head: { marginHorizontal: -space.inset, marginTop: space.s4 },
  writeOff: { marginTop: space.s4 },
  note: { marginTop: space.s4 },
  toast: { position: 'absolute', left: space.inset, right: space.inset, bottom: space.s3 },
});
