/**
 * What one client has bought.
 *
 * Not the price list — that is § 06 · 4b, the trainer's own packs, and it lives
 * on the Money tab. This is the other side of it: the packs *this person* is
 * actually holding, which is what the roster's "pack running low" and the
 * diary's "open pack" are both asking to see.
 *
 * The live pack is the whole screen. A trainer opening this is answering one
 * of two questions — how many sessions are left, or what is still owed — and
 * both of those are about the pack that is running now. Everything expired is a
 * receipt, so it goes below a rule and reads dimmer.
 *
 * Selling a new one is a sheet rather than a screen: four fields, opened from
 * a decision already made, and pushing a screen for it would put a back button
 * between the trainer and the till.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../navigation/MainStack';
import { observePackages, createPackage } from '../../db/packages';
import { observeClient } from '../../db/clients';
import { useAuth } from '../../store/AuthContext';
import { rupees } from '../../home/time';
import type PackageModel from '../../db/models/Package';
import {
  AppBar,
  Button,
  Control,
  Empty,
  FieldLabel,
  GroupHead,
  IconBack,
  IconButton,
  IconPlus,
  IconWallet,
  List,
  Reveal,
  Row,
  RowValue,
  Segmented,
  Sheet,
  Skeleton,
  SkeletonRow,
  Tag,
  Toast,
  colors,
  space,
  type TagTone,
} from '../../design';

type Props = NativeStackScreenProps<MainStackParamList, 'PackageList'>;

type PackType = 'session_pack' | 'monthly';

const TYPE_LABEL: Record<string, string> = {
  session_pack: 'Session pack',
  monthly: 'Monthly',
};

const STATUS: Record<string, { label: string; tone: TagTone }> = {
  active: { label: 'Running', tone: 'accent' },
  overdue: { label: 'Overdue', tone: 'danger' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function PackageListScreen({ route, navigation }: Props) {
  const { clientId, clientName } = route.params;
  const { trainerId } = useAuth();

  const [packages, setPackages] = useState<PackageModel[]>([]);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState<string | null>(clientName ?? null);

  const [selling, setSelling] = useState(false);
  const [type, setType] = useState<PackType>('session_pack');
  const [sessions, setSessions] = useState('');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const sub = observePackages(clientId).subscribe((next) => {
      setPackages(next);
      setReady(true);
    });
    return () => sub.unsubscribe();
  }, [clientId]);

  useEffect(() => {
    const sub = observeClient(clientId).subscribe((client) => {
      if (client?.name) setName(client.name);
    });
    return () => sub.unsubscribe();
  }, [clientId]);

  const { live, done } = useMemo(() => {
    const l: PackageModel[] = [];
    const d: PackageModel[] = [];
    for (const pkg of packages) (pkg.status === 'active' || pkg.status === 'overdue' ? l : d).push(pkg);
    return { live: l, done: d };
  }, [packages]);

  const reset = () => {
    setType('session_pack');
    setSessions('');
    setAmount('');
    setFrom('');
    setUntil('');
  };

  const sell = async () => {
    const value = parseFloat(amount);
    if (!value || Number.isNaN(value)) {
      setNotice('A pack needs a price.');
      return;
    }
    if (!trainerId) {
      setNotice('Not signed in yet — try again in a moment.');
      return;
    }
    setSaving(true);
    try {
      await createPackage({
        trainerId,
        clientId,
        type,
        sessionsTotal: type === 'session_pack' && sessions ? parseInt(sessions, 10) : undefined,
        amount: value,
        startDate: from || undefined,
        endDate: until || undefined,
      });
      setSelling(false);
      reset();
      setNotice(`${TYPE_LABEL[type]} sold. Record the payment when it lands.`);
    } catch {
      setNotice('Could not save that pack.');
    } finally {
      setSaving(false);
    }
  };

  /** "8 of 12 left · ₹3,000" for a pack, dates for a month. */
  const detail = (pkg: PackageModel): string => {
    if (pkg.type === 'session_pack') {
      const left = pkg.sessionsRemaining ?? 0;
      const total = pkg.sessionsTotal ?? null;
      return `${left} of ${total ?? '?'} left · ${rupees(pkg.amount)}`;
    }
    const span = [day(pkg.startDate), day(pkg.endDate)].filter(Boolean).join(' → ');
    return span ? `${rupees(pkg.amount)} · ${span}` : rupees(pkg.amount);
  };

  const row = (pkg: PackageModel, dim = false) => {
    const status = STATUS[pkg.status] ?? { label: pkg.status, tone: 'neutral' as TagTone };
    const pack = pkg.type === 'session_pack';
    return (
      <Row
        key={pkg.id}
        grouped
        dim={dim}
        title={TYPE_LABEL[pkg.type] ?? pkg.type}
        subtitle={detail(pkg)}
        severity={pkg.status === 'overdue' ? 'critical' : undefined}
        trailing={
          pack ? (
            <RowValue value={String(pkg.sessionsRemaining ?? 0)} unit="left" minWidth={44} />
          ) : (
            <Tag label={status.label} tone={status.tone} />
          )
        }
        onPress={() => navigation.navigate('PackageDetail', { packageId: pkg.id, clientId })}
      />
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Packs"
          subtitle={name ?? undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={<IconButton icon={IconPlus} label="Sell a pack" bare onPress={() => setSelling(true)} />}
        />
      </View>

      <Reveal ready={ready} skeleton={<PackListSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {packages.length === 0 ? (
            <Empty
              icon={IconWallet}
              title="Nothing sold to them yet"
              body="Sell a pack and the session count starts coming off it as you deliver. Until then there is nothing to run down."
              action={<Button label="Sell a pack" icon={IconPlus} onPress={() => setSelling(true)} />}
              style={styles.empty}
            />
          ) : (
            <>
              {live.length ? (
                <>
                  <GroupHead label="Running" count={live.length} />
                  <List style={styles.group}>{live.map((pkg) => row(pkg))}</List>
                </>
              ) : null}

              {done.length ? (
                <>
                  <GroupHead label="Finished" count={done.length} />
                  <List style={styles.group}>{done.map((pkg) => row(pkg, true))}</List>
                </>
              ) : null}

              <Button
                label="Sell another pack"
                icon={IconPlus}
                variant="secondary"
                block
                onPress={() => setSelling(true)}
                style={styles.sell}
              />
            </>
          )}
        </ScrollView>
      </Reveal>

      <Sheet visible={selling} onClose={() => setSelling(false)} title="Sell a pack">
        <Segmented
          options={[
            { key: 'session_pack', label: 'Session pack' },
            { key: 'monthly', label: 'Monthly' },
          ]}
          value={type}
          onChange={setType}
          style={styles.seg}
        />

        {type === 'session_pack' ? (
          <View style={styles.field}>
            <FieldLabel>How many sessions</FieldLabel>
            <Control
              value={sessions}
              onChangeText={setSessions}
              keyboardType="number-pad"
              placeholder="12"
            />
          </View>
        ) : null}

        <View style={styles.field}>
          <FieldLabel>Price</FieldLabel>
          <Control
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="3000"
            affix="₹"
          />
        </View>

        <View style={styles.dates}>
          <View style={styles.grow}>
            <FieldLabel>Starts</FieldLabel>
            <Control value={from} onChangeText={setFrom} placeholder="2026-08-01" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.grow}>
            <FieldLabel>Ends</FieldLabel>
            <Control value={until} onChangeText={setUntil} placeholder="2026-08-31" keyboardType="numbers-and-punctuation" />
          </View>
        </View>

        <Text style={styles.fine}>
          Dates are optional. A session pack runs until the sessions are gone; a month needs both
          ends to know when it lapsed.
        </Text>

        <Button
          label="Sell it"
          variant="primary"
          size="lg"
          block
          loading={saving}
          onPress={() => void sell()}
        />
      </Sheet>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function PackListSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading this client's packs">
      <Skeleton width={82} height={10} style={styles.headGap} />
      <List>
        <SkeletonRow grouped avatar={false} trailing />
        <SkeletonRow grouped avatar={false} trailing />
      </List>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  headGap: { marginTop: space.s5, marginBottom: space.s3 },
  group: { marginBottom: space.s2 },
  sell: { marginTop: space.s5 },
  empty: { marginTop: space.s7 },

  seg: { marginBottom: space.s4 },
  field: { marginBottom: space.s4 },
  dates: { flexDirection: 'row', gap: space.s2, marginBottom: space.s3 },
  grow: { flex: 1 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginBottom: space.s5 },

  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
