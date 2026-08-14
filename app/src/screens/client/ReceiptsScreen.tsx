/**
 * Screen 5c · What you've paid.
 *
 * The same receipt component, the same number range and the same honest footer as
 * the trainer's copy — because it **is** his copy. Receipt numbers are minted
 * locally from a device-scoped range, so the number on her phone and the number on
 * his are the same string, arrived at offline.
 *
 * "Not a tax invoice" is not hedging: a trainer under the ₹20 lakh GST line issues
 * a numbered receipt, and printing GSTIN language on it would be a claim neither
 * of them can support.
 */

import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import { buildPayments, coachFirstName } from '../../client/client';
import { whatsappUri } from '../../money/money';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Empty,
  IconBack,
  IconButton,
  IconRupee,
  IconShare,
  List,
  Receipt,
  ReceiptRow,
  Row,
  SectionHead,
  Tag,
  colors,
  space,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;

export default function ReceiptsScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);
  const [at] = useState(() => Date.now());

  const view = useMemo(
    () => (clientId ? buildPayments(input, clientId, at) : null),
    [input, clientId, at],
  );

  if (!clientId || !view) return null;

  const first = coachFirstName(view.coach);
  const earlier = view.receipts.slice(1);

  const share = () => {
    if (!view.latest) return;
    void Share.share({
      message: [
        `Receipt ${view.latest.receiptNo}`,
        `${view.latest.amount} — ${view.latest.forWhat}`,
        `Paid to ${view.latest.paidTo} · ${view.latest.method}`,
        view.latest.when,
        'Not a tax invoice.',
      ].join('\n'),
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="What you've paid"
          subtitle={view.since ? `${view.allTime} since ${view.since}` : view.allTime}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {view.latest ? (
          <>
            <SectionHead label="Latest receipt" first />
            <Receipt>
              <ReceiptRow label="Paid to" value={view.latest.paidTo} />
              <ReceiptRow label="For" value={view.latest.forWhat} />
              <ReceiptRow label="Method" value={view.latest.method} />
              <ReceiptRow label="Date" value={view.latest.when} />
              <ReceiptRow label="Receipt no." value={view.latest.receiptNo} />
              <ReceiptRow label="Received" value={view.latest.amount} total />
            </Receipt>

            <View style={styles.actions}>
              <Button
                label="Share"
                icon={IconShare}
                variant="secondary"
                onPress={share}
                style={styles.action}
              />
              <Button
                label={`Ask ${first}`}
                variant="ghost"
                onPress={() => {
                  const uri = whatsappUri(
                    view.coach?.phone ?? null,
                    `Hi ${first}, a question about receipt ${view.latest?.receiptNo} —`,
                  );
                  if (uri) void Linking.openURL(uri);
                }}
                style={styles.action}
              />
            </View>
            <Text style={styles.footnote}>
              Not a tax invoice. {first} is under the ₹20 lakh GST line, so a numbered receipt is
              all that&apos;s required.
            </Text>
          </>
        ) : (
          <Empty
            icon={IconRupee}
            title="No receipts yet"
            body={`Every receipt here is issued by ${first}. One appears as soon as they mark a payment received.`}
            style={styles.empty}
          />
        )}

        {earlier.length ? (
          <>
            <SectionHead label="Earlier" count={earlier.length} />
            <List style={styles.group}>
              {earlier.map((receipt) => (
                <Row
                  key={receipt.id}
                  grouped
                  title={receipt.amount}
                  subtitle={[receipt.receiptNo, receipt.short].filter(Boolean).join(' · ')}
                  trailing={<Tag label="Paid" tone="ok" />}
                />
              ))}
            </List>
          </>
        ) : null}

        <Callout style={styles.note}>
          Every receipt here was issued by {first}. If a payment you made is missing,{' '}
          <CalloutStrong>message them</CalloutStrong> — XRep can&apos;t see either of your bank
          accounts.
        </Callout>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  actions: { flexDirection: 'row', gap: space.s2, marginTop: space.s3 },
  action: { flex: 1 },
  footnote: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: space.s3 },

  group: { marginBottom: space.s2 },
  note: { marginTop: space.s3 },
  empty: { marginTop: space.s6 },
});
