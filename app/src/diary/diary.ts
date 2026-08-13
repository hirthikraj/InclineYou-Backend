/**
 * The diary — everything screen 05 shows, derived from local tables.
 *
 * Pure, like `home/deck` and `clients/roster`: `now` and the rows come in as
 * arguments, nothing here reads the database or the clock.
 *
 * The finding this file exists to encode: **every platform in the teardown
 * draws an hour grid, and an hour grid is the wrong shape for this job.** A
 * personal trainer works a split shift — early morning, a dead middle, evening
 * — so two thirds of a 24-hour grid is empty by design, and the one thing worth
 * acting on, the gap, gets drawn as blank space. So the day is an agenda:
 * sessions size to their content, and the empty hours collapse into one bar
 * that says how long the gap is and offers to fill it.
 */

import { readMode, type DeliveryMode } from '../home/mode';
import { DAY_MS, clockParts, startOfDay, startOfWeek } from '../home/time';

/* -------------------------------------------------------------- thresholds */

/**
 * §07: a gap shorter than this is never offered as bookable. You cannot run a
 * 60-minute session in 40 minutes, and offering it teaches people to distrust
 * every slot the app suggests.
 */
export const MIN_BOOKABLE_GAP_MIN = 45;

/** Below this a gap is just the space between two sessions, not lost revenue. */
export const GAP_FOLD_MIN = 60;

/** What a free slot is offered at when nothing else says otherwise. */
export const DEFAULT_SESSION_MIN = 60;

/** How far either side of a session another one counts as a clash. */
const CLASH_GRACE_MIN = 0;

/* ------------------------------------------------------------------- input */

export interface DiaryClient {
  id: string;
  name: string;
  deliveryMode?: string | null;
  metadata?: unknown;
  /** JSON `[{day,time}]` — the client's usual weekly slots, if they have any. */
  weeklySchedule?: string | null;
}
export interface DiarySession {
  id: string;
  clientId: string;
  programId?: string;
  scheduledAt: Date | number;
  durationMinutes?: number;
  status: string;
  dayLabel?: string;
  templateDay?: number;
  deliveryMode?: string | null;
  seriesId?: string | null;
  cancelledBy?: string | null;
  packDelta?: number | null;
  packAppliedAt?: Date | number | null;
  batchId?: string | null;
}
export interface DiaryProgram {
  id: string;
  clientId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status: string;
}
export interface DiaryWorkout {
  id: string;
  clientId: string;
  scheduledSessionId?: string;
}
export interface DiarySetLog {
  id: string;
  workoutSessionId: string;
}
export interface DiaryHours {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}
export interface DiaryBlock {
  id: string;
  startsAt: Date | number;
  endsAt: Date | number;
  allDay: boolean;
  reason?: string | null;
}
export interface DiaryPackage {
  id: string;
  clientId: string;
  sessionsRemaining?: number;
  sessionsTotal?: number;
  status: string;
}

export interface DiaryBatchRecord {
  id: string;
  name: string;
  capacity: number;
  minSize: number;
}

export interface DiaryInput {
  clients: DiaryClient[];
  batches: DiaryBatchRecord[];
  sessions: DiarySession[];
  programs: DiaryProgram[];
  workouts: DiaryWorkout[];
  setLogs: DiarySetLog[];
  hours: DiaryHours[];
  blocks: DiaryBlock[];
  packages: DiaryPackage[];
}

/**
 * Batches are built, tested and **off for the MVP launch** — a roadmap item, not
 * a dropped one.
 *
 * Flipping this to true is the whole switch: the agenda folds attendees into a
 * batch row again, the week collapses them to one pip, and the clash sheet
 * offers "make it a batch". With it false, a session that carries a `batch_id`
 * simply draws as the ordinary one-to-one it already is — which is also exactly
 * what the app does when a batch is deleted, so this is a supported state rather
 * than a hidden one.
 *
 * The table and the column stay: migrations that have run are immutable, and the
 * schema contract here is additive-only. An empty table costs nothing.
 */
export const BATCHES_ENABLED = false;

/* ------------------------------------------------------------------ output */

export type SessionState = 'scheduled' | 'done' | 'no_show' | 'cancelled';

export interface DiaryItem {
  id: string;
  clientId: string;
  clientName: string;
  programId?: string;
  templateDay?: number;
  at: number;
  endsAt: number;
  time: string;
  meridiem: string;
  durationMinutes: number;
  /** "Push A · Week 5 of 8", or what happened to it once it is in the past. */
  detail: string;
  mode: DeliveryMode;
  state: SessionState;
  /** Live now — the row the agenda scrolls to. */
  running: boolean;
  /** Past, still `scheduled`: a pack that hasn't moved. A money problem. */
  open: boolean;
  /** Overlaps another live session on the same day. */
  clash: boolean;
  /** Its outcome can still be reversed. */
  undoable: boolean;
  seriesId?: string | null;
  /** Set when this attendee is part of a batch. The agenda draws the batch, not them. */
  batchId?: string | null;
}

/**
 * 3d · a batch, as one row.
 *
 * Not a session — a *view* of every attendee's session at one slot. The
 * individual rows still exist underneath and still own their own pack, outcome
 * and undo; this is what the agenda draws instead of four rows that say the
 * same time.
 */
export interface DiaryBatch {
  /** Batch id and slot: the same batch can legitimately run twice in a day. */
  id: string;
  batchId: string;
  name: string;
  at: number;
  endsAt: number;
  time: string;
  meridiem: string;
  /** "Full Body A · 60 min", or "2 booked · 3 days out" when it is under-filled. */
  detail: string;
  /** Each attendee, with their own session — that is where their outcome lives. */
  people: { id: string; name: string; sessionId: string; state: SessionState }[];
  booked: number;
  capacity: number;
  minSize: number;
  /**
   * How far below the minimum, when there is still time to fill it.
   *
   * Null once the batch is full enough, and null once it has started — telling
   * a trainer a running batch is two short is a complaint, not information.
   */
  shortBy: number | null;
  /** Every attendee's session id, for marking the whole batch done. */
  sessionIds: string[];
  running: boolean;
  /** Every attendee is closed off. */
  settled: boolean;
}

export interface DiaryGap {
  id: string;
  from: number;
  to: number;
  minutes: number;
  /** Whole hours, rounded down — "6h free". */
  label: string;
  /** Bookable slots inside it, once the trainer opens it. */
  slots: DiarySlot[];
  /** Clients who usually train in this window and have nothing booked this week. */
  idle: { id: string; name: string }[];
}

export interface DiarySlot {
  id: string;
  at: number;
  minutes: number;
}

export interface DiaryDay {
  /** Start of the day, local. */
  at: number;
  weekday: number;
  items: DiaryItem[];
  /** One row per batch-slot. Their attendees are in `items` too, flagged. */
  batches: DiaryBatch[];
  gaps: DiaryGap[];
  blocks: DiaryBlock[];
  /** Sessions that have started but were never closed off. */
  openCount: number;
  /** Minutes of bookable dead time. */
  freeMinutes: number;
  /** Working hours cover none of this day. */
  closed: boolean;
  /** Sun · 9 Aug · 6 sessions */
  subtitle: string;
}

export interface StripDay {
  at: number;
  weekday: number;
  label: string;
  date: number;
  today: boolean;
  past: boolean;
  /** 0–3 filled pips; a closed day shows three hollow ones. */
  load: number;
  closed: boolean;
}

export interface WeekPip {
  sessionId: string;
  at: number;
  time: string;
  name: string;
  mode: DeliveryMode;
  state: SessionState;
  /** Part of a batch — the week shows the group, not each attendee. */
  batchId?: string | null;
}

export interface WeekColumn {
  at: number;
  label: string;
  date: number;
  today: boolean;
  closed: boolean;
  pips: WeekPip[];
}

export interface DiaryWeek {
  from: number;
  to: number;
  columns: WeekColumn[];
  booked: number;
  done: number;
  freeMinutes: number;
  /** 3 – 9 Aug · 24 sessions */
  subtitle: string;
}

export interface MonthCell {
  at: number;
  date: number;
  today: boolean;
  inMonth: boolean;
  /** One dot per two sessions, capped at three. */
  dots: number;
  full: boolean;
}

export interface DiaryMonth {
  at: number;
  cells: MonthCell[];
  total: number;
  /** August 2026 · 84 sessions */
  subtitle: string;
}

/* ------------------------------------------------------------------- rules */

const ms = (v: Date | number | undefined | null): number =>
  v === null || v === undefined ? 0 : v instanceof Date ? v.getTime() : Number(v);

const lower = (v: string | undefined | null): string => (v ?? '').toLowerCase();

const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** ISO weekday: 0 = Monday, so it matches the strip and `working_hours`. */
export function isoWeekday(at: number): number {
  return (new Date(at).getDay() + 6) % 7;
}

/**
 * 24-hour, always.
 *
 * The gap bar and the now line state a *position in time*, not an appointment,
 * and both have to be unambiguous on their own: 12-hour without a meridiem
 * renders the evening window 17:00–21:00 as "05:00 – 09:00", which is the
 * morning. Session rows keep the 12-hour gutter, because there the meridiem
 * sits underneath the time.
 */
export function hhmm(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function minuteOfDay(at: number): number {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

function atMinute(dayStart: number, minute: number): number {
  const d = new Date(dayStart);
  d.setHours(0, minute, 0, 0);
  return d.getTime();
}

function readState(status: string): SessionState {
  const value = lower(status);
  if (value === 'done' || value === 'completed') return 'done';
  if (value === 'no_show' || value === 'noshow') return 'no_show';
  if (value === 'cancelled' || value === 'canceled') return 'cancelled';
  return 'scheduled';
}

function parseDay(value?: string): number | null {
  if (!value) return null;
  const t = Date.parse(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(t) ? null : t;
}

/** "Push A · Week 5 of 8" — only when the program carries real dates. */
function programLine(program: DiaryProgram | undefined, at: number): string | null {
  if (!program) return null;
  const label = program.name?.trim();
  if (!label) return null;

  const start = parseDay(program.startDate);
  const end = parseDay(program.endDate);
  if (start === null) return label;

  const week = Math.floor((startOfDay(at) - startOfDay(start)) / (7 * DAY_MS)) + 1;
  if (week < 1) return label;
  if (end === null) return `${label} · Week ${week}`;

  const total = Math.max(1, Math.ceil((startOfDay(end) - startOfDay(start)) / (7 * DAY_MS)));
  return `${label} · Week ${Math.min(week, total)} of ${total}`;
}

/**
 * A weekday's windows, merged.
 *
 * Two windows that overlap are one window. Without this an accidental
 * duplicate — the same hours saved twice, or a hand-entered set colliding with
 * an imported one — produces two identical gaps in the agenda, two identical
 * React keys, and a day that claims twice the free time it has.
 */
/** Minutes from midnight, start and end. The shape both hour screens share. */
export interface TimeWindow {
  startMinute: number;
  endMinute: number;
}

/**
 * Overlapping or duplicate windows, collapsed into one each.
 *
 * Exported because two screens need the same answer: the diary subtracts these
 * to find gaps, and the working-hours screen draws one pill per window. If they
 * disagreed, a day could show two pills and one gap.
 *
 * Takes anything with the four fields — model instances included — and always
 * returns plain, safely mutable objects.
 */
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = windows
    .filter((w) => w.endMinute > w.startMinute)
    .map((w) => ({ startMinute: w.startMinute, endMinute: w.endMinute }))
    .sort((a, b) => a.startMinute - b.startMinute);

  const out: TimeWindow[] = [];
  for (const window of sorted) {
    const last = out[out.length - 1];
    if (last && window.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, window.endMinute);
    } else {
      out.push(window);
    }
  }
  return out;
}

function hoursFor(hours: DiaryHours[], weekday: number): DiaryHours[] {
  const sorted = hours
    .filter((h) => h.weekday === weekday && h.endMinute > h.startMinute)
    // Read the four fields out by name, deliberately.
    //
    // The rows arriving here are WatermelonDB Model instances, and a model's
    // columns are getters on its PROTOTYPE, installed by the @field decorator.
    // Object spread copies own enumerable properties only — so `{ ...row }`
    // yields an object carrying the model's internals and none of its data,
    // and every field reads back undefined.
    //
    // That failed silently. The filter and sort above still worked, because
    // they read the model itself; only the copies were hollow. So the day
    // looked open and the windows looked present, while `atMinute` was handed
    // undefined and returned NaN — and since every comparison against NaN is
    // false, the gap loop ran to the end and found nothing.
    //
    // Naming the fields also makes a copy a real copy: the merge below mutates
    // `endMinute`, and that must never reach the database row.
    .map((h) => ({
      id: h.id,
      weekday: h.weekday,
      startMinute: h.startMinute,
      endMinute: h.endMinute,
    }))
    .sort((a, b) => a.startMinute - b.startMinute);

  const out: DiaryHours[] = [];
  for (const window of sorted) {
    const last = out[out.length - 1];
    if (last && window.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, window.endMinute);
    } else {
      out.push(window);
    }
  }
  return out;
}

function blocksOn(blocks: DiaryBlock[], dayStart: number): DiaryBlock[] {
  const dayEnd = dayStart + DAY_MS;
  return blocks.filter((b) => ms(b.startsAt) < dayEnd && ms(b.endsAt) > dayStart);
}

/**
 * The client's usual slots, from `weekly_schedule`.
 *
 * Stored as `[{day,time}]` by the weekly slot picker. Parsed defensively — a
 * malformed preference should cost a suggestion, never a screen.
 */
function usualSlots(client: DiaryClient): { day: number; minute: number }[] {
  if (!client.weeklySchedule) return [];
  try {
    const raw = JSON.parse(client.weeklySchedule) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const { weekday, day, time } = entry as {
        weekday?: unknown;
        day?: unknown;
        time?: unknown;
      };
      if (typeof time !== 'string') return [];

      // The weekly slot picker writes `{ templateDay, weekday, time }` with
      // weekday 1 = Monday. This file counts from 0 = Monday, like the day
      // strip and `working_hours`, so the two have to be reconciled here — and
      // `day` is accepted as a 0-based alias so a differently-written row still
      // resolves rather than silently never matching.
      const iso =
        typeof weekday === 'number' ? weekday - 1 : typeof day === 'number' ? day : null;
      if (iso === null || iso < 0 || iso > 6) return [];

      const [h, m] = time.split(':').map((n) => Number.parseInt(n, 10));
      if (Number.isNaN(h)) return [];
      return [{ day: iso, minute: h * 60 + (Number.isNaN(m) ? 0 : m) }];
    });
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------- day */

export function buildDay(input: DiaryInput, dayStart: number, now: number): DiaryDay {
  const dayEnd = dayStart + DAY_MS;
  const weekday = isoWeekday(dayStart);

  const byClient = new Map(input.clients.map((c) => [c.id, c]));
  const programs = new Map<string, DiaryProgram>();
  for (const p of input.programs) {
    if (!DEAD_PROGRAM.has(lower(p.status))) programs.set(p.id, p);
  }

  const setCountByWorkout = new Map<string, number>();
  for (const log of input.setLogs) {
    setCountByWorkout.set(
      log.workoutSessionId,
      (setCountByWorkout.get(log.workoutSessionId) ?? 0) + 1,
    );
  }
  const workoutBySession = new Map<string, DiaryWorkout>();
  for (const w of input.workouts) {
    if (w.scheduledSessionId) workoutBySession.set(w.scheduledSessionId, w);
  }

  const onDay = input.sessions
    .filter((s) => {
      const at = ms(s.scheduledAt);
      return at >= dayStart && at < dayEnd;
    })
    .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt));

  const items: DiaryItem[] = onDay.map((session) => {
    const at = ms(session.scheduledAt);
    const minutes = session.durationMinutes || DEFAULT_SESSION_MIN;
    const endsAt = at + minutes * 60_000;
    const state = readState(session.status);
    const client = byClient.get(session.clientId);
    const { time, meridiem } = clockParts(at);

    const workout = workoutBySession.get(session.id);
    const sets = workout ? (setCountByWorkout.get(workout.id) ?? 0) : 0;

    // What the line says depends on what already happened to it. A past day is
    // a record, not a plan.
    let detail: string;
    if (state === 'done') {
      detail = sets > 0 ? `${programLabel(session, programs)} · logged ${sets} sets` : programLabel(session, programs);
    } else if (state === 'no_show') {
      detail = (session.packDelta ?? 0) < 0 ? 'Marked no-show · pack −1' : 'Marked no-show';
    } else if (state === 'cancelled') {
      detail = session.cancelledBy === 'trainer' ? 'Cancelled by you' : 'Cancelled';
    } else if (at < now) {
      detail = `${programLabel(session, programs)} · not closed off`;
    } else {
      detail = programLine(session.programId ? programs.get(session.programId) : undefined, at)
        ?? session.dayLabel?.trim()
        ?? 'Session';
    }

    const applied = session.packAppliedAt ? ms(session.packAppliedAt) : null;

    return {
      id: session.id,
      clientId: session.clientId,
      clientName: client?.name?.trim() || 'Client',
      programId: session.programId,
      templateDay: session.templateDay,
      at,
      endsAt,
      time,
      meridiem,
      durationMinutes: minutes,
      detail,
      mode: readMode({
        session: session.deliveryMode,
        client: client?.deliveryMode,
        metadata: client?.metadata,
      }),
      state,
      running: state === 'scheduled' && now >= at && now < endsAt,
      open: state === 'scheduled' && endsAt < now,
      clash: false,
      undoable:
        state !== 'scheduled' && (applied === null || now - applied <= 24 * 60 * 60 * 1000),
      seriesId: session.seriesId,
      // Gated here, not just at the grouping: the agenda skips any item that
      // belongs to a batch, so leaving this set while grouping is off would
      // make four real sessions disappear instead of drawing individually.
      batchId: BATCHES_ENABLED ? (session.batchId ?? null) : null,
    };
  });

  // Clash marking: any two live sessions whose spans overlap. Marked, never
  // prevented — two clients on one floor at once is a normal Indian gym hour.
  const live = items.filter((i) => i.state !== 'cancelled');
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      // Two people in the same batch are not a clash — they are the batch. The
      // warning exists for a floor double-booked by accident, and firing it on
      // every attendee of a group would make the one signal worthless.
      if (live[i].batchId && live[i].batchId === live[j].batchId) continue;
      if (live[i].endsAt - CLASH_GRACE_MIN * 60_000 > live[j].at) {
        live[i].clash = true;
        live[j].clash = true;
      }
    }
  }

  const windows = hoursFor(input.hours, weekday);
  const dayBlocks = blocksOn(input.blocks, dayStart);
  const gaps = findGaps(windows, dayBlocks, live, dayStart, now, input, weekday);

  const batches = groupBatches(items, input, now);

  const bookedCount = live.filter((i) => i.state !== 'cancelled').length;
  const freeMinutes = gaps.reduce((sum, g) => sum + g.minutes, 0);
  const openCount = items.filter((i) => i.open).length;

  return {
    at: dayStart,
    weekday,
    items,
    batches,
    gaps,
    blocks: dayBlocks,
    openCount,
    freeMinutes,
    closed: windows.length === 0,
    subtitle: daySubtitle(dayStart, bookedCount, openCount, freeMinutes),
  };
}


/**
 * Folds every attendee of a batch into one agenda row.
 *
 * Keyed on batch **and slot**, because the same batch legitimately runs twice in
 * a day — the six o'clock barbell group and the evening one are the same batch
 * with the same capacity, and merging them would draw a row that claims sixteen
 * people were in the room at once.
 *
 * A cancelled attendee is not in the count. They gave the slot back, and a batch
 * that says 8/10 with two cancellations in it is lying about what the floor
 * holds tonight.
 */
function groupBatches(items: DiaryItem[], input: DiaryInput, now: number): DiaryBatch[] {
  if (!BATCHES_ENABLED) return [];

  const byBatch = new Map<string, DiaryItem[]>();
  for (const item of items) {
    if (!item.batchId) continue;
    const key = `${item.batchId}@${item.at}`;
    const list = byBatch.get(key);
    if (list) list.push(item);
    else byBatch.set(key, [item]);
  }

  const records = new Map(input.batches.map((b) => [b.id, b]));
  const rows: DiaryBatch[] = [];

  for (const [key, group] of byBatch) {
    const first = group[0];
    const record = first.batchId ? records.get(first.batchId) : undefined;
    // A batch row whose own record hasn't synced yet still draws — the sessions
    // are what the trainer booked, and waiting on the name would blank the slot.
    const capacity = record?.capacity ?? Math.max(group.length, 10);
    const minSize = record?.minSize ?? 0;

    const attending = group.filter((i) => i.state !== 'cancelled');
    const booked = attending.length;
    const started = now >= first.at;
    const shortBy = !started && minSize > 0 && booked < minSize ? minSize - booked : null;

    rows.push({
      id: key,
      batchId: first.batchId as string,
      name: record?.name?.trim() || 'Batch',
      at: first.at,
      endsAt: first.endsAt,
      time: first.time,
      meridiem: first.meridiem,
      detail:
        shortBy !== null
          ? `${booked} booked · ${daysOut(first.at, now)}`
          : `${batchPlan(group)} · ${first.durationMinutes} min`,
      people: attending.map((i) => ({
        id: i.clientId,
        name: i.clientName,
        sessionId: i.id,
        state: i.state,
      })),
      booked,
      capacity,
      minSize,
      shortBy,
      sessionIds: group.map((i) => i.id),
      running: attending.some((i) => i.running),
      settled: attending.length > 0 && attending.every((i) => i.state !== 'scheduled'),
    });
  }

  return rows.sort((a, b) => a.at - b.at);
}

/** The plan they are all on, when they share one. Otherwise the batch's own name carries it. */
function batchPlan(group: DiaryItem[]): string {
  const labels = new Set(group.map((i) => i.detail.split(' · ')[0]).filter(Boolean));
  return labels.size === 1 ? [...labels][0] : `${group.length} on the floor`;
}

/** "3 days out", "tomorrow", "today" — how long is left to fill it. */
function daysOut(at: number, now: number): string {
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `${days} days out`;
}

function programLabel(session: DiarySession, programs: Map<string, DiaryProgram>): string {
  const program = session.programId ? programs.get(session.programId) : undefined;
  return session.dayLabel?.trim() || program?.name?.trim() || 'Session';
}

function daySubtitle(dayStart: number, booked: number, open: number, freeMinutes: number): string {
  const d = new Date(dayStart);
  const stamp = `${DAY_SHORT[isoWeekday(dayStart)]} · ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  if (open > 0) return `${stamp} · ${open} to close off`;
  if (booked === 0) return `${stamp} · nothing booked`;
  const free = freeMinutes >= 60 ? ` · ${Math.floor(freeMinutes / 60)}h free` : '';
  return `${stamp} · ${booked} session${booked === 1 ? '' : 's'}${free}`;
}

/**
 * The dead middle, found by subtraction.
 *
 * Working hours minus blocks minus booked sessions. Only the leftovers long
 * enough to sell are returned: §07 puts the floor at 45 minutes, because a gap
 * you cannot run a session in is not an opportunity, and offering it teaches
 * people to distrust the slots.
 */
function findGaps(
  windows: DiaryHours[],
  blocks: DiaryBlock[],
  items: DiaryItem[],
  dayStart: number,
  now: number,
  input: DiaryInput,
  weekday: number,
): DiaryGap[] {
  if (windows.length === 0) return [];

  const busy: { from: number; to: number }[] = [
    ...items
      .filter((i) => i.state === 'scheduled' || i.state === 'done')
      .map((i) => ({ from: i.at, to: i.endsAt })),
    ...blocks.map((b) => ({ from: ms(b.startsAt), to: ms(b.endsAt) })),
  ].sort((a, b) => a.from - b.from);

  const out: DiaryGap[] = [];

  for (const window of windows) {
    let cursor = atMinute(dayStart, window.startMinute);
    const close = atMinute(dayStart, window.endMinute);

    for (const span of busy) {
      if (span.to <= cursor) continue;
      if (span.from >= close) break;
      if (span.from > cursor) push(cursor, Math.min(span.from, close));
      cursor = Math.max(cursor, span.to);
    }
    if (cursor < close) push(cursor, close);
  }

  function push(from: number, to: number) {
    const minutes = Math.round((to - from) / 60_000);
    if (minutes < GAP_FOLD_MIN) return;
    out.push({
      id: `gap_${from}`,
      from,
      to,
      minutes,
      label: gapLabel(minutes),
      slots: sliceSlots(from, to, now),
      idle: idleClients(input, weekday, from, to, now),
    });
  }

  return out;
}

function gapLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** A gap, cut into offerable slots. Anything left under the floor is dropped. */
function sliceSlots(from: number, to: number, now: number): DiarySlot[] {
  const out: DiarySlot[] = [];
  let cursor = from;
  while (to - cursor >= MIN_BOOKABLE_GAP_MIN * 60_000) {
    const remaining = Math.round((to - cursor) / 60_000);
    const minutes = remaining >= DEFAULT_SESSION_MIN ? DEFAULT_SESSION_MIN : remaining;
    // A slot that has already passed is not bookable, it is history.
    if (cursor + minutes * 60_000 > now) out.push({ id: `slot_${cursor}`, at: cursor, minutes });
    cursor += minutes * 60_000;
  }
  return out;
}

/**
 * "Sneha Rao and 3 others usually train around now and have nothing booked."
 *
 * The sentence that makes the gap bar worth its pixels. A client qualifies when
 * one of their usual weekly slots falls inside this gap and they have no live
 * session anywhere in the current week.
 */
function idleClients(
  input: DiaryInput,
  weekday: number,
  from: number,
  to: number,
  now: number,
): { id: string; name: string }[] {
  const weekFrom = startOfWeek(from);
  const weekTo = weekFrom + 7 * DAY_MS;

  const bookedThisWeek = new Set(
    input.sessions
      .filter((s) => {
        const at = ms(s.scheduledAt);
        return at >= weekFrom && at < weekTo && readState(s.status) !== 'cancelled';
      })
      .map((s) => s.clientId),
  );

  const fromMinute = minuteOfDay(from);
  const toMinute = fromMinute + Math.round((to - from) / 60_000);

  return input.clients
    .filter((c) => !bookedThisWeek.has(c.id))
    .filter((c) =>
      usualSlots(c).some((slot) => slot.day === weekday && slot.minute >= fromMinute && slot.minute < toMinute),
    )
    .map((c) => ({ id: c.id, name: c.name.trim() || 'Client' }));
}

/* ------------------------------------------------------------------- strip */

export function buildStrip(input: DiaryInput, anchor: number, now: number): StripDay[] {
  const weekStart = startOfWeek(anchor);
  const today = startOfDay(now);

  return Array.from({ length: 7 }, (_, i) => {
    const at = weekStart + i * DAY_MS;
    const weekday = isoWeekday(at);
    const count = input.sessions.filter((s) => {
      const t = ms(s.scheduledAt);
      return t >= at && t < at + DAY_MS && readState(s.status) !== 'cancelled';
    }).length;

    return {
      at,
      weekday,
      label: DAY_SHORT[weekday],
      date: new Date(at).getDate(),
      today: at === today,
      past: at < today,
      // Three pips, and the third means "three or more" — the strip answers
      // "how heavy" at a glance, not "exactly how many".
      load: Math.min(3, count),
      closed: hoursFor(input.hours, weekday).length === 0,
    };
  });
}

/* -------------------------------------------------------------------- week */

export function buildWeek(input: DiaryInput, anchor: number, now: number): DiaryWeek {
  const from = startOfWeek(anchor);
  const to = from + 7 * DAY_MS;
  const today = startOfDay(now);
  const byClient = new Map(input.clients.map((c) => [c.id, c]));

  const columns: WeekColumn[] = Array.from({ length: 7 }, (_, i) => {
    const at = from + i * DAY_MS;
    const weekday = isoWeekday(at);

    const onDay = input.sessions
      .filter((s) => {
        const t = ms(s.scheduledAt);
        return t >= at && t < at + DAY_MS && readState(s.status) !== 'cancelled';
      })
      .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt));

    // A batch is one pip, named by its size. Eight attendees drawn as eight pips
    // would make a Saturday morning batch look like the busiest day of the week,
    // which is the opposite of what a week view is for — shape and load.
    const seenBatch = new Set<string>();
    const pips = onDay
      .filter((s) => {
        const key = BATCHES_ENABLED && s.batchId ? `${s.batchId}@${ms(s.scheduledAt)}` : null;
        if (!key) return true;
        if (seenBatch.has(key)) return false;
        seenBatch.add(key);
        return true;
      })
      .map((s) => {
        const client = byClient.get(s.clientId);
        const t = ms(s.scheduledAt);
        const d = new Date(t);
        return {
          sessionId: s.id,
          at: t,
          // 24-hour on the pip: it is 50px wide and "06:00" fits where
          // "6:00 AM" does not.
          time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
          name:
            BATCHES_ENABLED && s.batchId
              ? `Batch ${onDay.filter((o) => o.batchId === s.batchId && ms(o.scheduledAt) === t).length}`
              : (client?.name?.trim() || 'Client').split(/\s+/)[0],
          mode: readMode({
            session: s.deliveryMode,
            client: client?.deliveryMode,
            metadata: client?.metadata,
          }),
          state: readState(s.status),
          batchId: BATCHES_ENABLED ? (s.batchId ?? null) : null,
        };
      });

    return {
      at,
      label: DAY_SHORT[weekday],
      date: new Date(at).getDate(),
      today: at === today,
      closed: hoursFor(input.hours, weekday).length === 0,
      pips,
    };
  });

  const booked = columns.reduce((sum, c) => sum + c.pips.length, 0);
  const done = columns.reduce((sum, c) => sum + c.pips.filter((p) => p.state === 'done').length, 0);
  const freeMinutes = Array.from({ length: 7 }, (_, i) =>
    buildDay(input, from + i * DAY_MS, now).freeMinutes,
  ).reduce((a, b) => a + b, 0);

  const a = new Date(from);
  const b = new Date(to - DAY_MS);
  const span =
    a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MONTH_SHORT[b.getMonth()]}`
      : `${a.getDate()} ${MONTH_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTH_SHORT[b.getMonth()]}`;

  return {
    from,
    to,
    columns,
    booked,
    done,
    freeMinutes,
    subtitle: `${span} · ${booked} session${booked === 1 ? '' : 's'}`,
  };
}

/* ------------------------------------------------------------------- month */

/** §07: month cells carry dots, never names. A 46px cell cannot hold a name. */
export const SESSIONS_PER_DOT = 2;
/** At or above this a day is full, and the cell says so in warn ink. */
export const FULL_DAY_SESSIONS = 6;

export function buildMonth(input: DiaryInput, anchor: number, now: number): DiaryMonth {
  const first = new Date(anchor);
  first.setDate(1);
  first.setHours(0, 0, 0, 0);
  const monthStart = first.getTime();
  const monthIndex = first.getMonth();

  const gridStart = startOfWeek(monthStart);
  const today = startOfDay(now);

  const countOn = (at: number) =>
    input.sessions.filter((s) => {
      const t = ms(s.scheduledAt);
      return t >= at && t < at + DAY_MS && readState(s.status) !== 'cancelled';
    }).length;

  // Six rows always: a month that renders five rows one month and six the next
  // makes the grid jump under the thumb.
  const cells: MonthCell[] = Array.from({ length: 42 }, (_, i) => {
    const at = gridStart + i * DAY_MS;
    const d = new Date(at);
    const count = countOn(at);
    return {
      at,
      date: d.getDate(),
      today: at === today,
      inMonth: d.getMonth() === monthIndex,
      dots: Math.min(3, Math.floor(count / SESSIONS_PER_DOT) + (count % SESSIONS_PER_DOT > 0 ? 1 : 0)),
      full: count >= FULL_DAY_SESSIONS,
    };
  });

  const total = cells.filter((c) => c.inMonth).reduce((sum, c) => sum + countOn(c.at), 0);

  return {
    at: monthStart,
    cells,
    total,
    subtitle: `${MONTH_LONG[monthIndex]} ${first.getFullYear()} · ${total} session${total === 1 ? '' : 's'}`,
  };
}

/* -------------------------------------------------------------------- move */

export interface MoveSuggestion {
  at: number;
  time: string;
  meridiem: string;
  /** "Today" · "Monday 10 Aug" */
  dayLabel: string;
  /** "1 hour later · floor free" */
  why: string;
}

/**
 * Three ranked slots before the date picker.
 *
 * Ranked by *when that client usually trains*, because a picker is what you
 * show when you have nothing intelligent to say. Their own weekly slots first,
 * then the nearest free time today, then the same time tomorrow.
 */
export function suggestMoves(
  input: DiaryInput,
  session: DiarySession,
  now: number,
  limit = 3,
): MoveSuggestion[] {
  const client = input.clients.find((c) => c.id === session.clientId);
  if (!client) return [];

  const from = ms(session.scheduledAt);
  const minutes = session.durationMinutes || DEFAULT_SESSION_MIN;
  const today = startOfDay(now);
  const out: MoveSuggestion[] = [];
  const seen = new Set<number>();

  const add = (at: number, why: string) => {
    if (at <= now || seen.has(at) || out.length >= limit) return;
    seen.add(at);
    const { time, meridiem } = clockParts(at);
    out.push({ at, time, meridiem, dayLabel: dayName(at, today), why });
  };

  // 1 — the rest of today, in their own free slots.
  const todayGaps = buildDay(input, today, now).gaps;
  for (const gap of todayGaps) {
    for (const slot of gap.slots) {
      if (slot.at > from && slot.minutes >= minutes) {
        const later = Math.round((slot.at - from) / 3_600_000);
        add(slot.at, later >= 1 ? `${later} hour${later === 1 ? '' : 's'} later · floor free` : 'Later today · floor free');
      }
    }
  }

  // 2 — their usual slots over the next week.
  for (let i = 1; i <= 7 && out.length < limit; i += 1) {
    const day = today + i * DAY_MS;
    const weekday = isoWeekday(day);
    for (const slot of usualSlots(client)) {
      if (slot.day !== weekday) continue;
      add(atMinute(day, slot.minute), `Their usual ${DAY_SHORT[weekday]} slot`);
    }
  }

  // 3 — free slots over the next few days, so there is always something.
  for (let i = 1; i <= 7 && out.length < limit; i += 1) {
    const day = today + i * DAY_MS;
    for (const gap of buildDay(input, day, now).gaps) {
      for (const slot of gap.slots) {
        if (slot.minutes >= minutes) add(slot.at, 'Floor free');
      }
    }
  }

  return out;
}

function dayName(at: number, today: number): string {
  const day = startOfDay(at);
  if (day === today) return 'Today';
  if (day === today + DAY_MS) return 'Tomorrow';
  const d = new Date(at);
  return `${DAY_SHORT[isoWeekday(at)]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/* ------------------------------------------------------------------ clash */

export interface Clash {
  session: DiaryItem;
}

/** Who is already on the floor at this time. Warns; never blocks. */
export function findClash(input: DiaryInput, at: number, minutes: number, now: number): DiaryItem | null {
  const day = buildDay(input, startOfDay(at), now);
  const endsAt = at + minutes * 60_000;
  return (
    day.items.find(
      (i) => i.state !== 'cancelled' && i.at < endsAt && i.endsAt > at,
    ) ?? null
  );
}

/* --------------------------------------------------------------- recurrence */

/**
 * The dates a weekly repeat would land on, bounded by the pack.
 *
 * "Until the pack runs out" is the default and it resolves to a real date on
 * screen. PTminder and Trainerize both let a trainer book a client into
 * sessions they have not paid for; that is a billing argument waiting to
 * happen, so the count comes from `sessions_remaining` and stops there.
 */
export function occurrencesFor(
  from: number,
  weekdays: number[],
  count: number,
  limitWeeks = 26,
): number[] {
  if (count <= 0 || weekdays.length === 0) return [];
  const out: number[] = [];
  const minute = minuteOfDay(from);

  for (let week = 0; week < limitWeeks && out.length < count; week += 1) {
    const weekBase = startOfWeek(from) + week * 7 * DAY_MS;
    for (const day of [...weekdays].sort((a, b) => a - b)) {
      if (out.length >= count) break;
      const at = atMinute(weekBase + day * DAY_MS, minute);
      if (at > from) out.push(at);
    }
  }
  return out;
}

/** How many sessions the client has actually paid for. */
export function packRemaining(input: DiaryInput, clientId: string): number | null {
  const live = input.packages.filter(
    (p) => p.clientId === clientId && lower(p.status) === 'active',
  );
  const counts = live
    .map((p) => p.sessionsRemaining)
    .filter((n): n is number => typeof n === 'number');
  return counts.length > 0 ? Math.max(0, Math.max(...counts)) : null;
}

/** Sessions inside a span that would be disrupted by blocking it out (5b). */
export function sessionsInRange(input: DiaryInput, from: number, to: number): DiarySession[] {
  return input.sessions
    .filter((s) => {
      const at = ms(s.scheduledAt);
      return at >= from && at < to && readState(s.status) === 'scheduled';
    })
    .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt));
}

/** How many of the last 28 days had a session on them (the 1c rest-day fact). */
export function daysWorkedRecently(input: DiaryInput, now: number, window = 28): number {
  const from = startOfDay(now) - (window - 1) * DAY_MS;
  const days = new Set<number>();
  for (const s of input.sessions) {
    const at = ms(s.scheduledAt);
    if (at < from || at > now) continue;
    if (readState(s.status) === 'cancelled') continue;
    days.add(startOfDay(at));
  }
  return days.size;
}
