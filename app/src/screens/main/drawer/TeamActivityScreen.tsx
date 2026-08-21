/**
 * 6k · who changed what, on whose clients.
 *
 * ── Why a coach can read this, and not only an admin ──────────────────────
 *
 * This screen is the reason Phase 3's editing is acceptable at all. An admin can
 * change a coach's client's Tuesday; the coach can see that it happened, who did
 * it, and what it said. A log only its authors could read would be an account of
 * nothing.
 *
 * So the scope inverts by role, server-side: **a coach sees the changes made to
 * their clients; an admin sees the team's.** Same endpoint, and the difference
 * comes out of `TeamScope` rather than out of a query parameter the app could
 * get wrong.
 *
 * ── The sentences are the server's ────────────────────────────────────────
 *
 * "Changed Barbell Squat to 4 × 6 on Meera's day 2" is written at the moment of
 * the edit and stored, not rebuilt here. Rebuilding it from current state would
 * produce a different sentence every time the plan changed again, which is the
 * one thing an account of a change must not do. This screen renders prose it did
 * not compose, on purpose.
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { fetchTeamActivity, type TeamActivityRow } from '../../../api/team';
import { relativePast } from '../../../home/time';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Avatar,
  Banner,
  Empty,
  IconBack,
  IconButton,
  IconCloudOff,
  IconShield,
  List,
  Row,
  SkeletonRow,
  Tag,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'TeamActivity'>;

export default function TeamActivityScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const { trainerId } = useAuth();

  const [rows, setRows] = useState<TeamActivityRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchTeamActivity(params?.clientId));
    } finally {
      setLoading(false);
    }
  }, [params?.clientId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const now = Date.now();

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Team changes"
          subtitle={rows && rows.length > 0 ? `${rows.length} recent` : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading && rows !== null} onRefresh={load} tintColor={colors.accent} />
        }
      >
        {offline ? (
          <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
            This log lives online. Nothing has been missed — it just needs a connection to read.
          </Banner>
        ) : null}

        {rows === null && !offline ? (
          <View style={styles.skeleton}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}

        {rows !== null && rows.length === 0 ? (
          <Empty
            icon={IconShield}
            title="Nobody has changed anything"
            body="When a teammate edits one of your clients' plans, it shows up here with their name on it."
            style={styles.empty}
          />
        ) : null}

        {rows && rows.length > 0 ? (
          <List>
            {rows.map((row) => {
              // "You changed…" reads better than your own name, and it is the
              // fastest way for an admin to separate their own edits from a
              // colleague's in a shared list.
              const actor = row.actorTrainerId === trainerId ? 'You' : row.actorName ?? 'A teammate';
              const mine = row.subjectTrainerId === trainerId;
              return (
                <Row
                  key={row.id}
                  grouped
                  wrap
                  leading={<Avatar name={row.actorName ?? ''} size="sm" />}
                  title={`${actor} · ${relativePast(row.createdAt, now)}`}
                  subtitle={row.summary}
                  trailing={mine ? <Tag label="Your client" tone="accent" /> : undefined}
                  onPress={
                    row.clientId
                      ? () =>
                          navigation.navigate('TeamClient', {
                            clientId: row.clientId as string,
                            name: row.clientName ?? 'Client',
                          })
                      : undefined
                  }
                />
              );
            })}
          </List>
        ) : null}

        {rows && rows.length > 0 ? (
          <Text style={styles.hint}>
            Every change a teammate makes to one of your clients is listed here. Nothing can be
            removed from this list.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  banner: { marginBottom: space.s4 },
  skeleton: { gap: space.s2, marginTop: space.s4 },
  empty: { marginTop: space.s7 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.ink3, marginTop: space.s3 },
});
