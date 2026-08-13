/**
 * 7b · Pause, or end it.
 *
 * `agent/design system/screens/xrep-clients.html` § 10.
 *
 * **Three different things. Two of them you can walk back.** The roster already
 * drew the difference and said what it costs — paused keeps the pack, archived
 * closes it — and this is where that decision is actually made.
 *
 * The shape is the long-press menu's: two reversible rows in a list, the rule
 * about money that applies to both, then a divider and the destructive one alone
 * below it. Learned once, on the roster, and reused here.
 *
 * The dialog counts what will be lost rather than asking "are you sure?", and it
 * points at archive, which is what the trainer almost always meant.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useClientFile } from '../../../clients/useClientFile';
import { buildHead, currentPack } from '../../../clients/file';
import { countForRemoval, removeClient, setClientStatus } from '../../../db/clients';
import { rupees } from '../../../home/time';
import {
  AppBar,
  Callout,
  CalloutStrong,
  Dialog,
  DialogStrong,
  IconBack,
  IconButton,
  List,
  Row,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'ClientEnd'>;

export default function ClientEndScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useRoute<Rt>().params;
  const { input, now } = useClientFile(clientId);

  const head = useMemo(() => buildHead(input, now), [input, now]);
  const pack = useMemo(() => currentPack(input), [input]);
  const [counts, setCounts] = useState({ sessions: 0, metrics: 0, payments: 0 });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Counted once on entry. The dialog's whole value is the number, so it is read
  // before the trainer can reach the row rather than while the modal opens.
  useEffect(() => {
    let alive = true;
    void countForRemoval(clientId).then((next) => {
      if (alive) setCounts(next);
    });
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (!head) return null;

  const first = head.name.split(' ')[0] || head.name;
  const left = pack?.sessionsRemaining ?? 0;
  const paused = head.status === 'paused';
  const archived = head.status === 'archived';

  const flip = async (status: 'paused' | 'archived' | 'active') => {
    if (busy) return;
    setBusy(true);
    await setClientStatus(clientId, status);
    navigation.goBack();
  };

  const remove = async () => {
    setConfirming(false);
    setBusy(true);
    await removeClient(clientId);
    // Back past the file itself — the record it was showing is gone.
    navigation.popToTop();
  };

  const done = input.sessions.filter((s) => s.status === 'done').length;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={paused || archived ? 'Resume, or end' : 'Pause or end'}
          subtitle={`${head.name}${left ? ` · ${left} session${left === 1 ? '' : 's'} left` : ''}`}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.lede}>Three different things. Two of them you can walk back.</Text>

        <List style={styles.list}>
          {paused || archived ? (
            <Row
              grouped
              wrap
              title={`Bring ${first} back`}
              subtitle={
                archived
                  ? `Restores them to your roster with their history. A closed pack stays closed — sell a new one.`
                  : `They start counting towards your plan again and can see new sessions.`
              }
              onPress={() => void flip('active')}
            />
          ) : (
            <Row
              grouped
              wrap
              title={`Pause ${first}`}
              subtitle={`Keeps all ${done} session${done === 1 ? '' : 's'} and their ${left} remaining one${left === 1 ? '' : 's'}. They stop counting towards your plan and can't see new sessions until you resume.`}
              onPress={() => void flip('paused')}
            />
          )}
          {!archived ? (
            <Row
              grouped
              wrap
              title={`Archive ${first}`}
              subtitle={`Closes the pack — their ${left} unused session${left === 1 ? '' : 's'} end there. History is kept for your records, and you can restore them any time.`}
              onPress={() => void flip('archived')}
            />
          ) : null}
        </List>

        {head.owed > 0 ? (
          <Callout style={styles.note}>
            Neither one clears the <CalloutStrong>{rupees(head.owed)}</CalloutStrong>. It stays on
            their book and in your pending total until you record it or write it off.
          </Callout>
        ) : (
          <Callout style={styles.note}>
            Nothing is owed, so neither one leaves money behind. If a pack is sold later it starts
            clean.
          </Callout>
        )}

        <View style={styles.rule} />

        <List style={styles.list}>
          <Row
            grouped
            wrap
            title={`Remove ${first}`}
            subtitle={`Deletes them, ${counts.sessions} session${counts.sessions === 1 ? '' : 's'}, ${counts.metrics} measurement${counts.metrics === 1 ? '' : 's'} and ${counts.payments} payment${counts.payments === 1 ? '' : 's'}. Not undoable.`}
            onPress={() => setConfirming(true)}
          />
        </List>

        <Callout style={styles.note}>
          <CalloutStrong>Removing takes effect at once.</CalloutStrong> There is no grace period on a
          client the way there is on your own account — which is why archive is the row above.
        </Callout>
      </ScrollView>

      <Dialog
        visible={confirming}
        title={`Remove ${head.name}?`}
        confirmLabel="Remove"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void remove()}
      >
        <Text style={styles.dialog}>
          {counts.sessions} session{counts.sessions === 1 ? '' : 's'}, {counts.metrics} measurement
          {counts.metrics === 1 ? '' : 's'} and {counts.payments} payment
          {counts.payments === 1 ? '' : 's'} go with them. Months you&apos;ve already closed keep
          their totals, so your reports won&apos;t move — but their side of them goes blank.{' '}
          <DialogStrong>Archive keeps every bit of it</DialogStrong> and still takes them off your
          roster.
        </Text>
      </Dialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  lede: { fontSize: 13.5, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  list: { marginBottom: space.s2 },
  note: { marginTop: space.s3 },
  // A plain rule, not the `Rule` component — that one states a policy.
  rule: { height: 1, backgroundColor: colors.line, marginVertical: space.s6 },
  dialog: { fontSize: 14, lineHeight: 21, color: colors.ink2 },
});
