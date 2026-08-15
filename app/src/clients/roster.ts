/**
 * The roster — everything screen 04 shows, derived from local tables.
 *
 * Pure, like `home/deck`: `now` and the rows come in as arguments, nothing here
 * reads the database or the clock. The thresholds are imported from the deck
 * rather than restated, because the whole point of the severity spine being the
 * same 2px bar on both screens is that "needs attention" means one thing in
 * this app, not two.
 *
 * The finding this file exists to encode: every platform in the teardown puts
 * money on another screen, and for a trainer selling ten-session packs for cash
 * and UPI, who owes you *is* the roster. So the default order is not
 * alphabetical — it is who needs chasing, and A–Z is one tap away.
 */

import { OVERDUE_DAYS, PACK_ENDING, QUIET_DAYS } from '../home/deck';
import { readMode, type DeliveryMode } from '../home/mode';
import { DAY_MS, daysBetween, rupees, startOfDay } from '../home/time';

/**
 * An invite this old has been ignored. Trainerize turns its account tag red at
 * three days and that number has survived contact with a lot of users.
 */
export const INVITE_STALE_DAYS = 3;

/** Before this, the A–Z rail is scaffolding around a list you can already see. */
export const INDEX_RAIL_MIN = 40;

const DONE_SESSION = new Set(['done', 'completed']);
const DUE_PAYMENT = new Set(['pending', 'due', 'unpaid', 'overdue']);
const DEAD_PACKAGE = new Set(['cancelled', 'canceled', 'completed', 'expired', 'refunded']);
const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

/* -------------------------------------------------------------------- input */

export interface RosterClient {
  id: string;
  name: string;
  phone?: string;
  status: string;
  /**
   * The CLIENT's own consent, from the server. Distinct from `status`, which is
   * this trainer's view — the two can legitimately disagree. Absent until the
   * first pull after the client was written, which is why nothing here treats
   * absence as meaningful.
   */
  membershipStatus?: string | null;
  deliveryMode?: string | null;
  metadata?: unknown;
  createdAt: Date | number;
  updatedAt: Date | number;
  /** WatermelonDB's per-record state. Anything but `synced` is still queued. */
  syncStatus?: string;
}
export interface RosterProgram {
  id: string;
  clientId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status: string;
}
export interface RosterPackage {
  id: string;
  clientId: string;
  sessionsTotal?: number;
  sessionsRemaining?: number;
  status: string;
}
export interface RosterPayment {
  id: string;
  clientId: string;
  amount: number;
  status: string;
  createdAt: Date | number;
}
export interface RosterWorkout {
  id: string;
  clientId: string;
  sessionDate: string;
  createdAt: Date | number;
}
export interface RosterScheduled {
  id: string;
  clientId: string;
  scheduledAt: Date | number;
  status: string;
}

export interface RosterInput {
  clients: RosterClient[];
  programs: RosterProgram[];
  packages: RosterPackage[];
  payments: RosterPayment[];
  workouts: RosterWorkout[];
  sessions: RosterScheduled[];
}

/* ------------------------------------------------------------------- output */

export type RosterStatus = 'active' | 'paused' | 'invited' | 'archived' | 'inactive';
export type AttentionKind = 'overdue' | 'quiet' | 'pack' | 'invite' | 'unavailable';
export type Batch = 'morning' | 'evening' | 'night' | 'none';

export interface RosterRow {
  id: string;
  name: string;
  phone?: string;
  status: RosterStatus;
  mode: DeliveryMode;
  /** First letter for the A–Z rail. `#` for anything that isn't a letter. */
  letter: string;
  /** The row's second line. The attention line wins over the program line. */
  line: string;
  severity?: 'alert' | 'critical';
  attention?: { kind: AttentionKind; action: string; weight: number };
  pack?: { remaining: number; total?: number };
  owed: number;
  quietDays: number | null;
  lastSessionAt: number | null;
  sessionsLeft: number | null;
  batch: Batch;
  /** Written on this phone, not yet on the server. Shows a Queued tag (4c). */
  queued: boolean;
}

export interface Roster {
  rows: RosterRow[];
  counts: Record<Segment, number>;
  /** Owed, quiet and ending — the three figures on the attention strip. */
  tally: { owed: number; quiet: number; ending: number };
  paused: number;
  archived: number;
  /** No clients at all, in any state — the first-run screen (4a). */
  firstRun: boolean;
}

export type Segment = 'all' | 'attention' | 'active' | 'paused' | 'invited';

export const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'invited', label: 'Invited' },
];

export type SortKey = 'attention' | 'name' | 'recent' | 'left' | 'owed';

export const SORTS: { key: SortKey; label: string; hint?: string }[] = [
  { key: 'attention', label: 'Needs attention first', hint: 'Overdue, then quiet, then pack ending' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'recent', label: 'Last session', hint: 'Most recent first' },
  { key: 'left', label: 'Sessions left', hint: 'Fewest first' },
  { key: 'owed', label: 'Amount owed', hint: 'Highest first' },
];

export interface Filters {
  mode: DeliveryMode[];
  money: ('owes' | 'paid' | 'ending')[];
  batch: Batch[];
}

export const NO_FILTERS: Filters = { mode: [], money: [], batch: [] };

export function filterCount(f: Filters): number {
  return f.mode.length + f.money.length + f.batch.length;
}

/* -------------------------------------------------------------------- rules */

const ms = (v: Date | number | undefined): number =>
  v === undefined ? 0 : v instanceof Date ? v.getTime() : Number(v);

const lower = (v: string | undefined): string => (v ?? '').toLowerCase();

function meta(client: RosterClient): Record<string, unknown> {
  return client.metadata && typeof client.metadata === 'object'
    ? (client.metadata as Record<string, unknown>)
    : {};
}

function metaTime(client: RosterClient, key: string): number | null {
  const raw = meta(client)[key];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Anything we don't recognise is treated as active — a client is never hidden. */
function readStatus(raw: string): RosterStatus {
  const value = lower(raw);
  if (value === 'paused' || value === 'on_hold') return 'paused';
  if (value === 'invited') return 'invited';
  if (value === 'archived') return 'archived';
  if (value === 'inactive') return 'inactive';
  return 'active';
}

function parseDay(value?: string): number | null {
  if (!value) return null;
  const t = Date.parse(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(t) ? null : t;
}

/** "Push A · Week 5 of 8". Only when the program carries real dates. */
function programLine(program: RosterProgram | undefined, now: number): string | null {
  if (!program) return null;
  const label = program.name?.trim();
  if (!label) return null;

  const start = parseDay(program.startDate);
  const end = parseDay(program.endDate);
  if (start === null) return label;

  const week = Math.floor((startOfDay(now) - startOfDay(start)) / (7 * DAY_MS)) + 1;
  if (week < 1) return label;
  if (end === null) return `${label} · Week ${week}`;

  const total = Math.max(1, Math.ceil((startOfDay(end) - startOfDay(start)) / (7 * DAY_MS)));
  return `${label} · Week ${Math.min(week, total)} of ${total}`;
}

const DAY_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${DAY_NAMES[d.getMonth()]}`;
}

/**
 * Which batch a client trains in, from where their sessions actually sit.
 *
 * Derived rather than typed, because "batch" on an Indian gym floor is an
 * observation about when someone turns up, not a field anyone would maintain.
 *
 * The boundaries are the ones a Chennai floor runs on: the before-work batch,
 * the after-work rush, and the late batch that fills up past eight. The gap
 * between noon and four is deliberately nobody's batch — a client who trains
 * at two is training alone, and calling that "afternoon batch" would invent a
 * group that doesn't meet.
 */
const EVENING_FROM = 16;
const NIGHT_FROM = 20;

function readBatch(sessions: RosterScheduled[]): Batch {
  let morning = 0;
  let evening = 0;
  let night = 0;

  for (const s of sessions) {
    const hour = new Date(ms(s.scheduledAt)).getHours();
    if (hour < 12) morning += 1;
    else if (hour >= NIGHT_FROM) night += 1;
    else if (hour >= EVENING_FROM) evening += 1;
  }

  if (morning === 0 && evening === 0 && night === 0) return 'none';
  // Ties go to the earlier batch: someone splitting evenly between the 6pm and
  // the 8pm is on the floor with the 6pm crowd, and that is the roster a
  // trainer pictures when they filter.
  if (morning >= evening && morning >= night) return 'morning';
  return evening >= night ? 'evening' : 'night';
}

function groupBy<T extends { clientId: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const list = out.get(row.clientId);
    if (list) list.push(row);
    else out.set(row.clientId, [row]);
  }
  return out;
}

/* ------------------------------------------------------------------- build */

export function buildRoster(input: RosterInput, now: number): Roster {
  const byProgram = groupBy(input.programs);
  const byPackage = groupBy(input.packages);
  const byPayment = groupBy(input.payments);
  const byWorkout = groupBy(input.workouts);
  const bySession = groupBy(input.sessions);

  const rows = input.clients
    .filter((client) => readStatus(client.status) !== 'archived')
    .map((client) => row(client, now, { byProgram, byPackage, byPayment, byWorkout, bySession }));

  const counts: Record<Segment, number> = {
    all: rows.length,
    attention: rows.filter((r) => r.attention).length,
    active: rows.filter((r) => r.status === 'active').length,
    paused: rows.filter((r) => r.status === 'paused').length,
    invited: rows.filter((r) => r.status === 'invited').length,
  };

  const attention = rows.filter((r) => r.attention);

  return {
    rows,
    counts,
    tally: {
      owed: attention.filter((r) => r.attention?.kind === 'overdue').reduce((s, r) => s + r.owed, 0),
      quiet: attention.filter((r) => r.attention?.kind === 'quiet').length,
      ending: attention.filter((r) => r.attention?.kind === 'pack').length,
    },
    paused: counts.paused,
    archived: input.clients.filter((c) => readStatus(c.status) === 'archived').length,
    firstRun: input.clients.length === 0,
  };
}

function row(
  client: RosterClient,
  now: number,
  index: {
    byProgram: Map<string, RosterProgram[]>;
    byPackage: Map<string, RosterPackage[]>;
    byPayment: Map<string, RosterPayment[]>;
    byWorkout: Map<string, RosterWorkout[]>;
    bySession: Map<string, RosterScheduled[]>;
  },
): RosterRow {
  const status = readStatus(client.status);
  const name = client.name?.trim() || 'Client';
  const sessions = index.bySession.get(client.id) ?? [];

  /* ------------------------------------------------------------------ money */

  const due = (index.byPayment.get(client.id) ?? []).filter((p) => DUE_PAYMENT.has(lower(p.status)));
  const owed = due.reduce((sum, p) => sum + (p.amount || 0), 0);
  const oldestDue = due.length > 0 ? Math.min(...due.map((p) => ms(p.createdAt))) : null;
  const owedDays = oldestDue === null ? 0 : daysBetween(oldestDue, now);

  /* ------------------------------------------------------------------- pack */

  const livePacks = (index.byPackage.get(client.id) ?? []).filter(
    (p) => !DEAD_PACKAGE.has(lower(p.status)),
  );
  const remaining = livePacks
    .map((p) => p.sessionsRemaining)
    .filter((n): n is number => typeof n === 'number');
  const sessionsLeft = remaining.length > 0 ? Math.min(...remaining) : null;
  const leanest =
    sessionsLeft === null ? undefined : livePacks.find((p) => p.sessionsRemaining === sessionsLeft);

  /* ------------------------------------------------------------------ quiet */

  const workouts = index.byWorkout.get(client.id) ?? [];
  const lastSessionAt =
    workouts.length > 0 ? Math.max(...workouts.map((w) => ms(w.createdAt))) : null;
  const livePrograms = (index.byProgram.get(client.id) ?? []).filter(
    (p) => !DEAD_PROGRAM.has(lower(p.status)),
  );
  // Only a client with a live plan can be "quiet" — someone with no program
  // isn't ignoring you, they are waiting for you.
  const quietDays =
    livePrograms.length > 0 && status === 'active'
      ? daysBetween(lastSessionAt ?? ms(client.createdAt), now)
      : null;

  /* -------------------------------------------------------------- attention
   * Ranked, and only the top one is shown. A row that says three things says
   * none of them, and the verb has to be unambiguous for the swipe to work.
   * ------------------------------------------------------------------------ */

  let attention: RosterRow['attention'];
  let line: string | null = null;
  let severity: RosterRow['severity'];

  const invitedAt = metaTime(client, 'invitedAt') ?? ms(client.createdAt);
  const inviteDays = daysBetween(invitedAt, now);

  /**
   * The number belongs to a trainer account, so no invite can ever reach it.
   *
   * Ranked ABOVE money, which nothing else here is, and deliberately: every
   * other attention item is a thing that became true over time and will still be
   * true tomorrow, whereas this one is a typo the trainer made seconds ago and
   * can fix in seconds. Ranking it below an overdue payment would bury the one
   * item on the roster that is actually a data-entry mistake — and the trainer
   * would go on believing they had invited somebody they had not.
   *
   * The client themselves is untouched by this: they can be scheduled, logged
   * and billed exactly like anyone else. Only app access is impossible.
   */
  const unavailable = lower(client.membershipStatus ?? '') === 'unavailable';

  if (unavailable) {
    attention = { kind: 'unavailable', action: 'Fix number', weight: 5000 };
    severity = 'alert';
    line = 'That number is a trainer account — they can’t be invited';
  } else if (status === 'paused') {
    const pausedAt = metaTime(client, 'pausedAt') ?? ms(client.updatedAt);
    const tail = sessionsLeft === null ? 'no pack' : `${sessionsLeft} sessions left`;
    line = `Paused ${shortDate(pausedAt)} · ${tail}`;
  } else if (owed > 0 && owedDays >= OVERDUE_DAYS) {
    attention = { kind: 'overdue', action: 'Remind', weight: 4000 + owed };
    severity = 'critical';
    line = `${rupees(owed)} overdue · ${owedDays} days`;
  } else if (quietDays !== null && quietDays >= QUIET_DAYS) {
    attention = { kind: 'quiet', action: 'Nudge', weight: 3000 + quietDays };
    severity = 'alert';
    line = `No workout logged in ${quietDays} days`;
  } else if (sessionsLeft !== null && sessionsLeft <= PACK_ENDING) {
    attention = { kind: 'pack', action: 'Renew', weight: 2000 - sessionsLeft };
    severity = 'alert';
    line =
      sessionsLeft <= 0
        ? 'Pack finished'
        : `Pack ends in ${sessionsLeft} session${sessionsLeft === 1 ? '' : 's'}`;
  } else if (status === 'invited' && inviteDays >= INVITE_STALE_DAYS) {
    attention = { kind: 'invite', action: 'Resend', weight: 1000 + inviteDays };
    severity = 'alert';
    line = `Invited ${inviteDays} days ago · not set up`;
  } else if (status === 'invited') {
    line = `Invited ${inviteDays === 0 ? 'today' : `${inviteDays} days ago`}`;
  } else if (owed > 0) {
    // Owed but not yet overdue: still the most useful thing to know, and still
    // not an alert.
    line = `${rupees(owed)} due`;
  }

  if (!line) {
    line =
      programLine(livePrograms[0], now) ??
      (lastSessionAt ? `Last session ${shortDate(lastSessionAt)}` : 'No program yet');
  }

  const first = name.charAt(0).toUpperCase();

  return {
    id: client.id,
    name,
    phone: client.phone?.trim() || undefined,
    status,
    mode: readMode({ client: client.deliveryMode, metadata: client.metadata }),
    letter: /[A-Z]/.test(first) ? first : '#',
    line,
    severity,
    attention,
    pack:
      sessionsLeft === null
        ? undefined
        : { remaining: sessionsLeft, total: leanest?.sessionsTotal || undefined },
    owed,
    quietDays,
    lastSessionAt,
    sessionsLeft,
    batch: readBatch(sessions),
    queued: client.syncStatus !== undefined && client.syncStatus !== 'synced',
  };
}

/* ------------------------------------------------------ segment · filter · sort */

export function inSegment(row: RosterRow, segment: Segment): boolean {
  switch (segment) {
    case 'attention':
      return Boolean(row.attention);
    case 'active':
      return row.status === 'active';
    case 'paused':
      return row.status === 'paused';
    case 'invited':
      return row.status === 'invited';
    default:
      return true;
  }
}

export function passesFilters(row: RosterRow, f: Filters): boolean {
  if (f.mode.length > 0 && !f.mode.includes(row.mode)) return false;
  if (f.batch.length > 0 && !f.batch.includes(row.batch)) return false;
  if (f.money.length > 0) {
    const owes = row.owed > 0;
    const ending = row.sessionsLeft !== null && row.sessionsLeft <= PACK_ENDING;
    const hit = f.money.some((m) => (m === 'owes' ? owes : m === 'paid' ? !owes : ending));
    if (!hit) return false;
  }
  return true;
}

export function sortRows(rows: RosterRow[], key: SortKey): RosterRow[] {
  const byName = (a: RosterRow, b: RosterRow) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  return [...rows].sort((a, b) => {
    switch (key) {
      case 'name':
        return byName(a, b);
      case 'recent':
        return (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0) || byName(a, b);
      case 'left':
        // Nulls last: a client with no pack is not "zero sessions left".
        return (
          (a.sessionsLeft ?? Number.POSITIVE_INFINITY) - (b.sessionsLeft ?? Number.POSITIVE_INFINITY) ||
          byName(a, b)
        );
      case 'owed':
        return b.owed - a.owed || byName(a, b);
      default:
        return (b.attention?.weight ?? 0) - (a.attention?.weight ?? 0) || byName(a, b);
    }
  });
}

export interface RosterSection {
  key: string;
  label: string;
  count?: number;
  tone?: 'default' | 'alert';
  data: RosterRow[];
}

/**
 * Two groups when sorted by urgency, one per letter when sorted A–Z.
 *
 * The section shape is the reason the A–Z rail can only exist in the second
 * case (§ 07): in the first there are no letters to point at.
 */
export function sectionRows(rows: RosterRow[], sort: SortKey, segment: Segment): RosterSection[] {
  if (sort === 'name') {
    const out: RosterSection[] = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.key === row.letter) last.data.push(row);
      else out.push({ key: row.letter, label: row.letter, data: [row] });
    }
    return out;
  }

  // Inside the attention segment every row needs attention, so splitting it
  // into "needs attention" and "everyone else" would leave an empty half.
  if (segment === 'attention') {
    return rows.length === 0 ? [] : [{ key: 'attention', label: '', data: rows }];
  }

  const needs = rows.filter((r) => r.attention);
  const rest = rows.filter((r) => !r.attention);
  const out: RosterSection[] = [];
  if (needs.length > 0) {
    out.push({
      key: 'needs',
      label: 'Needs attention',
      count: needs.length,
      tone: 'alert',
      data: needs,
    });
  }
  if (rest.length > 0) {
    out.push({
      key: 'rest',
      label: needs.length > 0 ? 'Everyone else' : 'Everyone',
      count: rest.length,
      data: rest,
    });
  }
  return out;
}

/** Name and phone. Archived is excluded unless asked for (§ 07). */
export function matches(row: RosterRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (row.name.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3 && (row.phone ?? '').replace(/\D/g, '').includes(digits);
}

/** Where the query hit the name, so the screen can mark it. */
export function markRange(name: string, query: string): [number, number] | null {
  const at = name.toLowerCase().indexOf(query.trim().toLowerCase());
  return at < 0 ? null : [at, at + query.trim().length];
}
