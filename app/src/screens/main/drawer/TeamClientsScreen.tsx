/**
 * 6f · the team's clients, grouped by coach.
 *
 * ── Online-only, and it says so rather than pretending ────────────────────
 *
 * The one screen in XRep with a real loading state and a real offline dead end,
 * because the data genuinely is not on the phone and must not be: mirroring
 * every coach's roster onto every admin's device multiplies the local database
 * by the size of the team, and an offline copy leaves with the phone when an
 * admin is removed. So this screen is honest about needing signal instead of
 * faking a cache — and everything an admin needs *on the floor* (their own
 * clients) is in the app's own roster, offline, where it always was.
 *
 * ── It is not a list, it is a question ────────────────────────────────────
 *
 * An owner opening this is not browsing 44 names. They are asking one of two
 * things: "who has whom" — answered by the grouping — and "is anybody being
 * dropped", answered by the drift count on each coach's header and the tone on
 * each row. `team/roster.ts` turns dates into that; a screen full of "last
 * session 19 Jun" would make the reader do the subtraction the screen exists to
 * have already done.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { fetchTeamClients, TeamError, type CoachClients } from '../../../api/team';
import { buildTeamRoster } from '../../../team/roster';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Avatar,
  Banner,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconCloudOff,
  IconUsers,
  List,
  Row,
  SkeletonRow,
  Tag,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function TeamClientsScreen() {
  const navigation = useNavigation<Nav>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const { trainerId } = useAuth();

  const [buckets, setBuckets] = useState<CoachClients[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBuckets(await fetchTeamClients());
      setError(null);
    } catch (e) {
      // Keep whatever is already on screen: a refresh that fails should not
      // replace a correct list from thirty seconds ago with an error page.
      setError(e instanceof TeamError ? e.message : 'Could not load the team’s clients.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // `now` is captured per render rather than per row, so every "quiet 23 days"
  // on the screen is measured from the same instant.
  const view = useMemo(
    () => buildTeamRoster(buckets ?? [], trainerId, Date.now()),
    [buckets, trainerId],
  );

  const subtitle = buckets
    ? `${view.totalClients} client${view.totalClients === 1 ? '' : 's'}` +
      (view.totalDrifting > 0 ? ` · ${view.totalDrifting} not training` : '')
    : undefined;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Team clients"
          subtitle={subtitle}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading && buckets !== null} onRefresh={load} tintColor={colors.accent} />
        }
      >
        {offline ? (
          <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
            Your team’s clients live online, so this needs a connection. Your own clients are on the
            Clients tab and work offline.
          </Banner>
        ) : null}

        {error && buckets === null ? (
          <Banner tone="error" style={styles.banner}>
            {error}
          </Banner>
        ) : null}

        {buckets === null && !offline && error === null ? (
          <View style={styles.skeleton}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}

        {buckets !== null && view.empty ? (
          <Empty
            icon={IconUsers}
            title="No clients in the team yet"
            body="Every coach’s clients show up here once they add them. Nobody’s money book is ever shown."
            style={styles.empty}
          />
        ) : null}

        {view.coaches.map((coach) => (
          <View key={coach.trainerId} style={styles.group}>
            <GroupHead
              label={coach.isMe ? `${coach.coachName} · you` : coach.coachName}
              count={coach.clients.length}
              // Warm ink only where somebody is being dropped, which is the one
              // thing on this screen that wants an admin's attention.
              tone={coach.drifting > 0 ? 'alert' : 'default'}
            />
            <Text style={styles.summary}>{coach.summary}</Text>
            <List>
              {coach.clients.map((client) => (
                <Row
                  key={client.id}
                  grouped
                  leading={<Avatar name={client.name} size="sm" />}
                  title={client.name}
                  subtitle={client.activity}
                  severity={client.tone === 'danger' ? 'alert' : undefined}
                  trailing={
                    client.gap ? (
                      <Tag
                        label={client.gap}
                        tone={client.tone === 'danger' ? 'danger' : 'warn'}
                      />
                    ) : undefined
                  }
                  onPress={() =>
                    navigation.navigate('TeamClient', { clientId: client.id, name: client.name })
                  }
                />
              ))}
            </List>
          </View>
        ))}
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
  group: { marginBottom: space.s5 },
  summary: { fontSize: 12, color: colors.ink3, marginBottom: space.s2 },
});
