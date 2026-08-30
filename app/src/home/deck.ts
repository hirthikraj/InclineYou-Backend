/**
 * The deck — everything screen 03 shows, derived from local tables.
 *
 * Pure by design: `now` and every row set come in as arguments, nothing here
 * touches the database or the clock. Same reasoning as `clientStatusRules` —
 * the rules that decide what a trainer sees first thing in the morning are the
 * part of this app most worth being able to read in one sitting.
 *
 * The order of the modules is the finding the teardown produced: a trainer's
 * home is a to-do list, not a report. What's next, where the day stands, who
 * needs chasing, the schedule, the money, what happened. No chart until the
 * day is over, and no greeting at all.
 */

import type { TagTone } from '../design';
import { readMode, type DeliveryMode } from './mode';
import {
  DAY_MS,
  clockParts,
  daysBetween,
  monthName,
  relativeMinutes,
  rupees,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from './time';

/* --------------------------------------------------------------- thresholds
 * § 06: vague statuses lose to explicit ones. Every number a trainer reads on
 * this screen — "9 days", "2 sessions" — comes from one of these, and the copy
 * always states the number rather than calling it "low compliance".
 * -------------------------------------------------------------------------- */

/** A client with a live plan and no logged workout for this long needs a nudge. */
export const QUIET_DAYS = 7;
/** A session pack this close to empty is worth renewing before it runs out. */
export const PACK_ENDING = 2;
/** Money owed for longer than this stops being a reminder and becomes a problem. */
export const OVERDUE_DAYS = 7;
/** More than three alerts at the top of home and the whole module becomes wallpaper. */
export const ATTENTION_VISIBLE = 3;
/** How far back the activity feed and the "what happened" rules look. */
export const ACTIVITY_DAYS = 7;
/** A session stays "next" for this long after its start time before it's simply late. */
const NEXT_GRACE_MS = 90 * 60_000;

/* ------------------------------------------------------- the attention model
 * One table, read by two screens.
 *
 * This screen and the roster (`clients/roster.ts`) both answer "who needs the
 * trainer", and for a while they answered it differently: three kinds here
 * against six there, two weight scales, two strings for an empty pack, and two
 * rules about whether money that is not yet late counts at all. Same trainer,
 * same morning, two lists — and the same 2px severity bar on both, which is
 * what made the disagreement invisible.
 *
 * The division of labour now: **this file owns the model, both files own their
 * own selection.** A screen may legitimately not care about a band — Today has
 * no use for a stale invite, because an invite is not a thing that happens
 * today — but no screen may re-rank or re-word a band it does show.
 *
 * BANDS, not raw weights. A band is worth 1000 and the magnitude inside it is
 * clamped to 0…999, so an amount can order items within a band and can never
 * lift one out of it. That is the bug this replaces: the roster weighed overdue
 * money at `4000 + the rupees owed`, so any client owing more than ₹1,000
 * outranked the band the file's own comment called "ranked ABOVE money, and
 * deliberately".
 * -------------------------------------------------------------------------- */

/**
 * Every band, most urgent first. The order IS the design, so it is one list
 * rather than eight numbers scattered across two files.
 *
 *   unavailable   the phone number belongs to a trainer account, so no invite
 *                 can ever reach it. First because it is the only item that is
 *                 a mistake made seconds ago and fixable in seconds; every
 *                 other one became true over time and will still be true
 *                 tomorrow.
 *   setup         added, never onboarded. Nothing else about them can work:
 *                 the diary has no slot to suggest and the deck has no day to
 *                 build.
 *   overdue-late  money past OVERDUE_DAYS. A problem, not a reminder.
 *   pack-empty    they turn up and there is nothing to draw down. Critical for
 *                 the same reason as late money: it stops the work.
 *   quiet         a live plan and nothing logged for QUIET_DAYS. A relationship
 *                 going cold, which is slower than either of the two above.
 *   pack-ending   one or two sessions left. Worth selling before it bites.
 *   due-soon      money owed and not yet late. Worth seeing, not worth chasing.
 *   invite-stale  they have not installed the app. Nothing is broken: a client
 *                 is fully usable without an invite, which is why this is last.
 */
export const ATTENTION_BANDS = [
  'unavailable',
  'setup',
  'overdue-late',
  'pack-empty',
  'quiet',
  'pack-ending',
  'due-soon',
  'invite-stale',
  /*
   * A workout log nobody closed.
   *
   * LAST, because it is the only band where nothing is at risk: the trainer
   * finished a session and left its log open, which costs nothing until it is
   * never fixed.
   *
   * ── PRESENT HERE, AND THIS SCREEN DOES NOT RAISE IT ──────────────────────
   *
   * The band lives in the model on both halves because the model is ONE TABLE —
   * "a screen may decline to show a band, and no screen may re-rank or re-word
   * one it does show". The web's Today raises it (`staleOpenLogs` in
   * `web app/web/lib/today/deck.ts`); home does not, and that is the declining
   * half of that rule rather than an omission. `ATTENTION_VISIBLE` is 3 here, so
   * the least urgent band on the ladder would almost never reach the screen, and
   * closing a log wants the desk it was left open on.
   *
   * APPENDED, never inserted. `BAND_VALUE` is `length - i`, so a band added at
   * the end shifts every value up by exactly one and leaves the relative order
   * untouched.
   */
  'log-open',
] as const;

export type AttentionBand = (typeof ATTENTION_BANDS)[number];

/** Bigger is more urgent, so the list is read from the bottom up. */
const BAND_VALUE: Record<AttentionBand, number> = ATTENTION_BANDS.reduce(
  (acc, band, i) => {
    acc[band] = ATTENTION_BANDS.length - i;
    return acc;
  },
  {} as Record<AttentionBand, number>,
);

/** Which bands are red rather than amber: the two that stop the work. */
const CRITICAL_BANDS = new Set<AttentionBand>(['overdue-late', 'pack-empty']);

export function attentionSeverity(band: AttentionBand): 'alert' | 'critical' {
  return CRITICAL_BANDS.has(band) ? 'critical' : 'alert';
}

/**
 * The sort key. `magnitude` orders items inside a band and is clamped, so it
 * cannot reach the band above — pass rupees through `moneyMagnitude` first.
 */
export function attentionWeight(band: AttentionBand, magnitude = 0): number {
  const inside = Math.max(0, Math.min(999, Math.round(magnitude)));
  return BAND_VALUE[band] * 1000 + inside;
}

/**
 * Rupees, as something that fits in a band. Hundreds, so ₹99,900 is the first
 * amount that saturates — above that two debts tie and the name breaks it,
 * which is the right failure: at a lakh owed the order stops being the point.
 */
export function moneyMagnitude(rupeesOwed: number): number {
  return rupeesOwed / 100;
}

/* One phrasing per fact. Both screens call these rather than writing their own,
 * because "Pack is empty" here and "Pack finished" there described the same
 * package and gave a trainer no way to know it. */

export function moneyLine(total: number, days: number, late: boolean): string {
  return `${rupees(total)} ${late ? 'overdue' : 'due'} · ${days} day${days === 1 ? '' : 's'}`;
}

export function packLine(remaining: number): string {
  return remaining <= 0
    ? 'Pack is empty'
    : `Pack ends in ${remaining} session${remaining === 1 ? '' : 's'}`;
}

export function quietLine(days: number): string {
  return `No workout logged in ${days} days`;
}

/**
 * `Log still open · finished today` · `2 logs still open · oldest 9 days ago`.
 *
 * Home does not raise `log-open` (see the band's note), but the PHRASING lives
 * here anyway, for the reason this whole block exists: "Pack is empty" here and
 * "Pack finished" there described the same package and gave a trainer no way to
 * know it. The day home starts raising the row, it must not invent a second
 * sentence for it.
 */
export function logLine(count: number, days: number): string {
  const age = days <= 0 ? 'finished today' : `${days} day${days === 1 ? '' : 's'} ago`;
  return count === 1 ? `Log still open · ${age}` : `${count} logs still open · oldest ${age}`;
}

/** The band money sits in, given how old the oldest unpaid invoice is. */
export function moneyBand(days: number, flaggedOverdue: boolean): AttentionBand {
  return flaggedOverdue || days >= OVERDUE_DAYS ? 'overdue-late' : 'due-soon';
}

/** The band a pack sits in, or null when it has enough left to be nobody's problem. */
export function packBand(remaining: number): AttentionBand | null {
  if (remaining <= 0) return 'pack-empty';
  return remaining <= PACK_ENDING ? 'pack-ending' : null;
}

const DONE_SESSION = new Set(['done', 'completed']);
const DEAD_SESSION = new Set(['cancelled', 'canceled', 'no_show']);
const DUE_PAYMENT = new Set(['pending', 'due', 'unpaid', 'overdue']);
const PAID_PAYMENT = new Set(['paid', 'settled', 'received']);
const DEAD_PACKAGE = new Set(['cancelled', 'canceled', 'completed', 'expired', 'refunded']);
const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

/* -------------------------------------------------------------------- input */

export interface DeckClient {
  id: string;
  name: string;
  status: string;
  deliveryMode?: string | null;
  metadata?: unknown;
}
export interface DeckScheduled {
  id: string;
  clientId: string;
  programId?: string;
  scheduledAt: Date | number;
  durationMinutes?: number;
  status: string;
  dayLabel?: string;
  templateDay?: number;
  deliveryMode?: string | null;
}
export interface DeckWorkout {
  id: string;
  clientId: string;
  programId?: string;
  scheduledSessionId?: string;
  sessionDate: string;
  createdAt: Date | number;
  /** V13 — set when the trainer closed the log. Absent means still open. */
  endedAt?: Date | number | null;
}
export interface DeckSetLog {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  loadKg?: number;
  reps?: number;
  createdAt: Date | number;
}
export interface DeckProgram {
  id: string;
  clientId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status: string;
}
export interface DeckPackage {
  id: string;
  clientId: string;
  sessionsRemaining?: number;
  status: string;
  /** Last decrement — which is the moment a pack became worth renewing. */
  updatedAt: Date | number;
}
export interface DeckPayment {
  id: string;
  clientId: string;
  amount: number;
  method?: string;
  status: string;
  upiReference?: string;
  /** The gym's cut, stored on the row at record time. */
  gymShareAmount?: number | null;
  paidAt?: Date | number;
  createdAt: Date | number;
}
export interface DeckMetric {
  id: string;
  clientId: string;
  metricType: string;
  value: number;
  unit?: string;
  recordedAt: Date | number;
}

export interface DeckInput {
  clients: DeckClient[];
  sessions: DeckScheduled[];
  workouts: DeckWorkout[];
  setLogs: DeckSetLog[];
  programs: DeckProgram[];
  packages: DeckPackage[];
  payments: DeckPayment[];
  metrics: DeckMetric[];
  /** Workout sessions known to contain a personal record. Computed separately. */
  prSessionIds?: Set<string>;
}

/* ------------------------------------------------------------------- output */

export interface DeckSession {
  id: string;
  clientId: string;
  clientName: string;
  /** Carried so Start can open the workout log already keyed to the plan. */
  programId?: string;
  templateDay?: number;
  at: number;
  time: string;
  meridiem: string;
  /** "Full Body B · Week 4/8" */
  detail: string;
  mode: DeliveryMode;
  done: boolean;
}

export type AttentionKind = 'overdue' | 'quiet' | 'pack' | 'log';

export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  clientId: string;
  clientName: string;
  /** States the number: "₹6,000 overdue · 11 days". */
  line: string;
  severity: 'alert' | 'critical';
  /** Remind · Nudge · Renew. */
  action: string;
  /** Sort key — bigger is more urgent. */
  weight: number;
  /** When the condition became true, so the notification centre can date it. */
  at: number;
}

export interface RunningSession {
  scheduledId: string;
  workoutId: string;
  clientId: string;
  clientName: string;
  programId?: string;
  templateDay?: number;
  startedAt: number;
  setsLogged: number;
  volumeKg: number;
  prs: number;
  /** The exercise of the most recent set — the hero's title, once resolved. */
  lastExerciseId?: string;
  lastSetAt?: number;
}

export interface DeckActivity {
  key: string;
  at: number;
  clientId: string;
  clientName: string;
  body: string;
  meta: string;
  tag?: { label: string; tone: TagTone };
  /** Where § 04 says the row goes: the thing that happened. */
  target: { kind: 'workout' | 'payment' | 'metric'; id: string };
}

export interface DeckMoney {
  monthLabel: string;
  billed: number;
  collected: number;
  pending: number;
  /** The trainer's part of the month's billing — billed minus the gym's cut. */
  yours: number;
  /** Month-on-month change in billing, null when there is no previous month. */
  trendPercent: number | null;
}

export interface DeckWeek {
  days: { label: string; value: number; on: boolean }[];
  delivered: number;
  /** Delivered as a share of everything scheduled this week. */
  percent: number;
}

export interface Deck {
  clientCount: number;
  /** The whole day, in order, including what is already done. */
  today: DeckSession[];
  todayDone: number;
  /** The hero when nothing is running: the next session that hasn't happened. */
  next: DeckSession | null;
  /** How far off it is — "starts in 34 min". */
  nextIn: string | null;
  /** The hero when a workout is being logged right now. */
  running: RunningSession | null;
  /** The hero once the day is over. */
  tomorrow: DeckSession | null;
  tomorrowCount: number;
  attention: AttentionItem[];
  collectedToday: number;
  pendingTotal: number;
  money: DeckMoney;
  activity: DeckActivity[];
  week: DeckWeek;
  /** True when the trainer has no clients at all — state 2a. */
  firstRun: boolean;
}

/* -------------------------------------------------------------------- rules */

const ms = (v: Date | number | undefined): number =>
  v === undefined ? 0 : v instanceof Date ? v.getTime() : Number(v);

const lower = (v: string | undefined): string => (v ?? '').toLowerCase();

function parseDay(value?: string): number | null {
  if (!value) return null;
  const t = Date.parse(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(t) ? null : t;
}

/**
 * "Full Body B · Week 4/8".
 *
 * The week counter is what turns a session into a position in a plan, and it
 * is the single most-repeated element in the design file's session rows. It
 * only appears when the program has real dates — a made-up week number is
 * worse than none.
 */
function sessionDetail(
  session: DeckScheduled,
  program: DeckProgram | undefined,
  at: number,
): string {
  const label = session.dayLabel?.trim() || program?.name?.trim() || 'Session';
  if (!program) return label;

  const start = parseDay(program.startDate);
  const end = parseDay(program.endDate);
  if (start === null) return label;

  const week = Math.floor((startOfDay(at) - startOfDay(start)) / (7 * DAY_MS)) + 1;
  if (week < 1) return label;
  if (end === null) return `${label} · Week ${week}`;

  const total = Math.max(1, Math.ceil((startOfDay(end) - startOfDay(start)) / (7 * DAY_MS)));
  return `${label} · Week ${Math.min(week, total)}/${total}`;
}

function toDeckSession(
  session: DeckScheduled,
  client: DeckClient | undefined,
  program: DeckProgram | undefined,
): DeckSession {
  const at = ms(session.scheduledAt);
  const { time, meridiem } = clockParts(at);
  return {
    id: session.id,
    clientId: session.clientId,
    clientName: client?.name?.trim() || 'Client',
    programId: session.programId,
    templateDay: session.templateDay,
    at,
    time,
    meridiem,
    detail: sessionDetail(session, program, at),
    mode: readMode({
      session: session.deliveryMode,
      client: client?.deliveryMode,
      metadata: client?.metadata,
    }),
    done: DONE_SESSION.has(lower(session.status)),
  };
}

/**
 * Who needs chasing, most urgent first.
 *
 * One row per client per kind, never two rows for the same client and reason —
 * a trainer who owes you money and hasn't logged a workout is two different
 * jobs, but three overdue invoices are one.
 */
function buildAttention(input: DeckInput, now: number): AttentionItem[] {
  const items: AttentionItem[] = [];
  const byId = new Map(input.clients.map((c) => [c.id, c]));

  // --- money owed ---
  const dueByClient = new Map<string, { total: number; oldest: number; overdue: boolean }>();
  for (const p of input.payments) {
    const status = lower(p.status);
    if (!DUE_PAYMENT.has(status)) continue;
    const at = ms(p.createdAt);
    const entry = dueByClient.get(p.clientId);
    if (entry) {
      entry.total += p.amount || 0;
      entry.oldest = Math.min(entry.oldest, at);
      entry.overdue = entry.overdue || status === 'overdue';
    } else {
      dueByClient.set(p.clientId, {
        total: p.amount || 0,
        oldest: at,
        overdue: status === 'overdue',
      });
    }
  }
  for (const [clientId, due] of dueByClient) {
    const client = byId.get(clientId);
    if (!client) continue;
    const days = Math.max(0, daysBetween(due.oldest, now));
    // Two bands, not a boolean: money owed is always worth seeing, and past
    // OVERDUE_DAYS it stops being a reminder. The roster used to withhold the
    // row entirely under seven days, which is how the same ₹9,000 could be an
    // item here and not one there.
    const band = moneyBand(days, due.overdue);
    items.push({
      key: `overdue:${clientId}`,
      kind: 'overdue',
      clientId,
      clientName: client.name?.trim() || 'Client',
      line: moneyLine(due.total, days, band === 'overdue-late'),
      severity: attentionSeverity(band),
      action: 'Remind',
      weight: attentionWeight(band, moneyMagnitude(due.total)),
      at: due.oldest,
    });
  }

  // --- gone quiet ---
  const lastWorkout = new Map<string, number>();
  for (const w of input.workouts) {
    const at = parseDay(w.sessionDate) ?? ms(w.createdAt);
    const seen = lastWorkout.get(w.clientId);
    if (seen === undefined || at > seen) lastWorkout.set(w.clientId, at);
  }
  const engaged = new Set<string>();
  for (const p of input.programs) if (!DEAD_PROGRAM.has(lower(p.status))) engaged.add(p.clientId);
  for (const p of input.packages) if (!DEAD_PACKAGE.has(lower(p.status))) engaged.add(p.clientId);

  for (const client of input.clients) {
    // Only clients who are actually training: a prospect with no plan and no
    // pack has not "gone quiet", they have not started.
    if (lower(client.status) !== 'active' || !engaged.has(client.id)) continue;
    const last = lastWorkout.get(client.id);
    if (last === undefined) continue;
    const days = daysBetween(last, now);
    if (days < QUIET_DAYS) continue;
    items.push({
      key: `quiet:${client.id}`,
      kind: 'quiet',
      clientId: client.id,
      clientName: client.name?.trim() || 'Client',
      line: quietLine(days),
      severity: attentionSeverity('quiet'),
      action: 'Nudge',
      weight: attentionWeight('quiet', days),
      // Dated from the moment they crossed the line, not from today, so the
      // notification centre doesn't re-announce it every morning.
      at: last + QUIET_DAYS * DAY_MS,
    });
  }

  // --- pack running out ---
  const fewest = new Map<string, { remaining: number; at: number }>();
  for (const pkg of input.packages) {
    if (DEAD_PACKAGE.has(lower(pkg.status))) continue;
    if (typeof pkg.sessionsRemaining !== 'number') continue;
    const seen = fewest.get(pkg.clientId);
    if (seen === undefined || pkg.sessionsRemaining < seen.remaining) {
      fewest.set(pkg.clientId, { remaining: pkg.sessionsRemaining, at: ms(pkg.updatedAt) });
    }
  }
  for (const [clientId, { remaining, at }] of fewest) {
    const band = packBand(remaining);
    if (!band) continue;
    const client = byId.get(clientId);
    if (!client) continue;
    items.push({
      key: `pack:${clientId}`,
      kind: 'pack',
      clientId,
      clientName: client.name?.trim() || 'Client',
      line: packLine(remaining),
      severity: attentionSeverity(band),
      action: 'Renew',
      // Fewer left is more urgent, inside whichever of the two pack bands it
      // landed in.
      weight: attentionWeight(band, PACK_ENDING - remaining),
      at,
    });
  }

  return items.sort((a, b) => b.weight - a.weight || a.clientName.localeCompare(b.clientName));
}

function buildRunning(
  input: DeckInput,
  today: DeckScheduled[],
  clientsById: Map<string, DeckClient>,
): RunningSession | null {
  // A session is running when the trainer has opened a workout log against it,
  // has not closed that log, and has not yet marked the scheduled session done.
  // There is no explicit "in progress" status in the schema, and inventing one
  // would mean a session could be left running forever by a phone that died
  // mid-set.
  //
  // The `ended_at` test is what makes screen 17's *Later* honest: finishing the
  // log and closing the money are two different facts, and a trainer who
  // finished the log but left the money for tomorrow should not still be told
  // they are mid-session.
  //
  // Not "the first unfinished session that happens to have a log" — an early
  // session left unmarked would then mask a later one that is genuinely under
  // way. The pair has to be found together.
  let live: DeckScheduled | undefined;
  let workout: DeckWorkout | undefined;
  for (const session of today) {
    const status = lower(session.status);
    if (DONE_SESSION.has(status) || DEAD_SESSION.has(status)) continue;
    const found = input.workouts.find((w) => w.scheduledSessionId === session.id && !w.endedAt);
    if (found) {
      live = session;
      workout = found;
      break;
    }
  }
  if (!live || !workout) return null;

  const logs = input.setLogs.filter((l) => l.workoutSessionId === workout.id);
  const volume = logs.reduce((sum, l) => sum + (l.loadKg || 0) * (l.reps || 0), 0);
  const latest = logs.reduce<DeckSetLog | null>(
    (best, l) => (best === null || ms(l.createdAt) > ms(best.createdAt) ? l : best),
    null,
  );

  return {
    scheduledId: live.id,
    workoutId: workout.id,
    clientId: live.clientId,
    clientName: clientsById.get(live.clientId)?.name?.trim() || 'Client',
    programId: live.programId,
    templateDay: live.templateDay,
    startedAt: ms(workout.createdAt),
    setsLogged: logs.length,
    volumeKg: Math.round(volume),
    prs: input.prSessionIds?.has(workout.id) ? 1 : 0,
    lastExerciseId: latest?.exerciseId,
    lastSetAt: latest ? ms(latest.createdAt) : undefined,
  };
}

function buildActivity(input: DeckInput, now: number): DeckActivity[] {
  const since = startOfDay(now) - (ACTIVITY_DAYS - 1) * DAY_MS;
  const byId = new Map(input.clients.map((c) => [c.id, c]));
  const out: DeckActivity[] = [];

  const setsByWorkout = new Map<string, DeckSetLog[]>();
  for (const l of input.setLogs) {
    const list = setsByWorkout.get(l.workoutSessionId);
    if (list) list.push(l);
    else setsByWorkout.set(l.workoutSessionId, [l]);
  }

  const sessionsById = new Map(input.sessions.map((s) => [s.id, s]));

  for (const w of input.workouts) {
    const at = ms(w.createdAt);
    if (at < since) continue;
    const client = byId.get(w.clientId);
    if (!client) continue;
    const logs = setsByWorkout.get(w.id) ?? [];
    const volume = Math.round(logs.reduce((sum, l) => sum + (l.loadKg || 0) * (l.reps || 0), 0));
    const label = w.scheduledSessionId
      ? sessionsById.get(w.scheduledSessionId)?.dayLabel?.trim()
      : undefined;
    const { time, meridiem } = clockParts(at);
    out.push({
      key: `workout:${w.id}`,
      at,
      clientId: w.clientId,
      clientName: client.name?.trim() || 'Client',
      body: label ? `finished ${label}` : 'logged a workout',
      meta: `${logs.length} set${logs.length === 1 ? '' : 's'}${volume > 0 ? ` · ${volume.toLocaleString('en-IN')} kg` : ''} · ${time} ${meridiem}`,
      tag: input.prSessionIds?.has(w.id) ? { label: 'PR', tone: 'pr' } : undefined,
      target: { kind: 'workout', id: w.id },
    });
  }

  for (const p of input.payments) {
    if (!PAID_PAYMENT.has(lower(p.status))) continue;
    const at = ms(p.paidAt) || ms(p.createdAt);
    if (at < since) continue;
    const client = byId.get(p.clientId);
    if (!client) continue;
    const { time, meridiem } = clockParts(at);
    const ref = p.upiReference?.trim();
    out.push({
      key: `payment:${p.id}`,
      at,
      clientId: p.clientId,
      clientName: client.name?.trim() || 'Client',
      body: `paid ${rupees(p.amount || 0)}`,
      meta: [p.method?.trim() || 'Payment', ref ? `ref ${ref}` : null, `${time} ${meridiem}`]
        .filter(Boolean)
        .join(' · '),
      tag: { label: 'Paid', tone: 'ok' },
      target: { kind: 'payment', id: p.id },
    });
  }

  // Body metrics, newest first per client, so a weight entry can be compared
  // against the one before it — "−1.2 kg in 3 weeks" is the whole point.
  const metricsByClient = new Map<string, DeckMetric[]>();
  for (const m of input.metrics) {
    const list = metricsByClient.get(m.clientId);
    if (list) list.push(m);
    else metricsByClient.set(m.clientId, [m]);
  }
  for (const [clientId, list] of metricsByClient) {
    const client = byId.get(clientId);
    if (!client) continue;
    const sorted = [...list].sort((a, b) => ms(b.recordedAt) - ms(a.recordedAt));
    for (let i = 0; i < sorted.length; i += 1) {
      const m = sorted[i];
      const at = ms(m.recordedAt);
      if (at < since) break;
      const previous = sorted.slice(i + 1).find((p) => p.metricType === m.metricType);
      const unit = m.unit?.trim() || '';
      const { time, meridiem } = clockParts(at);
      let meta = `${time} ${meridiem}`;
      if (previous) {
        const delta = m.value - previous.value;
        const weeks = Math.max(1, Math.round(daysBetween(ms(previous.recordedAt), at) / 7));
        const sign = delta > 0 ? '+' : '−';
        meta = `${sign}${Math.abs(delta).toFixed(1)} ${unit} in ${weeks} week${weeks === 1 ? '' : 's'} · ${meta}`;
      }
      out.push({
        key: `metric:${m.id}`,
        at,
        clientId,
        clientName: client.name?.trim() || 'Client',
        body: `logged ${m.value}${unit ? ` ${unit}` : ''}`,
        meta,
        target: { kind: 'metric', id: m.id },
      });
    }
  }

  return out.sort((a, b) => b.at - a.at);
}

function buildMoney(input: DeckInput, now: number): DeckMoney {
  const monthStart = startOfMonth(now);
  const previousStart = startOfMonth(monthStart - 1);

  let billed = 0;
  let collected = 0;
  let pending = 0;
  let cut = 0;
  let previous = 0;

  for (const p of input.payments) {
    const at = ms(p.createdAt);
    const amount = p.amount || 0;
    const status = lower(p.status);
    if (at >= monthStart) {
      billed += amount;
      cut += p.gymShareAmount ?? 0;
      if (PAID_PAYMENT.has(status)) collected += amount;
      else if (DUE_PAYMENT.has(status)) pending += amount;
    } else if (at >= previousStart) {
      previous += amount;
    }
  }

  return {
    monthLabel: monthName(now),
    billed,
    collected,
    pending,
    yours: Math.max(0, billed - cut),
    trendPercent: previous > 0 ? Math.round(((billed - previous) / previous) * 100) : null,
  };
}

function buildWeek(sessions: DeckScheduled[], now: number): DeckWeek {
  const weekStart = startOfWeek(now);
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const delivered = new Array(7).fill(0);
  let scheduled = 0;
  let done = 0;

  for (const s of sessions) {
    const at = ms(s.scheduledAt);
    const index = Math.floor((startOfDay(at) - weekStart) / DAY_MS);
    if (index < 0 || index > 6) continue;
    if (DEAD_SESSION.has(lower(s.status))) continue;
    scheduled += 1;
    if (DONE_SESSION.has(lower(s.status))) {
      delivered[index] += 1;
      done += 1;
    }
  }

  const todayIndex = Math.floor((startOfDay(now) - weekStart) / DAY_MS);
  return {
    days: labels.map((label, i) => ({ label, value: delivered[i], on: i === todayIndex })),
    delivered: done,
    percent: scheduled > 0 ? Math.round((done / scheduled) * 100) : 0,
  };
}

/* --------------------------------------------------------------------- deck */

export function buildDeck(input: DeckInput, now: number): Deck {
  const clientsById = new Map(input.clients.map((c) => [c.id, c]));
  const programsById = new Map(input.programs.map((p) => [p.id, p]));

  const dayStart = startOfDay(now);
  const dayEnd = dayStart + DAY_MS;

  const todayRaw = input.sessions
    .filter((s) => {
      const at = ms(s.scheduledAt);
      return at >= dayStart && at < dayEnd && !DEAD_SESSION.has(lower(s.status));
    })
    .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt));

  const today = todayRaw.map((s) =>
    toDeckSession(s, clientsById.get(s.clientId), s.programId ? programsById.get(s.programId) : undefined),
  );

  const tomorrowRaw = input.sessions
    .filter((s) => {
      const at = ms(s.scheduledAt);
      return at >= dayEnd && at < dayEnd + DAY_MS && !DEAD_SESSION.has(lower(s.status));
    })
    .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt));

  const running = buildRunning(input, todayRaw, clientsById);

  // The next session is the first one not yet done. It stays "next" for a
  // grace period after its start time — a trainer who is ten minutes late
  // still wants the same card, not the one after it.
  const next =
    running === null
      ? today.find((s) => !s.done && s.at + NEXT_GRACE_MS >= now) ?? null
      : null;

  const paidToday = input.payments
    .filter((p) => PAID_PAYMENT.has(lower(p.status)))
    .filter((p) => {
      const at = ms(p.paidAt) || ms(p.createdAt);
      return at >= dayStart && at < dayEnd;
    })
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const pendingTotal = input.payments
    .filter((p) => DUE_PAYMENT.has(lower(p.status)))
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const tomorrowFirst = tomorrowRaw[0];

  return {
    clientCount: input.clients.length,
    today,
    todayDone: today.filter((s) => s.done).length,
    next,
    nextIn: next ? relativeMinutes(next.at - now) : null,
    running,
    tomorrow: tomorrowFirst
      ? toDeckSession(
          tomorrowFirst,
          clientsById.get(tomorrowFirst.clientId),
          tomorrowFirst.programId ? programsById.get(tomorrowFirst.programId) : undefined,
        )
      : null,
    tomorrowCount: tomorrowRaw.length,
    attention: buildAttention(input, now),
    collectedToday: paidToday,
    pendingTotal,
    money: buildMoney(input, now),
    activity: buildActivity(input, now),
    week: buildWeek(input.sessions, now),
    firstRun: input.clients.length === 0,
  };
}
