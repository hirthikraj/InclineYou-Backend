/**
 * 6l · what the team took. Owner only.
 *
 * ── The one place money crosses between coaches ───────────────────────────
 *
 * Everywhere else in this feature money is invisible across coaches, and that is
 * the promise the money book rests on. This screen is the carve-out the PRD
 * argued for in §0.4: it is what a gym owner is actually buying when the coach
 * layer is sold to them, and without it "the owner's numbers" is a spreadsheet
 * they keep by hand.
 *
 * It stays a carve-out because of what it refuses to show. **Totals, counts, and
 * a client count — never a payment, never a client's name.** "Who paid what" is
 * not derivable from this screen, which is the line between an owner's P&L and
 * reading somebody else's money book.
 *
 * ── And the coaches were told ─────────────────────────────────────────────
 *
 * Phase 1's invitation screen promised nobody could see what another coach had
 * collected. This endpoint narrows that, so the copy on 6d and 6a changed in the
 * same commit rather than after somebody noticed. The note at the bottom of this
 * screen exists for the owner reading it: what they are seeing, the coaches know
 * they can see.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { fetchTeamRevenue, TeamError, type TeamRevenue } from '../../../api/team';
import { rupees } from '../../../home/time';
import {
  AppBar,
  Avatar,
  Banner,
  Bar,
  Callout,
  Empty,
  Figures,
  IconBack,
  IconButton,
  IconCloudOff,
  IconLock,
  IconRupee,
  List,
  Row,
  Segmented,
  SkeletonRow,
  Tag,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Range = 'month' | 'last' | 'year';

export default function TeamRevenueScreen() {
  const navigation = useNavigation<Nav>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const [range, setRange] = useState<Range>('month');
  const [data, setData] = useState<TeamRevenue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (which: Range) => {
      setLoading(true);
      try {
        const { from, to } = bounds(which);
        setData(await fetchTeamRevenue(from, to));
        setError(null);
      } catch (e) {
        setError(e instanceof TeamError ? e.message : 'Could not load the team’s numbers.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void load(range);
    }, [load, range]),
  );

  /**
   * Bars are drawn against the biggest coach rather than against the team total.
   *
   * Against the total, a team of five reads as five short bars and the shape says
   * nothing. Against the leader, the question the owner actually has — who is
   * carrying this and who is not — is legible at a glance.
   */
  const top = useMemo(
    () => Math.max(1, ...(data?.coaches ?? []).map((coach) => coach.collected)),
    [data],
  );

  const nobodyEarned = data !== null && data.teamCollected === 0;
  const hasGym = data !== null && data.teamGymShare > 0 && data.teamCollected > 0;
  const kept = data ? data.teamCollected - data.teamGymShare : 0;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Team earnings"
          subtitle={data ? `${data.from} to ${data.to}` : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading && data !== null}
            onRefresh={() => load(range)}
            tintColor={colors.accent}
          />
        }
      >
        <Segmented<Range>
          options={[
            { key: 'month', label: 'This month' },
            { key: 'last', label: 'Last month' },
            { key: 'year', label: 'This year' },
          ]}
          value={range}
          onChange={setRange}
          style={styles.range}
        />

        {offline ? (
          <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
            The team’s numbers live online. Your own money book is on the Money tab and works
            offline.
          </Banner>
        ) : null}

        {error && data === null ? (
          <Banner tone="error" style={styles.banner}>
            {error}
          </Banner>
        ) : null}

        {data === null && !offline && error === null ? (
          <View style={styles.skeleton}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}

        {data ? (
          <>
            {/* The money book's own pair, reused rather than a second stat block
                invented for this screen. The right-hand figure is the gym's cut
                where there is a gym, and the team's coach count where there is
                not — a ₹0 "gym's cut" would claim an arrangement that does not
                exist, which V11 was careful about. */}
            <Figures
              collected={rupees(data.teamCollected)}
              owed={hasGym ? rupees(data.teamGymShare) : String(data.coaches.length)}
              labels={['Team collected', hasGym ? 'Gym’s cut' : 'Coaches']}
              // The gym's cut is a slice OF what was collected, not a second
              // pile beside it, so the bar reads as the split it is. With no gym
              // the right-hand figure is a headcount, which is not part of a
              // whole at all — `bar={false}` is exactly what that case is for.
              bar={hasGym}
              collectedPart={hasGym ? kept / data.teamCollected : 1}
              owedPart={hasGym ? data.teamGymShare / data.teamCollected : 0}
              legend={hasGym ? ['your coaches', 'the gym'] : undefined}
              style={styles.figures}
            />

            {nobodyEarned ? (
              <Empty
                icon={IconRupee}
                title="Nothing recorded yet"
                body="Payments show up here as coaches record them. Nothing is missing — the range is just empty."
                compact
                style={styles.empty}
              />
            ) : (
              <List style={styles.list}>
                {data.coaches.map((coach) => (
                  <Row
                    key={coach.trainerId}
                    grouped
                    wrap
                    leading={<Avatar name={coach.coachName ?? ''} size="sm" />}
                    title={coach.coachName ?? 'Coach'}
                    subtitle={coachLine(coach.payments, coach.payingClients)}
                    trailing={<Text style={styles.amount}>{rupees(coach.collected)}</Text>}
                  />
                ))}
              </List>
            )}

            {!nobodyEarned ? (
              <View style={styles.bars}>
                {data.coaches
                  .filter((coach) => coach.collected > 0)
                  .map((coach) => (
                    <View key={coach.trainerId} style={styles.barRow}>
                      <Text numberOfLines={1} style={styles.barName}>
                        {(coach.coachName ?? 'Coach').split(' ')[0]}
                      </Text>
                      <Bar
                        segments={[
                          {
                            key: coach.trainerId,
                            fraction: coach.collected / top,
                            color: colors.accent,
                          },
                        ]}
                        style={styles.bar}
                      />
                    </View>
                  ))}
              </View>
            ) : null}

            {/* For the owner, not for reassurance: what they are seeing, the
                coaches have been told they can see. */}
            <Callout icon={IconLock} style={styles.note}>
              Totals only — no individual payments and no client names, and your coaches know you
              see this much. Each coach’s own money book stays theirs.
            </Callout>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** ISO bounds. Computed here rather than server-side so the labels and the query agree. */
function bounds(range: Range): { from: string; to: string } {
  const now = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (range === 'last') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(first), to: iso(last) };
  }
  if (range === 'year') {
    return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  }
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

/** "12 payments · 7 clients" — a count, which is all this screen ever says about clients. */
function coachLine(payments: number, payingClients: number): string {
  if (payments === 0) return 'Nothing recorded';
  const entries = payments === 1 ? '1 payment' : `${payments} payments`;
  const clients = payingClients === 1 ? '1 client' : `${payingClients} clients`;
  return `${entries} · ${clients}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  range: { marginBottom: space.s4 },
  banner: { marginBottom: space.s4 },
  skeleton: { gap: space.s2 },
  figures: { marginBottom: space.s4 },
  list: { marginBottom: space.s4 },
  empty: { marginVertical: space.s5 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.ink },
  bars: { gap: space.s2, marginBottom: space.s4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  barName: { width: 64, fontSize: 12, color: colors.ink3 },
  bar: { flex: 1 },
  note: { marginTop: space.s2 },
});
