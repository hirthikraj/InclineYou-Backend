/**
 * Screen 05 · Diary · FR-2.
 *
 * `agent/design system/screens/xrepdiary.html`.
 *
 * Eight platforms were torn down and every one of them ships a time grid. A
 * time grid is the wrong shape for this job: a personal trainer works a split
 * shift — early morning, a dead middle, evening — so two thirds of a 24-hour
 * grid is empty by design, and the one object worth acting on, the gap, gets
 * drawn as blank space. This collapses the dead middle into a single tappable
 * bar and gives the pixels back to the sessions.
 *
 * Day is the working view. Week answers shape and load; month answers density
 * and nothing else.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import type { AppTabsParamList } from '../../../navigation/AppTabs';
import { useShell } from '../../../navigation/AppShell';
import { useDiary } from '../../../diary/useDiary';
import {
  DEFAULT_SESSION_MIN,
  atMinute,
  buildDay,
  buildMonth,
  buildStrip,
  buildWeek,
  daysWorkedRecently,
  findClash,
  hhmm,
  mergeWindows,
  isoWeekday,
  stepAnchor,
  BATCHES_ENABLED,
  type DiaryBatch,
  type DiaryInput,
  type DiaryItem,
} from '../../../diary/diary';
import {
  addToBatch,
  bookSeries,
  bookSession,
  cancelSessions,
  createBatch,
  markBatchDone,
  createTimeBlock,
  markNotTrained,
  moveSession,
  undoOutcome,
} from '../../../db/diary';
import { startSession } from '../../../db/sessions';
import { useAuth } from '../../../store/AuthContext';
import { DAY_MS, clockParts, startOfDay } from '../../../home/time';
import {
  Agenda,
  AgendaItem,
  AppBar,
  Avatar,
  AvatarStack,
  Banner,
  BlockBar,
  Button,
  Callout,
  CalloutStrong,
  DayStrip,
  Empty,
  FreeSlot,
  GapBar,
  GroupHead,
  IconAlert,
  IconButton,
  IconCalendar,
  IconChart,
  IconClock,
  IconCloudOff,
  IconGrid,
  IconMenu,
  IconPlus,
  List,
  MonthGrid,
  NowLine,
  Pack,
  Reveal,
  Row,
  Segmented,
  Tag,
  Tally,
  Toast,
  WeekGrid,
  WeekLegend,
  colors,
  space,
  useReduceMotion,
} from '../../../design';
import { AgendaSkeleton } from './DiarySkeleton';
import BookSheet, { type BookResult } from './BookSheet';
import BatchSheet from './BatchSheet';
import SessionSheet, { type Outcome } from './SessionSheet';
import ClashSheet, { type ClashChoice } from './ClashSheet';
import TimeOffSheet, { type BlockChoice } from './TimeOffSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type View3 = 'day' | 'week' | 'month';

const VIEWS = [
  { key: 'day' as const, label: 'Day' },
  { key: 'week' as const, label: 'Week' },
  { key: 'month' as const, label: 'Month' },
];

/* --------------------------------------------------------- the page turn */

/** Horizontal travel before this counts as a swipe and not a scroll or a tap. */
const SWIPE_SLOP = 18;
/** Fraction of the screen dragged that commits the turn on its own, however slowly. */
const SWIPE_COMMIT_FRACTION = 0.25;
/** …or a flick this fast (px/ms), which commits at any distance. */
const SWIPE_VELOCITY = 0.35;

export default function DiaryScreen() {
  const navigation = useNavigation<Nav>();
  const shell = useShell();
  const focused = useIsFocused();
  const { trainerId } = useAuth();
  const network = useNetworkState();

  const [selected, setSelected] = useState(() => startOfDay(Date.now()));
  const [view, setView] = useState<View3>('day');
  const [openGap, setOpenGap] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [bookAt, setBookAt] = useState<number | null>(null);
  const [sheetItem, setSheetItem] = useState<DiaryItem | null>(null);
  const [clash, setClash] = useState<{ item: DiaryItem; wanted: number; next: number | null } | null>(null);
  const [pending, setPending] = useState<BookResult | null>(null);
  const [blockRange, setBlockRange] = useState<{ from: number; to: number } | null>(null);
  const [batchSheet, setBatchSheet] = useState<DiaryBatch | null>(null);
  /** The batch a booking is being made into, so the sheet books them in rather than beside it. */
  const [addTo, setAddTo] = useState<DiaryBatch | null>(null);
  /** Pre-selected client, when the booking came from somewhere that knows who. */
  const [bookFor, setBookFor] = useState<string | null>(null);

  const route = useRoute<RouteProp<AppTabsParamList, 'DiaryTab'>>();
  const scroller = useRef<ScrollView>(null);
  const { input, now, ready } = useDiary(selected, focused);
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const day = useMemo(() => buildDay(input, selected, now), [input, selected, now]);
  const strip = useMemo(() => buildStrip(input, selected, now), [input, selected, now]);
  const week = useMemo(() => buildWeek(input, selected, now), [input, selected, now]);
  const month = useMemo(() => buildMonth(input, selected, now), [input, selected, now]);

  const today = startOfDay(now);
  const isToday = selected === today;

  /* ------------------------------------------------------------- tab press */

  useFocusEffect(
    useCallback(() => {
      // §04: the Diary tab jumps to today, then to now on a second tap. The
      // agenda already opens scrolled to now — nobody opens a diary to look at
      // 3am — so the second tap is the scroll.
      const unsubscribe = (
        navigation as unknown as { addListener: (e: string, cb: () => void) => () => void }
      ).addListener('tabPress', () => {
        if (selected !== today) {
          setSelected(today);
          setView('day');
        } else {
          scroller.current?.scrollTo({ y: 0, animated: true });
        }
      });
      return unsubscribe;
    }, [navigation, selected, today]),
  );

  /* ---------------------------------------------------------------- booking */

  /**
   * "Book a session", arriving from anywhere else in the app.
   *
   * Booking is a sheet on the diary, not a screen — 3a draws the diary behind it
   * — so every entry point lands here rather than on a form of its own. An
   * effect rather than initial state, because this tab is usually already
   * mounted and a navigate to a live screen only changes its params. The params
   * are cleared once consumed, or returning to the tab later would reopen it.
   */
  const wantsBook = route.params?.book === true;
  useEffect(() => {
    if (!wantsBook) return;
    const askedFor = route.params?.at ?? null;
    const slot = askedFor ?? nextBookableSlot(input, now);
    setSelected(startOfDay(slot));
    setView('day');
    setBookFor(route.params?.clientId ?? null);
    setBookAt(slot);
    navigation.setParams({ book: undefined, clientId: undefined, at: undefined } as never);
  }, [wantsBook, route.params?.at, route.params?.clientId, input, now, navigation]);

  const openBooking = (at: number) => {
    setOpenGap(null);
    setBookAt(at);
  };

  const commitBooking = async (result: BookResult) => {
    if (!trainerId) return;
    setBookAt(null);

    // §07: the conflict check runs against local data, so booking works with no
    // signal. It warns; it never blocks.
    const hit = findClash(input, result.at, result.minutes, now);
    if (hit) {
      const nextSlot =
        buildDay(input, startOfDay(result.at), now)
          .gaps.flatMap((g) => g.slots)
          .find((s) => s.at >= hit.endsAt)?.at ?? null;
      setPending(result);
      setClash({ item: hit, wanted: result.at, next: nextSlot });
      return;
    }
    await write(result);
  };

  const write = async (result: BookResult) => {
    if (!trainerId) return;
    try {
      // Booking *into* a batch, from its capacity strip. Not a series and never
      // a repeat: you join the group at its slot, and the group owns the slot.
      if (addTo) {
        const batch = addTo;
        setAddTo(null);
        await addToBatch(batch.batchId, {
          trainerId,
          clientId: result.clientId,
          at: batch.at,
          durationMinutes: result.minutes,
          mode: result.mode,
        });
        setNotice(`Added to ${batch.name}.`);
        return;
      }
      if (result.occurrences.length > 0) {
        await bookSeries(
          {
            trainerId,
            clientId: result.clientId,
            durationMinutes: result.minutes,
            mode: result.mode,
          },
          [result.at, ...result.occurrences],
        );
        setNotice(`Booked ${result.occurrences.length + 1} sessions.`);
      } else {
        await bookSession({
          trainerId,
          clientId: result.clientId,
          at: result.at,
          durationMinutes: result.minutes,
          mode: result.mode,
        });
        setNotice('Booked.');
      }
    } catch {
      setNotice('Could not save that booking.');
    }
  };

  const resolveClash = async (choice: ClashChoice) => {
    const result = pending;
    const conflicting = clash?.item;
    setClash(null);
    setPending(null);
    if (!result) return;

    if (choice.kind === 'batch' && conflicting && trainerId) {
      // The two of them become a batch at the slot they were both going to
      // occupy anyway. The existing session keeps its pack history; the new one
      // is booked into the same group.
      const booked = await bookSession({
        trainerId,
        clientId: result.clientId,
        at: conflicting.at,
        durationMinutes: result.minutes,
        mode: result.mode,
      });
      await createBatch(trainerId, batchNameFor(conflicting.at), [conflicting.id, booked.id]);
      setNotice(`${conflicting.clientName} and one more, together.`);
      return;
    }
    if (choice.kind === 'move-theirs' && conflicting) {
      await moveSession(conflicting.id, choice.at);
      await write(result);
      setNotice(`${conflicting.clientName} moved. Both booked.`);
      return;
    }
    await write({ ...result, at: choice.at });
  };

  /* --------------------------------------------------------------- outcomes */

  const applyOutcome = async (item: DiaryItem, outcome: Outcome) => {
    setSheetItem(null);
    try {
      if (outcome === 'no_show') await markNotTrained(item.id, 'no_show');
      else await markNotTrained(item.id, 'cancelled', outcome === 'cancelled_trainer' ? 'trainer' : 'client');
      setNotice(
        outcome === 'no_show'
          ? `${item.clientName} marked no-show · pack −1`
          : `${item.clientName} cancelled · pack untouched`,
      );
    } catch {
      setNotice('Could not save that.');
    }
  };

  const undo = async (item: DiaryItem) => {
    try {
      await undoOutcome(item.id);
      setNotice(`Put back — ${item.clientName} is booked again.`);
    } catch {
      setNotice('Could not undo that.');
    }
  };

  const message = (item: DiaryItem) => {
    const client = input.clients.find((c) => c.id === item.clientId);
    const phone = (client as { phone?: string } | undefined)?.phone;
    if (!phone) {
      setNotice('No phone number saved for this client.');
      return;
    }
    void Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`).catch(() =>
      setNotice('Could not open WhatsApp.'),
    );
  };

  const blockOut = async (choice: BlockChoice, sessionIds: string[]) => {
    const range = blockRange;
    setBlockRange(null);
    if (!range || !trainerId) return;
    try {
      await createTimeBlock(trainerId, range.from, range.to, true, 'Time off');
      if (choice === 'cancel' && sessionIds.length > 0) {
        await cancelSessions(sessionIds, 'trainer');
      }
      setNotice(
        choice === 'cancel' && sessionIds.length > 0
          ? `Blocked · ${sessionIds.length} cancelled, no pack deducted`
          : 'Blocked. Existing sessions kept.',
      );
    } catch {
      setNotice('Could not block that time.');
    }
  };

  /* ----------------------------------------------------------------- header */

  const subtitle =
    view === 'week' ? week.subtitle : view === 'month' ? month.subtitle : day.subtitle;

  const header = (
    <>
      {offline ? (
        <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
          Offline — this week is on your phone. Booking still works.
        </Banner>
      ) : null}

      {view === 'day' ? (
        <DayStrip days={strip} selected={selected} onSelect={setSelected} style={styles.strip} />
      ) : null}

      <Segmented options={VIEWS} value={view} onChange={setView} style={styles.segmented} />
    </>
  );

  /* ------------------------------------------------------------------ views */

  const dayBody = () => {
    // Only once the day has actually been read. An empty agenda and an unread
    // one look identical and mean opposite things.
    if (day.items.length === 0 && day.gaps.length === 0 && ready) {
      const worked = daysWorkedRecently(input, now);
      return (
        <>
          <Empty
            icon={IconCalendar}
            title={`Nothing booked on ${weekdayName(selected)}`}
            body={
              day.closed
                ? `${weekdayName(selected)} is outside your working hours. Add a one-off session anyway, or open the day up.`
                : 'Add a session, or leave the day where it is.'
            }
            style={styles.empty}
            action={
              <View style={styles.emptyActions}>
                <Button
                  label="Book a session"
                  size="lg"
                  block
                  icon={IconPlus}
                  onPress={() => openBooking(defaultSlot(input, selected, now))}
                />
                {day.closed ? (
                  <Button
                    label={`Open ${weekdayName(selected)}s for booking`}
                    variant="ghost"
                    block
                    onPress={() => navigation.navigate('WorkingHours')}
                  />
                ) : null}
              </View>
            }
          />
          {worked >= 20 ? (
            <Callout icon={IconChart} style={styles.note}>
              You've trained <CalloutStrong>{worked} of the last 28 days</CalloutStrong>. A rest day
              is a business decision, not a gap.
            </Callout>
          ) : null}
        </>
      );
    }

    // One ordered stream: sessions, the folded gaps between them, and the now
    // line dropped in at its real position.
    const stream: { key: string; at: number; node: React.ReactNode }[] = [];

    for (const item of day.items) {
      // An attendee of a batch is drawn as part of the batch, not beside it.
      if (item.batchId) continue;
      stream.push({ key: item.id, at: item.at, node: sessionRow(item) });
    }
    for (const batch of day.batches) {
      stream.push({ key: batch.id, at: batch.at, node: batchRow(batch) });
    }
    for (const gap of day.gaps) {
      const open = openGap === gap.id;
      stream.push({
        key: gap.id,
        at: gap.from,
        node: (
          <>
            <AgendaItem>
              <GapBar
                label={gap.label}
                from={hhmm(gap.from)}
                to={hhmm(gap.to)}
                open={open}
                onPress={() => setOpenGap(open ? null : gap.id)}
              />
            </AgendaItem>
            {open
              ? gap.slots.map((slot) => (
                  <AgendaItem
                    key={slot.id}
                    time={clockParts(slot.at).time}
                    meridiem={clockParts(slot.at).meridiem}
                  >
                    <FreeSlot
                      minutes={slot.minutes}
                      onPress={() => openBooking(slot.at)}
                      onLongPress={() =>
                        setBlockRange({ from: slot.at, to: slot.at + slot.minutes * 60_000 })
                      }
                    />
                  </AgendaItem>
                ))
              : null}
            {open && gap.idle.length > 0 ? (
              <AgendaItem bleed>
                <Callout icon={IconAlert}>
                  <CalloutStrong>{idleNames(gap.idle)}</CalloutStrong> usually train around now and
                  have nothing booked this week.
                </Callout>
              </AgendaItem>
            ) : null}
          </>
        ),
      });
    }
    for (const block of day.blocks) {
      const at = block.startsAt instanceof Date ? block.startsAt.getTime() : Number(block.startsAt);
      stream.push({
        key: `block_${block.id}`,
        at,
        node: (
          <AgendaItem>
            <BlockBar label={block.reason?.trim() || 'Blocked out'} />
          </AgendaItem>
        ),
      });
    }
    if (isToday) {
      stream.push({
        key: 'now',
        at: now,
        node: <NowLine label={hhmm(now)} />,
      });
    }

    stream.sort((a, b) => a.at - b.at);

    return (
      <>
        {day.openCount > 0 ? (
          <Banner tone="error" icon={IconAlert} style={styles.banner}>
            {`${day.openCount} session${day.openCount === 1 ? ' is' : 's are'} still open. Close ${
              day.openCount === 1 ? 'it' : 'them'
            } so the pack is right.`}
          </Banner>
        ) : null}
        <Agenda style={styles.agenda}>
          {stream.map((entry) => (
            <React.Fragment key={entry.key}>{entry.node}</React.Fragment>
          ))}
        </Agenda>
      </>
    );
  };

  const sessionRow = (item: DiaryItem) => (
    <AgendaItem time={item.time} meridiem={item.meridiem}>
      <Row
        title={item.clientName}
        subtitle={item.detail}
        leading={<Avatar name={item.clientName} size="sm" />}
        severity={item.state === 'no_show' ? 'critical' : item.clash ? 'alert' : undefined}
        spine={item.running ? 'now' : item.state === 'done' ? 'done' : undefined}
        dim={item.state === 'cancelled'}
        trailing={trailingFor(item)}
        onPress={() => setSheetItem(item)}
      />
    </AgendaItem>
  );

  /**
   * 3d · a batch, as one row.
   *
   * Capacity is a strip plus the number, and an under-filled batch says how far
   * off the minimum it is **while there is still time to fill it** — three days
   * out is actionable, ten minutes before is a complaint.
   */
  const batchRow = (batch: DiaryBatch) => (
    <AgendaItem time={batch.time} meridiem={batch.meridiem}>
      <Row
        wrap
        title={batch.name}
        subtitle={
          batch.shortBy !== null
            ? `${batch.detail}\nBelow the ${batch.minSize} you need to run it`
            : batch.detail
        }
        severity={batch.shortBy !== null ? 'alert' : undefined}
        spine={batch.running ? 'now' : batch.settled ? 'done' : undefined}
        trailing={
          <View style={styles.batchEnd}>
            <AvatarStack names={batch.people.map((p) => p.name)} />
            <Pressable
              onPress={() => setAddTo(batch)}
              accessibilityRole="button"
              accessibilityLabel={`${batch.booked} of ${batch.capacity} places taken. Add a client`}
            >
              <Pack remaining={batch.booked} total={batch.capacity} cap min={batch.minSize} />
            </Pressable>
          </View>
        }
        onPress={() => setBatchSheet(batch)}
      />
    </AgendaItem>
  );

  const trailingFor = (item: DiaryItem) => {
    if (item.open) return <Button label="Close" size="sm" variant="ghost" onPress={() => void closeOff(item)} />;
    if (item.undoable && item.state !== 'done') {
      return <Button label="Undo" size="sm" variant="ghost" onPress={() => void undo(item)} />;
    }
    if (item.state === 'done') return <Tag label="Done" tone="ok" />;
    if (item.state === 'cancelled') return <Tag label="Cancelled" />;
    return <Tag label={item.mode === 'remote' ? 'Remote' : 'Floor'} tone={item.mode === 'remote' ? 'remote' : 'floor'} />;
  };

  const closeBatch = async (batch: DiaryBatch) => {
    try {
      const charged = await markBatchDone(batch.sessionIds);
      setNotice(
        charged === batch.booked
          ? `${batch.booked} marked done, one off each pack.`
          : `${batch.booked} marked done. ${batch.booked - charged} had no pack to charge.`,
      );
    } catch {
      setNotice('Could not close that batch off.');
    }
  };

  const closeOff = async (item: DiaryItem) => {
    try {
      await startSession(item.id).then(() => undefined);
    } catch {
      // Already started, or nothing to start — the outcome sheet is the path.
    }
    setSheetItem(item);
  };

  const weekBody = () => (
    <>
      <Tally
        style={styles.tally}
        items={[
          { key: 'booked', value: String(week.booked), label: 'booked' },
          { key: 'done', value: String(week.done), label: 'done', tone: 'ok' },
          {
            key: 'free',
            value: `${Math.floor(week.freeMinutes / 60)}h`,
            label: 'free',
            tone: 'warn',
          },
        ]}
      />
      <WeekGrid
        style={styles.week}
        columns={week.columns.map((c) => ({
          at: c.at,
          label: c.label,
          date: c.date,
          today: c.today,
          closed: c.closed,
          pips: c.pips.map((p) => ({
            id: p.sessionId,
            time: p.time,
            name: p.name,
            kind: p.batchId
              ? ('batch' as const)
              : p.mode === 'remote'
                ? ('remote' as const)
                : ('floor' as const),
            done: p.state === 'done',
          })),
        }))}
        onDay={(at) => {
          setSelected(at);
          setView('day');
        }}
        onPip={(_id, at) => {
          setSelected(at);
          setView('day');
        }}
      />
      <WeekLegend
        items={[
          { color: colors.accent, label: 'Floor' },
          { color: colors.remote, label: 'Remote' },
          ...(BATCHES_ENABLED ? [{ color: colors.warn, label: 'Batch' }] : []),
        ]}
      />
    </>
  );

  const monthBody = () => (
    <>
      <MonthGrid
        style={styles.month}
        cells={month.cells}
        selected={selected}
        onSelect={setSelected}
        onLongPress={(at) => openBooking(defaultSlot(input, at, now))}
      />
      <WeekLegend
        items={[
          { color: colors.accent, label: '1 dot = 2 sessions' },
          { color: colors.warn, label: 'Full day' },
        ]}
      />
      <GroupHead
        label={longDay(selected)}
        count={day.items.length}
        style={styles.monthHead}
      />
      {day.items.length === 0 ? (
        <Text style={styles.monthEmpty}>Nothing booked.</Text>
      ) : (
        <List>
          {day.items.map((item) => (
            <Row
              key={item.id}
              grouped
              minHeight={56}
              title={item.clientName}
              subtitle={item.detail}
              leading={<Avatar name={item.clientName} size="sm" />}
              onPress={() => setSheetItem(item)}
            />
          ))}
        </List>
      )}
    </>
  );

  /* ------------------------------------------------------------------ swipe */

  /**
   * Left for forward, right for back — the direction every calendar and photo
   * gallery on the phone already uses. The page rides the finger 1:1 — it is
   * the thing being dragged, not a cursor pointing at it — and a committed turn
   * carries the old day the rest of the way off-screen while the new one slides
   * in from the far edge, one continuous movement rather than a cut. Whatever
   * the view is stepping by, the gesture is the same one.
   *
   * `PanResponder` rather than a gesture library because this app has neither
   * gesture-handler nor reanimated installed, and `Sheet` and `Drawer` already
   * do their dragging this way.
   */
  const { width: pageWidth } = useWindowDimensions();
  const shift = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  /** Where the finger left the page, so the exit leg knows how far is left. */
  const dragX = useRef(0);

  // Read through a ref so the responder can be built once and still see the
  // current view. Rebuilding it every render would drop a gesture in progress.
  const turner = useRef<(delta: 1 | -1, vx: number) => void>(() => {});
  useEffect(() => {
    turner.current = (delta, vx) => {
      const turn = () => {
        setSelected((current) => stepAnchor(view, current, delta));
        setOpenGap(null);
      };
      if (reduceMotion) {
        turn();
        shift.setValue(0);
        return;
      }
      // Exit at roughly the speed the finger let go with, so the release
      // reads as a handover rather than a restart. Slow drags get a floor —
      // the page still has to arrive.
      const remaining = Math.max(pageWidth - Math.abs(dragX.current), 0);
      const exitMs = Math.min(200, Math.max(80, remaining / Math.max(Math.abs(vx), 0.7)));
      Animated.timing(shift, {
        toValue: -delta * pageWidth,
        duration: exitMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        turn();
        // The new day enters from the side the swipe was heading towards,
        // decelerating into place.
        shift.setValue(delta * pageWidth);
        Animated.timing(shift, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    };
  });

  const swipe = useMemo(
    () =>
      PanResponder.create({
        // Capture, not bubble: the body is inside a vertical ScrollView, and a
        // non-capturing handler would never see a gesture the scroller had
        // already claimed. The 2:1 ratio is what keeps a vertical scroll —
        // which is always slightly diagonal — from being read as a page turn.
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dx) > SWIPE_SLOP && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        // Once this is a page turn it stays one. Handing it back mid-drag would
        // leave the content translated with nothing to settle it.
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          dragX.current = g.dx;
          if (reduceMotion) return;
          shift.setValue(g.dx);
        },
        onPanResponderRelease: (_, g) => {
          const far = Math.abs(g.dx) > pageWidth * SWIPE_COMMIT_FRACTION;
          const fast = Math.abs(g.vx) > SWIPE_VELOCITY;
          if (far || fast) {
            // A decisive flick names the direction even against the drag —
            // swiping out and flicking back means "changed my mind", and the
            // page should follow the flick, not the leftover displacement.
            const towards = fast ? g.vx : g.dx;
            turner.current(towards < 0 ? 1 : -1, g.vx);
          } else {
            Animated.spring(shift, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 0,
              speed: 20,
            }).start();
          }
          dragX.current = 0;
        },
        onPanResponderTerminate: () => {
          dragX.current = 0;
          Animated.spring(shift, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 20,
          }).start();
        },
      }),
    [shift, reduceMotion, pageWidth],
  );

  /* ----------------------------------------------------------------- render */

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.pad}>
        <AppBar
          title="Diary"
          subtitle={subtitle}
          leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
          actions={
            <>
              {/* Jump to today wears the calendar, not the clock. It moves the
                  diary to a DATE; the clock next to it is about times of day,
                  and two clocks in one bar meaning two different things is
                  worse than either icon being imperfect on its own. It also
                  stays conditional, which is what keeps the bar at two actions
                  in the state it is usually in. */}
              {isToday && view === 'day' ? null : (
                <IconButton
                  icon={IconCalendar}
                  label="Jump to today"
                  bare
                  onPress={() => {
                    setSelected(today);
                    setView('day');
                  }}
                />
              )}
              {/* Working hours, visibly and permanently.
                  This was reachable only by long-pressing the view switcher —
                  a gesture on an unrelated control, which is not a route
                  anybody finds. The hours decide what this whole screen draws:
                  a closed day, an empty gap, a slot that is missing at 4pm are
                  all answered here, and the question is always asked while
                  looking at the diary. Settings still has the same entry for
                  anyone who goes looking where settings live. */}
              <IconButton
                icon={IconClock}
                label="Your working hours"
                bare
                onPress={() => navigation.navigate('WorkingHours')}
              />
              <IconButton
                icon={IconGrid}
                label="Change view"
                bare
                onPress={() => setView(view === 'day' ? 'week' : view === 'week' ? 'month' : 'day')}
              />
            </>
          }
        />
      </View>

      {/* The page turn is captured out here, around the scroller rather than
          inside it, so a swipe anywhere — over the strip, the grid, a session
          row — turns the page. Vertical scrolling passes straight through. */}
      <View style={styles.swipe} {...swipe.panHandlers}>
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {/* The strip and the switcher sit in the header above and stay real —
              you can already swipe to Thursday before the day has been read. Only
              the body below them is unknown, so only it crosses over.

              The header stays put through a page turn too: the day strip is the
              week, and sliding it sideways while it stays on the same week would
              claim a movement that did not happen. */}
          <Animated.View style={{ transform: [{ translateX: shift }] }}>
            <Reveal ready={ready} skeleton={<AgendaSkeleton />} style={styles.viewBody}>
              {view === 'day' ? dayBody() : view === 'week' ? weekBody() : monthBody()}
            </Reveal>
          </Animated.View>
        </ScrollView>
      </View>

      <BookSheet
        visible={bookAt !== null}
        input={input}
        at={bookAt ?? now}
        seedClientId={bookFor}
        onBook={(result) => void commitBooking(result)}
        onClose={() => {
          setBookAt(null);
          setBookFor(null);
        }}
      />
      <SessionSheet
        visible={sheetItem !== null}
        item={sheetItem}
        input={input}
        now={now}
        onClose={() => setSheetItem(null)}
        onStart={(item) => {
          setSheetItem(null);
          void startSession(item.id)
            .then((workoutId) =>
              navigation.navigate('WorkoutLog', {
                workoutId,
                programId: item.programId,
                templateDay: item.templateDay,
              }),
            )
            .catch(() => setNotice('Could not start that session.'));
        }}
        onMove={(item, at) => {
          setSheetItem(null);
          void moveSession(item.id, at).then(() => setNotice(`${item.clientName} moved.`));
        }}
        onOutcome={(item, outcome) => void applyOutcome(item, outcome)}
        onMessage={(item) => {
          setSheetItem(null);
          message(item);
        }}
        onOpenProgram={(item) => {
          setSheetItem(null);
          navigation.navigate('ProgramList', { clientId: item.clientId });
        }}
        onOpenPack={(item) => {
          setSheetItem(null);
          navigation.navigate('PackageList', { clientId: item.clientId, clientName: item.clientName });
        }}
      />
      <ClashSheet
        visible={clash !== null}
        clash={clash?.item ?? null}
        wanted={clash?.wanted ?? now}
        nextFree={clash?.next ?? null}
        onChoose={(choice) => void resolveClash(choice)}
        onClose={() => {
          setClash(null);
          setPending(null);
        }}
      />
      <BatchSheet
        batch={batchSheet}
        regulars={[]}
        onAdd={() => {
          const batch = batchSheet;
          setBatchSheet(null);
          setAddTo(batch);
          setBookAt(batch?.at ?? null);
        }}
        onDoneAll={(batch) => {
          setBatchSheet(null);
          void closeBatch(batch);
        }}
        onOpenAttendee={(sessionId) => {
          setBatchSheet(null);
          const attendee = day.items.find((i) => i.id === sessionId);
          if (attendee) setSheetItem(attendee);
        }}
        onClose={() => setBatchSheet(null)}
      />
      <TimeOffSheet
        visible={blockRange !== null}
        input={input}
        from={blockRange?.from ?? now}
        to={blockRange?.to ?? now}
        onBlock={(choice, ids) => void blockOut(choice, ids)}
        onClose={() => setBlockRange(null)}
      />

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

/* ---------------------------------------------------------------- helpers */

const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekdayName(at: number): string {
  return DAY_LONG[(new Date(at).getDay() + 6) % 7];
}

function longDay(at: number): string {
  const d = new Date(at);
  return `${weekdayName(at)} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/**
 * Where a booking starts when nothing was tapped.
 *
 * The moment this day opens for work, not a fixed 06:00 — a trainer whose
 * Tuesday starts at 17:00 was being handed 06:00 and made to nudge eleven
 * hours, and one who starts at 05:00 was being handed an hour they had already
 * spent. The hours are already on screen behind this sheet; opening anywhere
 * else contradicts them.
 *
 * On today the clock wins over the calendar: the next round hour, unless the
 * day has not opened yet, in which case it is the opening. A day with no hours
 * at all — or one already over — falls back to the next round hour, which is at
 * least a real time rather than midnight. The trainer is never *held* to any of
 * this; §07 keeps their own booking free of working hours entirely.
 */
function defaultSlot(input: DiaryInput, day: number, now: number): number {
  const windows = mergeWindows(input.hours.filter((h) => h.weekday === isoWeekday(day)));

  if (day !== startOfDay(now)) {
    return windows[0] ? atMinute(day, windows[0].startMinute) : day + 6 * 3_600_000;
  }

  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const hour = next.getTime();

  // The first window that has not already closed — on a split shift at 14:00
  // that is the evening, not the morning that ended three hours ago.
  const live = windows.find((w) => atMinute(day, w.endMinute) > hour);
  return live ? Math.max(atMinute(day, live.startMinute), hour) : hour;
}

function idleNames(idle: { name: string }[]): string {
  const first = idle[0]?.name ?? '';
  if (idle.length === 1) return first;
  return `${first} and ${idle.length - 1} other${idle.length === 2 ? '' : 's'}`;
}

/**
 * The slot a booking should open on when the caller didn't name one.
 *
 * The first genuinely free slot in today's working hours, because that is the
 * one a trainer means by "book a session" — and if today is full or over, the
 * next hour on the clock, which is at least a real time rather than midnight.
 */
function nextBookableSlot(input: DiaryInput, now: number): number {
  const today = buildDay(input, startOfDay(now), now);
  const slot = today.gaps.flatMap((g) => g.slots).find((s) => s.at >= now);
  if (slot) return slot.at;
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next.getTime();
}

/** "Morning batch", "Evening batch" — the hour is what a trainer calls it by. */
function batchNameFor(at: number): string {
  const hour = new Date(at).getHours();
  if (hour < 12) return 'Morning batch';
  if (hour < 17) return 'Afternoon batch';
  return 'Evening batch';
}

const styles = StyleSheet.create({
  batchEnd: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  swipe: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  banner: { marginBottom: space.s2 },
  strip: { marginTop: 10 },
  segmented: { marginTop: space.s3 },
  viewBody: { marginTop: space.s4 },
  agenda: { marginTop: space.s2 },
  empty: { marginTop: 20 },
  emptyActions: { gap: space.s2, width: 290 },
  note: { marginTop: space.s5 },
  tally: { marginBottom: space.s4 },
  week: { marginBottom: space.s2 },
  month: { marginBottom: space.s2 },
  monthHead: { marginHorizontal: -space.inset, marginTop: space.s3 },
  monthEmpty: { fontSize: 13, color: colors.ink3, paddingVertical: space.s3 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
