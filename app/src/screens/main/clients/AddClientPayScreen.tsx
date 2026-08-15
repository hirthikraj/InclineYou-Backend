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
 * arithmetic is done out loud on the pack this client is actually being put on,
 * using the same pair and bar the Gym share screen uses — so the two screens
 * agree by construction rather than by both being careful.
 *
 * **Who collects decides which price list is offered.** A client paying the
 * trainer picks from the trainer's packs, with a discount box, because that is a
 * price the trainer sets and can knock money off. A client paying at the gym's
 * counter picks from the gym's packages and there is no discount box — you
 * cannot discount a price you don't set. Either way the two figures underneath
 * are worked out before the Add button, so nobody agrees to a number they
 * haven't seen.
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
import { observePacks, packOwner, sellPack, type PackOwner } from '../../../db/money';
import { getTrainer } from '../../../api/trainer';
import { rupees } from '../../../home/time';
import type { DeliveryMode } from '../../../home/mode';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  ChoiceCard,
  ChoiceSlot,
  Control,
  FieldLabel,
  FieldMsg,
  Figures,
  IconBack,
  IconButton,
  IconWallet,
  List,
  Radio,
  Row,
  Segmented,
  SkipButton,
  Steps,
  StepsLabel,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'AddClientPay'>;

/** One line of a price list — enough to show it, price it and sell it. */
interface PriceRow {
  id: string;
  name: string;
  type: string;
  sessions: number | null;
  amount: number;
  validityDays: number | null;
  owner: PackOwner;
}

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
  const [packs, setPacks] = useState<PriceRow[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [discount, setDiscount] = useState('');
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

  // Both price lists, kept whole. Which one is offered is decided by who
  // collects, and that answer changes while this screen is open.
  useEffect(() => {
    const sub = observePacks().subscribe((rows) => {
      setPacks(
        rows
          .filter((p) => p.status === 'active')
          .map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            sessions: p.sessions ?? null,
            amount: p.amount,
            validityDays: p.validityDays ?? null,
            owner: packOwner(p),
          })),
      );
    });
    return () => sub.unsubscribe();
  }, []);

  /** Whose price list applies. The one question already answered above. */
  const owner: PackOwner = collector === 'gym' ? 'gym' : 'trainer';
  const list = useMemo(() => packs.filter((p) => p.owner === owner), [packs, owner]);

  // A pack picked from one list must not stay picked when the other list is
  // shown — the price on screen would stop being the price being agreed.
  useEffect(() => {
    setChosenId((current) => (current && list.some((p) => p.id === current) ? current : null));
    if (owner === 'gym') setDiscount('');
  }, [list, owner]);

  const chosen = useMemo(() => list.find((p) => p.id === chosenId) ?? null, [list, chosenId]);

  /**
   * The split, on the money this client is actually being signed up for.
   *
   * Falls back to the first pack on the applicable list when nothing is picked
   * yet, because a split shown on an abstract ₹100 is a percentage restated,
   * not an explanation — but the moment a pack is picked the figures are about
   * that pack, discount included.
   */
  const shown = chosen ?? list[0] ?? null;
  const cut = useMemo(() => {
    if (!shown) return null;
    const pct = mode === 'remote' ? 0 : Number(percent);
    if (!Number.isFinite(pct)) return null;
    const clamped = Math.max(0, Math.min(100, pct));
    // Only a price the trainer sets can be discounted, and only the pack that
    // was actually picked — never the fallback standing in for it.
    const off =
      owner === 'trainer' && chosen
        ? Math.max(0, Math.min(shown.amount, Number(discount.replace(/\D/g, '')) || 0))
        : 0;
    const net = shown.amount - off;
    const theirs = Math.round((net * clamped) / 100);
    return { off, net, theirs, yours: net - theirs, percent: clamped };
  }, [shown, chosen, owner, discount, percent, mode]);

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

      // The pack picked here is a pack sold: the client owes it from today, at
      // the figure shown above rather than the list price. Its own try, because
      // a pack that fails to write is one sale to redo from the client's book —
      // losing the client over it would cost the trainer far more.
      if (withMoney && chosen) {
        try {
          await sellPack({
            trainerId,
            clientId: client.id,
            pack: {
              id: chosen.id,
              type: chosen.type,
              sessions: chosen.sessions,
              amount: chosen.amount,
              validityDays: chosen.validityDays,
            },
            discount: cut?.off ?? 0,
          });
        } catch {
          /* The client is added. The pack can be sold again from their book. */
        }
      }

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

        {/* --------------------------------------------------- the price list */}

        <Text style={styles.group}>
          {owner === 'gym' ? `What ${gym.name ?? 'the gym'} sells` : 'What they buy'}
        </Text>
        {list.length > 0 ? (
          <List>
            {list.map((row) => (
              <Row
                key={row.id}
                grouped
                selected={row.id === chosenId}
                title={`${row.name} · ${rupees(row.amount)}`}
                subtitle={
                  row.sessions
                    ? `${rupees(Math.round(row.amount / row.sessions))} a session`
                    : row.type === 'monthly'
                      ? 'Per month'
                      : 'One session'
                }
                leading={
                  <ChoiceSlot>
                    <Radio checked={row.id === chosenId} />
                  </ChoiceSlot>
                }
                // Tapping the chosen one again unpicks it: adding a client
                // without selling them anything yet is a real answer.
                onPress={() => setChosenId((current) => (current === row.id ? null : row.id))}
              />
            ))}
          </List>
        ) : (
          <Text style={styles.blank}>
            {owner === 'gym'
              ? `No ${gym.name ?? 'gym'} packages on the list yet — add them in Money → Packs and they'll be pickable here.`
              : 'No packs on your price list yet — add them in Money → Packs. You can still add ' +
                `${first} now and sell one later.`}
          </Text>
        )}

        {owner === 'trainer' && chosen ? (
          <>
            <View style={styles.label}>
              <FieldLabel>
                Discount <Text style={styles.optional}>optional</Text>
              </FieldLabel>
            </View>
            <Control
              value={discount}
              onChangeText={setDiscount}
              keyboardType="number-pad"
              inputMode="numeric"
              seg={<Text style={styles.rupee}>₹</Text>}
              placeholder="0"
              accessibilityLabel="Discount off this pack, in rupees"
            />
            <FieldMsg>
              {cut && cut.off > 0
                ? `${first} pays ${rupees(cut.net)} instead of ${rupees(chosen.amount)}. Your price list is unchanged.`
                : 'Off this sale only — your price list stays as it is.'}
            </FieldMsg>
          </>
        ) : null}

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

        {cut && shown ? (
          <>
            <Figures
              collected={rupees(cut.yours)}
              owed={rupees(cut.theirs)}
              labels={[
                // Who is holding the money changes what "yours" means: on the
                // gym's counter it is a debt to you, not cash in your hand.
                owner === 'gym'
                  ? 'The gym owes you'
                  : shown.sessions
                    ? `Yours on the ${shown.sessions}-pack`
                    : 'Yours',
                "The gym's",
              ]}
              tones={['ok', cut.theirs > 0 ? 'warn' : 'plain']}
              legend={[`${100 - cut.percent}% yours`, `${cut.percent}% theirs`]}
              collectedPart={cut.net ? cut.yours / cut.net : 1}
              owedPart={cut.net ? cut.theirs / cut.net : 0}
              style={styles.money}
            />
            <Text style={styles.basis}>
              {chosen
                ? `On ${chosen.name} at ${rupees(cut.net)}${cut.off > 0 ? ` (${rupees(cut.off)} off)` : ''}${
                    owner === 'gym' ? ', collected at the counter' : ''
                  }.`
                : `On your ${shown.name}, until you pick one above.`}
            </Text>
          </>
        ) : null}

        {/* Once a pack is picked the figures above ARE the explanation, and the
            paragraph would push the button off a small screen. It stays while
            nothing is picked, because then the numbers need the context. */}
        {chosen ? null : (
          <Callout style={styles.note}>
            {mode === 'floor' ? (
              <>
                Move {first} to <CalloutStrong>remote</CalloutStrong> and the gym&apos;s share is 0%
                — the whole {shown ? rupees(shown.amount) : 'amount'} stays yours.{' '}
              </>
            ) : (
              <>
                Remote sessions are <CalloutStrong>always 0%</CalloutStrong>, whatever the gym takes
                on the floor.{' '}
              </>
            )}
            Change the percentage later and it applies from that day on;{' '}
            <CalloutStrong>
              sessions already recorded keep the split they were recorded with.
            </CalloutStrong>
          </Callout>
        )}

        <Button
          // The agreed number rides on the button, so the last thing read
          // before the tap is the thing being agreed to.
          label={chosen && cut ? `Add ${first} on ${rupees(cut.net)}` : `Add ${first}`}
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
  blank: { fontSize: 13.5, color: colors.ink3, lineHeight: 20 },
  optional: { fontSize: 13, fontWeight: '400', color: colors.ink3 },
  rupee: { fontSize: 16, fontWeight: '500', color: colors.ink },
  money: { marginTop: space.s4 },
  /* Names the pack the figures above were worked out on — a split with no
     stated basis is a number the trainer has to take on faith. */
  basis: { fontSize: 12.5, color: colors.ink3, marginTop: space.s2 },
  note: { marginTop: space.s3 },
  go: { marginTop: space.s6 },
});
