/**
 * Screen 05 · Diary · FR-2.
 *
 * `agent/design system/screens/trainxdiary.html`.
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
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useShell } from '../../../navigation/AppShell';
import { useDiary } from '../../../diary/useDiary';
import {
  DEFAULT_SESSION_MIN,
  buildDay,
  buildMonth,
  buildStrip,
  buildWeek,
  daysWorkedRecently,
  findClash,
  hhmm,
  type DiaryItem,
} from '../../../diary/diary';
import {
  bookSeries,
  bookSession,
  cancelSessions,
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
  Row,
  Segmented,
  Tag,
  Tally,
  Toast,
  WeekGrid,
  WeekLegend,
  colors,
  space,
} from '../../../design';
import BookSheet, { type BookResult } from './BookSheet';
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

  const scroller = useRef<ScrollView>(null);
  const { input, now } = useDiary(selected, focused);
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
    if (day.items.length === 0 && day.gaps.length === 0) {
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
                  onPress={() => openBooking(defaultSlot(selected, now))}
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
      stream.push({ key: item.id, at: item.at, node: sessionRow(item) });
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

  const trailingFor = (item: DiaryItem) => {
    if (item.open) return <Button label="Close" size="sm" variant="ghost" onPress={() => void closeOff(item)} />;
    if (item.undoable && item.state !== 'done') {
      return <Button label="Undo" size="sm" variant="ghost" onPress={() => void undo(item)} />;
    }
    if (item.state === 'done') return <Tag label="Done" tone="ok" />;
    if (item.state === 'cancelled') return <Tag label="Cancelled" />;
    return <Tag label={item.mode === 'remote' ? 'Remote' : 'Floor'} tone={item.mode === 'remote' ? 'remote' : 'floor'} />;
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
            kind: p.mode === 'remote' ? ('remote' as const) : ('floor' as const),
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
        onLongPress={(at) => openBooking(defaultSlot(at, now))}
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
              {isToday && view === 'day' ? null : (
                <IconButton
                  icon={IconClock}
                  label="Jump to today"
                  bare
                  onPress={() => {
                    setSelected(today);
                    setView('day');
                  }}
                />
              )}
              <IconButton
                icon={IconGrid}
                label="Change view"
                bare
                onPress={() => setView(view === 'day' ? 'week' : view === 'week' ? 'month' : 'day')}
                onLongPress={() => navigation.navigate('WorkingHours')}
              />
            </>
          }
        />
      </View>

      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        <View style={styles.viewBody}>
          {view === 'day' ? dayBody() : view === 'week' ? weekBody() : monthBody()}
        </View>
      </ScrollView>

      <BookSheet
        visible={bookAt !== null}
        input={input}
        at={bookAt ?? now}
        onBook={(result) => void commitBooking(result)}
        onClose={() => setBookAt(null)}
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

/** Where a booking starts when nothing was tapped: the next round hour. */
function defaultSlot(day: number, now: number): number {
  const base = day === startOfDay(now) ? now : day + 6 * 3_600_000;
  const d = new Date(base);
  d.setMinutes(0, 0, 0);
  return d.getTime() + (day === startOfDay(now) ? 3_600_000 : 0);
}

function idleNames(idle: { name: string }[]): string {
  const first = idle[0]?.name ?? '';
  if (idle.length === 1) return first;
  return `${first} and ${idle.length - 1} other${idle.length === 2 ? '' : 's'}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
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
