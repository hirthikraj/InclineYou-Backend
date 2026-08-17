/**
 * Screen 03 · Home.
 *
 * `agent/design system/screens/xrephome.html`.
 *
 * Seven modules, in the order a trainer needs them: what's next, where the day
 * stands, who needs chasing, the schedule, the money, and what's happened. The
 * teardown of twelve platforms produced one finding that decides this whole
 * layout — a trainer's home is a to-do list, not a report — and a second that
 * decides what isn't here: nobody greets by name, and a greeting would cost the
 * most valuable 60px on the screen.
 *
 * Every module is conditional. Five empty cards are worse than one clear
 * action, so on a first run the modules that would be empty simply aren't
 * rendered; on a finished day the attention module says so in words rather than
 * drawing an empty list.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { useNetworkState } from 'expo-network';
import { Q } from '@nozbe/watermelondb';

import type { MainStackParamList } from '../../navigation/MainStack';
import { useShell } from '../../navigation/AppShell';
import { useDeck } from '../../home/useDeck';
import { ATTENTION_VISIBLE, type AttentionItem, type DeckSession } from '../../home/deck';
import { buildNotifications, loadReadAt } from '../../home/notifications';
import { MODE_LABELS, type DeliveryMode } from '../../home/mode';
import { dayStamp, rupees, rupeesShort } from '../../home/time';
import { syncDatabase } from '../../db/sync';
import { useSyncState } from '../../db/useSync';
import { database } from '../../db';
import type ExerciseModel from '../../db/models/Exercise';
import type ProgramExerciseModel from '../../db/models/ProgramExercise';
import { endSession, startSession } from '../../db/sessions';
import { loadDraft, onDraftChange, EMPTY_DRAFT, type SetupDraft } from '../../setup/draft';
import { METER_WHY, profileMeterItems } from '../../setup/meter';
import {
  Activity,
  AppBar,
  Avatar,
  Banner,
  Bar,
  Button,
  Card,
  Chip,
  Empty,
  IconBell,
  IconButton,
  IconCheck,
  IconCloudOff,
  IconMenu,
  IconSearch,
  Legend,
  Meter,
  RestTimer,
  Reveal,
  Row,
  RowTime,
  SectionHead,
  Seg,
  Stat,
  StatRail,
  SyncBand,
  Tag,
  Toast,
  WeekBars,
  colors,
  meterPercent,
  space,
} from '../../design';
import { NextHero, RunningHero, TomorrowHero, ClearHero, FirstRunHero } from './home/Hero';
import DeckSkeleton from './home/DeckSkeleton';

/** § 04: the Floor / Remote / Done choice persists across launches. */
const FILTER_KEY = 'xrep_today_filters';

/**
 * § 06: the profile meter, dismissed.
 *
 * A trainer with no UPI ID and no certification to declare would otherwise be
 * asked for both on every launch, forever. Persisted rather than held in state,
 * because a card that comes back tomorrow hasn't been dismissed — it's been
 * postponed, and nobody asked for that.
 */
const METER_KEY = 'xrep_meter_hidden';

type Filters = { floor: boolean; remote: boolean; done: boolean };
const DEFAULT_FILTERS: Filters = { floor: true, remote: true, done: false };

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const shell = useShell();
  const focused = useIsFocused();
  const deck = useDeck(focused);
  const sync = useSyncState();
  const network = useNetworkState();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [draft, setDraft] = useState<SetupDraft>(EMPTY_DRAFT);
  const [meterHidden, setMeterHidden] = useState(false);
  const [readAt, setReadAt] = useState(0);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Set when the notice reports something reversible. Cleared with the notice. */
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const scroller = useRef<ScrollView>(null);

  /* ------------------------------------------------------------ persistence */

  useEffect(() => {
    void SecureStore.getItemAsync(FILTER_KEY).then((raw) => {
      if (!raw) return;
      try {
        setFilters({ ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<Filters>) });
      } catch {
        // A corrupt preference is not worth a crash — the defaults are fine.
      }
    });
    void SecureStore.getItemAsync(METER_KEY).then((raw) => setMeterHidden(raw === '1'));
  }, []);

  const toggle = (key: keyof Filters) => {
    setFilters((current) => {
      const next = { ...current, [key]: !current[key] };
      void SecureStore.setItemAsync(FILTER_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Profile edits land on the drawer's own screens, which write to the server —
  // and the draft the meter reads catches up asynchronously. Subscribing beats
  // re-reading on focus, which loses the race against a background reconcile.
  useEffect(() => onDraftChange(setDraft), []);

  // The profile and the read mark both change on other screens, so they're
  // re-read on focus rather than once on mount.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void loadDraft().then((d) => live && setDraft(d));
      void loadReadAt().then((at) => live && setReadAt(at));
      return () => {
        live = false;
      };
    }, []),
  );

  /* ------------------------------------------------------------- derivation */

  const meterItems = useMemo(
    () =>
      profileMeterItems(draft, {
        // Both of these pointed at the "not built yet" placeholder until §07–16
        // built the screens they were always meant to open. A meter row that
        // tells you what is missing and then refuses to take you there is worse
        // than no meter.
        onAddCertification: () => navigation.navigate('Profile'),
        onAddUpi: () => navigation.navigate('GettingPaid'),
      }),
    [draft, navigation],
  );
  const profileComplete = meterPercent(meterItems) >= 100;

  /**
   * Hiding it has to say where it went, or the rest of the profile becomes
   * unfindable — the meter was the only signpost to it on this screen. And it
   * has to be reversible: the card never comes back on its own, so a mis-tap
   * without an undo is permanent.
   */
  const hideMeter = () => {
    setMeterHidden(true);
    void SecureStore.setItemAsync(METER_KEY, '1');
    setNotice('Hidden. The rest of it is in Menu › You and your business.');
    setUndo(() => () => {
      setMeterHidden(false);
      void SecureStore.deleteItemAsync(METER_KEY);
    });
  };

  const unread = useMemo(
    () => buildNotifications(deck, readAt).unread,
    [deck, readAt],
  );

  const counts = useMemo(() => {
    const live = deck.today.filter((s) => !s.done);
    return {
      floor: live.filter((s) => s.mode === 'floor').length,
      remote: live.filter((s) => s.mode === 'remote').length,
      done: deck.todayDone,
    };
  }, [deck.today, deck.todayDone]);

  // A finished session answers to the Done chip and nothing else — filtering it
  // by delivery mode as well would hide it behind two switches.
  const visibleToday = useMemo(
    () => deck.today.filter((s) => (s.done ? filters.done : filters[s.mode])),
    [deck.today, filters],
  );

  const attention = showAllAttention
    ? deck.attention
    : deck.attention.slice(0, ATTENTION_VISIBLE);
  const hidden = deck.attention.length - attention.length;

  const dayOver = deck.today.length > 0 && deck.todayDone === deck.today.length;
  const offline = network.isConnected === false || network.isInternetReachable === false;

  // Same rule as the roster: an empty deck on a fresh install is unproven
  // until a pull has succeeded this launch — "add your first client" reads as
  // "your clients are gone" to a trainer who has eight and just signed in. The
  // skeleton holds the stage while the first pull runs (the sync band above it
  // says why), plus one beat after it lands for the observables to re-emit.
  // A failed attempt lifts the hold: offline, the local read is all there is,
  // and a genuinely new trainer still needs the add button.
  const syncConfirmed = sync.phase !== 'syncing' && sync.lastSyncedAt !== null;
  const [emptyStands, setEmptyStands] = useState(false);
  useEffect(() => {
    if (!(deck.ready && deck.firstRun && syncConfirmed)) {
      setEmptyStands(false);
      return;
    }
    const t = setTimeout(() => setEmptyStands(true), 400);
    return () => clearTimeout(t);
  }, [deck.ready, deck.firstRun, syncConfirmed]);
  const firstRunProven =
    emptyStands || (sync.phase === 'error' && sync.lastSyncedAt === null);
  const deckSettled = deck.ready && (!deck.firstRun || firstRunProven);

  /* ---------------------------------------------------------------- actions */

  const openSession = (session: DeckSession) =>
    navigation.navigate('SessionDetail', { sessionId: session.id });

  /**
   * The schedule and the book are tabs, not screens.
   *
   * Home's "full schedule" and its money figures used to push the pre-design
   * calendar and roster over the top of the shell. Both of those surfaces are
   * designed now and they live in the tab bar, so these move sideways instead
   * of stacking — which is also the only way back out that doesn't need a
   * back button.
   */
  const openTab = (screen: 'DiaryTab' | 'MoneyTab', params?: object) =>
    navigation.navigate('Home', { screen, params } as never);

  /**
   * § 04: Start goes straight into the workout log, prefilled.
   *
   * A local write, so it works on a gym floor with no signal — and it only
   * starts the session, it doesn't finish it. The hero flips to its in-session
   * state and stays there until End.
   */
  const start = async (session: DeckSession) => {
    setStarting(true);
    try {
      const workoutId = await startSession(session.id);
      navigation.navigate('WorkoutLog', {
        workoutId,
        programId: session.programId,
        templateDay: session.templateDay,
      });
    } catch {
      setNotice("Couldn't open the log for that session. Try it from the session screen.");
    } finally {
      setStarting(false);
    }
  };

  /**
   * End is the irreversible one — it marks the session delivered and takes a
   * session off the client's pack — so unlike Start it asks first. § 04 pairs
   * it with an undo toast; a confirm is the same protection, before the fact.
   */
  const end = (scheduledId: string, clientName: string) => {
    Alert.alert(
      'End this session?',
      `Marks it delivered for ${clientName} and takes one off their pack.`,
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'End session',
          onPress: () => {
            void endSession(scheduledId).catch(() =>
              setNotice("Couldn't end the session. Open it and try from there."),
            );
          },
        },
      ],
    );
  };

  const actOn = (item: AttentionItem) => {
    // Remind, Nudge and Renew all open the client on the tab that caused the
    // alert. § 04 is explicit that none of them ever sends anything silently.
    navigation.navigate('ClientDetail', { clientId: item.clientId });
  };

  const refresh = useCallback(() => {
    void syncDatabase('pull-to-refresh');
  }, []);

  /**
   * § 04: tapping the Home tab while it is already active scrolls to the top,
   * and a second tap refreshes. `tabPress` is emitted by the nav bar for the
   * active tab precisely so the screen can own this.
   */
  const atTop = useRef(true);
  useEffect(() => {
    const unsubscribe = (navigation as unknown as {
      addListener: (event: string, cb: () => void) => () => void;
    }).addListener('tabPress', () => {
      if (atTop.current) refresh();
      else scroller.current?.scrollTo({ y: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation, refresh]);

  /* ------------------------------------------------------------------ render */

  // The date is always true; everything after it counts something, so it waits
  // for the read. "day done" before the tables are open would be a lie.
  const subtitle = [
    dayStamp(Date.now()),
    !deck.ready
      ? null
      : deck.running
        ? 'in session'
        : dayOver
          ? 'day done'
          : deck.today.length > 0
            ? `${deck.today.length} session${deck.today.length === 1 ? '' : 's'}`
            : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        ref={scroller}
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={64}
        onScroll={(e) => {
          atTop.current = e.nativeEvent.contentOffset.y <= 4;
        }}
        refreshControl={
          // Pull-to-refresh means SYNC, not fetch. Content is already correct
          // from SQLite, so the control snaps back immediately and the band
          // below reports progress — nothing ever blanks.
          <RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <AppBar
          title="Home"
          subtitle={subtitle}
          leading={<IconButton icon={IconMenu} label="Menu" bare size={22} onPress={shell.openDrawer} />}
          actions={
            <>
              <IconButton
                icon={IconSearch}
                label="Search"
                bare
                onPress={() => navigation.navigate('Search')}
              />
              <IconButton
                icon={IconBell}
                label="Notifications"
                bare
                dot={unread > 0}
                onPress={() => navigation.navigate('Notifications')}
              />
            </>
          }
        />

        {offline ? (
          /* Tapping retries when there is nothing waiting, and shows WHAT is
             waiting when there is. The banner has just claimed a number, and
             the number is the thing a trainer wants opened. */
          <Banner
            tone="offline"
            icon={IconCloudOff}
            style={styles.banner}
            onPress={sync.hasPending ? () => navigation.navigate('SyncQueue') : refresh}
          >
            {`Offline — everything still works.${queued(sync.hasPending, sync.pendingCount)}`}
          </Banner>
        ) : null}

        {sync.phase === 'syncing' ? (
          <SyncBand
            label={
              sync.pendingCount > 0
                ? `Syncing ${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'}…`
                : 'Syncing…'
            }
          />
        ) : null}

        {notice ? (
          <Toast
            style={styles.banner}
            action={
              undo
                ? {
                    label: 'Undo',
                    onPress: () => {
                      undo();
                      setUndo(null);
                      setNotice(null);
                    },
                  }
                : { label: 'Dismiss', onPress: () => setNotice(null) }
            }
          >
            {notice}
          </Toast>
        ) : null}

        {/* § 06: the meter is a conditional banner, not chrome — it exists only
            while there is something left to fill in, and only until the trainer
            says they're done being asked. */}
        {!profileComplete && !meterHidden ? (
          <Meter items={meterItems} why={METER_WHY} onClose={hideMeter} style={styles.meter} />
        ) : null}

        {/* Everything from here down is derived from the tables. The chrome
            above — bar, offline banner, sync band, profile meter — is real
            before the first read and stays put. */}
        <Reveal ready={deckSettled} skeleton={<DeckSkeleton />}>
        <Hero
          deck={deck}
          starting={starting}
          onOpen={openSession}
          onStart={start}
          onEnd={end}
          onAddClient={() => navigation.navigate('AddClient')}
          onBook={() => openTab('DiaryTab', { book: true })}
          onTomorrow={() => openTab('DiaryTab')}
        />

        {deck.firstRun ? null : (
          <StatRail style={styles.rail}>
            <Stat
              label="Sessions"
              value={deck.todayDone}
              unit={`/${deck.today.length}`}
              onPress={() => openTab('DiaryTab')}
            />
            <Stat
              label="Collected"
              value={rupeesShort(deck.collectedToday)}
              onPress={() => openTab('MoneyTab')}
            />
            <Stat
              label="Pending"
              value={deck.pendingTotal > 0 ? rupeesShort(deck.pendingTotal) : '—'}
              tone={deck.pendingTotal > 0 ? 'warn' : 'default'}
              onPress={() => openTab('MoneyTab')}
            />
          </StatRail>
        )}

        {/* ------------------------------------------------ needs attention */}
        {deck.firstRun ? null : (
          <>
            <SectionHead
              label="Needs attention"
              action={
                deck.attention.length > ATTENTION_VISIBLE && !showAllAttention
                  ? {
                      label: `View all ${deck.attention.length}`,
                      onPress: () => setShowAllAttention(true),
                    }
                  : undefined
              }
            />
            {/* Not before the tables have been read — "nobody needs you" is a
                claim, and it is the opposite of the truth while loading. */}
            {deck.attention.length === 0 && deck.ready ? (
              <Card>
                <Empty
                  compact
                  icon={IconCheck}
                  iconColor={colors.ok}
                  title="Nobody needs you"
                  body="Everyone's logging, everyone's paid up. Enjoy it — this doesn't happen often."
                />
              </Card>
            ) : (
              <View style={styles.stack}>
                {attention.map((item) => (
                  <Row
                    key={item.key}
                    severity={item.severity}
                    title={item.clientName}
                    subtitle={item.line}
                    leading={<Avatar name={item.clientName} size="sm" />}
                    trailing={
                      <Button
                        label={item.action}
                        variant="secondary"
                        size="sm"
                        onPress={() => actOn(item)}
                      />
                    }
                    onPress={() => actOn(item)}
                  />
                ))}
                {hidden > 0 ? (
                  <Button
                    label={`Show ${hidden} more`}
                    variant="secondary"
                    block
                    onPress={() => setShowAllAttention(true)}
                  />
                ) : null}
              </View>
            )}
          </>
        )}

        {/* -------------------------------------------------------- today */}
        {deck.today.length > 0 ? (
          <>
            <SectionHead
              label="Today"
              action={{ label: 'Full schedule', onPress: () => openTab('DiaryTab') }}
            />
            <Seg style={styles.seg}>
              {(['floor', 'remote'] as DeliveryMode[]).map((mode) => (
                <Chip
                  key={mode}
                  label={MODE_LABELS[mode]}
                  count={counts[mode]}
                  selected={filters[mode]}
                  onPress={() => toggle(mode)}
                />
              ))}
              <Chip
                label="Done"
                count={counts.done}
                selected={filters.done}
                onPress={() => toggle('done')}
              />
            </Seg>

            {visibleToday.length === 0 ? (
              <Card>
                <Empty
                  compact
                  title="Nothing in this filter"
                  body="Turn a chip back on to see the rest of the day."
                />
              </Card>
            ) : (
              <View style={styles.stack}>
                {visibleToday.map((session) => (
                  <Row
                    key={session.id}
                    title={session.clientName}
                    subtitle={session.detail}
                    dim={session.done}
                    spine={
                      session.done ? 'done' : session.id === deck.next?.id ? 'now' : 'idle'
                    }
                    leading={<RowTime time={session.time} meridiem={session.meridiem} />}
                    trailing={
                      <Tag
                        label={MODE_LABELS[session.mode]}
                        tone={session.mode === 'remote' ? 'remote' : 'floor'}
                      />
                    }
                    onPress={() => openSession(session)}
                  />
                ))}
              </View>
            )}
          </>
        ) : null}

        {/* -------------------------------------------------------- money */}
        {deck.money.billed > 0 ? (
          <>
            <SectionHead
              label={deck.money.monthLabel}
              action={{ label: 'Payments', onPress: () => openTab('MoneyTab') }}
            />
            <Card>
              <View style={styles.moneyHead}>
                <View style={styles.moneyMain}>
                  <Text style={styles.moneyLabel}>Billed this month</Text>
                  {/* Shrinks rather than truncates: a seven-figure month is
                      exactly when the number matters most, and "₹12,34,…" is
                      not a figure. */}
                  <Text
                    style={styles.moneyValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {rupees(deck.money.billed)}
                  </Text>
                </View>
                {/* Whose money it is, right next to what was billed. Only drawn
                    when a gym cut makes the two differ — repeating the same
                    figure twice would read as a bug. */}
                {deck.money.yours < deck.money.billed ? (
                  <View style={styles.moneyShare}>
                    <Text style={styles.moneyLabel}>Your share</Text>
                    <Text
                      style={styles.moneyShareValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {rupees(deck.money.yours)}
                    </Text>
                  </View>
                ) : null}
                {deck.money.trendPercent !== null ? (
                  <Tag
                    label={`${deck.money.trendPercent >= 0 ? '▲' : '▼'} ${Math.abs(deck.money.trendPercent)}%`}
                    tone={deck.money.trendPercent >= 0 ? 'ok' : 'warn'}
                  />
                ) : null}
              </View>
              <Bar
                segments={[
                  {
                    key: 'collected',
                    fraction: deck.money.collected / Math.max(1, deck.money.billed),
                    color: colors.ok,
                  },
                  {
                    key: 'pending',
                    fraction: deck.money.pending / Math.max(1, deck.money.billed),
                    color: colors.warn,
                  },
                ]}
              />
              <Legend
                entries={[
                  {
                    key: 'collected',
                    label: `Collected ${rupees(deck.money.collected)}`,
                    color: colors.ok,
                  },
                  {
                    key: 'pending',
                    label: `Pending ${rupees(deck.money.pending)}`,
                    color: colors.warn,
                  },
                ]}
              />
            </Card>
          </>
        ) : null}

        {/* ---------------------------------------------------- this week */}
        {dayOver && deck.week.delivered > 0 ? (
          <>
            <SectionHead label="This week" />
            <Card>
              <View style={styles.weekHead}>
                <Text style={styles.weekTitle} numberOfLines={1}>
                  {deck.week.delivered} session{deck.week.delivered === 1 ? '' : 's'} delivered
                </Text>
                <Text style={styles.weekPercent}>{deck.week.percent}%</Text>
              </View>
              <WeekBars days={deck.week.days} />
            </Card>
          </>
        ) : null}

        {/* ----------------------------------------------- recent activity */}
        {deck.activity.length > 0 ? (
          <>
            <SectionHead label="Recent activity" />
            <View>
              {deck.activity.slice(0, 5).map((item, i, list) => (
                <Activity
                  key={item.key}
                  last={i === list.length - 1}
                  lead={<Avatar name={item.clientName} size="sm" />}
                  subject={item.clientName}
                  body={item.body}
                  meta={item.meta}
                  trailing={item.tag ? <Tag label={item.tag.label} tone={item.tag.tone} /> : null}
                  onPress={() => navigation.navigate('ClientDetail', { clientId: item.clientId })}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* State 2a's closing line — an out for someone not ready to invite a
            real person yet. The sample client itself is still to build. */}
        {deck.firstRun ? (
          <Banner style={styles.trailing} tone="neutral">
            Not ready? Add yourself as a client — log sessions against it and delete it later.
          </Banner>
        ) : null}
        </Reveal>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------- hero */

function Hero({
  deck,
  starting,
  onOpen,
  onStart,
  onEnd,
  onAddClient,
  onBook,
  onTomorrow,
}: {
  deck: ReturnType<typeof useDeck>;
  starting: boolean;
  onOpen: (session: DeckSession) => void;
  onStart: (session: DeckSession) => void;
  onEnd: (scheduledId: string, clientName: string) => void;
  onAddClient: () => void;
  onBook: () => void;
  onTomorrow: () => void;
}) {
  const navigation = useNavigation<Nav>();
  const running = deck.running;
  const detail = useRunningDetail(running?.programId, running?.lastExerciseId);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsed(Date.now() - running.startedAt);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [running]);

  if (running) {
    const rest = restRemaining(running.lastSetAt, detail.restSeconds);
    return (
      <>
        <RunningHero
          running={running}
          elapsedMs={elapsed}
          title={detail.name ?? 'Session in progress'}
          progress={`${running.setsLogged} set${running.setsLogged === 1 ? '' : 's'} logged${
            running.volumeKg > 0 ? ` · ${running.volumeKg.toLocaleString('en-IN')} kg` : ''
          }`}
          onLogSet={() =>
            navigation.navigate('WorkoutLog', {
              workoutId: running.workoutId,
              programId: running.programId,
              templateDay: running.templateDay,
            })
          }
          onEnd={() => onEnd(running.scheduledId, running.clientName)}
        />
        {/* Rest is counted from the last set that was actually logged, so the
            clock is right even if the phone was locked through it. */}
        {rest !== null ? (
          <RestTimer remaining={rest} total={detail.restSeconds} style={styles.rest} />
        ) : null}
      </>
    );
  }

  if (deck.firstRun) return <FirstRunHero onAdd={onAddClient} />;

  if (deck.next && deck.nextIn) {
    return (
      <NextHero
        session={deck.next}
        when={deck.nextIn}
        starting={starting}
        onOpen={() => onOpen(deck.next as DeckSession)}
        onStart={() => onStart(deck.next as DeckSession)}
        onMove={() => onOpen(deck.next as DeckSession)}
      />
    );
  }

  if (deck.tomorrow) {
    return <TomorrowHero session={deck.tomorrow} count={deck.tomorrowCount} onOpen={onTomorrow} />;
  }

  return <ClearHero onBook={onBook} />;
}

/** The tail of the offline banner — the number, when we could take one. */
function queued(hasPending: boolean, count: number): string {
  if (!hasPending) return '';
  if (count <= 0) return ' Changes are waiting to sync.';
  return ` ${count} change${count === 1 ? '' : 's'} waiting.`;
}

/**
 * Rest is over once it's over — the timer disappears rather than counting
 * negative. Read during a render that already ticks once a second off the
 * elapsed clock, so it needs no timer of its own.
 */
function restRemaining(lastSetAt: number | undefined, restSeconds: number): number | null {
  if (!lastSetAt) return null;
  const left = restSeconds - (Date.now() - lastSetAt) / 1000;
  return left > 0 ? left : null;
}

/** The current lift and its prescribed rest — two single-row reads, lazily. */
function useRunningDetail(
  programId?: string,
  exerciseId?: string,
): { name: string | null; restSeconds: number } {
  const [detail, setDetail] = useState<{ name: string | null; restSeconds: number }>({
    name: null,
    restSeconds: DEFAULT_REST,
  });

  useEffect(() => {
    if (!exerciseId) {
      setDetail({ name: null, restSeconds: DEFAULT_REST });
      return;
    }
    let live = true;
    void Promise.all([
      database.get<ExerciseModel>('exercises').query(Q.where('id', exerciseId)).fetch(),
      programId
        ? database
            .get<ProgramExerciseModel>('program_exercises')
            .query(Q.where('program_id', programId), Q.where('exercise_id', exerciseId))
            .fetch()
        : Promise.resolve([] as ProgramExerciseModel[]),
    ])
      .then(([exercises, prescriptions]) => {
        if (!live) return;
        setDetail({
          name: exercises[0]?.name ?? null,
          restSeconds: prescriptions[0]?.restSeconds || DEFAULT_REST,
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [programId, exerciseId]);

  return detail;
}

/** What a program says when it doesn't say. Ninety seconds is the gym default. */
const DEFAULT_REST = 90;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s6 },

  banner: { marginBottom: space.s3 },
  meter: { marginBottom: space.s3 },
  rail: { marginTop: space.s3 },
  rest: { marginTop: space.s3 },
  stack: { gap: space.cardGap },
  seg: { marginBottom: space.s3 },
  trailing: { marginTop: space.s3 },

  /**
   * Both card headers are a growing thing beside a fixed one. The growing side
   * has to be the one that gives way — without `flex: 1` it takes its natural
   * width and pushes the tag or the percentage out of the card, because the
   * trailing element is `flexShrink: 0` and wins.
   */
  moneyHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.s3,
    marginBottom: space.s3,
  },
  moneyMain: { flex: 1, minWidth: 0 },
  moneyLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  moneyValue: { fontSize: 30, fontWeight: '800', letterSpacing: -1.05, color: colors.ink, marginTop: 8 },
  moneyShare: { alignItems: 'flex-end', flexShrink: 0 },
  moneyShareValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.66,
    color: colors.ink,
    marginTop: 8,
  },

  weekHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.s3,
    marginBottom: 14,
  },
  weekTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.34,
    color: colors.ink,
  },
  weekPercent: { flexShrink: 0, fontSize: 13.5, color: colors.ink3 },
});
