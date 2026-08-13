/**
 * 4b · Packs — what you sell.
 *
 * The price list the trainer defined at setup, what each pack works out to per
 * session, and how many people are on it. Retiring a pack never touches a pack
 * somebody already bought: it stops being offered, and every package sold from
 * it stays exactly as it was.
 *
 * The callout does the arithmetic nobody does — **a shorter pack should cost
 * more per session** — and says whether this price list actually gets it right.
 *
 * "Ending soon" is here rather than on the roster because renewing is a money
 * decision, and this is where the prices are.
 */

import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useMoney } from '../../../money/useMoney';
import { buildPacks, rupees } from '../../../money/money';
import { createPack, setPackStatus, updatePack } from '../../../db/money';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Avatar,
  Button,
  Callout,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconPercent,
  IconPlus,
  IconWallet,
  List,
  Row,
  Tag,
  Toast,
  colors,
  space,
} from '../../../design';
import PackSheet, { BLANK_PACK, type PackDraft } from './PackSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function PacksScreen() {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const { trainerId } = useAuth();
  const { input, now, ready } = useMoney(focused);

  const [editing, setEditing] = useState<PackDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const view = useMemo(() => buildPacks(input, now), [input, now]);
  const mostSold = useMemo(() => {
    const top = [...view.selling].sort((a, b) => b.clients - a.clients)[0];
    return top && top.clients > 0 ? top.id : null;
  }, [view.selling]);

  const save = async (pack: PackDraft) => {
    setEditing(null);
    if (!trainerId) return;
    try {
      if (pack.id) {
        await updatePack(pack.id, {
          name: pack.name,
          type: pack.type,
          sessions: pack.sessions,
          amount: pack.amount,
          validityDays: pack.validityDays,
        });
        setNotice('Saved. Packs already sold are untouched.');
      } else {
        await createPack({
          trainerId,
          name: pack.name,
          type: pack.type,
          sessions: pack.sessions,
          amount: pack.amount,
          validityDays: pack.validityDays,
          orderIndex: input.packs.length,
        });
        setNotice(`${pack.name} added to your price list.`);
      }
    } catch {
      setNotice('Could not save that pack.');
    }
  };

  const retire = (id: string, name: string, clients: number) => {
    Alert.alert(
      `Stop selling ${name}?`,
      clients > 0
        ? `${clients} client${clients === 1 ? ' is' : 's are'} on it. They keep exactly what they bought — it just stops being offered to anyone new.`
        : 'It stops being offered. You can bring it back any time.',
      [
        { text: 'Keep selling it', style: 'cancel' },
        {
          text: 'Retire it',
          onPress: () => {
            void setPackStatus(id, 'inactive')
              .then(() => setNotice(`${name} retired.`))
              .catch(() => setNotice('Could not retire that pack.'));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Packs"
          subtitle={view.subtitle}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <IconButton
              icon={IconPlus}
              label="Add a pack"
              bare
              onPress={() => setEditing({ ...BLANK_PACK })}
            />
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {view.selling.length === 0 && ready ? (
          <Empty
            icon={IconWallet}
            title="No price list yet"
            body="Add what you sell — a 16-session pack, a monthly fee, whatever you actually charge. Everything else on this screen is built from it."
            style={styles.empty}
            action={
              <Button
                label="Add your first pack"
                size="lg"
                icon={IconPlus}
                onPress={() => setEditing({ ...BLANK_PACK })}
              />
            }
          />
        ) : (
          <>
            <GroupHead label="What you sell" count={view.selling.length} style={styles.head} />
            <List>
              {view.selling.map((pack) => (
                <Row
                  key={pack.id}
                  grouped
                  title={`${pack.name} · ${rupees(pack.amount)}`}
                  subtitle={pack.detail}
                  leading={<IconWallet size={20} color={colors.ink2} />}
                  trailing={pack.id === mostSold ? <Tag label="Most sold" tone="accent" /> : undefined}
                  onPress={() =>
                    setEditing({
                      id: pack.id,
                      name: pack.name,
                      type: pack.type as PackDraft['type'],
                      sessions: pack.sessions,
                      amount: pack.amount,
                      validityDays: null,
                    })
                  }
                  onLongPress={() => retire(pack.id, pack.name, pack.clients)}
                />
              ))}
            </List>
          </>
        )}

        {view.ending.length > 0 ? (
          <>
            <GroupHead label="Ending soon" count={view.ending.length} tone="alert" style={styles.head} />
            <List>
              {view.ending.map((row) => (
                <Row
                  key={row.packageId}
                  grouped
                  severity="alert"
                  title={row.name}
                  subtitle={row.detail}
                  leading={<Avatar name={row.name} size="sm" />}
                  trailing={
                    <Button
                      label="Renew"
                      size="sm"
                      variant="ghost"
                      onPress={() => navigation.navigate('MoneyBook', { clientId: row.clientId })}
                    />
                  }
                  onPress={() => navigation.navigate('MoneyBook', { clientId: row.clientId })}
                />
              ))}
            </List>
          </>
        ) : null}

        {view.retired.length > 0 ? (
          <>
            <GroupHead label="Retired" count={view.retired.length} style={styles.head} />
            <List>
              {view.retired.map((pack) => (
                <Row
                  key={pack.id}
                  grouped
                  dim
                  title={`${pack.name} · ${rupees(pack.amount)}`}
                  subtitle={
                    pack.clients > 0
                      ? `${pack.clients} still on it — no longer offered`
                      : 'No longer offered'
                  }
                  leading={<IconWallet size={20} color={colors.ink3} />}
                  trailing={
                    <Button
                      label="Bring back"
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        void setPackStatus(pack.id, 'active')
                          .then(() => setNotice(`${pack.name} is back on the list.`))
                          .catch(() => setNotice('Could not bring that back.'));
                      }}
                    />
                  }
                />
              ))}
            </List>
          </>
        ) : null}

        {view.priceNote ? (
          <Callout icon={IconPercent} style={styles.note}>
            {view.priceNote}
          </Callout>
        ) : null}
      </ScrollView>

      <PackSheet
        visible={editing !== null}
        draft={editing}
        onSave={(pack) => void save(pack)}
        onClose={() => setEditing(null)}
      />

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  head: { marginHorizontal: -space.inset },
  empty: { marginTop: space.s7 },
  note: { marginTop: space.s5 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
