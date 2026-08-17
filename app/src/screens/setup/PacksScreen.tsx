/**
 * Screen 02 · Trainer setup · What you sell.
 *
 * The one question in this flow whose answer is business data rather than
 * profile text, and it is asked here because a price list defined up front is
 * what makes every later screen work: selling a pack becomes picking one,
 * "₹375 a session" gets computed instead of guessed, and the Money screen has
 * something to group by.
 *
 * **How you work is asked first**, because it decides which price lists exist.
 * An independent trainer sells their own packs. A gym-employed trainer sells
 * the packages the gym's counter sets. Plenty do both — freelance clients in
 * the morning, the gym's floor in the evening — and they keep two lists. The
 * answer lands on the profile as `workMode`, and it is a defaults hint, never
 * a gate: who actually collects, and the gym's share, are still decided per
 * client at add-client time, because the mix changes month to month.
 *
 * Packs are written straight into the database as they are added — not held in
 * the setup draft — so a trainer who quits halfway through still has their
 * prices, and the rows sync like everything else.
 *
 * **A gym needs a named price list before Continue**, because adding a client
 * later asks who collects the money and then needs the matching prices — a
 * gym-employed trainer with no gym packages has a dead end waiting for them.
 * That is why Continue holds until at least one is entered — Skip in the app
 * bar still passes on the whole step, which is a different and honest answer.
 *
 * Skippable, and honestly so: plenty of trainers quote a number per client. The
 * Money screen's empty state asks again at the moment it actually matters.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { useSetup } from '../../setup/SetupContext';
import { useAuth } from '../../store/AuthContext';
import { createPack, packOwner, packsCollection, setPackStatus } from '../../db/money';
import { getTrainer, updateTrainer, type TrainerUpdate } from '../../api/trainer';
import type PackModel from '../../db/models/Pack';
import {
  Button,
  Callout,
  CalloutStrong,
  ChoiceCard,
  Control,
  FieldLabel,
  FieldMsg,
  IconPercent,
  IconPlus,
  IconTrash,
  IconWallet,
  List,
  Row,
  colors,
  space,
} from '../../design';
import PackSheet, { BLANK_GYM_PACK, BLANK_PACK, type PackDraft } from '../main/money/PackSheet';
import { SetupBar, SetupBody, SetupFoot, SetupScreen, SetupSub, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Packs'>;
};

/** The three ways a trainer works. The profile's `workMode` vocabulary. */
type WorkMode = 'independent' | 'gym' | 'both';

function asWorkMode(value: string | null | undefined): WorkMode | null {
  return value === 'independent' || value === 'gym' || value === 'both' ? value : null;
}

/** ₹1,24,500 grouping, kept local — the design system's copy lives in `home/time`. */
function money(n: number): string {
  const s = String(Math.round(n));
  if (s.length <= 3) return `₹${s}`;
  return `₹${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${s.slice(-3)}`;
}

export default function PacksScreen({ navigation }: Props) {
  const { patch, skip } = useSetup();
  const { trainerId } = useAuth();
  const [packs, setPacks] = useState<PackModel[]>([]);
  const [gymPacks, setGymPacks] = useState<PackModel[]>([]);
  const [editing, setEditing] = useState<PackDraft | null>(null);

  /** How they work. Null until they answer — the sections below hang off it. */
  const [mode, setMode] = useState<WorkMode | null>(null);
  const [savedMode, setSavedMode] = useState<WorkMode | null>(null);
  const [gymName, setGymName] = useState('');
  const [savedGym, setSavedGym] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);

  // The answer, if there is one, comes from the profile rather than being asked
  // again — a trainer who already told us how they work should not have to
  // repeat it to get a price list.
  useEffect(() => {
    let alive = true;
    getTrainer()
      .then(({ data }) => {
        if (!alive) return;
        const name = data.gymName ?? '';
        setSavedGym(name || null);
        setGymName(name);
        const saved = asWorkMode(data.workMode);
        setSavedMode(saved);
        // The old binary version of this screen stored only the gym. A trainer
        // with a gym on file was shown both price lists, so 'both' is the
        // faithful reading of pre-workMode data.
        setMode(saved ?? (name ? 'both' : null));
      })
      .catch(() => {
        /* Offline. The question below is still answerable; it just has no default. */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Re-read on focus rather than subscribing: this screen is visited once, and
  // a live query would outlive the flow for no benefit.
  const reload = useCallback(() => {
    let alive = true;
    void packsCollection
      .query()
      .fetch()
      .then((rows) => {
        if (!alive) return;
        const live = rows.filter((p) => p.status === 'active');
        const mine = live.filter((p) => packOwner(p) === 'trainer');
        const theirs = live.filter((p) => packOwner(p) === 'gym');
        setPacks(mine);
        setGymPacks(theirs);
        patch({ packCount: live.length });
      });
    return () => {
      alive = false;
    };
  }, [patch]);

  useFocusEffect(reload);

  /** Puts the answers on the profile, once, and only what changed. */
  const persistGym = async () => {
    const next = gymName.trim();
    const up: TrainerUpdate = {};
    if (next && next !== savedGym) up.gymName = next;
    if (mode && mode !== savedMode) up.workMode = mode;
    if (Object.keys(up).length === 0) return;
    try {
      await updateTrainer(up);
      if (up.gymName) setSavedGym(next);
      if (up.workMode) setSavedMode(mode);
    } catch {
      /* Offline. The packs are already on the phone; the answers go up later. */
    }
  };

  const save = async (pack: PackDraft) => {
    setEditing(null);
    if (!trainerId) return;
    await createPack({
      trainerId,
      name: pack.name,
      type: pack.type,
      sessions: pack.sessions,
      amount: pack.amount,
      validityDays: pack.validityDays,
      owner: pack.owner ?? 'trainer',
      orderIndex: packs.length + gymPacks.length,
    });
    // A gym package with no gym on the profile is a price nobody can attribute:
    // the Money screen would have nothing to head the group with. So the name
    // goes up the moment the first one is added, not a screen later.
    if (pack.owner === 'gym') void persistGym();
    reload();
  };

  const remove = async (id: string) => {
    await setPackStatus(id, 'inactive');
    reload();
  };

  const onSkip = () => {
    skip('packs');
    navigation.navigate('Payment');
  };

  /** Which price lists this way of working keeps. */
  const sellsOwn = mode === 'independent' || mode === 'both';
  const sellsGym = mode === 'gym' || mode === 'both';

  const trimmedGym = gymName.trim();
  /** The gym is only real once it has a name — an unnamed price list belongs to nobody. */
  const gym = sellsGym && trimmedGym.length > 0 ? trimmedGym : null;
  const needsGymPacks = gym != null && gymPacks.length === 0;

  const onContinue = async () => {
    setPressed(true);
    if (mode === null) return;
    if (sellsGym && trimmedGym.length === 0) return;
    if (needsGymPacks) return;

    // Written before leaving, in case an answer was edited after the packages
    // were added — the profile has to end up saying what the screen said.
    const up: TrainerUpdate = {};
    if (mode !== savedMode) up.workMode = mode;
    if (sellsGym) {
      if (trimmedGym !== (savedGym ?? '')) up.gymName = trimmedGym;
    } else if (savedGym) {
      // "On my own" with a gym on file is the trainer leaving it. An empty
      // string clears the name and its share together, server-side.
      up.gymName = '';
    }
    if (Object.keys(up).length > 0) {
      try {
        await updateTrainer(up);
      } catch {
        /* Offline. The packs are already on the phone; the answers go up later. */
      }
    }
    navigation.navigate('Payment');
  };

  return (
    <SetupScreen>
      <SetupBar step="packs" onBack={() => navigation.goBack()} onSkip={onSkip} />

      <SetupBody>
        <SetupTitle tight>What do you sell?</SetupTitle>
        <SetupSub>
          The packs you offer, with what you charge. You can change them any time — and changing a
          price never changes a pack somebody already bought.
        </SetupSub>

        {/* ------------------------------------------------- how they work */}

        <Text style={styles.group}>How you work</Text>
        <View style={styles.modes}>
          <ChoiceCard
            wide
            title="On my own"
            subtitle="Independent — your clients, your prices, you collect"
            selected={mode === 'independent'}
            onPress={() => setMode('independent')}
          />
          <ChoiceCard
            wide
            title="At a gym"
            subtitle="The gym's counter sells its packages; you're paid a share"
            selected={mode === 'gym'}
            onPress={() => setMode('gym')}
          />
          <ChoiceCard
            wide
            title="Both"
            subtitle="Freelance clients of your own, plus the gym's floor"
            selected={mode === 'both'}
            onPress={() => setMode('both')}
          />
        </View>
        {pressed && mode === null ? (
          <FieldMsg tone="error">Pick one — it decides which price lists to set up.</FieldMsg>
        ) : null}

        {/* ------------------------------------------------- their own list */}

        {sellsOwn ? (
          <>
            <Text style={styles.group}>Your packs</Text>
            {packs.length > 0 ? (
              <List style={styles.list}>
                {packs.map((pack) => (
                  <Row
                    key={pack.id}
                    grouped
                    title={`${pack.name} · ${money(pack.amount)}`}
                    subtitle={
                      pack.sessions
                        ? `${money(Math.round(pack.amount / pack.sessions))} a session`
                        : 'Per month'
                    }
                    leading={<IconWallet size={20} color={colors.ink2} />}
                    trailing={<IconTrash size={18} color={colors.ink3} />}
                    onPress={() => void remove(pack.id)}
                  />
                ))}
              </List>
            ) : (
              <Text style={styles.blank}>Nothing yet. Most trainers start with one or two.</Text>
            )}

            <Button
              label={packs.length === 0 ? 'Add a pack' : 'Add another'}
              variant="ghost"
              block
              icon={IconPlus}
              style={styles.add}
              onPress={() => setEditing({ ...BLANK_PACK })}
            />
          </>
        ) : null}

        {/* ------------------------------------------------- the gym's list */}

        {sellsGym ? (
          <>
            <View style={styles.label}>
              <FieldLabel>Which gym</FieldLabel>
            </View>
            <Control
              value={gymName}
              onChangeText={setGymName}
              placeholder="Anytime Fitness, Adyar"
              error={pressed && trimmedGym.length === 0}
              accessibilityLabel="The gym you work at"
            />
            <FieldMsg tone={pressed && trimmedGym.length === 0 ? 'error' : 'hint'}>
              {pressed && trimmedGym.length === 0
                ? 'The gym needs a name before its packages can be attributed to it'
                : 'Their share of a session is set per client, when you add them.'}
            </FieldMsg>

            {gym ? (
              <>
                <Text style={styles.group}>What {gym} sells</Text>
                {gymPacks.length > 0 ? (
                  <List style={styles.list}>
                    {gymPacks.map((pack) => (
                      <Row
                        key={pack.id}
                        grouped
                        title={`${pack.name} · ${money(pack.amount)}`}
                        subtitle={
                          pack.sessions
                            ? `${money(Math.round(pack.amount / pack.sessions))} a session`
                            : 'Per month'
                        }
                        leading={<IconWallet size={20} color={colors.ink2} />}
                        trailing={<IconTrash size={18} color={colors.ink3} />}
                        onPress={() => void remove(pack.id)}
                      />
                    ))}
                  </List>
                ) : (
                  <Text style={styles.blank}>
                    Their counter&apos;s prices, not yours. You&apos;ll pick one of these whenever
                    the gym collects instead of you.
                  </Text>
                )}

                <Button
                  label={gymPacks.length === 0 ? `Add a ${gym} package` : 'Add another'}
                  variant="ghost"
                  block
                  icon={IconPlus}
                  style={styles.add}
                  onPress={() => setEditing({ ...BLANK_GYM_PACK })}
                />
                {pressed && needsGymPacks ? (
                  <FieldMsg tone="error">
                    Add at least one, or skip the step — adding a client who pays at the counter has
                    nothing to pick otherwise.
                  </FieldMsg>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {mode === 'independent' ? (
          <Callout icon={IconPercent} style={styles.note}>
            One rule worth knowing:{' '}
            <CalloutStrong>a shorter pack should cost more per session</CalloutStrong> than a longer
            one. Otherwise the longer one gives nobody a reason to commit.
          </Callout>
        ) : null}
      </SetupBody>

      <SetupFoot>
        <Button
          label="Continue"
          variant="primary"
          size="lg"
          block
          onPress={() => void onContinue()}
        />
      </SetupFoot>

      <PackSheet
        visible={editing !== null}
        draft={editing}
        gymName={gym}
        onSave={(pack) => void save(pack)}
        onClose={() => setEditing(null)}
      />
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  modes: { gap: space.s2 },
  list: { marginTop: space.s2 },
  blank: { fontSize: 13.5, color: colors.ink3, marginTop: space.s3 },
  add: { marginTop: space.s3, marginBottom: space.s3 },
  label: { marginTop: space.s4 },
  group: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: space.s2,
    marginTop: space.s6,
  },
  note: { marginTop: 'auto'},
});
