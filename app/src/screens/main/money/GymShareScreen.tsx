/**
 * 5a · Gym share.
 *
 * 50% of floor sessions, 0% of remote — which is exactly why a trainer pushes
 * remote, and why that difference is stated as its own row rather than buried
 * in an average.
 *
 * The honest caveat is the point of the screen: **these are your figures, not
 * the gym's.** Train X does not talk to any gym's system, so if their number
 * differs, this is the one the trainer can show them.
 *
 * When no gym is set up, the screen becomes the place to set one up — because
 * the alternative is a "your share" line on the Money screen that quietly
 * claims 100% without anybody ever having said so.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useMoney } from '../../../money/useMoney';
import { buildGymShare, monthKey, periodLabel, rupees, signed } from '../../../money/money';
import { createSettlement, settleGymShare } from '../../../db/money';
import { updateTrainer } from '../../../api/trainer';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Bar,
  Button,
  Callout,
  Control,
  Empty,
  FieldLabel,
  GroupHead,
  IconBack,
  IconBuilding,
  IconButton,
  IconChevron,
  IconPercent,
  IconShield,
  IconWallet,
  Ledger,
  LedgerRow,
  List,
  Row,
  Toast,
  colors,
  space,
  tnum,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function GymShareScreen() {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const { trainerId } = useAuth();
  const { input, now, reloadProfile } = useMoney(focused);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [percent, setPercent] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const view = useMemo(() => buildGymShare(input, now, now), [input, now]);

  const openEditor = () => {
    setName(input.gym.name ?? '');
    setPercent(input.gym.percent != null ? String(input.gym.percent) : '');
    setEditing(true);
  };

  const save = async () => {
    const pct = Number(percent.replace(/[^0-9.]/g, ''));
    if (!name.trim() || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      setNotice('A gym name and a percentage between 0 and 100.');
      return;
    }
    setSaving(true);
    try {
      await updateTrainer({ gymName: name.trim(), gymSharePercent: pct });
      reloadProfile();
      setEditing(false);
      setNotice('Saved. New payments will use this split.');
    } catch {
      setNotice("Couldn't save that — you may be offline.");
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    setSaving(true);
    try {
      // An empty name clears the percentage with it, server-side. Half a gym
      // arrangement is worse than none.
      await updateTrainer({ gymName: '' });
      reloadProfile();
      setEditing(false);
      setNotice('Gym removed. Everything you collect is yours.');
    } catch {
      setNotice("Couldn't save that — you may be offline.");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------- no gym yet */

  if (!view || editing) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title={input.gym.name ? 'Gym share' : 'Set up your gym'}
            subtitle={input.gym.name ?? 'What the gym keeps of what you bill'}
            leading={
              <IconButton
                icon={IconBack}
                label="Back"
                bare
                onPress={() => (editing && view ? setEditing(false) : navigation.goBack())}
              />
            }
          />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {!editing ? (
            <Empty
              icon={IconBuilding}
              title="No gym on the book"
              body="If you train on a gym floor, they almost certainly take a cut of what you bill. Tell us the split and every figure on the Money screen shows what's actually yours."
              style={styles.empty}
              action={<Button label="Add the gym" size="lg" icon={IconBuilding} onPress={openEditor} />}
            />
          ) : (
            <>
              <View style={styles.field}>
                <FieldLabel>Which gym</FieldLabel>
                <Control
                  value={name}
                  onChangeText={setName}
                  placeholder="Anytime Fitness, Adyar"
                  accessibilityLabel="Gym name"
                />
              </View>
              <View style={styles.field}>
                <FieldLabel>What they keep</FieldLabel>
                <Control
                  value={percent}
                  onChangeText={setPercent}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  placeholder="50"
                  seg={<Text style={styles.pct}>%</Text>}
                  accessibilityLabel="Gym percentage"
                />
              </View>

              <Callout icon={IconPercent} style={styles.note}>
                Of floor sessions only. Remote sessions are always yours in full — which is the
                whole reason to push them.
              </Callout>

              <Button
                label="Save"
                size="lg"
                block
                loading={saving}
                style={styles.cta}
                onPress={() => void save()}
              />
              {input.gym.name ? (
                <Button
                  label="I've left this gym"
                  variant="ghost"
                  block
                  style={styles.leave}
                  onPress={() => void leave()}
                />
              ) : null}
            </>
          )}
        </ScrollView>

        {notice ? (
          <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
            {notice}
          </Toast>
        ) : null}
      </SafeAreaView>
    );
  }

  /* ------------------------------------------------------------------ 5a */

  const total = view.yours + view.theirs || 1;
  const period = monthKey(now);
  const alreadyRecorded = input.settlements.some((s) => s.period === period);

  const recordThisMonth = async () => {
    if (!trainerId) return;
    try {
      const due = new Date(now);
      due.setMonth(due.getMonth() + 1, 1);
      due.setHours(0, 0, 0, 0);
      await createSettlement({
        trainerId,
        period,
        amount: view.theirs,
        sessionsCounted: view.floorSessions,
        gymName: view.gymName,
        dueAt: due.getTime(),
      });
      setNotice(`${periodLabel(period)}'s share recorded as due.`);
    } catch {
      setNotice('Could not record that.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Gym share"
          subtitle={`${view.gymName} · ${view.percent}%`}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={<IconButton icon={IconPercent} label="Change the split" bare onPress={openEditor} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.figures}>
            <View>
              <Text style={styles.figLabel}>{`Yours in ${view.monthLabel}`}</Text>
              <Text style={[styles.figValue, styles.figOk]}>{rupees(view.yours)}</Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.figLabel}>Gym's</Text>
              <Text style={styles.figValueSmall}>{rupees(view.theirs)}</Text>
            </View>
          </View>
          <Bar
            style={styles.bar}
            segments={[
              { key: 'mine', fraction: view.yours / total, color: colors.accent },
              { key: 'theirs', fraction: view.theirs / total, color: colors.surface3 },
            ]}
          />
        </View>

        <GroupHead label="How the split works" style={styles.head} />
        <List>
          <Row
            grouped
            minHeight={56}
            title={`${view.percent}% of floor sessions`}
            subtitle={`${rupees(view.floorBilled)} collected · ${rupees(view.theirs)} to them`}
            leading={<IconPercent size={19} color={colors.ink2} />}
            trailing={<IconChevron size={18} color={colors.ink3} />}
            onPress={openEditor}
          />
          <Row
            grouped
            minHeight={56}
            title="0% of remote sessions"
            subtitle={
              view.remoteBilled > 0
                ? `${rupees(view.remoteBilled)} this month, all yours`
                : 'Nothing remote this month — it would all be yours'
            }
            leading={<IconWallet size={19} color={colors.ink2} />}
          />
        </List>

        <GroupHead
          label="What you owe the gym"
          // The count is what is still DUE. Printing a 0 beside a settled row
          // reads as a bug rather than as the good news it is.
          count={view.settlements.filter((s) => !s.settled).length || undefined}
          style={styles.head}
        />
        {view.settlements.length === 0 ? (
          <Text style={styles.blank}>Nothing recorded yet.</Text>
        ) : (
          <Ledger>
            {view.settlements.map((entry) => (
              <LedgerRow
                key={entry.id}
                direction="out"
                title={entry.title}
                detail={entry.detail}
                amount={signed(entry.amount, 'out')}
                note={entry.note}
                settled={entry.settled}
                onPress={
                  entry.settled
                    ? undefined
                    : () => {
                        void settleGymShare(entry.id)
                          .then(() => setNotice('Marked as settled.'))
                          .catch(() => setNotice('Could not save that.'));
                      }
                }
              />
            ))}
          </Ledger>
        )}

        {!alreadyRecorded && view.theirs > 0 ? (
          <Button
            label={`Record ${view.monthLabel}'s share · ${rupees(view.theirs)}`}
            variant="ghost"
            block
            style={styles.record}
            onPress={() => void recordThisMonth()}
          />
        ) : null}

        <Callout icon={IconShield} style={styles.note}>
          These are your own figures, not the gym's. Train X doesn't talk to your gym's system — if
          their number differs, this is the one you can show them.
        </Callout>
      </ScrollView>

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
  empty: { marginTop: space.s7 },
  field: { marginTop: space.s3 },
  pct: { fontSize: 16, fontWeight: '500', color: colors.ink },
  cta: { marginTop: space.s4 },
  leave: { marginTop: space.s2 },

  card: {
    marginTop: space.s3,
    padding: space.cardPad,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  figures: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  right: { alignItems: 'flex-end' },
  figLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 7,
  },
  figValue: { fontSize: 29, fontWeight: '800', letterSpacing: -1.02, color: colors.ink, ...tnum },
  figOk: { color: colors.ok },
  figValueSmall: { fontSize: 23, fontWeight: '800', letterSpacing: -0.8, color: colors.ink, ...tnum },
  bar: { marginTop: space.s4 },

  head: { marginHorizontal: -space.inset, marginTop: space.s3 },
  blank: { fontSize: 13, color: colors.ink3, paddingVertical: space.s3 },
  record: { marginTop: space.s3 },
  note: { marginTop: space.s4 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
