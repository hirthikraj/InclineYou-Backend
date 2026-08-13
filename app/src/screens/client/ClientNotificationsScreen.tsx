/**
 * The bell — a moved session, a new plan, a payment marked received, a Sunday
 * report.
 *
 * Derived from local rows rather than stored as a feed, which is the same choice
 * every other screen in this app makes: a notification here is a fact that already
 * exists somewhere else, described. That has one consequence worth stating — there
 * is no read/unread bookkeeping beyond "does this still need something from you",
 * because a feed with its own state is a second copy of the truth, and second
 * copies drift.
 *
 * Four kinds, and only the first is ever a job.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import { buildSessions, buildPayments, clock12, coachFirstName } from '../../client/client';
import {
  AppBar,
  Empty,
  IconBack,
  IconBell,
  IconButton,
  List,
  Notif,
  SectionHead,
  colors,
  space,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;

interface Line {
  id: string;
  subject?: string;
  body: string;
  time: string;
  unread: boolean;
  go: () => void;
}

export default function ClientNotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);
  const [at] = useState(() => Date.now());

  const first = coachFirstName(input.coach);

  const lines = useMemo<Line[]>(() => {
    if (!clientId) return [];
    const out: Line[] = [];

    const sessions = buildSessions(input, clientId, at);
    if (sessions.notice) {
      out.push({
        id: `moved-${sessions.notice.sessionId}`,
        subject: first,
        body: `moved a session to ${sessions.notice.to}. Confirm it in one tap — nothing is deducted.`,
        time: sessions.notice.at,
        unread: true,
        go: () => navigation.navigate('Sessions'),
      });
    }

    // A payment their trainer marked received. Newest three, and they are always
    // read: there is nothing for the client to do about a receipt.
    const payments = buildPayments(input, clientId, at);
    payments.receipts.slice(0, 3).forEach((receipt) => {
      out.push({
        id: `paid-${receipt.id}`,
        subject: first,
        body: `marked ${receipt.amount} received — ${receipt.detail}.`,
        time: receipt.detail.split(' · ').pop() ?? '',
        unread: false,
        go: () => navigation.navigate('Receipts'),
      });
    });

    // Sunday's report, if one has landed.
    const report = input.reports
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))[0];
    if (report) {
      out.push({
        id: `report-${report.id}`,
        body: `Your week is in: ${report.sessionsKept} of ${report.sessionsPlanned} kept, ${Math.round(report.volumeKg).toLocaleString('en-IN')} kg lifted.`,
        time: report.sentAt ? clock12(report.sentAt) : 'Sunday',
        unread: false,
        go: () => navigation.navigate('Week', { weekStart: report.weekStart }),
      });
    }

    return out;
  }, [input, clientId, at, first, navigation]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Notifications"
          subtitle={
            lines.some((l) => l.unread) ? 'One thing needs you' : `${lines.length} recent`
          }
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      {lines.length ? (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <SectionHead label="Recent" first />
          <List>
            {lines.map((line) => (
              <Notif
                key={line.id}
                subject={line.subject}
                body={line.body}
                time={line.time}
                read={!line.unread}
                onPress={line.go}
              />
            ))}
          </List>
        </ScrollView>
      ) : (
        <Empty
          icon={IconBell}
          title="Nothing new"
          body={`A moved session, a payment ${first} marks received, or Sunday's report will show up here.`}
          style={styles.empty}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  empty: { marginTop: space.s7 },
});
