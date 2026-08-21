/**
 * 5b · How they pay.
 *
 * `agent/design system/screens/xrep-clients.html` § 08, frame 5b.
 *
 * The one thing that earns a second screen is money — and how much of it there
 * is to ask about depends on how the trainer works, which they answered once
 * at setup (`workMode` on the profile):
 *
 * **Independent** trainers are never asked who takes the money — they do, by
 * definition. The screen asks where the client trains, offers the trainer's
 * own packs, and lets the agreed price be edited right on the sale: below the
 * list price it is recorded as a discount, above it it is simply the amount.
 * No gym, no split, no share arithmetic.
 *
 * **Gym** trainers are not asked either — the counter collects, by definition.
 * They pick from the gym's packages and answer the one question that is theirs
 * to answer: what share of it they get, as a percentage or as a rupee figure.
 * Either way it is stored as `trainerSplitPercent` (what the TRAINER keeps),
 * the same convention `projectedCut` reads.
 *
 * **Both** is the only case where the screen asks a question first: is this a
 * gym client or one of your own? The answer picks which of the two forms above
 * renders — the rest of the screen IS that form.
 *
 * A profile with no `workMode` is not the same as "independent": the old setup
 * screen stored only the gym, so plenty of gym trainers have a gym on file and
 * no answer. Same convention as setup's PacksScreen — the gym on file means the
 * gym's price list is real, and whether their own packs exist alongside it says
 * whether there is a second list to ask about.
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
  IconPlus,
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

/** The trainer's setup answer. Decides which of the two forms this screen is. */
type WorkMode = 'independent' | 'gym' | 'both';

function asWorkMode(value: string | null | undefined): WorkMode | null {
  return value === 'independent' || value === 'gym' || value === 'both' ? value : null;
}

/** Whose client this one is — the only per-client question left about money. */
type ClientKind = 'freelance' | 'gym';

export default function AddClientPayScreen() {
  const navigation = useNavigation<Nav>();
  const { name, phone } = useRoute<Rt>().params;
  const { trainerId } = useAuth();

  const [mode, setMode] = useState<DeliveryMode>('floor');
  const [workMode, setWorkMode] = useState<WorkMode | null>(null);
  /** Answered only when workMode is 'both' — everyone else has no choice to make. */
  const [kindChoice, setKindChoice] = useState<ClientKind | null>(null);
  const [gym, setGym] = useState<{ name: string | null; percent: number | null; upi: string | null }>(
    { name: null, percent: null, upi: null },
  );
  const [packs, setPacks] = useState<PriceRow[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  /** Freelance only: the figure actually agreed, editable, pre-filled from the pack. */
  const [price, setPrice] = useState('');
  /** Gym only: the trainer's share, and whether it was quoted as % or ₹. */
  const [shareAs, setShareAs] = useState<'percent' | 'amount'>('percent');
  const [share, setShare] = useState('');
  const [saving, setSaving] = useState(false);

  // The trainer's share as a percentage, pre-filled from Settings. The profile
  // stores what the GYM keeps, so the default here is its complement.
  const defaultShare = gym.percent != null ? String(Math.max(0, 100 - gym.percent)) : '';

  useEffect(() => {
    let alive = true;
    getTrainer()
      .then(({ data }) => {
        if (!alive) return;
        setWorkMode(asWorkMode(data.workMode));
        setGym({
          name: data.gymName ?? null,
          percent: data.gymSharePercent != null ? Number(data.gymSharePercent) : null,
          upi: data.upiVpa ?? null,
        });
        if (data.gymSharePercent != null) {
          setShare(String(Math.max(0, 100 - Number(data.gymSharePercent))));
        }
      })
      .catch(() => {
        /* Offline. The freelance form still works — it just has no gym to ask about. */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Both price lists, kept whole. Which one is offered is decided by whose
  // client this is, and (for 'both') that answer changes while this screen is open.
  useEffect(() => {
    const sub = observePacks().subscribe((rows) => {
      setPacks(
        rows
          // Case-blind for the same reason as packSessionsLeft: a pack the
          // add-client gate counted must also show up on this price list.
          .filter((p) => (p.status ?? '').toLowerCase() === 'active')
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

  /**
   * How this trainer works: the profile's answer when there is one, otherwise
   * the faithful reading of a pre-workMode profile. The old setup screen stored
   * only the gym — so a gym on file with no own packs is a gym trainer, and a
   * gym on file WITH own packs kept two lists, which is 'both'. No gym on file
   * stays null and reads as freelance below, exactly as before.
   */
  const effectiveMode: WorkMode | null = useMemo(() => {
    if (workMode) return workMode;
    if (!gym.name) return null;
    return packs.some((p) => p.owner === 'trainer') ? 'both' : 'gym';
  }, [workMode, gym.name, packs]);

  /**
   * Whose client this is. Independent trainers only have their own; gym
   * trainers only have the gym's; 'both' answers per client. Null while a
   * 'both' trainer hasn't answered yet — the form waits for them.
   */
  const kind: ClientKind | null =
    effectiveMode === 'gym' ? 'gym' : effectiveMode === 'both' ? kindChoice : 'freelance';

  /** Whose price list applies. */
  const owner: PackOwner = kind === 'gym' ? 'gym' : 'trainer';
  const list = useMemo(() => packs.filter((p) => p.owner === owner), [packs, owner]);

  // A pack picked from one list must not stay picked when the other list is
  // shown — the price on screen would stop being the price being agreed.
  useEffect(() => {
    setChosenId((current) => (current && list.some((p) => p.id === current) ? current : null));
  }, [list]);

  const chosen = useMemo(() => list.find((p) => p.id === chosenId) ?? null, [list, chosenId]);

  // The editable figure follows the pick: picking a pack fills it with the
  // list price, unpicking clears it. The trainer edits from there, not from a
  // blank box that pretends the list price doesn't exist.
  useEffect(() => {
    setPrice(chosen && owner === 'trainer' ? String(chosen.amount) : '');
  }, [chosen, owner]);

  /** Freelance: what this client actually pays — the edited figure, or the list price. */
  const paid = useMemo(() => {
    if (owner !== 'trainer' || !chosen) return null;
    if (price.trim() === '') return chosen.amount;
    const n = Number(price.replace(/\D/g, ''));
    return Number.isFinite(n) ? n : chosen.amount;
  }, [owner, chosen, price]);

  /**
   * Gym: the split, on the package this client is actually being signed up
   * for. Falls back to the first pack on the gym's list when nothing is picked
   * yet, because a split shown on an abstract ₹100 is a percentage restated,
   * not an explanation. Remote is always 100% yours — the same rule
   * `projectedCut` applies in code.
   */
  const shown = chosen ?? list[0] ?? null;
  const cut = useMemo(() => {
    if (kind !== 'gym' || !shown) return null;
    const net = shown.amount;
    if (mode === 'remote') return { yours: net, theirs: 0, percent: 100 };
    if (shareAs === 'percent') {
      if (share.trim() === '') return null;
      const pct = Number(share);
      if (!Number.isFinite(pct)) return null;
      const clamped = Math.max(0, Math.min(100, pct));
      const yours = Math.round((net * clamped) / 100);
      return { yours, theirs: net - yours, percent: clamped };
    }
    const yours = Math.max(0, Math.min(net, Number(share.replace(/\D/g, '')) || 0));
    return { yours, theirs: net - yours, percent: net ? Math.round((yours / net) * 100) : 0 };
  }, [kind, shown, mode, shareAs, share]);

  const save = async (withMoney: boolean) => {
    if (!trainerId || saving) return;
    setSaving(true);
    try {
      const isGym = (kind ?? 'freelance') === 'gym';

      // `trainerSplitPercent` is what the TRAINER keeps. A gym client's share
      // is stored as entered (or, quoted in rupees, as its percent of the pack
      // actually chosen — a fallback pack would store a number nobody agreed).
      // Freelance clients carry no split at all.
      let split: number | undefined;
      if (withMoney && isGym && mode === 'floor') {
        if (shareAs === 'percent' && share.trim() !== '' && Number.isFinite(Number(share))) {
          split = Math.max(0, Math.min(100, Number(share)));
        } else if (shareAs === 'amount' && chosen && cut) {
          split = cut.percent;
        }
      }

      const client = await createClient(trainerId, {
        name,
        phone,
        paymentMode: isGym ? 'gym_collects' : 'trainer_collects',
        deliveryMode: withMoney ? mode : undefined,
        trainerSplitPercent: split,
      });

      // The pack picked here is a pack sold: the client owes it from today, at
      // the figure shown above rather than the list price. Its own try, because
      // a pack that fails to write is one sale to redo from the client's book —
      // losing the client over it would cost the trainer far more.
      if (withMoney && chosen) {
        try {
          // Freelance: the edited figure below the list price is a discount on
          // record; above it, it is simply the amount. Gym prices are not the
          // trainer's to edit, so they sell as listed.
          const agreed = owner === 'trainer' && paid != null ? paid : chosen.amount;
          const base = Math.max(chosen.amount, agreed);
          await sellPack({
            trainerId,
            clientId: client.id,
            pack: {
              id: chosen.id,
              type: chosen.type,
              sessions: chosen.sessions,
              amount: base,
              validityDays: chosen.validityDays,
            },
            discount: base - agreed,
          });
        } catch {
          /* The client is added. The pack can be sold again from their book. */
        }
      }

      // Money settled, but the client is not in the routine yet: their week
      // (step 3) and their plan (step 4) come before the success screen.
      navigation.replace('ClientSchedule', { clientId: client.id });
    } catch {
      setSaving(false);
    }
  };

  const first = name.split(' ')[0] || name;
  const gymName = gym.name ?? 'the gym';

  /** What the Add button commits to: the agreed price, once a pack is picked. */
  const agreedLabel =
    chosen && owner === 'trainer' && paid != null
      ? rupees(paid)
      : chosen
        ? rupees(chosen.amount)
        : null;

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
          <Steps count={4} current={1} />
          <StepsLabel current={1} count={4} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* The one question only a 'both' trainer is asked. It comes first
            because its answer decides everything below it. */}
        {effectiveMode === 'both' ? (
          <>
            <Text style={styles.group}>Whose client</Text>
            <View style={styles.choices}>
              <ChoiceCard
                title="Your own"
                subtitle={gym.upi ? `Your prices — UPI to ${gym.upi} or cash` : 'Your prices, you collect'}
                selected={kind === 'freelance'}
                onPress={() => setKindChoice('freelance')}
              />
              <ChoiceCard
                title="Gym client"
                subtitle={`${gymName}'s counter collects; you get a share`}
                selected={kind === 'gym'}
                onPress={() => setKindChoice('gym')}
              />
            </View>
            {kind === null ? (
              <FieldMsg>Pick one — it decides whose prices {first} is offered.</FieldMsg>
            ) : null}
          </>
        ) : null}

        {kind !== null ? (
          <>
            <Text style={styles.group}>Where they train</Text>
            <Segmented
              options={[
                { key: 'floor', label: 'Floor' },
                { key: 'remote', label: 'Remote' },
              ]}
              value={mode}
              onChange={(key) => setMode(key as DeliveryMode)}
            />

            {/* ----------------------------------------------- the price list */}

            <Text style={styles.group}>
              {kind === 'gym' ? `What ${gymName} sells` : 'What they buy'}
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
                    // Tapping the chosen one again unpicks it — changing your
                    // mind mid-pick shouldn't need a second tap on the other row.
                    // The Add button below stays dead until something is picked.
                    onPress={() => setChosenId((current) => (current === row.id ? null : row.id))}
                  />
                ))}
              </List>
            ) : (
              /* An empty price list is a dead end this step can't work around —
                 sessions are sold from a pack, so there is nothing to offer
                 until one exists. The button pushes Packs onto the stack;
                 backing out lands right here, form intact, and the live packs
                 subscription shows the new pack without a refresh. */
              <>
                <Text style={styles.blank}>
                  {kind === 'gym'
                    ? `No ${gymName} packages on the list yet. ${first} gets signed up on one of them — add what the counter charges and it's pickable right here.`
                    : `No packs on your price list yet. ${first} gets sold sessions from it — create a pack, come back, and it's pickable right here.`}
                </Text>
                <Button
                  label={kind === 'gym' ? `Add a ${gymName} package` : 'Create a pack'}
                  variant="ghost"
                  block
                  icon={IconPlus}
                  onPress={() => navigation.navigate('MoneyPacks')}
                  style={styles.blankGo}
                />
              </>
            )}

            {/* ------------------------------- freelance: the price is theirs to set */}

            {kind === 'freelance' && chosen ? (
              <>
                <View style={styles.label}>
                  <FieldLabel>What {first} pays</FieldLabel>
                </View>
                <Control
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  seg={<Text style={styles.rupee}>₹</Text>}
                  placeholder={String(chosen.amount)}
                  accessibilityLabel="The amount this client pays for the pack, in rupees"
                />
                <FieldMsg>
                  {paid != null && paid < chosen.amount
                    ? `${rupees(chosen.amount - paid)} off the list price, this sale only — your price list is unchanged.`
                    : paid != null && paid > chosen.amount
                      ? `${rupees(paid - chosen.amount)} above the list price, this sale only.`
                      : 'Edit it if you have agreed a different figure. Your price list stays as it is.'}
                </FieldMsg>
              </>
            ) : null}

            {/* --------------------------------------- gym: the share is the question */}

            {kind === 'gym' && mode === 'floor' ? (
              <>
                <View style={styles.label}>
                  <FieldLabel>Your share</FieldLabel>
                </View>
                <View style={styles.shareRow}>
                  <View style={styles.shareField}>
                    <Control
                      value={share}
                      onChangeText={setShare}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      affix={shareAs === 'percent' ? '%' : undefined}
                      seg={shareAs === 'amount' ? <Text style={styles.rupee}>₹</Text> : undefined}
                      placeholder={shareAs === 'percent' ? '50' : shown ? String(shown.amount) : '0'}
                      accessibilityLabel={
                        shareAs === 'percent'
                          ? 'Your share, as a percentage'
                          : 'Your share, in rupees'
                      }
                    />
                  </View>
                  <View style={styles.shareToggle}>
                    <Segmented
                      options={[
                        { key: 'percent', label: '%' },
                        { key: 'amount', label: '₹' },
                      ]}
                      value={shareAs}
                      onChange={(key) => {
                        setShareAs(key as 'percent' | 'amount');
                        // A number quoted in one unit is nonsense in the other —
                        // switching resets to the Settings default, or to blank.
                        setShare(key === 'percent' ? defaultShare : '');
                      }}
                    />
                  </View>
                </View>
                <FieldMsg>
                  {shareAs === 'amount'
                    ? shown
                      ? `Saved as its share of ${shown.name} — ${cut ? `${cut.percent}%` : 'pick a figure'}.`
                      : 'Quoted in rupees, saved as a percentage of the package you pick.'
                    : gym.percent != null
                      ? `From your ${gymName} figure in Settings → Getting paid.`
                      : `No figure set for ${gymName} yet — Settings → Getting paid.`}
                </FieldMsg>
              </>
            ) : null}

            {kind === 'gym' && cut && shown ? (
              <>
                <Figures
                  collected={rupees(cut.yours)}
                  owed={rupees(cut.theirs)}
                  labels={['The gym owes you', `${gymName} keeps`]}
                  tones={['ok', cut.theirs > 0 ? 'warn' : 'plain']}
                  legend={[`${cut.percent}% yours`, `${100 - cut.percent}% theirs`]}
                  collectedPart={shown.amount ? cut.yours / shown.amount : 1}
                  owedPart={shown.amount ? cut.theirs / shown.amount : 0}
                  style={styles.money}
                />
                <Text style={styles.basis}>
                  {chosen
                    ? `On ${chosen.name} at ${rupees(chosen.amount)}, collected at the counter.`
                    : `On ${gymName}'s ${shown.name}, until you pick one above.`}
                </Text>
              </>
            ) : null}

            {kind === 'gym' && !chosen ? (
              <Callout style={styles.note}>
                {mode === 'floor' ? (
                  <>
                    Remote clients are different: the gym takes{' '}
                    <CalloutStrong>0%</CalloutStrong> of remote sessions, whatever it keeps on the
                    floor.{' '}
                  </>
                ) : (
                  <>
                    Remote sessions are <CalloutStrong>always 100% yours</CalloutStrong>, whatever
                    the gym keeps on the floor.{' '}
                  </>
                )}
                Change the share later and it applies from that day on;{' '}
                <CalloutStrong>
                  sessions already recorded keep the split they were recorded with.
                </CalloutStrong>
              </Callout>
            ) : null}

            <Button
              // The agreed number rides on the button, so the last thing read
              // before the tap is the thing being agreed to. Dead until a pack
              // is picked: a client is sold sessions from a pack, so there is
              // nothing to agree to before one is chosen.
              label={agreedLabel ? `Add ${first} on ${agreedLabel}` : `Add ${first}`}
              size="lg"
              block
              disabled={saving || !chosen}
              onPress={() => void save(true)}
              style={styles.go}
            />
            {!chosen ? (
              <FieldMsg style={styles.goMsg}>
                Pick a pack above — {first} is added on it.
              </FieldMsg>
            ) : null}
          </>
        ) : null}
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
  blankGo: { marginTop: space.s3 },
  rupee: { fontSize: 16, fontWeight: '500', color: colors.ink },
  shareRow: { flexDirection: 'row', gap: space.s2, alignItems: 'center' },
  shareField: { flex: 1 },
  shareToggle: { width: 108 },
  money: { marginTop: space.s4 },
  /* Names the pack the figures above were worked out on — a split with no
     stated basis is a number the trainer has to take on faith. */
  basis: { fontSize: 12.5, color: colors.ink3, marginTop: space.s2 },
  note: { marginTop: space.s3 },
  go: { marginTop: space.s6 },
  goMsg: { marginTop: space.s2, textAlign: 'center' },
});
