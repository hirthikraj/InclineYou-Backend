/**
 * The roster — everything /clients shows, derived from server rows.
 *
 * A PORT of `app/src/clients/roster.ts`, with three adaptations for the web:
 *
 *   1 · `weeklySchedule` arrives as a parsed array, not a JSON string — the
 *       REST response already deserialised it.
 *   2 · `membershipStatus` arrives nullable, because a response from a backend
 *       older than 28 Aug 2026 does not carry it. Absent reads as available,
 *       which is the right way round: the band is a claim that a number cannot
 *       be reached, and a claim needs evidence.
 *   3 · `syncStatus` / `queued` do not exist — the web is online-only.
 *
 * Everything else — the band table, the weights, the thresholds, the phrasings
 * — is copied from the mobile file, because the point of `ATTENTION_BANDS` being
 * a shared export is that "needs attention" means the same thing on both halves.
 *
 * ── AND ONE LAYER THE MOBILE FILE DOES NOT HAVE YET · 27 Aug 2026 ────────────
 *
 * The derived STATUS TAG (`ClientTag`) and the tier the default sort runs on
 * (`attentionTier`) are this half's, on the product owner's instruction. Three
 * things about that, stated rather than left to be discovered:
 *
 *   · Nothing was re-weighted to do it. `attentionWeight`, the bands, the
 *     severities and every phrasing are untouched — the tier sits ABOVE the
 *     weight and the weight still orders rows inside it, so no row on this screen
 *     is worded or coloured differently from the same row on Today.
 *   · The tags are derived from what is already on the wire. No column, no
 *     endpoint, no field: `endDate` on `PackageResponse` and `no_show` on
 *     `SessionResponse` were both already there and simply unread here.
 *   · The phone's roster still sorts by weight alone and has no tags. `app/` is
 *     not edited from this half without being asked, so this is a known
 *     divergence and not a drift — whoever closes it moves both halves in one
 *     commit and deletes this block.
 */

import {
  MISSED_STREAK,
  PACK_ENDING,
  PACK_EXPIRING_DAYS,
  QUIET_DAYS,
  OVERDUE_DAYS,
  attentionSeverity,
  attentionWeight,
  missedLine,
  moneyBand,
  moneyLine,
  moneyMagnitude,
  packBand,
  packExpiryLine,
  packLine,
  quietLine,
  type AttentionBand,
} from '@/lib/today/deck';
import { DAY_MS, WEEKDAYS_LONG, daysBetween, isoWeekday, startOfDay } from '@/lib/today/time';
import { readMode, type DeliveryMode } from '@/lib/today/mode';
import type { ClientWire, PackageWire, PaymentWire, WorkoutWire, ProgramWire, SessionWire } from './api';

/* ---------------------------------------------------------------- constants */

export const INVITE_STALE_DAYS = 3;
export const INDEX_RAIL_MIN = 40;

/**
 * The status-tag thresholds (27 Aug 2026). Four of the five reuse a deck
 * constant on purpose — the brief's numbers and the ladder's turned out to be
 * the same numbers, and a tag that said *Expiring* at a different count from the
 * row that says *Pack ends in 2 sessions* would be the same client described
 * twice:
 *
 *   Expiring  ≤ PACK_ENDING sessions  or  ≤ PACK_EXPIRING_DAYS days
 *   At risk   MISSED_STREAK in a row, MISSED_RECENT inside MISSED_WINDOW_DAYS,
 *             or silent past their own gap (never sooner than QUIET_DAYS)
 *   Lapsed    LAPSED_DAYS with nothing delivered
 *
 * `LAPSED_DAYS` is the one new number, and it is a boundary rather than a
 * threshold: past it a client is not "at risk" any more — being at risk implies
 * there is something left to save.
 */
export const LAPSED_DAYS = 30;

/**
 * "Missed 2+ sessions" read the other way — 2 no-shows inside the last month,
 * whether or not they were consecutive.
 *
 * The deck's `missed` band is a STREAK (`MISSED_STREAK` no-shows in a row over
 * settled sessions) and that stays exactly as it is: it writes the row's line,
 * and two screens on this half phrasing one client differently is the bug
 * `deck.ts`'s phrasing helpers exist to prevent. This is the TAG's rule only.
 * Two absences a fortnight apart with a delivered session between them is not a
 * streak and is a client drifting, which is what the tag has to catch.
 */
export const MISSED_RECENT = 2;
export const MISSED_WINDOW_DAYS = 30;

const EVENING_FROM = 16;
const NIGHT_FROM = 20;

const DONE_SESSION = new Set(['done', 'completed']);
const DUE_PAYMENT = new Set(['pending', 'due', 'unpaid', 'overdue']);
const DEAD_PACKAGE = new Set(['cancelled', 'canceled', 'completed', 'expired', 'refunded']);
const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

/* -------------------------------------------------------------------- types */

export type RosterStatus = 'active' | 'paused' | 'invited' | 'archived' | 'inactive';
export type AttentionKind =
  | 'setup'
  | 'overdue'
  | 'quiet'
  | 'pack'
  | 'missed'
  | 'invite'
  | 'unavailable';
export type Batch = 'morning' | 'evening' | 'night' | 'none';

/**
 * The tag on every row — DERIVED, never set by a trainer.
 *
 * That is the whole point of it: a status a trainer has to maintain is a status
 * that is wrong by the second week, and the six facts below are all already on
 * the wire. `paused` is the one exception and it is not really one — a trainer
 * pausing a client is them stating a fact, not maintaining a label, and it wins
 * over every derived tag because a paused client who has not trained for three
 * weeks is not drifting, they are paused.
 *
 * The tags are EXCLUSIVE and ordered — a client can be all of at-risk, expiring
 * and owing at once, and the row shows one tag. See `readTag`.
 */
export type ClientTag = 'at-risk' | 'expiring' | 'lapsed' | 'prospect' | 'paused' | 'active';

/** A tag, or `all`. The filters across the top of the screen are exactly these. */
export type Segment = 'all' | ClientTag;
export type SortKey = 'attention' | 'name' | 'recent' | 'left' | 'owed';

export interface RosterRow {
  id: string;
  name: string;
  phone?: string;
  status: RosterStatus;
  /** The derived tag. One per row, from `readTag`. */
  tag: ClientTag;
  mode: DeliveryMode;
  letter: string;
  line: string;
  severity?: 'alert' | 'critical';
  attention?: { kind: AttentionKind; action: string; weight: number };
  setupStep?: 'schedule' | 'plan';
  pack?: { remaining: number; total?: number };
  owed: number;
  quietDays: number | null;
  lastLoggedAt: number | null;
  /**
   * The last session actually DELIVERED — a workout log, or a scheduled session
   * marked done, whichever is later.
   *
   * Not the same as `lastLoggedAt`, which is logs only. The row prints this one
   * because "last attended" is a fact about the client and an unlogged session
   * they turned up to is still a session they turned up to; the `quiet` band
   * keeps reading `lastLoggedAt`, because that one is a fact about the trainer's
   * logging and the deck already says so.
   */
  lastAttendedAt: number | null;
  /** Consecutive no-shows over settled sessions — the deck's `missed` streak. */
  missedStreak: number;
  sessionsLeft: number | null;
  batch: Batch;
}

export interface Tally {
  overdueAmt: number;
  overdueCount: number;
  dueAmt: number;
  dueCount: number;
  quiet: number;
  ending: number;
  missed: number;
  setup: number;
}

export interface Roster {
  rows: RosterRow[];
  /** One per filter chip, so the chip can print its own count. */
  counts: Record<Segment, number>;
  /**
   * How many rows carry an attention row. NOT a segment any more — it is the
   * union of four tags plus money, so it groups the list and heads the group; it
   * does not filter it.
   */
  attention: number;
  tally: Tally;
  paused: number;
  archived: number;
  firstRun: boolean;
}

/**
 * WHAT THE SUMMARY STRIP COUNTS — one key per tile, and the reason it is here.
 *
 * The six figures above the table each name a subset of the rows underneath
 * them: *₹6,400 overdue > 7d · 1* is one client, *2 gone quiet* is two. Before
 * this axis existed the trainer read the number and then went and found those
 * rows by eye in a list of twenty-three, which is exactly the work the figure
 * was supposed to have already done.
 *
 * These are NOT the same cut as `money`. `owes` is "any rupee outstanding" and
 * is a question about the client; `overdue` is "outstanding past seven days"
 * and is a question about the debt. The strip already drew both separately and
 * has since the screen shipped — this only lets you press them.
 */
export type Focus = 'overdue' | 'due' | 'quiet' | 'ending' | 'missed' | 'setup';

export interface Filters {
  mode: DeliveryMode[];
  money: ('owes' | 'paid' | 'ending')[];
  batch: Batch[];
  /**
   * At most one at a time, unlike every other axis here.
   *
   * The tiles are alternative readings of one roster, not facets that compose:
   * *gone quiet* and *not set up* are disjoint by construction, so a pair of
   * them selected together can only ever mean the union — which is what `all`
   * already is, one row up. A second press clears it.
   */
  focus: Focus | null;
}

export const NO_FILTERS: Filters = { mode: [], money: [], batch: [], focus: null };

export function filterCount(f: Filters): number {
  return f.mode.length + f.money.length + f.batch.length + (f.focus ? 1 : 0);
}

/**
 * The predicate behind each tile, written against the SAME expressions
 * `buildRoster` tallies with.
 *
 * That is the whole contract of this function: a tile that says 2 and selects
 * three rows is worse than a tile that does nothing, so the count and the
 * filter must not be able to drift. `overdue`/`due` split on `severity` here
 * because that is how `overdueLateRows`/`dueSoonRows` split there, and the
 * other four read `attention.kind` because that is what the tally counts.
 */
export function matchesFocus(r: RosterRow, focus: Focus): boolean {
  switch (focus) {
    case 'overdue':
      return r.attention?.kind === 'overdue' && r.severity === 'critical';
    case 'due':
      return r.attention?.kind === 'overdue' && r.severity !== 'critical';
    case 'quiet':
      return r.attention?.kind === 'quiet';
    case 'ending':
      return r.attention?.kind === 'pack';
    case 'missed':
      return r.attention?.kind === 'missed';
    case 'setup':
      return r.attention?.kind === 'setup';
  }
}

/** The tile labels, in the strip's own order. Used by the removable chip row. */
export const FOCUS_LABEL: Record<Focus, string> = {
  overdue: 'Overdue',
  due: 'Due soon',
  quiet: 'Gone quiet',
  ending: 'Pack ending',
  missed: 'Missed 2+',
  setup: 'Not set up',
};

/**
 * The tags, in the order they are drawn — worst first, so the filter row reads
 * the same way the default sort does.
 *
 * `tone` is a webapp.css `.tag--*` variant. Two of the six are deliberately
 * neutral: *Lapsed* and *Paused* are both states where nothing is going wrong
 * any more, one because it is over and one because it was chosen. A tone on
 * every row is a tone on no row.
 */
export const TAGS: { key: ClientTag; label: string; tone: string; hint: string }[] = [
  { key: 'at-risk', label: 'At risk', tone: 'tag--danger', hint: 'Missed 2 or more, or quiet past their own gap' },
  { key: 'expiring', label: 'Expiring', tone: 'tag--warn', hint: '2 sessions or 7 days left' },
  /* '' is the base `.tag` — surface-3 on ink-2, the neutral one. */
  { key: 'lapsed', label: 'Lapsed', tone: '', hint: 'Nothing delivered in 30 days' },
  { key: 'active', label: 'Active', tone: 'tag--ok', hint: 'Training at the frequency you set' },
  { key: 'prospect', label: 'Prospect', tone: 'tag--info', hint: 'An enquiry — not training yet' },
  { key: 'paused', label: 'Paused', tone: '', hint: 'Paused by you' },
];

export const TAG_LABEL: Record<ClientTag, string> = TAGS.reduce(
  (acc, t) => { acc[t.key] = t.label; return acc; },
  {} as Record<ClientTag, string>,
);

export const TAG_TONE: Record<ClientTag, string> = TAGS.reduce(
  (acc, t) => { acc[t.key] = t.tone; return acc; },
  {} as Record<ClientTag, string>,
);

/**
 * The filter row: *All* and then one chip per tag, in the tags' own order.
 *
 * *Needs attention* and *Invited* were the two chips this replaced. Attention is
 * not a state a client is in — it is the union of four of them, and it is
 * already what the default sort and the group header say; *Invited* became
 * *Prospect*, which is the same set of clients under the name the product uses
 * for them. Money is deliberately NOT a chip here: it is not a tag, it has its
 * own axis in the filter panel (*Pending* / *Paid up*), and it is a column on
 * every row.
 */
export const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'All' },
  ...TAGS.map((t) => ({ key: t.key as Segment, label: t.label })),
];

export const SORTS: { key: SortKey; label: string; hint?: string }[] = [
  { key: 'attention', label: 'Needs attention first', hint: 'At risk, then expiring, then pending' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'recent', label: 'Last attended', hint: 'Most recent first' },
  { key: 'left', label: 'Sessions left', hint: 'Fewest first' },
  { key: 'owed', label: 'Amount pending', hint: 'Highest first' },
];

/* -------------------------------------------------------------------- input */

export interface RosterInput {
  clients: ClientWire[];
  packages: PackageWire[];
  payments: PaymentWire[];
  workouts: WorkoutWire[];
  programs: ProgramWire[];
  sessions: SessionWire[];
}

/* ------------------------------------------------------------------- rules */

const ms = (v: number | undefined | null): number => (v == null ? 0 : Number(v));

const lower = (v: string | undefined | null): string => (v ?? '').toLowerCase();

function readStatus(raw: string): RosterStatus {
  const value = lower(raw);
  if (value === 'paused' || value === 'on_hold') return 'paused';
  if (value === 'invited') return 'invited';
  if (value === 'archived') return 'archived';
  if (value === 'inactive') return 'inactive';
  return 'active';
}

function parseDay(value?: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(t) ? null : t;
}

function programLine(
  program: ProgramWire | undefined,
  now: number,
): string | null {
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

function readBatch(sessions: SessionWire[]): Batch {
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

/** Inline port of `app/src/clients/schedule.ts`'s `onboardingStep`. */
function onboardingStep(input: {
  weeklySchedule?: Array<unknown> | null;
  hasLiveProgram: boolean;
  hasWorkouts: boolean;
}): 'schedule' | 'plan' | null {
  if (input.hasWorkouts) return null;
  const hasSchedule = Array.isArray(input.weeklySchedule) && input.weeklySchedule.length > 0;
  if (!hasSchedule) return input.hasLiveProgram ? null : 'schedule';
  return input.hasLiveProgram ? null : 'plan';
}

/* -------------------------------------------------------------------- build */

export function buildRoster(input: RosterInput, now: number): Roster {
  const byProgram = groupBy(input.programs);
  const byPackage = groupBy(input.packages);
  const byPayment = groupBy(input.payments);
  const byWorkout = groupBy(input.workouts);
  const bySession = groupBy(input.sessions);

  const rows = input.clients
    .filter((c) => readStatus(c.status) !== 'archived')
    .map((c) => buildRow(c, now, { byProgram, byPackage, byPayment, byWorkout, bySession }));

  const counts: Record<Segment, number> = {
    all: rows.length,
    'at-risk': rows.filter((r) => r.tag === 'at-risk').length,
    expiring: rows.filter((r) => r.tag === 'expiring').length,
    lapsed: rows.filter((r) => r.tag === 'lapsed').length,
    active: rows.filter((r) => r.tag === 'active').length,
    prospect: rows.filter((r) => r.tag === 'prospect').length,
    paused: rows.filter((r) => r.tag === 'paused').length,
  };

  // Tally: split money into overdue (≥ OVERDUE_DAYS) vs due-soon (< OVERDUE_DAYS)
  const attentionRows = rows.filter((r) => r.attention);
  const overdueRows = attentionRows.filter((r) => r.attention?.kind === 'overdue');

  // We need to re-check which overdue rows are "late" vs "soon". Use attention weight
  // to distinguish: overdue-late band vs due-soon band.
  // A simpler proxy: rows whose severity is 'critical' with kind 'overdue' are overdue-late.
  const overdueLateRows = overdueRows.filter((r) => r.severity === 'critical');
  const dueSoonRows = overdueRows.filter((r) => r.severity !== 'critical');

  const tally: Tally = {
    overdueAmt: overdueLateRows.reduce((s, r) => s + r.owed, 0),
    overdueCount: overdueLateRows.length,
    dueAmt: dueSoonRows.reduce((s, r) => s + r.owed, 0),
    dueCount: dueSoonRows.length,
    quiet: attentionRows.filter((r) => r.attention?.kind === 'quiet').length,
    ending: attentionRows.filter((r) => r.attention?.kind === 'pack').length,
    missed: attentionRows.filter((r) => r.attention?.kind === 'missed').length,
    setup: attentionRows.filter((r) => r.attention?.kind === 'setup').length,
  };

  return {
    rows,
    counts,
    attention: attentionRows.length,
    tally,
    paused: counts.paused,
    archived: input.clients.filter((c) => readStatus(c.status) === 'archived').length,
    firstRun: input.clients.length === 0,
  };
}

function buildRow(
  client: ClientWire,
  now: number,
  index: {
    byProgram: Map<string, ProgramWire[]>;
    byPackage: Map<string, PackageWire[]>;
    byPayment: Map<string, PaymentWire[]>;
    byWorkout: Map<string, WorkoutWire[]>;
    bySession: Map<string, SessionWire[]>;
  },
): RosterRow {
  const status = readStatus(client.status);
  const name = client.name?.trim() || 'Client';
  const sessions = index.bySession.get(client.id) ?? [];

  /* money */
  const due = (index.byPayment.get(client.id) ?? []).filter((p) =>
    DUE_PAYMENT.has(lower(p.status)),
  );
  const owed = due.reduce((sum, p) => {
    const n = typeof p.amount === 'number' ? p.amount : Number(p.amount ?? 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const oldestDue = due.length > 0 ? Math.min(...due.map((p) => ms(p.createdAt))) : null;
  const owedDays = oldestDue === null ? 0 : daysBetween(oldestDue, now);

  /* pack */
  const livePacks = (index.byPackage.get(client.id) ?? []).filter(
    (p) => !DEAD_PACKAGE.has(lower(p.status)),
  );
  const remaining = livePacks
    .map((p) => p.sessionsRemaining)
    .filter((n): n is number => typeof n === 'number');
  const sessionsLeft = remaining.length > 0 ? Math.min(...remaining) : null;
  const leanest =
    sessionsLeft === null
      ? undefined
      : livePacks.find((p) => p.sessionsRemaining === sessionsLeft);

  /*
   * The pack that RAISES the row is the worst of theirs by band, not the one with
   * the fewest sessions — `deck.ts`'s rule, and its reasoning holds here word for
   * word: a client can hold a nearly-empty pack that runs to December and a full
   * one that expires on Friday, and "fewest sessions" picks the wrong one. The
   * `Sessions left` COLUMN still shows the leanest, because that column is a
   * count and not a verdict.
   */
  let worstPack: { band: AttentionBand; remaining: number; daysLeft: number | null } | null = null;
  for (const p of livePacks) {
    /* V30 · a paused pack raises no band. `deck.ts` carries the argument: the
       date is frozen and today is not, so the row would get louder every morning
       about an expiry that has stopped running. */
    if (p.pausedAt) continue;
    if (typeof p.sessionsRemaining !== 'number') continue;
    const endsAt = parseDay(p.endDate);
    // Floored at 0: an already-lapsed date reads as "today" rather than as a
    // negative that would sort below a pack expiring next week.
    const daysLeft = endsAt === null ? null : Math.max(0, daysBetween(now, endsAt));
    const band = packBand(p.sessionsRemaining, daysLeft);
    if (band === null) continue;
    if (worstPack === null || attentionWeight(band) > attentionWeight(worstPack.band)) {
      worstPack = { band, remaining: p.sessionsRemaining, daysLeft };
    }
  }

  /* quiet */
  const workouts = index.byWorkout.get(client.id) ?? [];
  const lastLoggedAt =
    workouts.length > 0 ? Math.max(...workouts.map((w) => ms(w.createdAt))) : null;
  const livePrograms = (index.byProgram.get(client.id) ?? []).filter(
    (p) => !DEAD_PROGRAM.has(lower(p.status)),
  );
  const quietDays =
    livePrograms.length > 0 && status === 'active'
      ? daysBetween(lastLoggedAt ?? ms(client.createdAt), now)
      : null;

  /* attended — a log, or a session someone ticked off, whichever is later */
  const doneAt = sessions
    .filter((s) => DONE_SESSION.has(lower(s.status)) && ms(s.scheduledAt) <= now)
    .map((s) => ms(s.scheduledAt));
  const lastDoneAt = doneAt.length > 0 ? Math.max(...doneAt) : null;
  const lastAttendedAt =
    lastLoggedAt === null && lastDoneAt === null
      ? null
      : Math.max(lastLoggedAt ?? 0, lastDoneAt ?? 0);

  /*
   * missed — `no_show` ONLY, in both readings.
   *
   * A cancelled session was called off, by either side, with notice, and says
   * nothing about whether the client is drifting; counting it would tag the most
   * considerate clients on the roster. A session still sitting at `scheduled` in
   * the past says nothing either — nobody has marked it, and that is a fact about
   * the trainer. So both counts run over SETTLED sessions: done or no-show.
   *
   * The window is `GET /v1/sessions?from&to`'s — eight weeks back — so a streak
   * older than that cannot be seen. That is the right failure: a client whose
   * last absence was in June is `lapsed` by then, not `at-risk`.
   */
  const settled = sessions
    .filter((s) => ms(s.scheduledAt) < now)
    .filter((s) => DONE_SESSION.has(lower(s.status)) || lower(s.status) === 'no_show')
    .sort((a, b) => ms(b.scheduledAt) - ms(a.scheduledAt));

  let missedStreak = 0;
  for (const s of settled) {
    if (lower(s.status) !== 'no_show') break;
    missedStreak += 1;
  }
  const missedRecent = settled.filter(
    (s) =>
      lower(s.status) === 'no_show' &&
      daysBetween(ms(s.scheduledAt), now) <= MISSED_WINDOW_DAYS,
  ).length;

  /* attention */
  let attention: RosterRow['attention'];
  let line: string | null = null;
  let severity: RosterRow['severity'];

  const invitedAt =
    (client.metadata && typeof client.metadata === 'object'
      ? metaNum(client.metadata, 'invitedAt')
      : null) ?? ms(client.createdAt);
  const inviteDays = daysBetween(invitedAt, now);

  const setupStep =
    status === 'active'
      ? onboardingStep({
          weeklySchedule: client.weeklySchedule,
          hasLiveProgram: livePrograms.length > 0,
          hasWorkouts: workouts.length > 0,
        })
      : null;

  const candidates: {
    band: AttentionBand;
    kind: AttentionKind;
    action: string;
    magnitude: number;
    line: string;
  }[] = [];

  /*
   * The number belongs to a trainer account, so no invite can ever reach it.
   *
   * The first band, above money, and deliberately: every other attention item is
   * a thing that became true over time and will still be true tomorrow, whereas
   * this one is a typo the trainer made seconds ago and can fix in seconds.
   * Ranking it below an overdue payment would bury the one item on the roster
   * that is actually a data-entry mistake — and the trainer would go on
   * believing they had invited somebody they had not.
   *
   * The client themselves is untouched by it: they can be scheduled, logged and
   * billed exactly like anyone else. Only app access is impossible.
   *
   * Copied from the mobile file rather than re-derived — this half went without
   * the band entirely until `membershipStatus` reached `GET /v1/clients`, and
   * the whole point of the port is that "needs attention" means the same thing
   * on both halves.
   */
  if (lower(client.membershipStatus ?? '') === 'unavailable') {
    candidates.push({
      band: 'unavailable',
      kind: 'unavailable',
      action: 'Fix number',
      magnitude: 0,
      line: 'That number is a trainer account — they can’t be invited',
    });
  }

  if (setupStep) {
    candidates.push({
      band: 'setup',
      kind: 'setup',
      action: 'Set up',
      magnitude: 0,
      /* *Not in your week yet — pick their training days* until this pass, and
         the clause was the only one of its kind on the screen. Every other line
         this function writes is a STATE and nothing else — *Pack is empty*,
         *Missed the last 2 sessions*, *Week picked, no plan on it yet*, which is
         this band's own sibling two characters below — and the verb lives in
         `action`, which the roster draws as a button on the same row. This one
         said the state AND the instruction, so the row read *Not in your week
         yet — pick their training days · Set up*.

         It was also, at 324px, the widest line in the table by 50px, and the
         roster's What's-up track is sized off the widest line: one row's extra
         clause was setting a column width for all twenty-three. Cutting it to
         the state alone is 130px and matches the sibling. */
      line:
        setupStep === 'schedule'
          ? 'Not in your week yet'
          : 'Week picked, no plan on it yet',
    });
  }

  if (status !== 'paused') {
    if (owed > 0) {
      const band = moneyBand(owedDays, false);
      candidates.push({
        band,
        kind: 'overdue',
        action: 'Remind',
        magnitude: moneyMagnitude(owed),
        line: moneyLine(owed, owedDays, band === 'overdue-late'),
      });
    }
    if (quietDays !== null && quietDays >= QUIET_DAYS) {
      candidates.push({
        band: 'quiet',
        kind: 'quiet',
        /* `Check in`, not `Nudge` — Today's word for this band since 27 Aug 2026,
         * and now that `missed` is raised here too the roster would otherwise
         * offer two different verbs for one act: asking after somebody. */
        action: 'Check in',
        magnitude: quietDays,
        line: quietLine(quietDays),
      });
    }
    if (worstPack) {
      const { band, remaining: left, daysLeft } = worstPack;
      const byDate = band === 'pack-expiring' && daysLeft !== null;
      candidates.push({
        band,
        kind: 'pack',
        action: 'Renew',
        /* Fewer left is more urgent inside the two session bands; fewer DAYS left
         * is more urgent inside the date band. Same axis, different unit, and
         * `attentionWeight` clamps so a magnitude cannot reach the band above. */
        magnitude: byDate ? PACK_EXPIRING_DAYS - daysLeft! : PACK_ENDING - left,
        /* The sentence follows the BAND, not the data: a pack in `pack-expiring`
         * landed there because of its date, so it says the date. */
        line: byDate
          ? packExpiryLine(daysLeft!, WEEKDAYS_LONG[isoWeekday(now + daysLeft! * DAY_MS)])
          : packLine(left),
      });
    }
    /*
     * Both readings of "missed 2+" raise the row, and the SENTENCE says which one
     * did — because a tag reading *At risk* over a line reading *Base · Week 5*
     * is a claim about somebody the trainer knows with no evidence attached, and
     * the first thing they will do is stop believing the tag.
     *
     * The streak keeps `deck.ts`'s wording exactly. The scattered case gets its
     * own, and that phrasing lives HERE rather than in `deck.ts` on purpose: it
     * is a different fact, and `deck.ts` is a port of the phone's file — a
     * helper added there that the phone does not have is the drift the header of
     * this file exists to prevent.
     */
    if (missedStreak >= MISSED_STREAK) {
      candidates.push({
        band: 'missed',
        kind: 'missed',
        action: 'Check in',
        // A longer streak is more urgent, and it saturates fast on purpose: four
        // missed in a row and five are the same conversation.
        magnitude: missedStreak,
        line: missedLine(missedStreak),
      });
    } else if (missedRecent >= MISSED_RECENT) {
      candidates.push({
        band: 'missed',
        kind: 'missed',
        action: 'Check in',
        // Below any streak of the same size, which is what a lower magnitude in
        // the same band means: two in a row is worse news than two in a month.
        magnitude: Math.max(1, missedRecent - 1),
        line: `Missed ${missedRecent} sessions in ${MISSED_WINDOW_DAYS} days`,
      });
    }
    if (status === 'invited' && inviteDays >= INVITE_STALE_DAYS) {
      candidates.push({
        band: 'invite-stale',
        kind: 'invite',
        action: 'Resend',
        magnitude: inviteDays,
        line: `Invited ${inviteDays} days ago · not set up`,
      });
    }
  }

  const top = candidates
    .map((c) => ({ ...c, weight: attentionWeight(c.band, c.magnitude) }))
    .sort((a, b) => b.weight - a.weight)[0];

  if (top) {
    attention = { kind: top.kind, action: top.action, weight: top.weight };
    severity = attentionSeverity(top.band);
    line = top.line;
  } else if (status === 'paused') {
    const pausedAt =
      (client.metadata && typeof client.metadata === 'object'
        ? metaNum(client.metadata, 'pausedAt')
        : null) ?? ms(client.updatedAt);
    const tail = sessionsLeft === null ? 'no pack' : `${sessionsLeft} sessions left`;
    line = `Paused ${shortDate(pausedAt)} · ${tail}`;
  } else if (status === 'invited') {
    line = `Invited ${inviteDays === 0 ? 'today' : `${inviteDays} days ago`}`;
  }

  if (!line) {
    line =
      programLine(livePrograms[0], now) ??
      (lastLoggedAt ? `Last session ${shortDate(lastLoggedAt)}` : 'No plan yet');
  }

  const letter = (name[0] ?? '#').toUpperCase();

  /*
   * Silence is measured from the last DELIVERED session, and from `createdAt`
   * when there has never been one — so a client added this morning is not
   * lapsed, and one added five weeks ago who never started is.
   */
  const silentDays = daysBetween(lastAttendedAt ?? ms(client.createdAt), now);

  const tag = readTag({
    status,
    silentDays,
    dormantAfter: dormantAfterDays(client.weeklySchedule),
    missedStreak,
    missedRecent,
    packBand: worstPack?.band ?? null,
    hasAttended: lastAttendedAt !== null,
  });

  return {
    id: client.id,
    name,
    phone: client.phone ?? undefined,
    status,
    tag,
    mode: readMode({ client: client.deliveryMode, metadata: client.metadata }),
    letter: /[A-Z]/.test(letter) ? letter : '#',
    line,
    severity,
    attention,
    setupStep: setupStep ?? undefined,
    pack: leanest
      ? {
          remaining: leanest.sessionsRemaining ?? 0,
          total: leanest.sessionsTotal ?? undefined,
        }
      : undefined,
    owed,
    quietDays,
    lastLoggedAt,
    lastAttendedAt,
    missedStreak,
    sessionsLeft,
    batch: readBatch(sessions),
  };
}

/**
 * Their own gap, doubled — how long silence has to run before it is drift.
 *
 * `weeklySchedule` is how many times a week the trainer said this client trains,
 * so the gap between sessions is 7 / that, and missing two of them is the first
 * moment worth a word. Doubled rather than exact because one skipped session is
 * a busy week: a 3×-a-week client is at risk after a week of silence, a
 * once-a-week client after a fortnight.
 *
 * Floored at `QUIET_DAYS`, which is the reason a client with no schedule at all
 * still gets an answer: with nothing said about frequency the deck's own
 * seven-day rule is the best available, and it is the number the `quiet` band
 * uses on the same row.
 */
function dormantAfterDays(weeklySchedule?: Array<unknown> | null): number {
  const perWeek = Array.isArray(weeklySchedule) ? weeklySchedule.length : 0;
  if (perWeek <= 0) return QUIET_DAYS;
  return Math.max(QUIET_DAYS, Math.max(1, Math.ceil(7 / perWeek)) * 2);
}

/**
 * The one tag a row shows, from the six a client can qualify for at once.
 *
 * The order below IS the decision, and every step of it is one that could have
 * gone the other way:
 *
 *   1 `paused` — a trainer's own statement outranks anything derived from data
 *     they paused on purpose.
 *   2 `prospect` — an enquiry cannot be at risk, quiet or lapsed; there is
 *     nothing yet to be at risk OF. It stops being one the moment they attend,
 *     whatever their status row still says.
 *   3 `lapsed` — ABOVE at-risk, not below it. At risk means there is something
 *     left to save; a month of silence is past that, and a roster that calls a
 *     client of six weeks ago "at risk" is a roster that never tells the trainer
 *     who has actually gone.
 *   4 `at-risk` — the drift, by either reading of "missed 2+".
 *   5 `expiring` — below at-risk because a pack running out on somebody who is
 *     still turning up is a renewal conversation, and the same pack on somebody
 *     who has stopped is a leaving one. Both are urgent; only one is about the
 *     pack.
 *   6 `active` — the fallback, and it means what the brief says: attending
 *     inside their expected frequency, with nothing else true of them.
 */
function readTag(input: {
  status: RosterStatus;
  silentDays: number;
  dormantAfter: number;
  missedStreak: number;
  missedRecent: number;
  packBand: AttentionBand | null;
  hasAttended: boolean;
}): ClientTag {
  if (input.status === 'paused') return 'paused';
  if (input.status === 'invited' && !input.hasAttended) return 'prospect';
  /* `inactive` is the server's own word for a roster row nobody has touched;
   * it is the same thing this screen calls lapsed, so it is not a seventh tag. */
  if (input.status === 'inactive') return 'lapsed';
  if (input.silentDays >= LAPSED_DAYS) return 'lapsed';
  if (input.missedStreak >= MISSED_STREAK) return 'at-risk';
  if (input.missedRecent >= MISSED_RECENT) return 'at-risk';
  if (input.silentDays > input.dormantAfter) return 'at-risk';
  /* Every pack band — empty, ending by count, expiring by date. The tag is one
   * word for "this pack is nearly over", and which axis it is nearly over on is
   * what the row's own line says. */
  if (input.packBand !== null) return 'expiring';
  return 'active';
}

function metaNum(meta: Record<string, unknown>, key: string): number | null {
  const raw = meta[key];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/* ---------------------------------------------------------------- sort/filter */

/**
 * The default order, and it is never alphabetical: at risk, then expiring, then
 * dues, then everyone else.
 *
 * This is a TIER above `attentionWeight`, not a replacement for it. The ladder
 * in `deck.ts` ranks by what is at stake — a package running out outranks money
 * owed, which is the decision of 27 Aug 2026 and is right for a queue of things
 * to DO. This screen is a list of PEOPLE, and the brief orders it by who is
 * closest to leaving: the client drifting away comes before the pack that needs
 * renewing, because renewing a pack for somebody who has stopped coming is not a
 * conversation that happens.
 *
 * So the tier decides which group a row is in and `attentionWeight` orders it
 * inside that group — which keeps every phrasing, severity and within-band
 * ordering identical to Today's. Two rows in the same tier with no attention row
 * at all fall through to the name, so the tail of the list is stable.
 *
 * Dues is a tier without being a tag: money is a state, not a state of the
 * client, and it is a column on every row.
 */
function attentionTier(r: RosterRow): number {
  if (r.tag === 'at-risk') return 0;
  if (r.tag === 'expiring') return 1;
  if (r.owed > 0) return 2;
  if (r.tag === 'lapsed') return 3;
  if (r.tag === 'prospect') return 4;
  /* Last, below plain Active. A paused client is the one row on the roster where
   * nothing is expected to happen, so nothing about them is urgent. */
  if (r.tag === 'paused') return 6;
  return 5;
}

export function sortRows(rows: RosterRow[], key: SortKey): RosterRow[] {
  return [...rows].sort((a, b) => {
    if (key === 'attention') {
      const ta = attentionTier(a);
      const tb = attentionTier(b);
      if (ta !== tb) return ta - tb;
      const wa = a.attention?.weight ?? -1;
      const wb = b.attention?.weight ?? -1;
      if (wa !== wb) return wb - wa;
      return a.name.localeCompare(b.name);
    }
    if (key === 'name') return a.name.localeCompare(b.name);
    if (key === 'recent') {
      return (b.lastAttendedAt ?? 0) - (a.lastAttendedAt ?? 0);
    }
    if (key === 'left') {
      const la = a.sessionsLeft ?? Infinity;
      const lb = b.sessionsLeft ?? Infinity;
      return la - lb;
    }
    if (key === 'owed') return b.owed - a.owed;
    return 0;
  });
}

/**
 * Name or phone, and nothing else.
 *
 * The phone is matched on DIGITS on both sides, because a trainer reads a number
 * off a WhatsApp thread as `+91 98410 22119` and the column holds `9841022119`.
 * Two digits before that kicks in, so typing a name that starts with a letter is
 * never a phone search and `S` does not match every number containing a 5.
 */
export function searchRows(rows: RosterRow[], query: string): RosterRow[] {
  const q = query.trim().toLowerCase();
  if (q === '') return rows;
  const digits = q.replace(/\D/g, '');
  return rows.filter((r) => {
    if (r.name.toLowerCase().includes(q)) return true;
    if (digits.length >= 2 && r.phone) return r.phone.replace(/\D/g, '').includes(digits);
    return false;
  });
}

export function filterRows(rows: RosterRow[], filters: Filters, segment: Segment): RosterRow[] {
  let result = rows;

  if (segment !== 'all') result = result.filter((r) => r.tag === segment);

  if (filters.mode.length > 0) result = result.filter((r) => filters.mode.includes(r.mode));

  if (filters.money.length > 0) {
    result = result.filter((r) => {
      if (filters.money.includes('owes') && r.owed > 0) return true;
      if (filters.money.includes('paid') && r.owed === 0) return true;
      if (filters.money.includes('ending') && r.attention?.kind === 'pack') return true;
      return false;
    });
  }

  if (filters.batch.length > 0) result = result.filter((r) => filters.batch.includes(r.batch));

  /* Last, so it narrows whatever the other three left rather than competing
     with them — a trainer who has pressed *Gone quiet* and then typed a name
     means both. */
  if (filters.focus) result = result.filter((r) => matchesFocus(r, filters.focus!));

  return result;
}
