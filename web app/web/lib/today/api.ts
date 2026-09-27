import 'server-only';

import { cache } from 'react';

import { api, ApiError, listAll, type ListEnvelope } from '@/lib/http/client';
import { listRecentNudges } from '@/lib/nudges/api';
import { COOLDOWN_DAYS, lastContactMap } from '@/lib/nudges/cooldown';

import {
  bookableClients, DEAD_SESSION, sessionMinutes,
  type RosterClientRow, type RosterPackRow, type RosterProgramRow,
} from '@/lib/schedule/roster';
import type { BookSession } from '@/lib/schedule/session';

import {
  ACTIVITY_DAYS, buildDeck, staleOpenLogs,
  type Deck, type DeckInput, type DeckWorkout,
} from './deck';
import { DAY_MS } from './time';
import type { RateSource, WorkWindow } from './day';

/**
 * Everything Today needs from the backend — the v1 wire, api-contract.html
 * *Today*: ten reads, all in parallel, none conditional.
 *
 * What changed from the pre-v1 build, and why this file is mostly adaptation:
 *
 *   · There is no `workout_session` in v1. A session's log IS the scheduled
 *     session row (`startedAt` / `endedAt`), and its live set count rides on the
 *     row (`log`), so the old second round-trip for the running session's sets is
 *     gone. The deck still speaks of "workouts"; they are built here from the
 *     session rows that have a log, keyed by the SESSION id (R2).
 *   · The two unbounded reads are gone. `GET /v1/workouts` (every log ever, for
 *     *gone quiet* and *100th session*) became `stats` on the client summary, and
 *     `GET /v1/payments` (every payment ever, for "owed") became `amountDue` on
 *     the package plus the month summary. Payments are now a seven-day window for
 *     the activity feed alone.
 *   · The trainer's gym share is per package (R3), so the per-session rate is
 *     worked out here from each client's newest package and `gymSharePercent` is
 *     always null.
 *
 * `deck.ts` stays a pure statement about the day; the translation lives here so
 * a wire change touches one file.
 */

/**
 * How far back `GET /v1/sessions` reaches. `missed` walks settled sessions and
 * `unmarked` looks back a week; a rule that reached further than the window would
 * silently return a shorter answer, which is the harder bug to see.
 */
export const SESSION_LOOKBACK_DAYS = 30;

/** Thrown for anything that is not a 2xx, so the page can tell 401 from 500. */
export class TodayApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'TodayApiError';
  }
}

/**
 * Every read goes through the common `api()` (`lib/http/client.ts`), which
 * adds the token and the web header, times out after 8 s — a `fetch` with no
 * timeout does not fail when a server stops answering, only when it refuses —
 * and logs request and response to the terminal and, in development, to the
 * browser console. The ten run in parallel, so the timeout is the ceiling for
 * the whole screen.
 */
async function get<T>(path: string): Promise<T> {
  try {
    return await api<T>(path);
  } catch (error) {
    // `requireToday` reads the status: 401 signs in again, null is unreachable.
    if (error instanceof ApiError) throw new TodayApiError(error.status);
    throw error;
  }
}

/**
 * Every item of a list read (1.1 R66): `{items}`, and for a paged read (L4, L9,
 * L10) the Next server follows `nextCursor` before drawing — on a solo
 * trainer's book it never has to at these limits, but nothing is dropped if it
 * does.
 */
function items<T>(path: string): Promise<T[]> {
  return listAll<T>(path, (p) => get<ListEnvelope<T>>(p));
}

/** For the reads the contract lets fail silently (L9, L10): they become empty. */
async function itemsOr<T>(path: string): Promise<T[]> {
  try {
    return await listAll<T>(path);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------ wire shapes ──
 * Named after the Java records they come from, so a change there is greppable
 * from here. Fields the screen does not read are left out on purpose.
 * -------------------------------------------------------------------------- */

/** L1 · `MeService.MeResponse`. */
interface MeWire {
  id: string;
  name: string | null;
  phone: string | null;
  /** Epoch ms since 1.1; null until setup is done. */
  setupCompletedAt: number | null;
  gymName: string | null;
  workspace: { id: string; name: string; currency: string; country: string; timezone: string };
}

/** L2 · `WorkingHoursService.WorkingHourResponse` — weekday 1 = Monday. */
interface WorkingHourWire {
  id: string;
  weekday: number;
  start: string;
  end: string;
}

/** L3 · `ClientSummaryService.ClientSummary`. */
interface ClientWire {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  pausedUntil: string | null;
  membershipStatus: string;
  clientType: string;
  hasPinnedNote: boolean;
  /** Never null on the wire (a trigger makes one per client); `version` is its If-Match. */
  schedule: { sessionsPerWeek: number | null; sessionDurationMinutes: number | null; deliveryMode: string | null; version: string | null } | null;
  slots: { id: string; weekday: number; start: string; durationMinutes: number | null; deliveryMode: string | null }[];
  program: { id: string; name: string; weeks: number; days: number; startDate: string | null; endDate: string | null } | null;
  stats: { sessionsDone: number; lastDoneAt: number | null; nextSessionAt: number | null; missedStreak: number };
}

/** L4 · `SessionReadService.SessionRow`. */
interface SessionWire {
  id: string;
  clientId: string;
  scheduledAt: number;
  endsAt: number;
  durationMinutes: number;
  status: string;
  deliveryMode: string | null;
  notes: string | null;
  slotId: string | null;
  workout: { id: string; name: string; programId: string | null; week: number | null; day: number | null } | null;
  startedAt: number | null;
  endedAt: number | null;
  /** `volumeKg` is a JSON number since 1.1 (only money is a string). */
  log: { exercises: number; setsDone: number; volumeKg: number; lastSetAt: number | null } | null;
  charge: { packageId: string } | null;
  updatedAt: number;
  version: string;
}

/** L5 · `PackageReadService.CurrentPackage`. Money is a decimal string. */
interface PackageWire {
  id: string;
  clientId: string;
  name: string;
  service: string;
  basis: 'sessions' | 'period';
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: string;
  discountAmount: string | null;
  endDate: string | null;
  dueDate: string | null;
  status: string;
  pausedAt: number | null;
  trainerSharePercent: string | null;
  trainerShareAmount: string | null;
  amountPaid: string;
  amountRefunded: string;
  amountDue: string;
  createdAt: number;
}

/**
 * L6 · `MoneySummaryService.Summary` — the one shape, shared with Business
 * (R65). Months come oldest first; `now` is as of today, not the span.
 */
interface MoneySummaryWire {
  currency: string;
  months: {
    month: string; billed: string; collected: string; gymCut: string;
    yours: string; writtenOff: string; refunded: string;
    packagesSold: number; paymentsCount: number;
  }[];
  total: { billed: string; trendPercent: number | null };
  now: { pending: string; overdue: string; clientsOwing: number; clientsOverdue: number };
}

/** L7 · `PackageReadService.PaymentRow` — a page of the ledger, the fields Today reads. */
interface PaymentWire {
  id: string;
  clientId: string;
  packageId: string;
  clientName: string;
  packageName: string;
  amount: string;
  method: string | null;
  status: string;
  reference: string | null;
  paidAt: number | null;
  bookAt: number;
  createdAt: number;
}

/** L7's envelope: the ledger always says its currency. */
interface LedgerWire {
  currency: string;
  items: PaymentWire[];
  nextCursor: string | null;
}

/** L8 · `AttentionDismissalService.DismissalResponse` — keyed by client + kind, no id (R1). */
interface DismissalWire {
  clientId: string;
  kind: string;
  band: string;
  snoozedUntil: number | null;
}

/** L10 · one `AssessmentListService.Item`, the fields Today reads. */
interface AssessmentWire {
  id: string; clientId: string; name: string; dueOn: string; state: string;
}

/** Money arrives as a decimal string; a figure that became NaN would print as ₹NaN. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `"06:30"` → 390. */
function minuteOf(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** `yyyy-MM-dd` for a local-calendar instant on the Next server. */
function isoDate(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* ------------------------------------------------------------------- the day */

/**
 * What `Renew` repeats. The v1 renew call copies the terms on the server and
 * needs only `packageId`; the rest stays until the write moves over.
 */
export interface RenewTerms {
  packageId: string;
  type: string;
  amount: number;
  sessionsTotal: number | null;
}

/** The earliest assessment a client owes today or earlier (L10). */
export interface OwedAssessment {
  id: string;
  clientId: string;
  name: string;
  dueOn: string;
  missed: boolean;
}

export interface TodayData {
  deck: Deck;
  trainer: {
    name: string;
    phone: string | null;
    gymName: string | null;
    /** Always null in v1 — the share is per package (R3). Kept for the day ribbon's type. */
    gymSharePercent: number | null;
    setupComplete: boolean;
  };
  /** The active workspace — currency and the clock every date on the screen is read in. */
  workspace: MeWire['workspace'];
  hours: WorkWindow[];
  rates: RateSource;
  /**
   * What the booking panel Today opens in place needs — derived from rows this
   * file already fetched, through `lib/schedule/roster.ts` so the schedule and
   * Today cannot disagree about who may be booked.
   */
  book: {
    clients: ReturnType<typeof bookableClients>;
    /** The whole fetched window, not just today — see `BookPanel.sessions`. */
    sessions: BookSession[];
  };
  /** clientId → the terms of their most recent pack, for the queue's `Renew`. */
  renewTerms: Record<string, RenewTerms>;
  /** clientId → the session ids whose open logs that client's `Close` will end. */
  openLogs: Record<string, string[]>;
  /** clientId → when they were last messaged, inside the cooldown window. */
  lastContact: Record<string, number>;
  /**
   * clientId → the earliest assessment they owe (L10). Read now so the hero's
   * *Assessment due* chip and the queue's assessment-due row have their data;
   * neither is drawn yet.
   */
  assessments: Record<string, OwedAssessment>;
  /** The instant the server derived this from. The browser ticks on from it. */
  now: number;
}

/**
 * `cache()` so the page and its metadata make one round of requests, not two.
 * It is a REQUEST cache: the next load re-reads the day.
 */
export const getToday = cache(async (): Promise<TodayData> => {
  const now = Date.now();

  /*
   * The window, as dates. The server resolves the day boundary from the
   * workspace's timezone (R8), but the dates themselves are picked here, on a
   * server whose zone may not be the trainer's — so each end is widened by a
   * day and the deck, which works in instants, ignores the slack.
   *
   * Thirty days back is what `missed` and `unmarked` need; `to` is exclusive and
   * must cover the whole of tomorrow.
   */
  const today = isoDate(now);
  const sessionsFrom = isoDate(now - (SESSION_LOOKBACK_DAYS + 1) * DAY_MS);
  const sessionsTo = isoDate(now + 3 * DAY_MS);
  const paymentsFrom = isoDate(now - ACTIVITY_DAYS * DAY_MS);

  const [
    me,
    hours,
    clients,
    sessions,
    packages,
    money,
    payments,
    dismissals,
    nudges,
    assessments,
  ] = await Promise.all([
    get<MeWire>('/v1/me'),
    items<WorkingHourWire>('/v1/working-hours'),
    items<ClientWire>('/v1/clients?view=summary'),
    items<SessionWire>(`/v1/sessions?from=${sessionsFrom}&to=${sessionsTo}`),
    items<PackageWire>('/v1/packages?scope=current'),
    get<MoneySummaryWire>('/v1/money/summary?months=2'),
    // The feed shows twenty rows, so this one page is the whole answer — the
    // cursor is not followed (L7).
    get<LedgerWire>(`/v1/payments?status=paid&from=${paymentsFrom}&limit=20`),
    items<DismissalWire>('/v1/attention/dismissals'),
    // L9 and L10 are the only reads allowed to fail silently: losing either
    // degrades the queue's ranking or a chip, never the screen.
    listRecentNudges(COOLDOWN_DAYS),
    itemsOr<AssessmentWire>(`/v1/assessments?state=booked,missed&dueBy=${today}&limit=500`),
  ]);

  const clientRows = clients ?? [];
  const sessionRows = sessions ?? [];
  const packageRows = packages ?? [];

  /*
   * A logged session is the deck's "workout". Keyed by the session id, because
   * in v1 that IS the log's id — `/sessions/{id}` opens it.
   */
  const workouts: DeckWorkout[] = sessionRows
    .filter((s) => s.startedAt !== null)
    .map((s) => ({
      id: s.id,
      clientId: s.clientId,
      programId: s.workout?.programId ?? undefined,
      scheduledSessionId: s.id,
      sessionDate: isoDate(s.startedAt!),
      createdAt: s.startedAt!,
      endedAt: s.endedAt,
      setsDone: s.log?.setsDone ?? 0,
      volumeKg: num(s.log?.volumeKg),
      lastSetAt: s.log?.lastSetAt ?? null,
    }));

  const input: DeckInput = {
    clients: clientRows.map((c) => ({
      id: c.id,
      name: c.name ?? '',
      status: c.status,
      deliveryMode: c.schedule?.deliveryMode ?? null,
      metadata: null,
      hasNote: c.hasPinnedNote,
      lastDoneAt: c.stats.lastDoneAt,
      sessionsDone: c.stats.sessionsDone,
      // The server's streak over the whole history (L3), not one walked from
      // L4's 30-day window, which would cut off an older streak.
      missedStreak: c.stats.missedStreak,
    })),
    sessions: sessionRows.map((s) => ({
      id: s.id,
      clientId: s.clientId,
      programId: s.workout?.programId ?? undefined,
      scheduledAt: s.scheduledAt,
      durationMinutes: s.durationMinutes,
      status: s.status,
      dayLabel: s.workout?.name,
      templateDay: s.workout?.day ?? undefined,
      deliveryMode: s.deliveryMode,
      notes: s.notes,
      week: s.workout?.week ?? undefined,
    })),
    workouts,
    // The live set counts ride on the session rows now (`DeckWorkout.setsDone`).
    setLogs: [],
    programs: clientRows
      .filter((c) => c.program !== null)
      .map((c) => ({
        id: c.program!.id,
        clientId: c.id,
        name: c.program!.name,
        startDate: c.program!.startDate ?? undefined,
        endDate: c.program!.endDate ?? undefined,
        status: 'active',
        weeks: c.program!.weeks,
      })),
    packages: packageRows.map((p) => ({
      id: p.id,
      clientId: p.clientId,
      sessionsTotal: p.sessionsTotal,
      sessionsRemaining: p.sessionsRemaining,
      amount: num(p.amount),
      status: p.status,
      updatedAt: p.createdAt,
      endDate: p.endDate,
      pausedAt: p.pausedAt,
      amountDue: num(p.amountDue),
      dueDate: p.dueDate,
      service: p.service,
    })),
    payments: (payments?.items ?? []).map((p) => ({
      id: p.id,
      clientId: p.clientId,
      amount: num(p.amount),
      method: p.method ?? undefined,
      status: p.status,
      upiReference: p.reference ?? undefined,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    })),
    dismissals: (dismissals ?? []).map((d) => ({
      // No id on the wire (R1): the row is addressed by client + kind.
      id: `${d.clientId}:${d.kind}`,
      clientId: d.clientId,
      kind: d.kind,
      band: d.band,
      snoozedUntil: d.snoozedUntil,
    })),
    nudges: (nudges ?? []).map((n) => ({ clientId: n.clientId, sentAt: n.sentAt })),
    // The deck reads newest month first; 1.1 sends oldest first. Pending and
    // clients owing are "right now" figures (`now`), the same on every month.
    moneySummary: [...(money?.months ?? [])].reverse().map((m) => ({
      month: m.month,
      billed: num(m.billed),
      collected: num(m.collected),
      gymCut: num(m.gymCut),
      yours: num(m.yours),
      pending: num(money?.now?.pending),
      clientsOwing: money?.now?.clientsOwing ?? 0,
    })),
  };

  const deck = buildDeck(input, now);

  /*
   * The per-session rate, per client, from their NEWEST package whatever its
   * status: a client whose pack ran out yesterday still has an agreed price.
   * The trainer's share is the package's own (R3) — a percentage, or a flat
   * amount spread over the sessions — and a package with no share is wholly the
   * trainer's. A period pack has no per-session rate: a month's fee is not
   * attributable to one hour of it.
   */
  const newest = new Map<string, PackageWire>();
  for (const p of packageRows) {
    const seen = newest.get(p.clientId);
    if (!seen || p.createdAt > seen.createdAt) newest.set(p.clientId, p);
  }
  const perSession = new Map<string, number>();
  const renewTerms: Record<string, RenewTerms> = {};
  for (const [clientId, p] of newest) {
    const amount = num(p.amount);
    const count = p.basis === 'sessions' ? p.sessionsTotal ?? 0 : 0;
    if (amount > 0 && count > 0) {
      const rate = p.trainerSharePercent !== null
        ? (amount / count) * (num(p.trainerSharePercent) / 100)
        : p.trainerShareAmount !== null
          ? num(p.trainerShareAmount) / count
          : amount / count;
      perSession.set(clientId, Math.round(rate));
    }
    if (amount > 0) {
      renewTerms[clientId] = { packageId: p.id, type: p.basis, amount, sessionsTotal: p.sessionsTotal };
    }
  }

  /* The same rule the queue's row was raised by, so Close never reaches a log the row did not count. */
  const openLogs: Record<string, string[]> = {};
  for (const [clientId, logs] of staleOpenLogs(input, now)) {
    openLogs[clientId] = logs.map((l) => l.workoutId);
  }

  /*
   * The booking form's two lists, derived rather than fetched. The sessions are
   * the whole window, because `suggestClients` ranks the roster on *trains around
   * this hour on Thursdays* and one day of rows cannot say that about anybody.
   */
  const rosterRows: RosterClientRow[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name ?? '',
    status: c.status,
    membershipStatus: c.membershipStatus,
    deliveryMode: c.schedule?.deliveryMode ?? null,
    metadata: null,
    sessionDurationMinutes: c.schedule?.sessionDurationMinutes ?? null,
    sessionsPerWeek: c.schedule?.sessionsPerWeek ?? null,
  }));
  const rosterPrograms: RosterProgramRow[] = input.programs.map((p) => ({
    id: p.id, clientId: p.clientId, name: p.name, status: p.status,
  }));
  const rosterPacks = new Map<string, RosterPackRow>(
    [...newest].map(([clientId, p]) => [clientId, {
      sessionsTotal: p.sessionsTotal, sessionsRemaining: p.sessionsRemaining,
    }]),
  );
  const clientById = new Map(clientRows.map((c) => [c.id, c]));
  const book = {
    clients: bookableClients(rosterRows, rosterPrograms, rosterPacks),
    sessions: sessionRows.map((s): BookSession => ({
      id: s.id,
      clientId: s.clientId,
      clientName: clientById.get(s.clientId)?.name?.trim() || 'Client',
      at: s.scheduledAt,
      minutes: sessionMinutes(
        s.durationMinutes,
        clientById.get(s.clientId)?.schedule?.sessionDurationMinutes,
      ),
      dead: DEAD_SESSION.has((s.status ?? '').toLowerCase()),
    })),
  };

  /* Only the earliest owed assessment per client is used (L10). */
  const owed: Record<string, OwedAssessment> = {};
  for (const a of assessments) {
    const seen = owed[a.clientId];
    if (!seen || a.dueOn < seen.dueOn) {
      owed[a.clientId] = {
        id: a.id, clientId: a.clientId, name: a.name, dueOn: a.dueOn, missed: a.state === 'missed',
      };
    }
  }

  return {
    deck,
    trainer: {
      name: me?.name ?? '',
      phone: me?.phone ?? null,
      gymName: me?.gymName ?? null,
      gymSharePercent: null,
      // `setupCompletedAt: null` is the redirect signal — the contract's
      // timestamp, not the old boolean.
      setupComplete: me?.setupCompletedAt != null,
    },
    workspace: me.workspace,
    // The wire's weekday is 1 = Monday; the ribbon's `WorkWindow` is 0 = Monday.
    hours: (hours ?? []).map((h) => ({
      weekday: h.weekday - 1,
      startMinute: minuteOf(h.start),
      endMinute: minuteOf(h.end),
    })),
    rates: { perSession, gymSharePercent: null },
    book,
    renewTerms,
    openLogs,
    lastContact: Object.fromEntries(lastContactMap(nudges)),
    assessments: owed,
    now,
  };
});
