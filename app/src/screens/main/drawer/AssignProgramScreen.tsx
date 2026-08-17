/**
 * Assign a program: client picker → their week → copy.
 *
 * ── Their week ─────────────────────────────────────────────────────────────
 *
 * A template's days are slots — Day 1, Day 2, Day 3 — and this screen is where
 * the slots land on a real week, because the landing is the client's
 * preference, not the template's. A three-day plan serves the client who
 * trains Mon/Wed/Fri and the one who trains Tue/Thu/Sat; what changes between
 * them is chosen here: which weekdays, and at what time on each. The count
 * must match exactly — a plan with a day that never happens, or a weekday with
 * no day to put on it, is refused by this screen first and by the server
 * again.
 *
 * The times must also be *free*: an hour another client already holds — their
 * standing week or a live program's schedule — cannot be landed on. The
 * steppers skip taken hours, a clash that arrives anyway (say, the picked
 * client changing under a sync) is named under its day, and the copy button
 * stays off until the week is clean. Same hard rule as the add-client week
 * picker; the diary's warn-only clash stance is for one-off sessions, not a
 * slot repeated every week.
 *
 * Day 1 goes on the earliest weekday picked, Day 2 on the next — the default,
 * not a rule: the mapping list under the times is where a client who wants
 * legs fresh on Monday gets Day 3 there. Each landed day gets its own time — a
 * 6am Monday and an 8pm Thursday is an ordinary client, not an edge case.
 *
 * Confirming also BOOKS the week: the same mapping-and-booking contract as the
 * add-client plan step (see ClientPlanScreen), read back in a dialog before
 * anything is written — as many sessions as the client's pack has left, or the
 * program's length when nothing on their account counts sessions.
 *
 * ── The copy ───────────────────────────────────────────────────────────────
 *
 * The one write in this feature that goes through the server rather than the
 * sync queue, and the reason is worth stating: **the copy is one transaction.**
 * It creates a program and writes one `program_exercise` row per entry in the
 * blueprint — translated from day slots to the weekdays chosen here — and a
 * half-written copy is a client on a plan with three exercises missing.
 * `POST /v1/templates/{id}/apply` already does it atomically; doing it again on
 * the phone would give the app two versions of its most consequential write.
 *
 * That means this screen needs a connection, and it says so up front rather
 * than failing at the end. Everything else in the app works offline; this
 * doesn't, and pretending otherwise would cost somebody their plan.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { isAxiosError } from 'axios';
import { combineLatest } from 'rxjs';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { applyTemplate, type ScheduleEntry } from '../../../api/programs';
import { syncDatabase } from '../../../db/sync';
import { bookSeries } from '../../../db/diary';
import { clientsCollection } from '../../../db/clients';
import { programsCollection } from '../../../db/programs';
import type ClientModel from '../../../db/models/Client';
import type ProgramModel from '../../../db/models/Program';
import { packSessionsLeft } from '../../../db/money';
import { useAuth } from '../../../store/AuthContext';
import { useTraining } from '../../../training/useTraining';
import { parseBlueprint, parseDayLabels, parseTrainingDays } from '../../../training/training';
import DayMapList from '../../../training/DayMapList';
import { slotOccurrences } from '../../../clients/schedule';
import { busySlots, slotClash } from '../../../clients/conflicts';
import {
  AppBar,
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  Chip,
  Dialog,
  DialogStrong,
  Empty,
  FieldMsg,
  GroupHead,
  IconBack,
  IconButton,
  IconCopy,
  IconUsers,
  List,
  Radio,
  Row,
  Seg,
  TimeField,
  Toast,
  formatMinute,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'AssignProgram'>;

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A sane default session time; every landed day starts here until nudged. */
const DEFAULT_MINUTE = 7 * 60;
/** The last clean mark before TimeField's 24:00 end-of-day boundary, which is not a clock time the server takes. */
const LAST_MINUTE = 23 * 60 + 45;
/** How many weeks to book when nothing on the client's account counts sessions. */
const FALLBACK_WEEKS = 4;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "17 Aug" — the shape the diary's own booking copy uses. */
function stamp(at?: number): string {
  if (!at) return '';
  const d = new Date(at);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

export default function AssignProgramScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { trainerId } = useAuth();
  const { input } = useTraining();

  const [picked, setPicked] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  /** Minutes from midnight, keyed by weekday. An unpicked weekday keeps its last value so re-picking it is not a reset. */
  const [times, setTimes] = useState<Record<number, number>>({});
  /** Trainer's remap of which plan day lands where. Null means the default order. */
  const [mapPick, setMapPick] = useState<number[] | null>(null);
  /** Sessions the picked client has paid for — the booking bound. Null: no pack counts. */
  const [packLeft, setPackLeft] = useState<number | null>(null);
  /** Full client and program rows, for the busy-hours check — `useTraining`'s
   * projections don't observe schedule columns, so these are watched here. */
  const [clientRows, setClientRows] = useState<ClientModel[]>([]);
  const [programRows, setProgramRows] = useState<ProgramModel[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Set on success. The screen stays up so the confirmation is actually read. */
  const [done, setDone] = useState(false);

  /**
   * The template's day slots: the laid-out days plus any day an exercise
   * already sits on — the same union 3b draws, and the same one the server
   * validates the schedule against.
   */
  const { slots, labels, weeks } = useMemo(() => {
    const template = input.templates.find((t) => t.id === params.templateId);
    if (!template) return { slots: [] as number[], labels: {} as Record<number, string>, weeks: null };
    const blueprint = parseBlueprint(template.structure);
    const laidOut = parseTrainingDays(template.trainingDays, blueprint);
    const used = blueprint
      .map((entry) => entry.day)
      .filter((day): day is number => day != null && day >= 1 && day <= 7);
    return {
      slots: [...new Set([...laidOut, ...used])].sort((a, b) => a - b),
      labels: parseDayLabels(template.dayLabels),
      weeks: template.weeks ?? null,
    };
  }, [input.templates, params.templateId]);

  // Every hour the other clients hold, live, so a schedule that syncs in
  // while this screen is open withdraws its slots too.
  useEffect(() => {
    const sub = combineLatest([
      clientsCollection
        .query()
        .observeWithColumns(['name', 'status', 'weekly_schedule', 'session_duration_minutes']),
      programsCollection.query().observeWithColumns(['status', 'schedule', 'client_id']),
    ]).subscribe(([cls, progs]) => {
      setClientRows(cls);
      setProgramRows(progs);
    });
    return () => sub.unsubscribe();
  }, []);

  const busy = useMemo(
    () => busySlots(clientRows, programRows, picked),
    [clientRows, programRows, picked],
  );

  /** How long the picked client's sessions run — what a landed hour occupies. */
  const duration = useMemo(
    () => clientRows.find((c) => c.id === picked)?.sessionDurationMinutes || 60,
    [clientRows, picked],
  );

  // The picked client's pack bounds the booking. Re-read per pick.
  useEffect(() => {
    setPackLeft(null);
    if (!picked) return undefined;
    let alive = true;
    packSessionsLeft(picked)
      .then((left) => {
        if (alive) setPackLeft(left);
      })
      .catch(() => {
        /* Unreadable is the same answer as no pack: fall back to the program's length. */
      });
    return () => {
      alive = false;
    };
  }, [picked]);

  /** Days land in week order: Day 1 on the earliest weekday picked. */
  const landed = useMemo(() => [...weekdays].sort((a, b) => a - b), [weekdays]);

  /** The nearest free mark to `want` on `weekday` — later first, then earlier.
   * A day someone holds entirely gives `want` back; the clash line names it. */
  const firstFree = (weekday: number, want: number): number => {
    for (let at = want; at <= LAST_MINUTE; at += 15) {
      if (!slotClash(busy, weekday, at, duration)) return at;
    }
    for (let at = want - 15; at >= 0; at -= 15) {
      if (!slotClash(busy, weekday, at, duration)) return at;
    }
    return want;
  };

  // The chips start empty on purpose: a Mon/Wed/Fri pre-pick would be a guess
  // to be corrected, and the whole point of this step is the client's answer.
  const toggleWeekday = (day: number) => {
    // A remap was made against the old set of landed weekdays; it does not
    // survive the week changing under it.
    setMapPick(null);
    if (weekdays.includes(day)) {
      setWeekdays(weekdays.filter((d) => d !== day));
      return;
    }
    // A newly landed day borrows the earliest picked time, because "same
    // slot, most mornings" is the common week and one nudge fixes the rest —
    // pushed to the nearest free hour when another client already has it.
    if (times[day] == null) {
      const earliest = weekdays.length ? times[Math.min(...weekdays)] : null;
      setTimes({ ...times, [day]: firstFree(day, earliest ?? DEFAULT_MINUTE) });
    }
    setWeekdays([...weekdays, day]);
  };

  /** Who is already on a live copy of this template, so the row can say so. */
  const already = useMemo(() => {
    const dead = new Set(['cancelled', 'canceled', 'completed', 'archived']);
    return new Set(
      input.programs
        .filter((p) => p.templateId === params.templateId && !dead.has(p.status.toLowerCase()))
        .map((p) => p.clientId),
    );
  }, [input.programs, params.templateId]);

  const clients = useMemo(
    () => [...input.clients].sort((a, b) => a.name.localeCompare(b.name)),
    [input.clients],
  );

  const countOk = landed.length === slots.length;

  /** Landed days whose hour another client holds — each blocks the copy. */
  const clashes = useMemo(() => {
    const out = new Map<number, ReturnType<typeof slotClash>>();
    for (const weekday of landed) {
      const at = Math.min(times[weekday] ?? DEFAULT_MINUTE, LAST_MINUTE);
      const hit = slotClash(busy, weekday, at, duration);
      if (hit) out.set(weekday, hit);
    }
    return out;
  }, [landed, times, busy, duration]);

  const ready = picked !== null && countOk && clashes.size === 0 && !saving;

  /**
   * Which plan day lands on which weekday — `map[i]` for `landed[i]`. Default:
   * slot i on the i-th weekday. The trainer's remap replaces it only while it
   * is still a permutation of the slots, which the toggle guarantees by
   * clearing it whenever the landed week changes.
   */
  const map = useMemo(() => {
    const valid =
      mapPick !== null &&
      mapPick.length === slots.length &&
      slots.every((d) => mapPick.includes(d));
    return valid ? mapPick : slots;
  }, [mapPick, slots]);

  /**
   * What confirming will book: the landed week, repeated until the client's
   * pack runs out — or the program's own length when nothing on their account
   * counts sessions (a month, for a program with no length).
   */
  const occurrences = useMemo(() => {
    if (!countOk || landed.length === 0) return [];
    const count = packLeft ?? (weeks ?? FALLBACK_WEEKS) * landed.length;
    const week = landed.map((weekday) => ({
      weekday,
      minute: Math.min(times[weekday] ?? DEFAULT_MINUTE, LAST_MINUTE),
    }));
    return slotOccurrences(Date.now(), week, count);
  }, [countOk, landed, times, packLeft, weeks]);

  const client = picked ? clients.find((c) => c.id === picked) ?? null : null;

  const assign = async () => {
    if (!ready || picked === null) return;
    setConfirming(false);
    // `ready` already gates on clashes, but the roster can change between the
    // dialog opening and this tap — the write is what must never double-book.
    for (const weekday of landed) {
      const at = Math.min(times[weekday] ?? DEFAULT_MINUTE, LAST_MINUTE);
      const hit = slotClash(busy, weekday, at, duration);
      if (hit) {
        setNotice(
          `${WEEKDAY_LONG[weekday - 1]} ${formatMinute(at)} just got taken — ${hit.clientName} ` +
            `now trains ${formatMinute(hit.startMinute)} – ${formatMinute(hit.endMinute)}. Pick another time.`,
        );
        return;
      }
    }
    setSaving(true);
    try {
      const schedule: ScheduleEntry[] = landed.map((weekday, i) => ({
        day: map[i],
        weekday,
        time: formatMinute(Math.min(times[weekday] ?? DEFAULT_MINUTE, LAST_MINUTE)),
      }));
      const { id: programId } = await applyTemplate(params.templateId, picked, schedule, params.name);
      // Pull the new program and its exercises down so the client's screens show
      // it without waiting for the next scheduled sync.
      await syncDatabase('assign-program');
      // The landed week, booked as real diary rows. Its own try: the plan is
      // already on the client, and a booking hiccup must not read as the copy
      // failing — the diary books the same week in one tap.
      let booked = 0;
      if (occurrences.length > 0 && trainerId) {
        try {
          // The full row — the roster projection this screen lists carries
          // only id and name, and the booking wants their mode and duration.
          const row = await clientsCollection.find(picked);
          const mode =
            row.deliveryMode === 'floor' || row.deliveryMode === 'remote'
              ? row.deliveryMode
              : undefined;
          await bookSeries(
            {
              trainerId,
              clientId: picked,
              durationMinutes: row.sessionDurationMinutes || 60,
              mode,
              programId,
            },
            occurrences,
          );
          booked = occurrences.length;
        } catch {
          /* The diary books the same week in one tap. */
        }
      }
      const name = client?.name ?? 'them';
      // Deliberately not going back here. Popping the screen unmounts the toast
      // with it, so the trainer taps a button and nothing appears to happen —
      // the confirmation has to outlive the action that earned it.
      setDone(true);
      setNotice(
        booked > 0
          ? `${params.name} copied onto ${name} — ${booked} session${booked === 1 ? '' : 's'} booked.`
          : `${params.name} copied onto ${name}.`,
      );
    } catch (e) {
      // A 400 is the server saying what to fix — the schedule rule, mostly —
      // and its sentence beats a generic one. Anything else is the connection.
      const detail = isAxiosError(e)
        ? (e.response?.data as { detail?: string } | undefined)?.detail
        : null;
      setNotice(detail ?? 'Could not assign it. Copying a program needs a connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Assign this program"
          subtitle={params.name}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {clients.length === 0 ? (
          <Empty
            icon={IconUsers}
            title="No clients yet"
            body="A program needs somebody to be on. Add a client first."
            style={styles.empty}
          />
        ) : (
          <>
            <GroupHead label="Who is it for" count={clients.length} />
            <List>
              {clients.map((client) => (
                <Row
                  key={client.id}
                  grouped
                  leading={<Avatar name={client.name} size="sm" />}
                  title={client.name}
                  subtitle={already.has(client.id) ? 'Already on this program' : undefined}
                  onPress={() => setPicked(client.id)}
                  trailing={<Radio checked={picked === client.id} />}
                />
              ))}
            </List>

            {slots.length > 0 ? (
              <>
                <GroupHead label="Their week" style={styles.section} />
                <Text style={styles.meta}>
                  {`This program trains ${slots.length} day${slots.length === 1 ? '' : 's'} a week. Pick the ${slots.length === 1 ? 'weekday' : `${slots.length} weekdays`} that suit${slots.length === 1 ? 's' : ''} them — Day 1 goes on the earliest.`}
                </Text>
                <Seg>
                  {WEEKDAY_SHORT.map((label, i) => (
                    <Chip
                      key={label}
                      label={label}
                      selected={weekdays.includes(i + 1)}
                      onPress={() => toggleWeekday(i + 1)}
                    />
                  ))}
                </Seg>
                {!countOk ? (
                  <Text style={styles.mismatch}>
                    {landed.length < slots.length
                      ? `${slots.length - landed.length} more to pick — the plan has ${slots.length} day${slots.length === 1 ? '' : 's'} and every one needs a weekday.`
                      : `That is ${landed.length - slots.length} too many — the plan only has ${slots.length} day${slots.length === 1 ? '' : 's'} to place.`}
                  </Text>
                ) : null}

                {landed.map((weekday, i) => {
                  const clash = clashes.get(weekday);
                  return (
                    <View key={weekday}>
                      <TimeField
                        label={`Day ${countOk ? map[i] : slots[i] ?? i + 1} · ${WEEKDAY_LONG[weekday - 1]}`}
                        value={times[weekday] ?? DEFAULT_MINUTE}
                        onChange={(next) => setTimes((t) => ({ ...t, [weekday]: next }))}
                        max={LAST_MINUTE}
                        isBlocked={(minute) => slotClash(busy, weekday, minute, duration) !== null}
                        style={styles.time}
                      />
                      {clash ? (
                        <FieldMsg tone="error">
                          {`Taken — ${clash.clientName} trains ${WEEKDAY_LONG[weekday - 1]}s ${formatMinute(clash.startMinute)} – ${formatMinute(clash.endMinute)}. Nudge to a free hour.`}
                        </FieldMsg>
                      ) : null}
                    </View>
                  );
                })}

                {countOk && slots.length > 1 ? (
                  <>
                    <GroupHead label="Which day lands where" style={styles.section} />
                    <Text style={styles.meta}>
                      {`Day ${slots[0]} goes on the earliest weekday unless you say otherwise. Tap a day to move it — the two days swap.`}
                    </Text>
                    <DayMapList
                      rows={landed.map(
                        (weekday) =>
                          `${WEEKDAY_LONG[weekday - 1]} · ${formatMinute(Math.min(times[weekday] ?? DEFAULT_MINUTE, LAST_MINUTE))}`,
                      )}
                      days={slots}
                      labels={labels}
                      map={map}
                      onChange={setMapPick}
                    />
                  </>
                ) : null}
              </>
            ) : (
              <Callout style={styles.note}>
                This program has no days laid out yet, so there is nothing to schedule — it copies
                as an empty plan.
              </Callout>
            )}

            <Callout icon={IconCopy} style={styles.note}>
              This <CalloutStrong>copies</CalloutStrong> the program onto them, starting today, on
              the weekdays and times picked here
              {occurrences.length > 0 ? (
                <>
                  , and books{' '}
                  <CalloutStrong>
                    {occurrences.length} session{occurrences.length === 1 ? '' : 's'}
                  </CalloutStrong>{' '}
                  on them —{' '}
                  {packLeft !== null ? 'as many as their pack has left' : 'the length of the program'}
                </>
              ) : null}
              . Editing the template afterwards will never change their plan — and assigning it
              again later gives them a second, separate copy.
            </Callout>

            {done ? (
              <Button
                label="Done"
                variant="primary"
                size="lg"
                block
                onPress={() => navigation.goBack()}
                style={styles.action}
              />
            ) : (
              <Button
                label={saving ? 'Copying…' : 'Copy it onto them'}
                variant="primary"
                size="lg"
                block
                loading={saving}
                disabled={!ready}
                onPress={() => setConfirming(true)}
                style={styles.action}
              />
            )}

            <Text style={styles.fine}>
              The copy happens on the server so it is all-or-nothing. This one step needs a
              connection.
            </Text>
          </>
        )}
      </ScrollView>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}

      {/* The read-back before anything is written: the mapping as chosen, and
          what confirming books. */}
      <Dialog
        visible={confirming && ready}
        title={`Put ${client?.name.split(' ')[0] ?? 'them'} on ${params.name}?`}
        confirmLabel={
          occurrences.length > 0
            ? `Book ${occurrences.length} session${occurrences.length === 1 ? '' : 's'}`
            : 'Assign it'
        }
        confirmVariant="primary"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void assign()}
      >
        {landed
          .map((weekday, i) => {
            const at = formatMinute(Math.min(times[weekday] ?? DEFAULT_MINUTE, LAST_MINUTE));
            const label = labels[map[i]];
            return `${WEEKDAY_LONG[weekday - 1]} ${at} — Day ${map[i]}${label ? ` · ${label}` : ''}`;
          })
          .join('\n')}
        {occurrences.length > 0 ? (
          <>
            {'\n\n'}Books{' '}
            <DialogStrong>
              {occurrences.length} session{occurrences.length === 1 ? '' : 's'}
            </DialogStrong>{' '}
            on these slots, the first on {stamp(occurrences[0])}, the last on{' '}
            {stamp(occurrences[occurrences.length - 1])}
            {packLeft !== null ? ' — the day their pack runs out' : ''}. Any one of them can be
            moved or cancelled from the diary.
          </>
        ) : landed.length === 0 ? (
          <>This program has no days laid out — it copies as an empty plan, with nothing to book.</>
        ) : (
          <>
            {'\n\n'}No sessions get booked: their pack has nothing left on it. Sell one and the
            diary books this same week in one tap.
          </>
        )}
      </Dialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  section: { marginTop: space.s5 },
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s3 },
  mismatch: { fontSize: 12.5, lineHeight: 18, color: colors.danger, marginTop: space.s2 },
  time: { marginTop: space.s3 },
  note: { marginTop: space.s4 },
  action: { marginTop: space.s4 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s3 },
  empty: { marginTop: space.s7 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
