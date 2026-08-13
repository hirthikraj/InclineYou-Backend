/**
 * 5b · How they pay.
 *
 * `agent/design system/screens/xrep-clients.html` § 08, frame 5b.
 *
 * The one thing that earns a second screen is money: floor or remote, who
 * collects, and what the gym takes. Putting that under the two required fields
 * would make the required fields look optional — so it gets a step of its own,
 * pre-filled from Settings, and skippable in one tap.
 *
 * **The split is pre-filled and the field says where the number came from**,
 * because a 50% default nobody can trace is a number nobody trusts. Below it the
 * arithmetic is done out loud on the trainer's own most-sold pack, using the
 * same pair and bar the Gym share screen uses — so the two screens agree by
 * construction rather than by both being careful.
 *
 * Skip lives in the app bar, never beside the primary button.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useAuth } from '../../../store/AuthContext';
import { createClient } from '../../../db/clients';
import { observePacks } from '../../../db/money';
import { getTrainer } from '../../../api/trainer';
import { rupees } from '../../../home/time';
import type { DeliveryMode } from '../../../home/mode';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  ChoiceCard,
  Control,
  FieldLabel,
  FieldMsg,
  Figures,
  IconBack,
  IconButton,
  Segmented,
  SkipButton,
  Steps,
  StepsLabel,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'AddClientPay'>;

export default function AddClientPayScreen() {
  const navigation = useNavigation<Nav>();
  const { name, phone } = useRoute<Rt>().params;
  const { trainerId } = useAuth();

  const [mode, setMode] = useState<DeliveryMode>('floor');
  const [collector, setCollector] = useState<'trainer' | 'gym'>('trainer');
  const [percent, setPercent] = useState('');
  const [gym, setGym] = useState<{ name: string | null; percent: number | null; upi: string | null }>(
    { name: null, percent: null, upi: null },
  );
  const [pack, setPack] = useState<{ sessions: number | null; amount: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // The default and its provenance arrive together — the field's own message
  // names the gym it came from, so the number is traceable rather than magic.
  useEffect(() => {
    let alive = true;
    getTrainer()
      .then(({ data }) => {
        if (!alive) return;
        setGym({
          name: data.gymName ?? null,
          percent: data.gymSharePercent != null ? Number(data.gymSharePercent) : null,
          upi: data.upiVpa ?? null,
        });
        if (data.gymSharePercent != null) setPercent(String(Number(data.gymSharePercent)));
      })
      .catch(() => {
        /* Offline. The step still works — it just has no default to pre-fill. */
      });
    return () => {
      alive = false;
    };
  }, []);

  // The most-sold pack is what the arithmetic below is done on, because a split
  // shown on an abstract ₹100 is a percentage restated, not an explanation.
  useEffect(() => {
    const sub = observePacks().subscribe((rows) => {
      const live = rows.filter((p) => p.status === 'active');
      const top = live[0] ?? rows[0];
      setPack(top ? { sessions: top.sessions ?? null, amount: top.amount } : null);
    });
    return () => sub.unsubscribe();
  }, []);

  const gymCut = useMemo(() => {
    const pct = mode === 'remote' ? 0 : Number(percent);
    if (!pack || !Number.isFinite(pct)) return null;
    const clamped = Math.max(0, Math.min(100, pct));
    const theirs = Math.round((pack.amount * clamped) / 100);
    return { theirs, yours: pack.amount - theirs, percent: clamped };
  }, [pack, percent, mode]);

  const save = async (withMoney: boolean) => {
    if (!trainerId || saving) return;
    setSaving(true);
    try {
      const pct = Number(percent);
      const client = await createClient(trainerId, {
        name,
        phone,
        paymentMode: withMoney && collector === 'gym' ? 'gym_collects' : 'trainer_collects',
        deliveryMode: withMoney ? mode : undefined,
        // `trainerSplitPercent` is what the TRAINER keeps, so the gym's share is
        // stored as its complement — the same convention `projectedCut` reads.
        trainerSplitPercent:
          withMoney && mode === 'floor' && Number.isFinite(pct) && percent !== ''
            ? Math.max(0, Math.min(100, 100 - pct))
            : undefined,
      });
      navigation.replace('ClientAdded', { clientId: client.id });
    } catch {
      setSaving(false);
    }
  };

  const first = name.split(' ')[0] || name;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={`How ${first} pays`}
          subtitle="Add a client · step 2"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={<SkipButton label="Use my usual" onPress={() => void save(false)} />}
        />
        <View style={styles.steps}>
          <Steps count={2} current={1} />
          <StepsLabel current={1} count={2} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.group}>Where they train</Text>
        <Segmented
          options={[
            { key: 'floor', label: 'Floor' },
            { key: 'remote', label: 'Remote' },
          ]}
          value={mode}
          onChange={(key) => setMode(key as DeliveryMode)}
        />

        <Text style={styles.group}>Who takes the money</Text>
        <View style={styles.choices}>
          <ChoiceCard
            title="You collect"
            subtitle={gym.upi ? `UPI to ${gym.upi}, or cash in hand` : 'UPI or cash in hand'}
            selected={collector === 'trainer'}
            onPress={() => setCollector('trainer')}
          />
          <ChoiceCard
            title="The gym collects"
            subtitle="Their counter, you mark it paid"
            selected={collector === 'gym'}
            onPress={() => setCollector('gym')}
          />
        </View>

        {mode === 'floor' && gym.name ? (
          <>
            <View style={styles.label}>
              <FieldLabel>Gym&apos;s share of a floor session</FieldLabel>
            </View>
            <Control
              value={percent}
              onChangeText={setPercent}
              keyboardType="number-pad"
              affix="%"
              placeholder="50"
              accessibilityLabel="The gym's share, as a percentage"
            />
            <FieldMsg>
              {gym.percent != null
                ? `Your ${gym.name} figure, from Settings → Getting paid.`
                : `No figure set for ${gym.name} yet — Settings → Getting paid.`}
            </FieldMsg>
          </>
        ) : null}

        {gymCut && pack ? (
          <Figures
            collected={rupees(gymCut.yours)}
            owed={rupees(gymCut.theirs)}
            labels={[
              pack.sessions ? `Yours on a ${pack.sessions}-pack` : 'Yours',
              "The gym's",
            ]}
            tones={['ok', gymCut.theirs > 0 ? 'warn' : 'plain']}
            legend={[`${100 - gymCut.percent}% yours`, `${gymCut.percent}% theirs`]}
            collectedPart={pack.amount ? gymCut.yours / pack.amount : 1}
            owedPart={pack.amount ? gymCut.theirs / pack.amount : 0}
            style={styles.money}
          />
        ) : null}

        <Callout style={styles.note}>
          {mode === 'floor' ? (
            <>
              Move {first} to <CalloutStrong>remote</CalloutStrong> and the gym&apos;s share is 0% —
              the whole {pack ? rupees(pack.amount) : 'amount'} stays yours.{' '}
            </>
          ) : (
            <>
              Remote sessions are <CalloutStrong>always 0%</CalloutStrong>, whatever the gym takes on
              the floor.{' '}
            </>
          )}
          Change the percentage later and it applies from that day on;{' '}
          <CalloutStrong>sessions already recorded keep the split they were recorded with.</CalloutStrong>
        </Callout>

        <Button
          label={`Add ${first}`}
          size="lg"
          block
          disabled={saving}
          onPress={() => void save(true)}
          style={styles.go}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  steps: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: 2 },
  body: { paddingHorizontal: space.inset, paddingTop: space.s5, paddingBottom: space.s10 },

  group: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: space.s2,
    marginTop: space.s5,
  },
  choices: { flexDirection: 'row', gap: space.s2 },
  label: { marginTop: space.s5 },
  money: { marginTop: space.s4 },
  note: { marginTop: space.s3 },
  go: { marginTop: space.s6 },
});
