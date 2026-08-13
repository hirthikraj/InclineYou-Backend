/**
 * 2a · Still owed — the chase list.
 *
 * Sorted by how LATE, not by how much. A ₹3,000 debt eleven days old is a worse
 * problem than a ₹9,000 one due tomorrow, and sorting by amount puts them the
 * wrong way round.
 *
 * "Reminded twice" sits on the row, because after the amount that is the most
 * useful fact there is: whether you have already asked.
 *
 * "Remind all" opens three separate chats, one after another, each with its own
 * name and amount. **Never a group message about money** — the debt is small,
 * the relationship is personal, and a broadcast costs clients.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useMoney } from '../../../money/useMoney';
import { buildChase, rupees, type ChaseRow } from '../../../money/money';
import { logReminder } from '../../../db/money';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Avatar,
  Button,
  Callout,
  Empty,
  IconBack,
  IconButton,
  IconMessage,
  IconSend,
  IconWallet,
  List,
  Row,
  Tally,
  Toast,
  colors,
  space,
} from '../../../design';
import RemindSheet from './RemindSheet';
import UpiSheet from './UpiSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function OwedScreen() {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const { trainerId } = useAuth();
  const { input, now, ready } = useMoney(focused);

  const [remind, setRemind] = useState<ChaseRow | null>(null);
  const [upi, setUpi] = useState<ChaseRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => buildChase(input, now), [input, now]);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const late = rows.filter((r) => r.late > 0);
  const lateTotal = late.reduce((sum, r) => sum + r.amount, 0);
  const oldest = rows.reduce((max, r) => Math.max(max, r.late), 0);

  const sent = (row: ChaseRow) => {
    if (trainerId) void logReminder(trainerId, row.clientId);
    setRemind(null);
    setNotice(`Reminded ${row.name.split(' ')[0]}.`);
  };

  /**
   * One chat at a time. The list is walked by opening the first, and the sheet
   * that follows carries the next — anything that fires three intents at once
   * loses two of them to the OS.
   */
  const remindAll = () => {
    const first = rows.find((r) => r.phone);
    if (!first) {
      setNotice('None of them have a phone number saved.');
      return;
    }
    setRemind(first);
  };

  const reachable = rows.filter((r) => r.phone).length;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Still owed"
          subtitle={
            rows.length === 0
              ? 'Nothing outstanding'
              : `${rupees(total)} across ${rows.length} client${rows.length === 1 ? '' : 's'}`
          }
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            rows.length > 0 ? (
              <IconButton icon={IconSend} label="Remind everyone" bare onPress={remindAll} />
            ) : null
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {rows.length === 0 && ready ? (
          <Empty
            icon={IconWallet}
            title="Hisaab clear"
            body="Every client is paid up. Nothing to chase."
            style={styles.empty}
          />
        ) : (
          <>
            <Tally
              style={styles.tally}
              items={[
                { key: 'late', value: rupees(lateTotal), label: 'late', tone: 'warn' },
                { key: 'due', value: rupees(total - lateTotal), label: 'due' },
                { key: 'oldest', value: `${oldest}d`, label: 'oldest' },
              ]}
            />

            <List>
              {rows.map((row) => (
                <Row
                  key={row.packageId}
                  grouped
                  minHeight={72}
                  // The detail is three facts, not a label — amount, how late,
                  // and whether you have already asked. It has to wrap.
                  wrap
                  title={row.name}
                  subtitle={row.detail}
                  severity={row.severity}
                  leading={<Avatar name={row.name} size="sm" />}
                  trailing={
                    <Button
                      label="Remind"
                      size="sm"
                      variant="ghost"
                      onPress={() => setRemind(row)}
                    />
                  }
                  onPress={() =>
                    navigation.navigate('MoneyBook', { clientId: row.clientId })
                  }
                />
              ))}
            </List>

            {reachable > 0 ? (
              <Button
                label={`Remind all ${reachable} on WhatsApp`}
                size="lg"
                block
                icon={IconSend}
                style={styles.all}
                onPress={remindAll}
              />
            ) : null}

            <Callout icon={IconMessage} style={styles.note}>
              Separate chats, each with their own name, amount and your UPI link. Never a group
              message about money.
            </Callout>
          </>
        )}
      </ScrollView>

      <RemindSheet
        visible={remind !== null}
        row={remind}
        gym={input.gym}
        onSent={sent}
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
          navigation.navigate('MoneyBook', { clientId: row.clientId, record: true });
        }}
        onClose={() => setUpi(null)}
      />

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
  tally: { marginTop: space.s3, marginBottom: space.s4 },
  empty: { marginTop: space.s7 },
  all: { marginTop: space.s4 },
  note: { marginTop: space.s3 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
