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
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  tnum,
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
    if (key === 'receipt') setNotice('Open the entry to send its receipt.');
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
        <View style={styles.headline}>
          <View style={styles.figures}>
            <View>
              <Text style={styles.figLabel}>{book.owed > 0 ? 'They owe' : 'Balance'}</Text>
              <Text style={[styles.figValue, book.owed > 0 && styles.figWarn]}>
                {book.owed > 0 ? rupees(book.owed) : 'Clear'}
              </Text>
            </View>
            {/* A monthly client has no session count, and a lone em-dash under
                "sessions left" reads as a bug rather than as "not applicable". */}
            {book.sessionsLeft != null ? (
              <View style={styles.right}>
                <Text style={styles.figLabel}>Sessions left</Text>
                <Text style={styles.figValueSmall}>
                  {book.sessionsLeft}
                  {book.sessionsTotal ? (
                    <Text style={styles.figTotal}>{`/${book.sessionsTotal}`}</Text>
                  ) : null}
                </Text>
              </View>
            ) : monthly ? (
              <View style={styles.right}>
                <Text style={styles.figLabel}>Pack</Text>
                <Text style={styles.figValueSmall}>Monthly</Text>
              </View>
            ) : null}
          </View>

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
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
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

  headline: {
    marginTop: space.s3,
    padding: space.cardPad,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  figures: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  right: { alignItems: 'flex-end' },
  figLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 7,
  },
  figValue: { fontSize: 29, fontWeight: '800', letterSpacing: -1.02, color: colors.ink, ...tnum },
  figWarn: { color: colors.warn },
  figValueSmall: { fontSize: 23, fontWeight: '800', letterSpacing: -0.8, color: colors.ink, ...tnum },
  figTotal: { fontSize: 14, fontWeight: '700', color: colors.ink3 },
  actions: { flexDirection: 'row', gap: space.s2, marginTop: space.s4 },
  grow: { flex: 1 },
  remind: { flexGrow: 0, flexShrink: 0, flexBasis: 100 },

  head: { marginHorizontal: -space.inset, marginTop: space.s4 },
  writeOff: { marginTop: space.s4 },
  note: { marginTop: space.s4 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
