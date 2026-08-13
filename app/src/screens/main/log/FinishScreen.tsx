/**
 * Screen 17 · § 6b — finished.
 *
 * Four figures and one honest sentence.
 *
 * ── The rule this screen exists to keep ───────────────────────────────────
 *
 * **Finishing the log did not touch the pack.** Marking the session done is what
 * moves it, and that is a second, separate tap. §09 is explicit and this is the
 * screen most likely to break it: the sets happened, and whether the session
 * counts against somebody's money is the trainer's call, not a side effect of
 * closing a table.
 *
 * *Later* is a real option, not a cancel. It leaves the session open and the
 * diary will chase it tomorrow.
 *
 * ── The message ───────────────────────────────────────────────────────────
 *
 * One WhatsApp, with the record in it, opened for the trainer to send. Not sent
 * on their behalf: the client's number belongs to the trainer's relationship
 * with them, and an app that posts to it unasked has taken a liberty. The switch
 * decides whether the sheet opens at all.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useLog } from '../../../log/useLog';
import { buildFinish, buildLog } from '../../../log/log';
import { finishLog, reopenLog } from '../../../db/log';
import { endSession } from '../../../db/sessions';
import { markNotTrained } from '../../../db/diary';
import { packagesCollection } from '../../../db/packages';
import { clientsCollection } from '../../../db/sessions';
import { whatsappUri } from '../../../money/money';
import NotTrainedSheet from './NotTrainedSheet';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Dock,
  Empty,
  IconBack,
  IconButton,
  IconChevron,
  IconDumbbell,
  IconShare,
  IconWallet,
  List,
  PrCard,
  Row,
  Summary,
  Switch,
  Tag,
  Toast,
  colors,
  space,
  type,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'FinishSession'>;

export default function FinishScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { input } = useLog();

  const [pack, setPack] = useState<{ remaining: number; total: number } | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [send, setSend] = useState(true);
  const [notTrained, setNotTrained] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [at] = useState(() => Date.now());

  const view = useMemo(() => buildLog(input, params.workoutId, at), [input, params.workoutId, at]);

  /**
   * Stamped on arrival, not on the button.
   *
   * Getting here IS finishing the log — the dock below is about the money, which
   * is a different fact. Leaving by the back arrow reopens it, so the two stay
   * in step with what the trainer thinks they did.
   */
  useEffect(() => {
    void finishLog(params.workoutId);
  }, [params.workoutId]);

  // The pack that a "done" would come off: the oldest active one with something
  // left on it, which is exactly the rule `endSession` uses. If the two ever
  // disagreed the screen would promise one pack and charge another.
  useEffect(() => {
    if (!view) return;
    let alive = true;
    void (async () => {
      const packs = await packagesCollection
        .query(
          Q.where('client_id', view.clientId),
          Q.where('type', 'session_pack'),
          Q.where('status', 'active'),
          Q.sortBy('created_at', Q.asc),
        )
        .fetch();
      const chargeable = packs.find((p) => (p.sessionsRemaining ?? 0) > 0);
      if (alive) {
        setPack(
          chargeable
            ? { remaining: chargeable.sessionsRemaining ?? 0, total: chargeable.sessionsTotal ?? 0 }
            : null,
        );
      }
      const client = await clientsCollection.find(view.clientId).catch(() => null);
      if (alive) setPhone(client?.phone ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [view?.clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useMemo(
    () => (view ? buildFinish(input, view, pack, at) : null),
    [input, view, pack, at],
  );

  if (!view || !finish) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Session"
            leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          />
        </View>
        <Empty
          icon={IconDumbbell}
          title="That session isn't on this phone"
          body="It may have been discarded, or it hasn't synced across yet."
          style={styles.empty}
        />
      </SafeAreaView>
    );
  }

  const back = () => {
    void reopenLog(params.workoutId);
    navigation.goBack();
  };

  const message = () => {
    const url = whatsappUri(phone, finish.message);
    if (!url) {
      setNotice('No phone number on file for them.');
      return;
    }
    void Linking.openURL(url).catch(() => setNotice('Could not open WhatsApp.'));
  };

  const markDone = async () => {
    if (!view.scheduledId) {
      setNotice('This log is not attached to a booked session, so there is nothing to close.');
      return;
    }
    setBusy(true);
    try {
      await endSession(view.scheduledId);
      if (send) message();
      setNotice(
        pack
          ? `Done. ${pack.remaining - 1} of ${pack.total} left · undoable for 24 hours from the diary.`
          : 'Done. Undoable for 24 hours from the diary.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view.clientName}
          subtitle={`${view.plan ?? 'Session'} · ${finish.minutes} minute${finish.minutes === 1 ? '' : 's'}`}
          leading={<IconButton icon={IconBack} label="Back to the log" bare onPress={back} />}
          actions={<IconButton icon={IconShare} label="Send the summary" bare onPress={message} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{finish.title}</Text>
        <Text style={styles.line}>{finish.line}.</Text>

        <Summary
          style={styles.summary}
          figures={[
            { label: 'Sets', value: String(finish.sets) },
            { label: 'Volume', value: finish.volumeKg.toLocaleString('en-IN'), unit: 'kg' },
            {
              label: 'Records',
              value: String(finish.records.length),
              gold: finish.records.length > 0,
            },
            { label: 'On the floor', value: String(finish.minutes), unit: 'min' },
          ]}
        />

        {finish.records.length ? (
          <List style={styles.records}>
            {finish.records.map((record) => (
              <Row
                key={record.exerciseId}
                grouped
                wrap
                title={`${record.name} · ${record.value} ${record.unit}`}
                subtitle={record.why}
                onPress={() =>
                  navigation.navigate('ExerciseHistory', {
                    clientId: view.clientId,
                    exerciseId: record.exerciseId,
                  })
                }
                trailing={<Tag label={record.announced ? 'Record' : 'Quiet'} tone={record.announced ? 'pr' : 'neutral'} />}
              />
            ))}
          </List>
        ) : null}

        <Callout icon={IconWallet} tone="accent" style={styles.pack}>
          Finishing the log did not touch their pack.{' '}
          <CalloutStrong tone="accent">{finish.pack}</CalloutStrong> Undoable for 24 hours, from the
          diary or from their pack history.
        </Callout>

        <List style={styles.options}>
          <Row
            grouped
            wrap
            title={`Send ${view.clientName.split(' ')[0]} the summary`}
            subtitle="One WhatsApp, opened for you to send · the record included"
            trailing={<Switch value={send} onChange={setSend} label="Send the summary" />}
          />
          <Row
            grouped
            wrap
            title="They didn't train"
            subtitle="No-show or cancelled · that decides the pack"
            onPress={() => setNotTrained(true)}
            trailing={<IconChevron size={18} color={colors.ink3} />}
          />
        </List>

        {finish.closed ? (
          <Callout style={styles.closed}>
            This session is already closed. Reopening it is the diary's job — tap it there and undo.
          </Callout>
        ) : null}
      </ScrollView>

      {notice ? (
        <View style={styles.toastDock} pointerEvents="box-none">
          <Toast action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>{notice}</Toast>
        </View>
      ) : null}

      <Dock alt={{ label: 'Later', onPress: () => navigation.popToTop() }}>
        <Button
          label={
            finish.closed
              ? 'Already marked done'
              : finish.packMoves
                ? `Mark done · pack −1`
                : 'Mark done'
          }
          variant="primary"
          size="lg"
          block
          disabled={finish.closed}
          loading={busy}
          onPress={() => void markDone()}
        />
      </Dock>

      <NotTrainedSheet
        visible={notTrained}
        clientName={view.clientName}
        scheduledId={view.scheduledId}
        onClose={() => setNotTrained(false)}
        onDone={async (outcome, by) => {
          if (!view.scheduledId) return;
          await markNotTrained(view.scheduledId, outcome, by);
          setNotTrained(false);
          setNotice(
            outcome === 'no_show'
              ? 'Marked a no-show. That costs a session.'
              : 'Marked cancelled. Nothing came off the pack.',
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s6 },

  title: { ...type.h1, color: colors.ink, marginTop: space.s2 },
  line: { ...type.bodySm, color: colors.ink3, marginTop: 7 },

  summary: { marginTop: space.s4 },
  records: { marginTop: space.s2 },
  pack: { marginTop: space.s3 },
  options: { marginTop: space.s3 },
  closed: { marginTop: space.s3 },

  toastDock: { paddingHorizontal: space.inset, paddingBottom: space.s2 },
  empty: { marginTop: space.s7 },
});
