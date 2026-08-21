/**
 * 6g · a teammate's client, read-only.
 *
 * ── What is deliberately missing, and why the screen says so ──────────────
 *
 * There is no money on this screen. No packages, no payments, no split, at any
 * role including the owner's. That is the promise the whole money book rests on
 * (PRD §0.4), and the coach whose client this is has to be able to rely on it
 * without reading a design document.
 *
 * But an absence explains nothing by itself. A coach who inherits a client and
 * finds an empty money book concludes the data was lost — so the screen carries
 * a line naming the coach the earlier payments are recorded against. The server
 * sends `moneyHidden` for exactly this: the app should state the rule, not infer
 * it from a gap.
 *
 * ── Two things an admin can do from here ──────────────────────────────────
 *
 * Open the plan and change it (6j, Phase 3), or hand the client to a different
 * coach. The first is for covering a session; the second is for when the
 * arrangement itself has changed. Everything else on this screen is a read.
 *
 * Every edit made through 6j is written down and pushed to the coach whose client
 * it is — which is what makes the capability safe to offer, and why the handover
 * history and the change log sit side by side further down.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import {
  fetchAssignments,
  fetchTeamClient,
  TeamError,
  type AssignmentRow,
  type TeamClientDetail,
} from '../../../api/team';
import { buildTeamRoster } from '../../../team/roster';
import { useAuth } from '../../../store/AuthContext';
import { useTeam } from '../../../team/useTeam';
import { buildTeam } from '../../../team/team';
import { dayStamp } from '../../../home/time';
import ReassignSheet from './ReassignSheet';
import {
  AppBar,
  Avatar,
  Banner,
  Button,
  Callout,
  CalloutStrong,
  IconBack,
  IconButton,
  IconCloudOff,
  IconLayers,
  IconLock,
  IconSwap,
  Kv,
  KvRow,
  List,
  Row,
  SectionHead,
  SkeletonRow,
  Tag,
  Toast,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'TeamClient'>;

export default function TeamClientScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const { trainerId } = useAuth();

  const { input } = useTeam();
  const team = useMemo(() => buildTeam(input), [input]);

  const [detail, setDetail] = useState<TeamClientDetail | null>(null);
  const [history, setHistory] = useState<AssignmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [next, moves] = await Promise.all([
        fetchTeamClient(params.clientId),
        // The move log is a second request rather than part of the detail: it is
        // empty for almost every client, and an admin only looks after a handover
        // has already happened.
        fetchAssignments(params.clientId).catch(() => [] as AssignmentRow[]),
      ]);
      setDetail(next);
      setHistory(moves);
      setError(null);
    } catch (e) {
      setError(e instanceof TeamError ? e.message : 'Could not load that client.');
    } finally {
      setLoading(false);
    }
  }, [params.clientId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const activity = useMemo(() => {
    if (!detail) return null;
    // Reused rather than re-derived: "quiet 23 days" has to mean the same thing
    // here as it does on the list this screen was opened from.
    const [bucket] = buildTeamRoster(
      [{
        trainerId: detail.client.coachTrainerId,
        coachName: detail.client.coachName,
        role: 'coach',
        clients: [detail.client],
      }],
      trainerId,
      Date.now(),
    ).coaches;
    return bucket?.clients[0] ?? null;
  }, [detail, trainerId]);

  const coaches = team.sections
    .flatMap((section) => section.members)
    .filter((member) => !member.pending && member.trainerId);

  const name = detail?.client.name ?? params.name;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={name}
          subtitle={detail ? `Coached by ${detail.client.coachName ?? 'a teammate'}` : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading && detail !== null} onRefresh={load} tintColor={colors.accent} />
        }
      >
        {offline ? (
          <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
            A teammate’s client lives online. This needs a connection.
          </Banner>
        ) : null}

        {error && detail === null ? (
          <Banner tone="error" style={styles.banner}>
            {error}
          </Banner>
        ) : null}

        {detail === null && !offline && error === null ? (
          <View style={styles.skeleton}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}

        {detail ? (
          <>
            <View style={styles.hero}>
              <Avatar name={name} size="lg" />
              <View style={styles.heroMain}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {name}
                </Text>
                {activity ? (
                  <Text
                    style={[
                      styles.heroActivity,
                      activity.tone === 'danger' && styles.heroActivityAlert,
                    ]}
                  >
                    {activity.activity}
                  </Text>
                ) : null}
              </View>
              {activity?.gap ? (
                <Tag label={activity.gap} tone={activity.tone === 'danger' ? 'danger' : 'warn'} />
              ) : null}
            </View>

            <Kv style={styles.kv}>
              <KvRow label="Goal" value={detail.client.goal || '—'} />
              <KvRow
                label="Sessions a week"
                value={detail.client.status === 'archived' ? '—' : plan(detail)}
              />
              <KvRow label="Training" value={deliveryLabel(detail.client.deliveryMode)} />
              <KvRow label="Booked ahead" value={String(detail.client.upcomingSessions)} />
            </Kv>

            {/* The rule, stated. An empty money section would be read as a bug
                by the first coach who inherits somebody. */}
            <Callout icon={IconLock} style={styles.note}>
              <CalloutStrong>Money stays with the coach who collected it.</CalloutStrong> Packages
              and payments for {firstName(name)} aren’t shown here, and never are — not to admins,
              not to the owner.
            </Callout>

            <SectionHead label="Plan" count={detail.programs.length} first />
            {detail.programs.length === 0 ? (
              <Text style={styles.none}>No program yet.</Text>
            ) : (
              <List>
                {detail.programs.map((program) => (
                  <Row
                    key={program.id}
                    grouped
                    leading={<Avatar name={program.name} size="sm" square />}
                    title={program.name}
                    subtitle={`${program.exercises} exercise${program.exercises === 1 ? '' : 's'}${
                      program.startDate ? ` · from ${program.startDate}` : ''
                    }`}
                    trailing={
                      program.status === 'active' ? <Tag label="Active" tone="ok" /> : undefined
                    }
                    // Phase 3 · openable, and editable inside. The plan is the
                    // thing an admin covering a session actually needs to reach.
                    onPress={() =>
                      navigation.navigate('TeamProgram', {
                        programId: program.id,
                        name: program.name,
                      })
                    }
                  />
                ))}
              </List>
            )}

            <SectionHead label="Recent sessions" count={detail.recentSessions.length} />
            {detail.recentSessions.length === 0 ? (
              <Text style={styles.none}>Nothing on the calendar yet.</Text>
            ) : (
              <List>
                {detail.recentSessions.slice(0, 8).map((session) => (
                  <Row
                    key={session.id}
                    grouped
                    title={dayStamp(session.scheduledAt)}
                    subtitle={sessionLine(session.status, session.logged)}
                    dim={session.status === 'cancelled'}
                  />
                ))}
              </List>
            )}

            {detail.recentMetrics.length > 0 ? (
              <>
                <SectionHead label="Measurements" />
                <List>
                  {detail.recentMetrics.slice(0, 5).map((metric, index) => (
                    <Row
                      key={`${metric.metricType}-${metric.recordedAt}-${index}`}
                      grouped
                      title={`${metric.value} ${metric.unit}`}
                      subtitle={`${metric.metricType} · ${dayStamp(metric.recordedAt)}`}
                    />
                  ))}
                </List>
              </>
            ) : null}

            {history.length > 0 ? (
              <>
                <SectionHead label="Handovers" count={history.length} />
                <List>
                  {history.map((move) => (
                    <Row
                      key={move.id}
                      grouped
                      wrap
                      title={`${move.fromCoachName ?? 'A coach'} → ${move.toCoachName ?? 'a coach'}`}
                      subtitle={handoverLine(move)}
                    />
                  ))}
                </List>
              </>
            ) : null}

            <Row
              title="Recent changes"
              subtitle={`What the team has changed on ${firstName(name)}’s plan`}
              leading={<Avatar name={name} size="sm" />}
              onPress={() => navigation.navigate('TeamActivity', { clientId: params.clientId })}
              style={styles.changes}
            />

            <Button
              label="Hand to another coach"
              variant="secondary"
              size="lg"
              block
              icon={IconSwap}
              disabled={offline || coaches.length < 2}
              onPress={() => setReassigning(true)}
              style={styles.reassign}
            />
            {coaches.length < 2 ? (
              <Text style={styles.none}>
                There’s only one coach in the team, so there’s nobody to hand them to yet.
              </Text>
            ) : null}

            <Callout icon={IconLayers} style={styles.note}>
              Tap a plan to change it. {firstName(detail.client.coachName ?? 'The coach')} sees every
              change and who made it — hand the client over instead if the arrangement itself has
              changed.
            </Callout>
          </>
        ) : null}
      </ScrollView>

      <ReassignSheet
        visible={reassigning}
        clientName={name}
        currentCoachId={detail?.client.coachTrainerId ?? null}
        currentCoachName={detail?.client.coachName ?? null}
        clientId={params.clientId}
        coaches={coaches}
        hasProgram={(detail?.programs.length ?? 0) > 0}
        onClose={() => setReassigning(false)}
        onDone={(message) => {
          setReassigning(false);
          setNotice(message);
          void load();
        }}
      />

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ sentences */

function plan(detail: TeamClientDetail): string {
  const perWeek = detail.sessionsPerWeek;
  const minutes = detail.sessionDurationMinutes;
  if (perWeek == null) return '—';
  const base = `${perWeek}×`;
  return minutes == null ? base : `${base} · ${minutes} min`;
}

function deliveryLabel(mode: string | null): string {
  if (mode === 'remote') return 'Remote';
  if (mode === 'floor') return 'On the floor';
  return mode ? mode : '—';
}

function sessionLine(status: string, logged: boolean): string {
  if (status === 'done') return logged ? 'Done · logged' : 'Done · not logged';
  if (status === 'no_show') return 'No show';
  if (status === 'cancelled') return 'Cancelled';
  return 'Scheduled';
}

function handoverLine(move: AssignmentRow): string {
  const when = dayStamp(move.createdAt).split(' · ')[1];
  const plan = move.programAction === 'clear' ? 'plan cleared' : 'plan moved with them';
  const by = move.actorName ? ` · by ${move.actorName.split(' ')[0]}` : '';
  return move.note ? `${when} · ${plan}${by} · “${move.note}”` : `${when} · ${plan}${by}`;
}

function firstName(name: string): string {
  return name.trim().split(' ')[0] || 'them';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  banner: { marginBottom: space.s4 },
  skeleton: { gap: space.s2, marginTop: space.s4 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginBottom: space.s4 },
  heroMain: { flex: 1, minWidth: 0 },
  heroName: { fontSize: 20, fontWeight: '700', color: colors.ink },
  heroActivity: { fontSize: 13, lineHeight: 18, color: colors.ink3, marginTop: 2 },
  heroActivityAlert: { color: colors.danger },
  kv: { marginBottom: space.s4 },
  note: { marginTop: space.s3 },
  none: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginTop: space.s2 },
  changes: { marginTop: space.s4 },
  reassign: { marginTop: space.s4 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
