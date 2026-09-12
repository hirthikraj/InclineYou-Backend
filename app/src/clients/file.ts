/**
 * The client file — four tabs, computed from what is already on the phone.
 *
 * `agent/design system/screens/inclineyou-clients.html` § 09–11, frames 6a–8b.
 *
 * Two rules from § 14 decide the shape of everything here:
 *
 *   · **the file paints from local storage, all four tabs, before any network
 *     call.** So this module is pure functions over rows the caller has already
 *     subscribed to — nothing in it can await, and there is no loading state to
 *     design around;
 *   · **every figure on the overview links to the screen that owns it.** Each
 *     one therefore carries its destination as data rather than leaving the
 *     screen to guess, which is also what guarantees one source per figure: the
 *     owed pair below is literally `outstanding()`, the same function the money
 *     book bills from.
 *
 * The one thing this file deliberately does not do is recompute money. Owed,
 * the gym's cut and the ledger all come from `money/money.ts`, because the
 * Package tab and Farhan's book are the same numbers one screen apart and the
 * fastest way to make two screens disagree is to give them two calculators.
 */

import type { StreakDay } from '../design';
import { DAY_MS, dayStamp, relativePast, rupees, startOfDay } from '../home/time';
import { readMode, type DeliveryMode } from '../home/mode';
import {
  ms,
  outstanding,
  projectedCut,
  type GymProfile,
  type MoneyPackage,
  type MoneyPayment,
} from '../money/money';

/* ------------------------------------------------------------------- input */

export interface FileClient {
  id: string;
  name: string;
  phone?: string | null;
  status: string;
  /** The client's own consent, from the server. See `Client.membershipStatus`. */
  membershipStatus?: string | null;
  deliveryMode?: string | null;
  paymentMode?: string | null;
  trainerSplitPercent?: number | null;
  metadata?: unknown;
  createdAt: Date | number;
}

export interface FileProgram {
  id: string;
  clientId: string;
  name: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: Date | number;
}

export interface FileSession {
  id: string;
  clientId: string;
  scheduledAt: Date | number;
  durationMinutes?: number | null;
  status: string;
  dayLabel?: string | null;
  deliveryMode?: string | null;
  cancelledBy?: string | null;
  packDelta?: number | null;
  packAppliedAt?: Date | null;
}

export interface FileWorkout {
  id: string;
  clientId: string;
  scheduledSessionId?: string | null;
  sessionDate: string;
  endedAt?: Date | null;
  createdAt: Date | number;
}

export interface FileSetLog {
  workoutSessionId: string;
}

export interface FileMetric {
  id: string;
  clientId: string;
  metricType: string;
  value: number;
  unit: string;
  recordedAt: Date | number;
}

export interface FileInput {
  client: FileClient | null;
  programs: FileProgram[];
  packages: MoneyPackage[];
  payments: MoneyPayment[];
  sessions: FileSession[];
  workouts: FileWorkout[];
  /** Only the count per workout is used — "6 exercises" on a logged row. */
  exerciseCounts: Record<string, number>;
  metrics: FileMetric[];
  gym: GymProfile;
}

export const EMPTY_FILE: FileInput = {
  client: null,
  programs: [],
  packages: [],
  payments: [],
  sessions: [],
  workouts: [],
  exerciseCounts: {},
  metrics: [],
  gym: { name: null, percent: null, upiVpa: null, trainerName: '' },
};

/* ------------------------------------------------------------------ shared */

export type FileTab = 'overview' | 'programs' | 'sessions' | 'package';

export const FILE_TABS: { key: FileTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'programs', label: 'Programs' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'package', label: 'Package' },
];

export interface FileHead {
  id: string;
  name: string;
  phone: string | null;
  /** "+91 98410 22119" — the shape an Indian number is read in. */
  phoneLabel: string | null;
  mode: DeliveryMode;
  status: 'active' | 'paused' | 'archived' | 'invited' | 'inactive';
  statusLabel: string;
  /**
   * True when the phone on this record belongs to a trainer account, so no
   * invite can ever reach it. Everything else about the client works — they can
   * be scheduled, logged and billed — which is why this is a flag beside the
   * status rather than a status of its own.
   */
  cannotInvite: boolean;
  /** The primary verb. For a client who owes you ₹6,000 it is not "Book". */
  owed: number;
  /**
   * The verb alone — the amount is not repeated here. This label sits in a
   * half-width button beside "Book", and "Collect ₹12,000" is wider than that
   * button on a 360dp screen. The figure is already on the same screen, large,
   * in the "Owes you" pair right below.
   */
  owedLabel: string | null;
}

export function buildHead(input: FileInput, now: number): FileHead | null {
  const c = input.client;
  if (!c) return null;
  const owed = owedFor(input);
  const status = statusOf(c.status);
  return {
    id: c.id,
    name: c.name,
    phone: c.phone ?? null,
    phoneLabel: formatPhone(c.phone ?? null),
    mode: readMode({ client: c.deliveryMode, metadata: c.metadata }),
    status,
    statusLabel: STATUS_LABELS[status],
    cannotInvite: (c.membershipStatus ?? '').toLowerCase() === 'unavailable',
    owed,
    owedLabel: owed > 0 ? 'Collect' : null,
  };
}

const STATUS_LABELS: Record<FileHead['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
  invited: 'Invited',
  inactive: 'Inactive',
};

function statusOf(raw: string): FileHead['status'] {
  if (raw === 'paused' || raw === 'archived' || raw === 'invited' || raw === 'inactive') return raw;
  return 'active';
}

/** Everything still owed across this client's open packs. */
function owedFor(input: FileInput): number {
  return input.packages.reduce((sum, pkg) => {
    if (pkg.writtenOffAt) return sum;
    return sum + outstanding(pkg, input.payments);
  }, 0);
}

/** The pack a trainer means when they say "their pack" — the live one, else the newest. */
export function currentPack(input: FileInput): MoneyPackage | null {
  const live = input.packages.filter((p) => p.status === 'active' && !p.writtenOffAt);
  const pool = live.length ? live : input.packages;
  return (
    [...pool].sort((a, b) => ms(b.createdAt) - ms(a.createdAt))[0] ?? null
  );
}

export function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return phone;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

/* ------------------------------------------------------------ 6a · overview */

/** Where a figure goes when it is tapped. The screen routes, this decides. */
export type FigureLink =
  | 'book'
  | 'package'
  | 'session'
  | 'adherence'
  | 'workout'
  | 'metrics'
  | null;

export interface OverviewRow {
  key: string;
  label: string;
  value: string;
  suffix?: string;
  detail?: string;
  link: FigureLink;
  /** The session or workout the row opens, when the link needs an id. */
  targetId?: string;
}

export interface OverviewView {
  owed: string;
  owedRaw: number;
  sessionsLeft: string;
  sessionsSuffix: string;
  rows: OverviewRow[];
  /** Seven states for the adherence strip, oldest first. */
  week: StreakDay[];
}

export function buildOverview(input: FileInput, now: number): OverviewView | null {
  const c = input.client;
  if (!c) return null;

  const pack = currentPack(input);
  const owed = owedFor(input);
  const rows: OverviewRow[] = [];

  const next = nextSession(input, now);
  rows.push(
    next
      ? {
          key: 'next',
          label: 'Next session',
          value: whenLabel(ms(next.scheduledAt), now),
          detail: [next.dayLabel, readMode({ session: next.deliveryMode, client: c.deliveryMode, metadata: c.metadata }), next.durationMinutes ? `${next.durationMinutes} min` : null]
            .filter(Boolean)
            .join(' · '),
          link: 'session',
          targetId: next.id,
        }
      : {
          key: 'next',
          label: 'Next session',
          value: 'None booked',
          detail: 'Book one from the header',
          link: null,
        },
  );

  const adherence = last7(input, now);
  rows.push({
    key: 'adherence',
    label: 'Adherence',
    value: String(adherence.kept),
    suffix: `/${adherence.planned}`,
    detail: adherence.planned ? 'Last 7 days' : 'Nothing was scheduled',
    link: adherence.planned ? 'adherence' : null,
  });

  const last = lastLogged(input);
  rows.push(
    last
      ? {
          key: 'logged',
          label: 'Last logged',
          value: whenLabel(ms(last.createdAt), now),
          detail: [
            labelForWorkout(input, last),
            countLabel(input.exerciseCounts[last.id] ?? 0, 'exercise'),
          ]
            .filter(Boolean)
            .join(' · '),
          link: 'workout',
          targetId: last.id,
        }
      : {
          key: 'logged',
          label: 'Last logged',
          value: 'Nothing yet',
          detail: 'No session has been logged yet',
          link: null,
        },
  );

  const weight = latestMetric(input, 'weight');
  const waist = latestMetric(input, 'waist');
  rows.push(
    weight
      ? {
          key: 'weight',
          label: 'Weight',
          value: trim(weight.value),
          suffix: ` ${weight.unit}`,
          detail: [
            `Measured ${dayStamp(ms(weight.recordedAt))}`,
            waist ? `waist ${trim(waist.value)} ${waist.unit}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          link: 'metrics',
        }
      : {
          key: 'weight',
          label: 'Weight',
          value: 'Not measured',
          detail: 'Add the first reading',
          link: 'metrics',
        },
  );

  const paid = input.payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);
  const doneCount = input.sessions.filter((s) => s.status === 'done').length;
  rows.push({
    key: 'alltime',
    label: 'All time',
    value: rupees(paid),
    detail: [
      `Since ${dayStamp(ms(c.createdAt))}`,
      countLabel(doneCount, 'session'),
    ]
      .filter(Boolean)
      .join(' · '),
    link: 'book',
  });

  return {
    owed: rupees(owed),
    owedRaw: owed,
    sessionsLeft: pack?.sessionsRemaining != null ? String(pack.sessionsRemaining) : '—',
    sessionsSuffix: pack?.sessionsTotal != null ? `/${pack.sessionsTotal}` : '',
    rows,
    week: adherence.week,
  };
}

/**
 * The last seven days, kept against planned.
 *
 * **A rest day never counts against anyone.** A day with nothing scheduled is
 * not a miss — it is the plan working — so it is absent from both halves of the
 * fraction rather than sitting in the denominator as a failure.
 */
function last7(input: FileInput, now: number): { kept: number; planned: number; week: StreakDay[] } {
  const from = startOfDay(now) - 6 * DAY_MS;
  const week: StreakDay[] = [];
  let kept = 0;
  let planned = 0;

  for (let i = 0; i < 7; i += 1) {
    const dayFrom = from + i * DAY_MS;
    const onDay = input.sessions.filter((s) => {
      const at = ms(s.scheduledAt);
      return at >= dayFrom && at < dayFrom + DAY_MS;
    });
    // Cancelled is neither kept nor planned: the slot was given back.
    const counted = onDay.filter((s) => s.status !== 'cancelled');
    const done = counted.some((s) => s.status === 'done');
    if (counted.length) {
      planned += 1;
      if (done) kept += 1;
      week.push(done ? 'done' : 'miss');
    } else {
      week.push('rest');
    }
  }

  return { kept, planned, week };
}

function nextSession(input: FileInput, now: number): FileSession | null {
  return (
    input.sessions
      .filter((s) => ms(s.scheduledAt) >= now && s.status !== 'cancelled' && s.status !== 'done')
      .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt))[0] ?? null
  );
}

function lastLogged(input: FileInput): FileWorkout | null {
  return (
    [...input.workouts].sort((a, b) => ms(b.createdAt) - ms(a.createdAt))[0] ?? null
  );
}

function labelForWorkout(input: FileInput, workout: FileWorkout): string | null {
  const session = workout.scheduledSessionId
    ? input.sessions.find((s) => s.id === workout.scheduledSessionId)
    : null;
  return session?.dayLabel ?? null;
}

function latestMetric(input: FileInput, type: string): FileMetric | null {
  return (
    input.metrics
      .filter((m) => m.metricType === type)
      .sort((a, b) => ms(b.recordedAt) - ms(a.recordedAt))[0] ?? null
  );
}

/** "Tomorrow 07:00", "Yesterday", "Mon 10 Aug". Never a bare timestamp. */
function whenLabel(at: number, now: number): string {
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
  const clock = new Date(at).toTimeString().slice(0, 5);
  if (days === 0) return `Today ${clock}`;
  if (days === 1) return `Tomorrow ${clock}`;
  if (days === -1) return 'Yesterday';
  if (days < -1) return relativePast(at, now);
  return `${dayStamp(at)} ${clock}`;
}

function countLabel(n: number, noun: string): string | null {
  if (!n) return null;
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** 84.20 → "84.2", 96 → "96". A trailing zero on a body weight reads as precision. */
export function trim(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/* ------------------------------------------------------------ 6b · programs */

export interface ProgramWeek {
  /** "Week 6", and the 0–1 the bar draws. */
  label: string;
  of: string;
  part: number;
}

export interface ProgramHistoryRow {
  id: string;
  name: string;
  detail: string;
  /** The dot's content — a week number, or an em dash for the gap. */
  mark: string;
  current: boolean;
}

export interface ProgramsView {
  current: {
    id: string;
    name: string;
    assigned: string;
    week: ProgramWeek | null;
    thisWeek: string | null;
    logged: string | null;
  } | null;
  history: ProgramHistoryRow[];
}

export function buildPrograms(input: FileInput, now: number): ProgramsView {
  const sorted = [...input.programs].sort((a, b) => startMs(b) - startMs(a));
  const active = sorted.find((p) => p.status === 'active') ?? null;

  const history: ProgramHistoryRow[] = sorted.map((p) => {
    const from = startMs(p);
    const to = p.endDate ? Date.parse(p.endDate) : null;
    const week = weekOf(p, now);
    return {
      id: p.id,
      name: p.name,
      detail: [
        `${dayStamp(from)} – ${p.status === 'active' ? 'now' : to ? dayStamp(to) : 'ended'}`,
        p.status === 'active' && week ? `week ${week.n} of ${week.total}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      mark: p.status === 'active' && week ? String(week.n) : '',
      current: p.status === 'active',
    };
  });

  // The gap before the first program is a real period of somebody's training,
  // not missing data — so it is a row, and it says what happened in it.
  const earliest = sorted.length ? startMs(sorted[sorted.length - 1]) : null;
  const clientFrom = input.client ? ms(input.client.createdAt) : null;
  if (earliest && clientFrom && earliest - clientFrom > 7 * DAY_MS) {
    const logged = input.workouts.filter((w) => ms(w.createdAt) < earliest).length;
    history.push({
      id: 'gap',
      name: 'No program',
      detail: logged
        ? `${dayStamp(clientFrom)} – ${dayStamp(earliest)} · sessions logged as you went`
        : `${dayStamp(clientFrom)} – ${dayStamp(earliest)} · nothing logged`,
      mark: '—',
      current: false,
    });
  }

  if (!active) return { current: null, history };

  const week = weekOf(active, now);
  const thisWeek = daysThisWeek(input, now);

  return {
    current: {
      id: active.id,
      name: active.name,
      assigned: `Assigned ${dayStamp(startMs(active))}`,
      week: week
        ? { label: `Week ${week.n}`, of: `of ${week.total}`, part: week.n / week.total }
        : null,
      thisWeek: thisWeek.labels.length ? `This week · ${thisWeek.labels.join(', ')}` : null,
      logged: thisWeek.planned
        ? `${thisWeek.done} of ${thisWeek.planned} days logged`
        : null,
    },
    history,
  };
}

function startMs(p: FileProgram): number {
  return p.startDate ? Date.parse(p.startDate) : ms(p.createdAt);
}

function weekOf(p: FileProgram, now: number): { n: number; total: number } | null {
  const from = startMs(p);
  if (!Number.isFinite(from)) return null;
  const to = p.endDate ? Date.parse(p.endDate) : null;
  if (!to || !Number.isFinite(to) || to <= from) return null;
  const total = Math.max(1, Math.round((to - from) / (7 * DAY_MS)));
  const n = Math.min(total, Math.max(1, Math.floor((now - from) / (7 * DAY_MS)) + 1));
  return { n, total };
}

function daysThisWeek(input: FileInput, now: number) {
  const from = startOfDay(now) - 6 * DAY_MS;
  const rows = input.sessions.filter((s) => ms(s.scheduledAt) >= from && s.status !== 'cancelled');
  const labels = Array.from(
    new Set(rows.map((s) => s.dayLabel).filter((l): l is string => Boolean(l))),
  ).slice(0, 3);
  return {
    labels,
    planned: rows.length,
    done: rows.filter((s) => s.status === 'done').length,
  };
}

/* ------------------------------------------------------------ 6c · sessions */

export type SessionFilter = 'all' | 'done' | 'no_show' | 'cancelled' | 'booked';

export interface SessionRow {
  id: string;
  time: string;
  day: string;
  title: string;
  /** What this row did to the pack. The only consequence a trainer scrolls for. */
  detail: string;
  tag: string;
  tone: 'ok' | 'danger' | 'info' | 'neutral';
  /** A no-show is the row an argument starts over, so it carries the red spine. */
  spine: boolean;
}

export interface SessionGroup {
  title: string;
  count?: number;
  rows: SessionRow[];
}

export interface SessionsView {
  counts: { key: SessionFilter; label: string; count: number }[];
  groups: SessionGroup[];
}

export function buildSessions(
  input: FileInput,
  now: number,
  filter: SessionFilter = 'all',
): SessionsView {
  const all = [...input.sessions].sort((a, b) => ms(b.scheduledAt) - ms(a.scheduledAt));

  const counts: SessionsView['counts'] = [
    { key: 'all', label: 'All', count: all.length },
    { key: 'done', label: 'Done', count: all.filter((s) => s.status === 'done').length },
    { key: 'no_show', label: 'No-show', count: all.filter((s) => s.status === 'no_show').length },
    { key: 'cancelled', label: 'Cancelled', count: all.filter((s) => s.status === 'cancelled').length },
    { key: 'booked', label: 'Booked', count: all.filter((s) => isBooked(s, now)).length },
  ];

  const picked = all.filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'booked') return isBooked(s, now);
    if (filter === 'done') return s.status === 'done';
    return s.status === filter;
  });

  const booked = picked.filter((s) => isBooked(s, now));
  const past = picked.filter((s) => !isBooked(s, now));

  const pack = currentPack(input);
  const groups: SessionGroup[] = [];
  if (booked.length) {
    groups.push({
      title: 'Booked',
      count: booked.length,
      rows: booked
        .slice()
        .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt))
        .map((s) => rowFor(s, input, now)),
    });
  }
  if (past.length) {
    groups.push({
      title:
        pack?.sessionsTotal != null && pack.sessionsRemaining != null
          ? `This pack · ${pack.sessionsTotal - pack.sessionsRemaining} of ${pack.sessionsTotal} used`
          : 'History',
      rows: past.map((s) => rowFor(s, input, now)),
    });
  }

  return { counts, groups };
}

function isBooked(s: FileSession, now: number): boolean {
  return s.status !== 'done' && s.status !== 'no_show' && s.status !== 'cancelled' && ms(s.scheduledAt) >= now;
}

function rowFor(s: FileSession, input: FileInput, now: number): SessionRow {
  const at = ms(s.scheduledAt);
  const time = new Date(at).toTimeString().slice(0, 5);
  const day = dayStamp(at).toUpperCase();
  const delta = s.packDelta ?? 0;
  const packLine = delta ? `pack ${delta > 0 ? '+' : '−'}${Math.abs(delta)}` : 'pack untouched';

  if (s.status === 'done') {
    const workout = input.workouts.find((w) => w.scheduledSessionId === s.id);
    const exercises = workout ? input.exerciseCounts[workout.id] ?? 0 : 0;
    return {
      id: s.id,
      time,
      day,
      title: s.dayLabel ?? 'Session',
      detail: [countLabel(exercises, 'exercise'), packLine].filter(Boolean).join(' · '),
      tag: 'Done',
      tone: 'ok',
      spine: false,
    };
  }

  if (s.status === 'no_show') {
    return {
      id: s.id,
      time,
      day,
      title: "Didn't turn up",
      detail: `No message · ${packLine}`,
      tag: 'No-show',
      tone: 'danger',
      spine: true,
    };
  }

  if (s.status === 'cancelled') {
    // Who cancelled is what decides the pack, so it is the title, not a detail.
    const byClient = s.cancelledBy === 'client';
    return {
      id: s.id,
      time,
      day,
      title: byClient ? 'He told me in time' : 'I called it off',
      detail: 'Pack kept · slot reused',
      tag: 'Cancelled',
      tone: 'neutral',
      spine: false,
    };
  }

  // A slot that has come and gone without an outcome is not "Booked" — telling
  // a trainer a session two days past is still booked is the screen lying about
  // the one thing they opened it to check. Not a fifth status: the absence of
  // one, which is exactly what it says.
  const past = ms(s.scheduledAt) < now;
  return {
    id: s.id,
    time,
    day,
    title: s.dayLabel ?? 'Session',
    detail: past
      ? `${modeLabel(s, input)} · no outcome yet · pack untouched`
      : `${modeLabel(s, input)} · pack untouched`,
    tag: past ? 'Not marked' : 'Booked',
    tone: past ? 'neutral' : 'info',
    spine: false,
  };
}

function modeLabel(s: FileSession, input: FileInput): string {
  const mode = readMode({
    session: s.deliveryMode,
    client: input.client?.deliveryMode,
    metadata: input.client?.metadata,
  });
  return mode === 'remote' ? 'Remote' : 'Floor';
}

/* ------------------------------------------------------------- 6d · package */

export interface PackageView {
  title: string;
  bought: string;
  status: string;
  left: string;
  leftSuffix: string;
  part: number;
  expires: string;
  legend: { left: string; used: string };
  owed: string;
  owedDetail: string;
  owedRaw: number;
  cut: string | null;
  cutDetail: string | null;
  perSession: number | null;
  renewLabel: string | null;
  /** Tone for the sessions-remaining figure and bar. */
  tone: 'ok' | 'warn' | 'danger';
}

export function buildPackage(input: FileInput, now: number): PackageView | null {
  const pack = currentPack(input);
  if (!pack) return null;

  const total = pack.sessionsTotal ?? 0;
  const left = pack.sessionsRemaining ?? 0;
  const used = Math.max(0, total - left);
  const owed = outstanding(pack, input.payments);
  const noShows = input.sessions.filter((s) => s.status === 'no_show').length;
  const perSession = total > 0 ? Math.round(pack.amount / total) : null;

  // The percentage was frozen on the day this pack was sold — a payment against
  // it carries the split it was recorded with, and that is the number to show.
  const recorded = input.payments.find(
    (p) => p.packageId === pack.id && p.sharePercent != null,
  );
  const cut = recorded
    ? { amount: recorded.gymShareAmount ?? 0, percent: recorded.sharePercent ?? 0 }
    : projectedCut(pack.amount, input.client ?? undefined, input.gym);

  const dueAt = pack.dueDate ? Date.parse(pack.dueDate) : null;
  const late = dueAt && dueAt < now ? Math.floor((now - dueAt) / DAY_MS) : 0;

  return {
    // Not `packDescription`, which returns an embeddable fragment ("a 10-session
    // pack") for use mid-sentence. A card title is not mid-sentence.
    title: total
      ? `${total} sessions · ${rupees(pack.amount)}`
      : `Open-ended · ${rupees(pack.amount)}`,
    bought: [
      `Bought ${dayStamp(ms(pack.createdAt))}`,
      perSession != null ? `${rupees(perSession)} a session` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    status: pack.status === 'active' ? 'Current' : pack.status === 'completed' ? 'Finished' : 'Closed',
    left: String(left),
    leftSuffix: total ? `/${total}` : '',
    part: total > 0 ? left / total : 0,
    expires: pack.endDate ? dayStamp(Date.parse(pack.endDate)) : 'No end date',
    legend: {
      left: `${left} left`,
      used: noShows
        ? `${used} used · ${noShows} no-show${noShows === 1 ? '' : 's'} among them`
        : `${used} used`,
    },
    owed: owed > 0 ? rupees(owed) : 'Nothing',
    owedDetail:
      owed > 0
        ? late
          ? `${late} day${late === 1 ? '' : 's'} late · see the full book`
          : 'See the full book'
        : 'Paid in full',
    owedRaw: owed,
    cut: cut.percent > 0 ? rupees(cut.amount) : null,
    cutDetail:
      cut.percent > 0
        ? `${cut.percent}% of floor, fixed on ${dayStamp(ms(pack.createdAt))}`
        : null,
    perSession,
    renewLabel: total ? `Renew · ${total} for ${rupees(pack.amount)}` : null,
    tone: left <= 0 ? 'danger' : left <= 2 ? 'warn' : 'ok',
  };
}

/* --------------------------------------------------------- 8a · body metrics */

export type MetricKind = 'weight' | 'waist';

export const METRIC_KINDS: { key: MetricKind; label: string; unit: string }[] = [
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'waist', label: 'Waist', unit: 'cm' },
];

export interface MetricRow {
  id: string;
  when: string;
  note: string;
  value: string;
  unit: string;
  delta: string;
  replaced: boolean;
}

/**
 * One point on the sparkline.
 *
 * `replaced` is the same flag `MetricRow` carries, and it is here because the
 * chart needs it too. It used to be a bare `number[]`: a correction on the same
 * day leaves two readings, the list marked one of them `replaced`, and the
 * chart drew it as an ordinary point — so a fat-fingered 68.0 against a real
 * 61.0 became a 7 kg spike, and the honest readings got squeezed into a third
 * of the plot. Append-only is the right rule and dropping the point is the edit
 * it exists to forbid, so the flag travels with the value instead.
 */
export interface SparkPoint {
  value: number;
  replaced: boolean;
}

export interface MetricsView {
  /** The two current figures. Both stay put when the segment changes. */
  current: { key: MetricKind; label: string; value: string; unit: string; delta: string }[];
  /** Oldest → newest, for the sparkline. Empty when there is nothing to draw. */
  spark: SparkPoint[];
  sentence: string | null;
  rows: MetricRow[];
  count: number;
  /** The last reading of the selected kind — the entry sheet's typo defence. */
  last: { value: number; unit: string; when: string } | null;
}

export function buildMetrics(input: FileInput, kind: MetricKind): MetricsView {
  const current = METRIC_KINDS.map((k) => {
    const series = seriesOf(input, k.key);
    const latest = series[series.length - 1] ?? null;
    const first = series[0] ?? null;
    return {
      key: k.key,
      label: k.label,
      value: latest ? trim(latest.value) : '—',
      unit: k.unit,
      delta: latest && first && series.length > 1 ? signedDelta(latest.value - first.value) : '—',
    };
  });

  const series = seriesOf(input, kind);
  const unit = METRIC_KINDS.find((k) => k.key === kind)?.unit ?? '';

  /**
   * Which readings a later one on the same day supersedes. Computed once, so
   * the list and the chart cannot disagree about it — the whole reason the
   * chart was drawing a number the list called a mistake.
   */
  const superseded = new Set(
    series
      .filter((m, i) => {
        const next = series[i + 1];
        return next !== undefined && sameDay(ms(next.recordedAt), ms(m.recordedAt));
      })
      .map((m) => m.id),
  );

  // Newest first for the list; the sparkline reads the other way.
  const rows: MetricRow[] = [];
  const desc = [...series].reverse();
  desc.forEach((m, i) => {
    const older = desc[i + 1] ?? null;
    // Two readings of the same kind on the same day: the later one is a
    // correction, and both rows say so. Neither is removed — that is the point.
    // Read off `superseded` rather than recomputed here, so the chart and this
    // list are looking at one answer.
    const sameDayNewer = superseded.has(m.id);
    const sameDayOlder = older && sameDay(ms(older.recordedAt), ms(m.recordedAt));
    rows.push({
      id: m.id,
      when: dayStamp(ms(m.recordedAt)),
      note: [
        // Midnight means the reading carried a date and no clock — a seeded
        // row, or an import. "00:00" would be a time nobody took a measurement
        // at, and false precision on this screen is the one thing it can't
        // afford.
        clock(ms(m.recordedAt)) === '00:00' ? null : clock(ms(m.recordedAt)),
        sameDayNewer ? 'replaced later that day' : sameDayOlder ? 'corrects the reading below' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      value: trim(m.value),
      unit,
      delta: older ? signedDelta(m.value - older.value) : '—',
      replaced: Boolean(sameDayNewer),
    });
  });

  const first = series[0] ?? null;
  const latest = series[series.length - 1] ?? null;

  return {
    current,
    spark: series.map((m) => ({ value: m.value, replaced: superseded.has(m.id) })),
    sentence:
      first && latest && series.length > 1
        ? `${trim(first.value)} ${unit} on ${dayStamp(ms(first.recordedAt))} → ${trim(latest.value)} ${unit} today.`
        : null,
    rows,
    count: input.metrics.length,
    last: latest
      ? { value: latest.value, unit, when: dayStamp(ms(latest.recordedAt)) }
      : null,
  };
}

function seriesOf(input: FileInput, kind: MetricKind): FileMetric[] {
  return input.metrics
    .filter((m) => m.metricType === kind)
    .sort((a, b) => ms(a.recordedAt) - ms(b.recordedAt));
}

function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

function clock(at: number): string {
  return new Date(at).toTimeString().slice(0, 5);
}

/** "−0.7", "+1.2", "0". Never coloured, so the sign has to carry the direction. */
function signedDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return '0';
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded)}`;
}
