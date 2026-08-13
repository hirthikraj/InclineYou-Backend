/**
 * Screens 18–24 · § 04 — Your sessions. Four rows, and one that changed.
 *
 * A client's schedule is not a diary: no day strip, no week view, no month grid,
 * no agenda gutter. Those exist on the trainer's side because a split shift across
 * 27 people needs them. Here it is a pack, then the sessions that are left, in
 * order — and the pack carries the number that actually matters, 4 of 24, and the
 * date the last one falls on.
 *
 * ── What a client cannot do ───────────────────────────────────────────────
 *
 * Move, cancel or no-show. All three change somebody else's working day and two
 * of them move a pack. Their half of a reschedule is one WhatsApp with a new time
 * and a one-tap confirm — and the sentence that has to be on that card is
 * **nothing is deducted for a move**, because a client who thinks a reschedule
 * cost them a session will ask, and asking is the failure this screen prevents.
 *
 * No swipe actions anywhere: every swipe on a trainer's session row changes that
 * session, and none of those changes are a client's to make.
 */

import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import { buildSessions, coachFirstName } from '../../client/client';
import { confirmMove } from '../../db/clientWrites';
import { whatsappUri } from '../../money/money';
import {
  AppBar,
  Bar,
  Button,
  Callout,
  CalloutStrong,
  Card,
  Coach,
  Empty,
  IconBack,
  IconButton,
  IconCalendar,
  IconCheck,
  Legend,
  List,
  Notice,
  Row,
  RowTime,
  SectionHead,
  Tag,
  Toast,
  colors,
  space,
  tnum,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;

export default function SessionsScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);

  const [at] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const view = useMemo(
    () => (clientId ? buildSessions(input, clientId, at) : null),
    [input, clientId, at],
  );

  if (!clientId || !view) return null;

  const coach = view.coach;
  const first = coachFirstName(coach);
  const message = (text: string) => {
    const uri = whatsappUri(coach?.phone ?? null, text);
    if (uri) void Linking.openURL(uri);
    else setToast(`We don't have a number for ${first} on this phone.`);
  };

  const confirm = async () => {
    if (!view.notice || confirming) return;
    setConfirming(true);
    try {
      await confirmMove(view.notice.sessionId);
      setToast('Confirmed. Nothing was deducted.');
      message(`Hi ${first}, ${view.notice.to} works for me — confirmed.`);
    } finally {
      setConfirming(false);
    }
  };

  const pack = view.pack;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Your sessions"
          subtitle={view.subtitle}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* 4b. Info spine, not amber: nothing is wrong and nothing is owed. And
            no glow anywhere — a notice that pulses reads as an alarm. */}
        {view.notice ? (
          <Notice
            title={view.notice.title}
            at={view.notice.at}
            change={{ from: view.notice.from, to: view.notice.to }}
            actions={
              <>
                <Button
                  label={view.notice.confirmLabel}
                  icon={IconCheck}
                  size="lg"
                  block
                  loading={confirming}
                  onPress={() => void confirm()}
                />
                <Button
                  label="Ask for another time"
                  variant="text"
                  block
                  onPress={() =>
                    message(
                      `Hi ${first}, ${view.notice?.to} doesn't work for me. What else do you have free?`,
                    )
                  }
                />
              </>
            }
            style={styles.notice}
          >
            <Text style={styles.noticeBody}>
              Same day, same length, same place.{' '}
              <Text style={styles.noticeStrong}>{view.notice.packLine}</Text>
            </Text>
          </Notice>
        ) : null}

        {view.notice ? (
          <Callout style={styles.note}>
            {first} sent this on WhatsApp too. Confirming there and confirming here are{' '}
            <CalloutStrong>the same tap</CalloutStrong> — you only need to do it once.
          </Callout>
        ) : null}

        {/* The pack bar reads the way the pack works: done in neutral, left in
            amber, because the number a client needs is what remains. */}
        {pack ? (
          <Card style={styles.packCard}>
            <View style={styles.packHead}>
              <View>
                <Text style={styles.packLabel}>{pack.label}</Text>
                <Text style={styles.packValue}>
                  {pack.left}
                  <Text style={styles.packTotal}>
                    {pack.total ? `/${pack.total} left` : ' left'}
                  </Text>
                </Text>
              </View>
              {pack.low ? <Tag label="Running out" tone="warn" /> : null}
            </View>
            {pack.total ? (
              <>
                <Bar
                  segments={[
                    { key: 'done', fraction: pack.used / pack.total, color: colors.surface3 },
                    { key: 'left', fraction: pack.left / pack.total, color: colors.warn },
                  ]}
                  style={styles.bar}
                />
                <Legend
                  entries={[
                    { key: 'done', label: `${pack.used} done`, color: colors.surface3 },
                    {
                      key: 'left',
                      label: `${pack.left} left${pack.lastOn ? ` · last one ${pack.lastOn}` : ''}`,
                      color: colors.warn,
                    },
                  ]}
                />
              </>
            ) : null}
          </Card>
        ) : null}

        <SectionHead label="Upcoming" count={view.upcoming.length} />
        {view.upcoming.length ? (
          <List style={styles.group}>
            {view.upcoming.map((row) => (
              <Row
                key={row.id}
                grouped
                leading={<RowTime time={row.day} meridiem={row.month} />}
                spine={row.now ? 'now' : undefined}
                severity={row.last ? 'alert' : undefined}
                title={row.when}
                subtitle={row.detail}
                trailing={
                  <Tag
                    label={row.last ? 'Last' : row.moved ? 'Moved' : row.mode === 'remote' ? 'Remote' : 'Floor'}
                    tone={row.last ? 'warn' : row.moved ? 'info' : row.mode === 'remote' ? 'remote' : 'floor'}
                  />
                }
              />
            ))}
          </List>
        ) : (
          <Empty
            compact
            icon={IconCalendar}
            title="Nothing booked"
            body={`Ask ${first} for a time and it will show up here.`}
          />
        )}

        <Callout style={styles.note}>
          <CalloutStrong>Only {first} can move a session.</CalloutStrong> Ask them and they will
          send a new time you can confirm in one tap. A move never uses up a session.
        </Callout>

        {coach ? (
          <Coach
            label="Your trainer"
            name={coach.name}
            detail={coach.gymName}
            action={{
              label: 'Ask to move one',
              onPress: () =>
                message(`Hi ${first}, could we move one of my sessions? Here's what suits me —`),
            }}
            onCall={coach.phone ? () => void Linking.openURL(`tel:${coach.phone}`) : undefined}
            style={styles.coach}
          />
        ) : null}
      </ScrollView>

      {toast ? (
        <View style={styles.toastDock} pointerEvents="box-none">
          <Toast action={{ label: 'Dismiss', onPress: () => setToast(null) }}>{toast}</Toast>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  notice: { marginBottom: space.s2 },
  noticeBody: { fontSize: 13.5, lineHeight: 20, color: colors.ink2 },
  noticeStrong: { color: colors.ink, fontWeight: '600' },

  packCard: { marginTop: space.s2 },
  packHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  packLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  packValue: { fontSize: 30, fontWeight: '800', letterSpacing: -1.05, color: colors.ink, marginTop: 8, ...tnum },
  packTotal: { fontSize: 15, fontWeight: '700', color: colors.ink3 },
  bar: { marginTop: space.s3 },

  group: { marginBottom: space.s2 },
  note: { marginTop: space.s3 },
  coach: { marginTop: space.s2 },

  toastDock: { paddingHorizontal: space.inset, paddingBottom: space.s2 },
});
