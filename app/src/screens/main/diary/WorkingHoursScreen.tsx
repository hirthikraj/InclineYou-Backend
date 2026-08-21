/**
 * 5a · When you work.
 *
 * Two layers of availability, not four. Trainerize stacks Vacation over
 * Date-specific over Appointment-type over General; it is a complete model and
 * it is far too much for a trainer with a phone. This is layer one — weekly
 * hours — and time blocks are layer two.
 *
 * And it keeps Trainerize's best rule, stated on the screen: these constrain
 * what a client can self-book. They never constrain the trainer.
 *
 * The editing sheet leads with a picture, not a form: a timeline of the day
 * with each window drawn as a block, redrawing as the fields are nudged, so a
 * split shift and the break inside it are visible rather than inferred from
 * two pairs of numbers. And because a trainer's week is mostly the same shape
 * six times over, the sheet can apply the day being edited to other weekdays
 * in the same save — one edit and a row of day chips instead of six repeat
 * visits.
 *
 * Editable at any time, from here or from the trainer's profile. Changing them is the
 * expected case, not an exception — a trainer's week moves with the season, the
 * gym's timings and their own. What a change must never do is silently strand
 * somebody already booked, so a save that would leave a client outside the new
 * hours says whose booking it is and asks first. A save that strands nobody
 * goes straight through, with no dialog and no confirmation step.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import {
  AppBar,
  AvailRow,
  Button,
  Callout,
  Chip,
  DayTimeline,
  Dialog,
  FieldMsg,
  IconBack,
  IconButton,
  IconPlus,
  IconShield,
  IconTrash,
  MINUTES_IN_DAY,
  Seg,
  Sheet,
  TimeField,
  colors,
  formatMinute,
  space,
  tnum,
} from '../../../design';
import { useAuth } from '../../../store/AuthContext';
import {
  conflictingSessions,
  observeWorkingHours,
  saveWorkingHours,
  type HourWindow,
  type HoursConflict,
} from '../../../db/diary';
import { mergeWindows } from '../../../diary/diary';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The shortest window worth having, and the nudge a new one opens with. */
const MIN_WINDOW_MIN = 30;
const NEW_WINDOW_MIN = 2 * 60;

/**
 * The common shapes, as one tap.
 *
 * Peak on an Indian gym floor is 06:00–10:00 and 17:00–21:00, which is why the
 * split shift is the default shape here and not an edge case. These are a
 * shortcut to the usual answer, not the set of possible answers — anything a
 * preset cannot say, the two fields below can.
 */
const PRESETS: { key: string; label: string; window: HourWindow }[] = [
  { key: 'early', label: '05:00 – 09:00', window: { startMinute: 300, endMinute: 540 } },
  { key: 'morning', label: '06:00 – 11:00', window: { startMinute: 360, endMinute: 660 } },
  { key: 'midday', label: '11:00 – 15:00', window: { startMinute: 660, endMinute: 900 } },
  { key: 'evening', label: '17:00 – 21:00', window: { startMinute: 1020, endMinute: 1260 } },
  { key: 'late', label: '19:00 – 22:00', window: { startMinute: 1140, endMinute: 1320 } },
];

export function formatWindow(w: { startMinute: number; endMinute: number }): string {
  return `${formatMinute(w.startMinute)} – ${formatMinute(w.endMinute)}`;
}

/** A save that is waiting on the trainer, because somebody is booked in it. */
interface PendingChange {
  /** The day being edited first, then any days the hours are copied to. */
  weekdays: number[];
  windows: HourWindow[];
  hits: (HoursConflict & { weekday: number })[];
}

export default function WorkingHoursScreen() {
  const navigation = useNavigation();
  const { trainerId } = useAuth();
  const [rows, setRows] = useState<{ weekday: number; startMinute: number; endMinute: number }[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<HourWindow[]>([]);
  const [copyDays, setCopyDays] = useState<number[]>([]);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const sub = observeWorkingHours().subscribe((all) =>
      setRows(
        all.map((r) => ({
          weekday: r.weekday,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
        })),
      ),
    );
    return () => sub.unsubscribe();
  }, []);

  const byDay = useMemo(() => {
    const out = new Map<number, HourWindow[]>();
    for (const row of rows) {
      const list = out.get(row.weekday) ?? [];
      list.push({ startMinute: row.startMinute, endMinute: row.endMinute });
      out.set(row.weekday, list);
    }
    // Merged with the diary's own rule, not just sorted. A day that has the
    // same window stored twice — an old tombstone the phone never learned
    // about, or hours saved twice — must draw one pill here and produce one
    // gap there, or the two screens contradict each other.
    for (const [weekday, list] of out) out.set(weekday, mergeWindows(list));
    return out;
  }, [rows]);

  const open = (weekday: number) => {
    setDraft(byDay.get(weekday) ?? []);
    // Copying is opted into per edit, never remembered: hours that were right
    // for the whole week last time are exactly the ones that are not this time.
    setCopyDays([]);
    setEditing(weekday);
  };

  /** A day chip is a toggle: the hours being edited will also replace that day. */
  const toggleCopyDay = (weekday: number) =>
    setCopyDays((current) =>
      current.includes(weekday)
        ? current.filter((d) => d !== weekday)
        : [...current, weekday].sort((a, b) => a - b),
    );

  /** A preset is a toggle: tap to add that window, tap again to take it back. */
  const togglePreset = (window: HourWindow) =>
    setDraft((current) => {
      const has = current.some(
        (w) => w.startMinute === window.startMinute && w.endMinute === window.endMinute,
      );
      return has
        ? current.filter(
            (w) => !(w.startMinute === window.startMinute && w.endMinute === window.endMinute),
          )
        : [...current, window].sort((a, b) => a.startMinute - b.startMinute);
    });

  /**
   * Edits one end of one window, and drags the other end out of the way.
   *
   * A trainer moving the start past the end means "my day now starts later",
   * not "my day is now negative". Pushing the far end keeps the window the
   * length it was rather than collapsing it, so one nudge never destroys the
   * value the other field was holding.
   */
  const editWindow = (index: number, edge: 'start' | 'end', value: number) =>
    setDraft((current) =>
      current.map((w, i) => {
        if (i !== index) return w;
        if (edge === 'start') {
          const startMinute = Math.min(value, MINUTES_IN_DAY - MIN_WINDOW_MIN);
          return {
            startMinute,
            endMinute: Math.max(w.endMinute, startMinute + MIN_WINDOW_MIN),
          };
        }
        const endMinute = Math.max(value, MIN_WINDOW_MIN);
        return {
          startMinute: Math.min(w.startMinute, endMinute - MIN_WINDOW_MIN),
          endMinute,
        };
      }),
    );

  const removeWindow = (index: number) =>
    setDraft((current) => current.filter((_, i) => i !== index));

  /**
   * A new window starts where the last one ended, not at some fixed hour.
   *
   * The second window of a split shift is always later than the first, and
   * opening it on top of the window that is already there would need three
   * nudges before it said anything true.
   */
  const addWindow = () =>
    setDraft((current) => {
      // The latest end, not the last row's: hand-editing can leave the list in
      // a different order than the clock, and opening the new window on top of
      // an existing one is the one placement that is never useful.
      const latest = current.reduce((max, w) => Math.max(max, w.endMinute), 0);
      const startMinute = Math.min(
        current.length > 0 ? latest + 60 : 6 * 60,
        MINUTES_IN_DAY - NEW_WINDOW_MIN,
      );
      return [...current, { startMinute, endMinute: startMinute + NEW_WINDOW_MIN }];
    });

  /** A window shorter than the floor is a typo mid-nudge, not a decision. */
  const invalid = draft.some((w) => w.endMinute - w.startMinute < MIN_WINDOW_MIN);

  /**
   * Saves, unless somebody is booked outside the result.
   *
   * The check runs against the *merged* draft, because that is what the diary
   * will read: two windows the trainer entered separately that happen to touch
   * cover a session sitting across their seam, and warning about it would be a
   * lie the trainer can see is a lie.
   */
  const save = async () => {
    if (editing === null || !trainerId || invalid) return;
    const windows = mergeWindows(draft);
    const weekdays = [editing, ...copyDays.filter((d) => d !== editing)];

    setChecking(true);
    try {
      // Checked day by day, because that is how it will be saved — and every
      // day's conflicts go into one dialog, so the trainer answers the whole
      // change once rather than being interrogated once per weekday.
      const hits: PendingChange['hits'] = [];
      for (const weekday of weekdays) {
        const dayHits = await conflictingSessions(weekday, windows);
        hits.push(...dayHits.map((hit) => ({ ...hit, weekday })));
      }
      if (hits.length > 0) {
        // The sheet closes and the dialog takes its place rather than stacking
        // on top of it — two modals at once is a platform coin-flip, and the
        // draft is held in state either way, so Cancel puts it back untouched.
        hits.sort((a, b) => a.at - b.at);
        setPending({ weekdays, windows, hits });
        setEditing(null);
        return;
      }
      for (const weekday of weekdays) await saveWorkingHours(trainerId, weekday, windows);
      setEditing(null);
    } finally {
      setChecking(false);
    }
  };

  /** The trainer read the list and still wants the change. */
  const confirmPending = async () => {
    if (!pending || !trainerId) return;
    for (const weekday of pending.weekdays) await saveWorkingHours(trainerId, weekday, pending.windows);
    setPending(null);
  };

  /** Back to the sheet, with the draft and day chips exactly as they left them. */
  const cancelPending = () => {
    if (!pending) return;
    setEditing(pending.weekdays[0]);
    setCopyDays(pending.weekdays.slice(1));
    setPending(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.pad}>
        <AppBar
          title="When you work"
          subtitle="Clients can only self-book inside these"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.list}>
          {DAYS.map((day, i) => (
            <AvailRow
              key={day}
              day={SHORT[i]}
              windows={(byDay.get(i) ?? []).map(formatWindow)}
              onPress={() => open(i)}
            />
          ))}
        </View>

        <Callout icon={IconShield} style={styles.note}>
          Your own booking ignores all of this. Settings exist to constrain clients, not the person
          who set them.
        </Callout>
      </ScrollView>

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === null ? '' : DAYS[editing]}
      >
        {/* Scrollable because a split shift plus presets is taller than the
            sheet's cap on a small phone. `flexShrink` is what lets it shrink
            into that cap — without it the ScrollView takes its content height
            and the Save button sits below the bottom of the screen. The sheet's
            drag handle owns its own pan responder, so this never fights it. */}
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* The receipt for everything below it: presets and nudges redraw
              these blocks live, and it draws the *merged* draft — two windows
              that touch become one block here because they become one window
              on save, and the picture must not promise otherwise. */}
          <DayTimeline windows={mergeWindows(draft)} style={styles.timeline} />

          <Text style={styles.label}>Quick fill</Text>
          <Seg style={styles.seg}>
            {PRESETS.map((preset) => (
              <Chip
                key={preset.key}
                label={preset.label}
                selected={draft.some(
                  (w) =>
                    w.startMinute === preset.window.startMinute &&
                    w.endMinute === preset.window.endMinute,
                )}
                onPress={() => togglePreset(preset.window)}
              />
            ))}
          </Seg>

          <Text style={[styles.label, styles.labelGap]}>Your hours</Text>

          {draft.length === 0 ? (
            <Text style={styles.hint}>
              Nothing set — this day will be closed, and no client can self-book on it.
            </Text>
          ) : (
            draft.map((window, i) => {
              // The break line reads off the previous *row*, not a sorted copy:
              // rows never reorder under a thumb mid-nudge, so while a window is
              // being dragged past its neighbour the line simply disappears
              // rather than jumping between rows.
              const prev = i > 0 ? draft[i - 1] : null;
              const gap =
                prev && window.startMinute > prev.endMinute
                  ? { startMinute: prev.endMinute, endMinute: window.startMinute }
                  : null;
              return (
                // Keyed by position: these windows have no identity until they are
                // saved, and two of them can legitimately read the same while the
                // trainer is halfway through nudging one onto the other.
                <View key={i} style={styles.window}>
                  {gap ? (
                    <Text style={styles.gapLine}>
                      break · {formatWindow(gap)} ·{' '}
                      {formatDuration(gap.endMinute - gap.startMinute)}
                    </Text>
                  ) : null}
                  <View style={styles.windowHead}>
                    <Text style={styles.windowName}>Window {i + 1}</Text>
                    <Text style={styles.windowDur}>
                      {formatDuration(window.endMinute - window.startMinute)}
                    </Text>
                  </View>
                  <View style={styles.windowFields}>
                    <TimeField
                      label="Starts"
                      value={window.startMinute}
                      onChange={(next) => editWindow(i, 'start', next)}
                      style={styles.field}
                    />
                    <TimeField
                      label="Ends"
                      value={window.endMinute}
                      onChange={(next) => editWindow(i, 'end', next)}
                      style={styles.field}
                    />
                    <IconButton
                      icon={IconTrash}
                      label={`Remove ${formatWindow(window)}`}
                      bare
                      onPress={() => removeWindow(i)}
                    />
                  </View>
                </View>
              );
            })
          )}

          <Button
            label={draft.length === 0 ? 'Add hours' : 'Add another window'}
            variant="ghost"
            icon={IconPlus}
            block
            style={styles.add}
            onPress={addWindow}
          />

          {invalid ? (
            <FieldMsg tone="error" style={styles.msg}>
              A window has to be at least {MIN_WINDOW_MIN} minutes long.
            </FieldMsg>
          ) : draft.length > 1 ? (
            <Text style={styles.hint}>
              A split shift is two windows: {mergeWindows(draft).map(formatWindow).join(' and ')}.
            </Text>
          ) : null}

          {/* A week is mostly the same day six times over. These chips let one
              edit be that week, instead of six more trips through this sheet. */}
          <Text style={[styles.label, styles.labelGap]}>Also apply to</Text>
          <Seg style={styles.seg}>
            {DAYS.map((_, d) => d)
              .filter((d) => d !== editing)
              .map((d) => (
                <Chip
                  key={d}
                  label={SHORT[d]}
                  selected={copyDays.includes(d)}
                  onPress={() => toggleCopyDay(d)}
                />
              ))}
          </Seg>
          {copyDays.length > 0 ? (
            <Text style={styles.hint}>
              {draft.length === 0 ? 'Closing' : 'Saving'} replaces{' '}
              {copyDays.map((d) => DAYS[d]).join(', ')} with{' '}
              {draft.length === 0 ? 'a closed day' : 'these hours'} too.
            </Text>
          ) : null}

          <Button
            label={ctaLabel(draft.length === 0, 1 + copyDays.length)}
            size="lg"
            block
            loading={checking}
            disabled={invalid}
            style={styles.cta}
            onPress={() => void save()}
          />
        </ScrollView>
      </Sheet>

      <Dialog
        visible={pending !== null}
        title={
          pending && pending.hits.length === 1
            ? '1 client is booked outside these hours'
            : `${pending?.hits.length ?? 0} sessions are booked outside these hours`
        }
        cancelLabel="Go back"
        confirmLabel="Save anyway"
        onCancel={cancelPending}
        onConfirm={() => void confirmPending()}
      >
        <View>
          <Text style={styles.dialogBody}>
            {pending ? pendingBody(pending) : ''}
          </Text>

          {pending?.hits.slice(0, MAX_LISTED).map((hit) => (
            <View key={hit.sessionId} style={styles.hit}>
              <Text style={styles.hitName} numberOfLines={1}>
                {hit.clientName}
              </Text>
              <Text style={styles.hitTime}>{hitTime(hit)}</Text>
            </View>
          ))}

          {pending && pending.hits.length > MAX_LISTED ? (
            <Text style={styles.more}>
              and {pending.hits.length - MAX_LISTED} more
            </Text>
          ) : null}

          <Text style={styles.dialogFoot}>
            They stay booked and still show in your diary. The new hours only change what clients
            can book from now on.
          </Text>
        </View>
      </Dialog>
    </SafeAreaView>
  );
}

/** Enough to recognise the problem; past this the dialog stops being readable. */
const MAX_LISTED = 5;

/** "4 h", "2 h 30 m" — how long a window or a break runs. */
function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** "Close this day" · "Close 3 days" · "Save hours" · "Save for 3 days". */
function ctaLabel(closing: boolean, dayCount: number): string {
  if (closing) return dayCount > 1 ? `Close ${dayCount} days` : 'Close this day';
  return dayCount > 1 ? `Save for ${dayCount} days` : 'Save hours';
}

/** The dialog's first line, for one day or several — the dates on each row say which day each hit is. */
function pendingBody(pending: PendingChange): string {
  const days = pending.weekdays.map((d) => DAYS[d]).join(', ');
  if (pending.windows.length === 0) return `Closing ${days} leaves these already booked:`;
  const hours = pending.windows.map(formatWindow).join(' and ');
  return pending.weekdays.length > 1
    ? `Sessions on ${days} fall outside ${hours}:`
    : `These ${days} sessions fall outside ${hours}:`;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "23 Aug · 07:00 – 08:00" — the date matters, these are all the same weekday. */
function hitTime(hit: HoursConflict): string {
  const d = new Date(hit.at);
  const start = d.getHours() * 60 + d.getMinutes();
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} · ${formatMinute(start)} – ${formatMinute(
    start + hit.minutes,
  )}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s9 },
  list: { marginTop: space.s3, gap: 6 },
  note: { marginTop: space.s6 },
  sheetScroll: { flexShrink: 1 },
  sheetBody: { paddingBottom: space.s4 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  labelGap: { marginTop: space.s6 },
  seg: { marginTop: space.s3 },
  timeline: { marginTop: space.s2, marginBottom: space.s5 },
  window: { marginTop: space.s3 },
  windowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  windowName: { fontSize: 12, fontWeight: '800', color: colors.ink2 },
  windowDur: { fontSize: 12, fontWeight: '700', color: colors.ink3, ...tnum },
  gapLine: { fontSize: 11.5, color: colors.ink3, marginBottom: space.s2, ...tnum },
  windowFields: { flexDirection: 'row', alignItems: 'flex-end', gap: space.s2 },
  field: { flex: 1 },
  add: { marginTop: space.s3 },
  msg: { marginTop: space.s3 },
  hint: { marginTop: space.s3, fontSize: 13, color: colors.ink3 },
  cta: { marginTop: space.s5 },
  dialogBody: { fontSize: 14, lineHeight: 21, color: colors.ink2 },
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    marginTop: space.s2,
  },
  hitName: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '700', color: colors.ink },
  hitTime: { fontSize: 12.5, color: colors.ink3 },
  more: { marginTop: space.s2, fontSize: 12.5, color: colors.ink3 },
  dialogFoot: { marginTop: space.s4, fontSize: 13, lineHeight: 19, color: colors.ink3 },
});
