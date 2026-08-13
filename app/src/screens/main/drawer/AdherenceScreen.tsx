/**
 * 4c · Adherence.
 *
 * A seven-cell strip per client — trained, missed, rest — and **rest days never
 * count against anyone.** That single rule is the difference between a compliance
 * score a trainer trusts and one they argue with, and a score they argue with is
 * a score they ignore.
 *
 * Computed live, on this frame, from rows already on the phone. Trainerize's
 * scores are "calculated every Sunday night" and read on a web dashboard; both
 * decisions make the number arrive too late to act on, which is the only reason
 * to compute it at all.
 *
 * Slipping is listed **first**, above on-track. The screen exists to find the
 * five people who need a message today, and putting eighteen fine ones above them
 * means scrolling past good news to reach the work.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useReports } from '../../../reports/useReports';
import {
  ADHERENCE_SORTS,
  buildAdherence,
  type AdherenceClient,
  type AdherenceSort,
} from '../../../reports/reports';
import {
  AppBar,
  Avatar,
  Callout,
  CalloutStrong,
  Empty,
  GroupHead,
  IconBack,
  IconBadge,
  IconButton,
  IconPercent,
  IconSort,
  Legend,
  List,
  Menu,
  Reveal,
  Row,
  Skeleton,
  SkeletonRow,
  Streak,
  Tally,
  colors,
  radius,
  space,
  tnum,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function AdherenceScreen() {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const { input, now, ready } = useReports(focused);

  const [sort, setSort] = useState<AdherenceSort>('worst');
  const [sortOpen, setSortOpen] = useState(false);

  const view = useMemo(() => buildAdherence(input, now, sort), [input, now, sort]);

  /** Whether any strip has a session the trainer never closed off. */
  const hasOpen = useMemo(
    () =>
      [...view.slipping, ...view.onTrack, ...view.quiet].some((r) =>
        r.week.includes('unknown'),
      ),
    [view],
  );

  const group = (label: string, rows: AdherenceClient[], alert = false) =>
    rows.length ? (
      <View key={label}>
        <GroupHead label={label} count={rows.length} tone={alert ? 'alert' : 'default'} />
        <List>
          {rows.map((row) => (
            <Row
              key={row.clientId}
              grouped
              severity={alert ? 'alert' : undefined}
              leading={<Avatar name={row.name} size="sm" />}
              title={row.name}
              subtitle={row.meta}
              onPress={() => navigation.navigate('ClientDetail', { clientId: row.clientId })}
              trailing={
                <View style={styles.trailing}>
                  <Streak days={row.week} />
                  {/* A dash, not "0%". A quiet client has no rate — nothing was
                      scheduled, so there is nothing to be a percentage of. */}
                  <PercentText percent={row.percent} />
                </View>
              }
            />
          ))}
        </List>
      </View>
    ) : null;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Adherence"
          subtitle={ready ? view.subtitle : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={<IconButton icon={IconSort} label="Sort" bare onPress={() => setSortOpen(true)} />}
        />
      </View>

      <Reveal ready={ready} skeleton={<AdherenceSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {view.empty ? (
            <Empty
              icon={IconBadge}
              title="Nobody to score yet"
              body="Adherence is sessions you scheduled that a client completed. It fills in as soon as the diary does."
              style={styles.empty}
            />
          ) : (
            <>
              <Tally
                style={styles.tally}
                items={[
                  { key: 'ok', value: String(view.tally.onTrack), label: 'on track', tone: 'ok' },
                  { key: 'slip', value: String(view.tally.slipping), label: 'slipping', tone: 'warn' },
                  { key: 'quiet', value: String(view.tally.quiet), label: 'quiet' },
                ]}
              />

              <Legend
                style={styles.legend}
                entries={[
                  { key: 'done', label: 'Trained', color: colors.ok },
                  { key: 'miss', label: 'Missed', color: colors.danger },
                  { key: 'rest', label: 'Rest day', color: colors.lineStrong },
                  // Only when there is one to explain. A permanent fourth entry
                  // for a state most weeks don't contain is a legend teaching a
                  // colour the reader will never see.
                  ...(hasOpen
                    ? [{ key: 'open', label: 'Not closed off', color: colors.surface3 }]
                    : []),
                ]}
              />

              {group('Slipping', view.slipping, true)}
              {group('On track', view.onTrack)}
              {group('Quiet', view.quiet)}

              <Callout icon={IconPercent} style={styles.note}>
                Adherence counts{' '}
                <CalloutStrong>sessions you scheduled that they completed</CalloutStrong> — rest days
                never count against anyone. Trainerize recalculates this weekly; we do it live, so a
                Tuesday miss shows on Tuesday.
              </Callout>
            </>
          )}
        </ScrollView>
      </Reveal>

      {sortOpen ? (
        <Pressable style={styles.menuLayer} onPress={() => setSortOpen(false)}>
          <Menu
            style={styles.menu}
            actions={ADHERENCE_SORTS.map((option) => ({
              key: option.key,
              label: sort === option.key ? `${option.label} ·` : option.label,
              onPress: () => {
                setSort(option.key);
                setSortOpen(false);
              },
            }))}
          />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

/** Its own component so the dash case is stated once rather than inline three times. */
function PercentText({ percent }: { percent: number | null }) {
  return (
    <View style={styles.percent}>
      <Text style={[styles.percentText, toneFor(percent)]}>
        {percent == null ? '—' : `${percent}%`}
      </Text>
    </View>
  );
}

function toneFor(percent: number | null) {
  if (percent == null) return { color: colors.ink3 };
  if (percent >= 80) return { color: colors.ok };
  if (percent >= 50) return { color: colors.warn };
  return { color: colors.danger };
}

function AdherenceSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Working out adherence">
      <Skeleton height={44} round={radius.r2} style={styles.tally} />
      <Skeleton width={112} height={10} style={styles.headGap} />
      <List>
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonRow key={i} grouped trailing />
        ))}
      </List>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  tally: { marginTop: space.s3 },
  legend: { marginTop: space.s3 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  // Fixed width so the strips line up down the list. A ragged right edge on
  // seven-cell strips makes them impossible to compare at a glance.
  percent: { minWidth: 40, alignItems: 'flex-end' },
  percentText: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2, ...tnum },
  headGap: { marginTop: space.s5, marginBottom: space.s3 },
  note: { marginTop: space.s4 },
  empty: { marginTop: space.s7 },

  menuLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim, justifyContent: 'center' },
  menu: { alignSelf: 'center' },
});
