/**
 * Screen 02 · Trainer setup · What you sell.
 *
 * The one question in this flow whose answer is business data rather than
 * profile text, and it is asked here because a price list defined up front is
 * what makes every later screen work: selling a pack becomes picking one,
 * "₹375 a session" gets computed instead of guessed, and the Money screen has
 * something to group by.
 *
 * Packs are written straight into the database as they are added — not held in
 * the setup draft — so a trainer who quits halfway through still has their
 * prices, and the rows sync like everything else.
 *
 * **A trainer employed at a gym is asked twice**, because they sell two things:
 * their own packs, and the packages the gym's counter sells. Adding a client
 * later asks who collects the money and then needs the matching price list, so
 * a gym-employed trainer with no gym packages has a dead end waiting for them.
 * That is why Continue holds until at least one is entered — Skip in the app bar
 * still passes on the whole step, which is a different and honest answer.
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
import { getTrainer, updateTrainer } from '../../api/trainer';
import type PackModel from '../../db/models/Pack';
import {
  Button,
  Callout,
  CalloutStrong,
  Control,
  FieldLabel,
  FieldMsg,
  IconPercent,
  IconPlus,
  IconTrash,
  IconWallet,
  List,
  Row,
  Segmented,
  colors,
  space,
} from '../../design';
import PackSheet, { BLANK_GYM_PACK, BLANK_PACK, type PackDraft } from '../main/money/PackSheet';
import { SetupBar, SetupBody, SetupFoot, SetupScreen, SetupSub, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Packs'>;
};

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

  /** Where they work. Null until the profile answers — the question is asked below. */
  const [atGym, setAtGym] = useState<boolean | null>(null);
  const [gymName, setGymName] = useState('');
  const [savedGym, setSavedGym] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);

  // The gym, if there is one, comes from the profile rather than being asked
  // again — a trainer who already told us where they work should not have to
  // repeat it to get a price list.
  useEffect(() => {
    let alive = true;
    getTrainer()
      .then(({ data }) => {
        if (!alive) return;
        const name = data.gymName ?? '';
        setSavedGym(name || null);
        setGymName(name);
        setAtGym(name.length > 0 ? true : null);
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

  /** Puts the typed gym name on the profile, once, and only when it changed. */
  const persistGym = async () => {
    const next = gymName.trim();
    if (!next || next === savedGym) return;
    try {
      await updateTrainer({ gymName: next });
      setSavedGym(next);
    } catch {
      /* Offline. The packs are already on the phone; the name goes up later. */
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

  const trimmedGym = gymName.trim();
  /** The gym is only real once it has a name — an unnamed price list belongs to nobody. */
  const gym = atGym === true && trimmedGym.length > 0 ? trimmedGym : null;
  const needsGymPacks = gym != null && gymPacks.length === 0;

  const onContinue = async () => {
    setPressed(true);
    if (atGym === true && trimmedGym.length === 0) return;
    if (needsGymPacks) return;

    // Written before leaving, in case the name was edited after the packages
    // were added — the profile has to end up saying what the screen said.
    if (atGym === true) await persistGym();
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

        {/* ------------------------------------------------- the gym's list */}

        <Text style={styles.group}>Where you work</Text>
        <Segmented
          options={[
            { key: 'own', label: 'On my own' },
            { key: 'gym', label: 'At a gym' },
          ]}
          value={atGym === true ? 'gym' : 'own'}
          onChange={(key) => setAtGym(key === 'gym')}
        />

        {atGym === true ? (
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
                : 'Their share of a session is set later, in Money → Gym share.'}
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
        ) : (
          <Callout icon={IconPercent} style={styles.note}>
            One rule worth knowing:{' '}
            <CalloutStrong>a shorter pack should cost more per session</CalloutStrong> than a longer
            one. Otherwise the longer one gives nobody a reason to commit.
          </Callout>
        )}
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
  list: { marginTop: space.s2 },
  blank: { fontSize: 13.5, color: colors.ink3, marginTop: space.s3 },
  add: { marginTop: space.s3 },
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
  note: { marginTop: 'auto' },
});
