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
 * Skippable, and honestly so: plenty of trainers quote a number per client. The
 * Money screen's empty state asks again at the moment it actually matters.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { useSetup } from '../../setup/SetupContext';
import { useAuth } from '../../store/AuthContext';
import { createPack, packsCollection, setPackStatus } from '../../db/money';
import type PackModel from '../../db/models/Pack';
import {
  Button,
  Callout,
  CalloutStrong,
  IconPercent,
  IconPlus,
  IconTrash,
  IconWallet,
  List,
  Row,
  colors,
  space,
} from '../../design';
import PackSheet, { BLANK_PACK, type PackDraft } from '../main/money/PackSheet';
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
  const { patch, skip, finish } = useSetup();
  const { trainerId } = useAuth();
  const [packs, setPacks] = useState<PackModel[]>([]);
  const [editing, setEditing] = useState<PackDraft | null>(null);

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
        setPacks(live);
        patch({ packCount: live.length });
      });
    return () => {
      alive = false;
    };
  }, [patch]);

  useFocusEffect(reload);

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
      orderIndex: packs.length,
    });
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

        <Callout icon={IconPercent} style={styles.note}>
          One rule worth knowing: <CalloutStrong>a shorter pack should cost more per session</CalloutStrong>{' '}
          than a longer one. Otherwise the longer one gives nobody a reason to commit.
        </Callout>
      </SetupBody>

      <SetupFoot>
        <Button
          label="Continue"
          variant="primary"
          size="lg"
          block
          onPress={() => navigation.navigate('Payment')}
        />
      </SetupFoot>

      <PackSheet
        visible={editing !== null}
        draft={editing}
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
  note: { marginTop: 'auto' },
});
