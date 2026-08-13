/**
 * Screens 18–24 · § 01 — Today. The client's counterpart to the trainer's home.
 *
 * The trainer's home is a to-do list: what's next, where the day stands, who
 * needs chasing. This is the same grammar re-keyed to one person's job — the live
 * card, the stat rail, the band that needs a decision, then the plan. Same
 * components, same order, same reasoning, and the hero here and the hero on their
 * trainer's phone are the same session row read from opposite ends.
 *
 * Three states, one screen:
 *
 *   1a  a session today            the live card, the rail, what needs you, the plan
 *   1b  nothing today              a rest day, said out loud, with adherence intact
 *   1c  no plan assigned yet       the likeliest first launch a client ever sees
 *
 * ── What is deliberately missing ──────────────────────────────────────────
 *
 * No greeting, for the same reason the trainer doesn't get one: it costs the most
 * valuable 60px on the screen. No activity feed — a client's recent activity is
 * their own logging, and that already has a tab. No charts; charts are a Progress
 * thing. And no skeleton anywhere, because every number here is already on this
 * phone.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import type { ClientTabsParamList } from '../../navigation/ClientTabs';
import { useShell } from '../../navigation/AppShell';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import {
  buildSessions,
  buildToday,
  coachFirstName,
  rupeesShort,
  type TodayView,
} from '../../client/client';
import { startSession } from '../../db/sessions';
import { startUnbookedLog } from '../../db/log';
import { useSyncState } from '../../db/useSync';
import { syncDatabase } from '../../db/sync';
import { pendingSummary, type PendingLine } from '../../db/pending';
import {
  AppBar,
  Banner,
  Button,
  Callout,
  CalloutStrong,
  Card,
  Coach,
  Empty,
  IconBell,
  IconButton,
  IconChevron,
  IconCloudOff,
  IconDumbbell,
  IconLayers,
  IconMenu,
  IconMessage,
  IconPlay,
  IconRefresh,
  IconRupee,
  IconWallet,
  List,
  Pulse,
  Row,
  RowTime,
  RowValue,
  SectionHead,
  Stat,
  StatRail,
  Streak,
  Tag,
  colors,
  space,
  tnum,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;

export default function TodayScreen({
  navigation: tabNav,
}: {
  navigation: { navigate: (screen: keyof ClientTabsParamList, params?: object) => void };
}) {
  const navigation = useNavigation<Nav>();
  const shell = useShell();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);
  const sync = useSyncState();
  const network = useNetworkState();

  const [at, setAt] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [queue, setQueue] = useState<PendingLine[]>([]);

  const view = useMemo(
    () => (clientId ? buildToday(input, clientId, at) : null),
    [input, clientId, at],
  );

  // The dot means "something needs you", so a session their trainer moved counts
  // — it is the one thing in the client app that is genuinely waiting on a tap.
  const toConfirm = useMemo(
    () => (clientId ? !!buildSessions(input, clientId, at).notice : false),
    [input, clientId, at],
  );

  const offline = network.isConnected === false;

  // 6b · the waiting list. Only assembled when there is something waiting, and
  // read from WatermelonDB's own bookkeeping rather than a column of ours.
  React.useEffect(() => {
    if (!sync.hasPending) {
      setQueue([]);
      return;
    }
    let alive = true;
    void pendingSummary().then((lines) => {
      if (alive) setQueue(lines);
    });
    return () => {
      alive = false;
    };
  }, [sync.hasPending, sync.pendingCount]);

  const refresh = useCallback(() => {
    setAt(Date.now());
    void syncDatabase('client-pull');
  }, []);

  if (!clientId || !view) return null;

  const coach = view.coach;
  const first = coachFirstName(coach);

  /** Every message action in the client app is a draft. Nothing sends silently. */
  const message = (text: string) => {
    if (!coach?.phone) return;
    void Linking.openURL(
      `https://wa.me/${coach.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`,
    );
  };

  const openLog = async () => {
    if (starting) return;
    setStarting(true);
    try {
      // The same two paths the trainer has, because it is the same log. A booked
      // session starts against the booking; anything else opens an unbooked log,
      // which works on a rest day and works with no plan assigned.
      if (view.live?.sessionId && !view.live.workoutId) await startSession(view.live.sessionId);
      else if (!view.live?.workoutId) await startUnbookedLog(coach?.id ?? '', clientId);
      tabNav.navigate('LogTab');
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view.kind === 'noplan' ? 'Today' : 'Today'}
          subtitle={view.dateLine}
          leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
          actions={
            <IconButton
              icon={IconBell}
              label="Notifications"
              bare
              dot={toConfirm || !!view.needs.length}
              onPress={() => navigation.navigate('Notifications')}
            />
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={sync.phase === 'syncing'}
            onRefresh={refresh}
            tintColor={colors.ink3}
          />
        }
      >
        {/* 6b. The banner names what still works, because the honest thing to
            say offline is that nothing is waiting on the client. */}
        {offline ? (
          <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
            Offline — everything still works.
            {sync.pendingCount > 0
              ? ` ${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} waiting.`
              : ''}
          </Banner>
        ) : null}

        {view.kind === 'noplan' ? (
          <NoPlan
            view={view}
            first={first}
            onMessage={() => message(`Hi ${first}, when do we start?`)}
            onCall={coach?.phone ? () => void Linking.openURL(`tel:${coach.phone}`) : undefined}
            onLog={() => void openLog()}
            onSessions={() => navigation.navigate('Sessions')}
            onPayments={() => tabNav.navigate('PaymentsTab')}
          />
        ) : view.kind === 'rest' ? (
          <RestDay
            view={view}
            onLog={() => void openLog()}
            onSessions={() => navigation.navigate('Sessions')}
          />
        ) : (
          <Session
            view={view}
            first={first}
            starting={starting}
            onStart={() => void openLog()}
            onMessage={() =>
              message(
                `Hi ${first}, about ${view.live ? `${view.live.time} ${view.live.meridiem}` : "today's session"} —`,
              )
            }
            onPack={() => navigation.navigate('Sessions')}
            onWeek={() => tabNav.navigate('ProgressTab')}
            onOwed={() => tabNav.navigate('PaymentsTab')}
            onPay={() => tabNav.navigate('PaymentsTab', { pay: true })}
            onExercise={(exerciseId) =>
              navigation.navigate('ExerciseHistory', { clientId, exerciseId })
            }
            onPlan={() => tabNav.navigate('LogTab')}
          />
        )}

        {/* 6b · what is waiting, and why nothing is lost. Under the day's
            content rather than above it: the queue is reassurance, not news. */}
        {queue.length ? (
          <>
            <SectionHead label="Waiting to sync" count={sync.pendingCount} />
            <List style={styles.group}>
              {queue.map((line) => (
                <Row
                  key={line.table}
                  grouped
                  leading={<IconRefresh size={17} color={colors.ink3} />}
                  title={line.label}
                  subtitle={line.detail}
                  trailing={<Tag label="Queued" />}
                />
              ))}
            </List>
            <Callout style={styles.note}>
              Two things need a signal: <CalloutStrong>paying by UPI</CalloutStrong>, because your
              UPI app needs one, and <CalloutStrong>Sunday&apos;s report</CalloutStrong>, because
              {` ${first}`}&apos;s server writes it. Logging, your plan, your sessions and your
              history are all on this phone.
            </Callout>
            <Text style={styles.quiet}>
              Nothing is lost and nothing is waiting on you. Pull down to try again.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ 1a */

function Session({
  view,
  first,
  starting,
  onStart,
  onMessage,
  onPack,
  onWeek,
  onOwed,
  onPay,
  onExercise,
  onPlan,
}: {
  view: TodayView;
  first: string;
  starting: boolean;
  onStart: () => void;
  onMessage: () => void;
  onPack: () => void;
  onWeek: () => void;
  onOwed: () => void;
  onPay: () => void;
  onExercise: (exerciseId: string) => void;
  onPlan: () => void;
}) {
  const live = view.live;

  return (
    <>
      {live ? (
        <Card live>
          <View style={styles.eyebrow}>
            <Pulse />
            <Text style={styles.eyebrowText}>{live.lead}</Text>
          </View>
          <View style={styles.clockRow}>
            <Text style={styles.clock} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {live.time}
            </Text>
            <Text style={styles.meridiem}>{live.meridiem}</Text>
          </View>
          <Text style={styles.title}>{live.title}</Text>
          <Text style={styles.detail}>{live.meta}</Text>
          <View style={styles.actions}>
            <Button
              label={live.running ? 'Back in' : 'Start'}
              icon={IconPlay}
              loading={starting}
              onPress={onStart}
              style={styles.primary}
            />
            {/* Message, not Move. A client cannot move a session. */}
            <Button
              label="Message"
              icon={IconMessage}
              variant="ghost"
              onPress={onMessage}
              style={styles.secondary}
            />
          </View>
        </Card>
      ) : null}

      <StatRail style={styles.rail}>
        <Stat
          label="Pack"
          value={view.pack ? view.pack.left : '—'}
          unit={view.pack?.total ? `/${view.pack.total}` : undefined}
          onPress={onPack}
        />
        <Stat
          label="This week"
          value={view.week.kept}
          unit={`/${Math.max(view.week.kept, view.week.planned)}`}
          onPress={onWeek}
        />
        {/* The amber cell is the point of the rail, same as the trainer's — and
            it is the same figure, read from the other end. */}
        <Stat
          label="You owe"
          value={view.owed > 0 ? rupeesShort(view.owed) : '—'}
          tone={view.owed > 0 ? 'warn' : 'default'}
          onPress={onOwed}
        />
      </StatRail>

      {view.needs.length ? (
        <>
          <SectionHead label="Needs you" count={view.needs.length} />
          <List style={styles.group}>
            {view.needs.map((need) => (
              <Row
                key={need.key}
                grouped
                severity={need.severity}
                leading={
                  need.key === 'owed' ? (
                    <IconRupee size={17} color={colors.danger} />
                  ) : (
                    <IconLayers size={17} color={colors.warn} />
                  )
                }
                title={need.title}
                subtitle={need.detail}
                onPress={need.key === 'owed' ? onPay : onPack}
                trailing={<Tag label={need.action} tone={need.key === 'owed' ? 'danger' : 'warn'} />}
              />
            ))}
          </List>
        </>
      ) : null}

      {view.plan.length ? (
        <>
          <SectionHead
            label="Today's plan"
            action={
              view.planCount > view.plan.length
                ? { label: `See all ${view.planCount}`, onPress: onPlan }
                : undefined
            }
          />
          <List style={styles.group}>
            {view.plan.map((row) => (
              <Row
                key={row.exerciseId}
                grouped
                title={row.name}
                subtitle={row.detail}
                onPress={() => onExercise(row.exerciseId)}
                trailing={row.sets ? <RowValue value={String(row.sets)} unit="Sets" /> : undefined}
              />
            ))}
          </List>
        </>
      ) : null}

      <Text style={styles.footnote}>
        {first} built this plan — if something hurts, stop and message {first}.
      </Text>
    </>
  );
}

/* ------------------------------------------------------------------ 1b */

function RestDay({
  view,
  onLog,
  onSessions,
}: {
  view: TodayView;
  onLog: () => void;
  onSessions: () => void;
}) {
  const { week } = view;
  return (
    <>
      <Card>
        <View style={styles.eyebrow}>
          <IconDumbbell size={16} color={colors.ink3} />
          <Text style={styles.eyebrowQuiet}>Rest day</Text>
        </View>
        <Text style={styles.restTitle}>Nothing today</Text>
        <Text style={styles.restBody}>
          {week.planned > 0
            ? `Your plan asks for ${week.planned === 1 ? 'one session' : `${week.planned} sessions`} this week. Today isn't one of them.`
            : "Your plan doesn't ask for a session today."}
        </Text>
        <View style={styles.restShape}>
          <Streak days={week.days} style={styles.streak} />
          {week.percent !== null ? (
            <Text style={styles.percent}>{week.percent}%</Text>
          ) : null}
        </View>
        <View style={styles.legend}>
          <Text style={styles.legendText}>Trained</Text>
          <Text style={styles.legendText}>Rest day</Text>
        </View>
      </Card>

      {/* The rule, said where it applies rather than in a help page. */}
      <Callout tone="accent" style={styles.note}>
        <CalloutStrong>Rest days never count against you.</CalloutStrong>{' '}
        {week.kept} of {week.planned} sessions kept is {week.percent ?? 100}%, and the rest of the
        week is what your plan asks for — your trainer sees the same number.
      </Callout>

      {view.next ? (
        <>
          <SectionHead
            label="Next session"
            action={{ label: 'All sessions', onPress: onSessions }}
          />
          <List style={styles.group}>
            <Row
              grouped
              leading={<RowTime time={view.next.day} meridiem={view.next.month} />}
              spine={view.next.now ? 'now' : undefined}
              title={view.next.when}
              subtitle={view.next.detail}
              onPress={onSessions}
              trailing={
                <Tag label={view.next.mode === 'remote' ? 'Remote' : 'Floor'} tone="neutral" />
              }
            />
          </List>
        </>
      ) : null}

      <SectionHead label="If you want to train anyway" />
      <Button
        label="Log a workout"
        icon={IconDumbbell}
        variant="secondary"
        block
        onPress={onLog}
      />
      <Text style={styles.quiet}>
        Anything you log on a rest day is yours. It doesn&apos;t change your plan and it
        doesn&apos;t use a session from your pack.
      </Text>
    </>
  );
}

/* ------------------------------------------------------------------ 1c */

function NoPlan({
  view,
  first,
  onMessage,
  onCall,
  onLog,
  onSessions,
  onPayments,
}: {
  view: TodayView;
  first: string;
  onMessage: () => void;
  onCall?: () => void;
  onLog: () => void;
  onSessions: () => void;
  onPayments: () => void;
}) {
  return (
    <>
      {/* No skeleton: nothing is loading. The plan genuinely does not exist yet,
          and this screen's whole job is to say whose job that is. */}
      <Empty
        icon={IconLayers}
        title="No plan yet"
        body={`${first} hasn't sent you a plan yet. They build it on their phone and it shows up here — nothing for you to set up, and nothing has gone wrong.`}
        style={styles.empty}
      />

      {view.coach ? (
        <Coach
          label="Your trainer"
          name={view.coach.name}
          detail={[view.coach.gymName, view.addedOn ? `added you ${view.addedOn}` : null]
            .filter(Boolean)
            .join(' · ')}
          action={{ label: `Message ${first}`, onPress: onMessage }}
          onCall={onCall}
        />
      ) : null}

      <SectionHead label="Works without a plan" />
      <List style={styles.group}>
        <Row
          grouped
          leading={<IconDumbbell size={17} color={colors.accentText} />}
          title="Log a workout anyway"
          subtitle="Your own sets, saved on this phone"
          onPress={onLog}
          trailing={<IconChevron size={18} color={colors.ink3} />}
        />
        <Row
          grouped
          leading={<IconLayers size={17} color={colors.ink3} />}
          title="Your sessions"
          subtitle={
            view.bookedCount
              ? `${view.bookedCount} booked${view.next ? ` · ${view.next.when}` : ''}`
              : 'Nothing booked yet'
          }
          onPress={onSessions}
          trailing={<IconChevron size={18} color={colors.ink3} />}
        />
        <Row
          grouped
          leading={<IconWallet size={17} color={colors.ink3} />}
          title="Payments"
          subtitle={view.owed > 0 ? `${rupeesShort(view.owed)} due` : 'Nothing due yet'}
          onPress={onPayments}
          trailing={<IconChevron size={18} color={colors.ink3} />}
        />
      </List>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  banner: { marginBottom: space.s2 },

  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  eyebrowText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
  eyebrowQuiet: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },

  clockRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12, marginBottom: 2 },
  clock: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 62,
    fontWeight: '800',
    letterSpacing: -2.79,
    lineHeight: 62,
    color: colors.ink,
    ...tnum,
  },
  meridiem: {
    flexShrink: 0,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.76,
    color: colors.ink3,
    marginLeft: 8,
  },
  title: { fontSize: 21, fontWeight: '700', letterSpacing: -0.42, color: colors.ink },
  detail: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.37, textTransform: 'uppercase', color: colors.ink3, marginTop: 7 },
  actions: { flexDirection: 'row', gap: space.s2, marginTop: space.s4 },
  primary: { flex: 1 },
  secondary: { flexGrow: 0, flexShrink: 0, flexBasis: 106 },

  rail: { marginTop: space.s3 },
  group: { marginBottom: space.s2 },
  note: { marginTop: space.s2 },
  quiet: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: 10 },
  footnote: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: space.s3 },

  restTitle: { fontSize: 27, fontWeight: '800', letterSpacing: -0.4, color: colors.ink, marginTop: 12, marginBottom: 6 },
  restBody: { fontSize: 13.5, lineHeight: 20, color: colors.ink2 },
  restShape: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: space.s4 },
  streak: { flex: 1 },
  percent: { fontSize: 17, fontWeight: '700', color: colors.ok, ...tnum },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.s2 },
  legendText: { fontSize: 11.5, color: colors.ink3 },

  empty: { marginTop: space.s4, marginBottom: space.s3 },
});
