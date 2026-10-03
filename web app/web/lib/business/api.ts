import 'server-only';

import { api, ApiError, listAll, type ListEnvelope } from '@/lib/http/client';
import { currentMonth, type Period } from '@/lib/money/period';

import {
  ledgerFilterParams,
  ledgerWindow,
  summaryQuery,
  type LedgerFilter,
  type LedgerPage,
  type LedgerRow,
  type MoneySummary,
  type OverviewData,
  type PickableClient,
  type PickablePackage,
  type SummaryMonth,
  type Arrangement,
  type GymMoney,
  type GymSettlement,
  type Payout,
  type Practice,
  gymQuery,
} from './types';

/**
 * EVERYTHING THE OVERVIEW AND THE LEDGER READ — api-contract v1.1 *Business*.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 *
 * `lib/money/api.ts`'s `getMoney()`: four requests that pulled every client,
 * every package and every payment the trainer had ever recorded into the Next
 * server so `compute.ts` could add them up. That is the unbounded read Today
 * already dropped. Here each figure is the server's own — a month summary, a
 * keyset-paged ledger, a bounded activity feed — and the pages hold a screenful
 * rather than the book.
 *
 * `lib/money/api.ts` is NOT deleted: Packages, Reports and the client file's
 * Payments still read through it, and they move in their own passes.
 *
 * ── THE FAILURE RULE ─────────────────────────────────────────────────────────
 *
 * Same as Today's: anything that is not a 2xx becomes a {@link BusinessApiError}
 * carrying the status, so a guard can tell a signed-out browser (401, back to
 * sign-in) from an unreachable server (null) from a refusal. One read is allowed
 * to fail silently — the practice report behind *Where the money comes from* —
 * because losing it degrades one section, never the page.
 */
export class BusinessApiError extends Error {
  constructor(
    readonly status: number | null,
    /** The server's `code` and its sentence — the writes read them, the guards do not. */
    readonly code: string | null = null,
    readonly detail: string | null = null,
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'BusinessApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  return send<T>(path);
}

/**
 * One call to the backend, any verb. Reads use it through {@link get}; the gym
 * page's writes use it directly, which is why a refusal carries the server's code
 * and sentence: a write has a cause the trainer can act on ("the gym already has
 * terms from that month") and a bare status cannot say it.
 */
export async function send<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  try {
    return await api<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new BusinessApiError(error.status, error.problem.code ?? null, error.problem.detail ?? null);
    }
    throw error;
  }
}

/* ------------------------------------------------------------ wire shapes ──
 * Named after the Java records they come from, fields the pages ignore left out.
 * -------------------------------------------------------------------------- */

interface MeWire {
  setupCompletedAt: number | null;
  gymName: string | null;
  workspace: { currency: string; timezone: string };
}

interface SummaryMonthWire {
  month: string; billed: string; collected: string; gymCut: string; yours: string;
  writtenOff: string; refunded: string; takeHome: string; packagesSold: number; paymentsCount: number;
}

interface SummaryWire {
  currency: string;
  months: SummaryMonthWire[];
  total: Omit<SummaryMonthWire, 'month'> & { trendPercent: number | null };
  now: { pending: string; overdue: string; clientsOwing: number; clientsOverdue: number };
}

interface LedgerRowWire {
  id: string; clientId: string; packageId: string; clientName: string; packageName: string;
  amount: string; collectedBy: 'trainer' | 'gym'; method: LedgerRow['method']; status: LedgerRow['status'];
  reference: string | null; note: string | null; bookAt: number;
  paidAt?: number | null; version?: string;
  split: { gym: string; trainer: string } | null;
}

interface LedgerWire { items: LedgerRowWire[]; nextCursor: string | null; total?: number }

interface ActivityWire {
  kind: 'paid' | 'sold' | 'write_off' | 'refund';
  at: number; clientId: string; clientName: string; amount: string;
  method?: string | null; packageId: string; packageName: string;
}

interface PackageWire {
  id: string; clientId: string; name: string; service: string;
  sessionsTotal: number | null; sessionsRemaining: number | null;
  amount: string; amountDue: string; dueDate: string | null; endDate: string | null;
  status: string; pausedAt: number | null; closedAt: number | null; createdAt: number;
  trainerSharePercent: string | null; trainerShareAmount: string | null;
}

interface ClientWire { id: string; name: string | null; status: string; clientType: string }

interface PracticeWire {
  months: { month: string; takeHome: string }[];
  headline: { takeHome: string };
  topClients: { clientId: string; clientName: string; sessions: number; collected: string; yours: string }[];
}

/* ----------------------------------------------------------------- parsing ── */

/** A decimal string to a number — the one place the conversion is made. */
function n(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function maybeN(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function month(m: SummaryMonthWire): SummaryMonth {
  return {
    month: m.month, billed: n(m.billed), collected: n(m.collected), gymCut: n(m.gymCut), yours: n(m.yours),
    writtenOff: n(m.writtenOff), refunded: n(m.refunded), takeHome: n(m.takeHome),
    packagesSold: m.packagesSold, paymentsCount: m.paymentsCount,
  };
}

function summary(w: SummaryWire): MoneySummary {
  const { month: _unused, ...total } = month({ ...w.total, month: '' });
  void _unused;
  return {
    currency: w.currency,
    months: w.months.map(month),
    total: { ...total, trendPercent: w.total.trendPercent ?? null },
    now: {
      pending: n(w.now.pending), overdue: n(w.now.overdue),
      clientsOwing: w.now.clientsOwing, clientsOverdue: w.now.clientsOverdue,
    },
  };
}

function ledgerRow(r: LedgerRowWire): LedgerRow {
  return {
    id: r.id, clientId: r.clientId, clientName: r.clientName, packageId: r.packageId, packageName: r.packageName,
    amount: n(r.amount), collectedBy: r.collectedBy, method: r.method, status: r.status,
    reference: r.reference, note: r.note, bookAt: r.bookAt, paidAt: r.paidAt ?? null, version: String(r.version ?? ''),
    split: r.split ? { gym: n(r.split.gym), trainer: n(r.split.trainer) } : null,
  };
}

/* ------------------------------------------------------------------ reads ── */

export async function getSummary(period: Period): Promise<MoneySummary> {
  return summary(await get<SummaryWire>(`/v1/money/summary?${summaryQuery(period)}`));
}

/**
 * One page of the ledger. `includeTotal` is one indexed COUNT, asked for on the
 * first page of a view only — Next and Previous do not need to re-count.
 */
export async function getLedgerPage(input: {
  period: Period;
  now: number;
  filter: LedgerFilter;
  cursor?: string | null;
  includeTotal?: boolean;
  limit?: number;
}): Promise<LedgerPage> {
  const { from, to } = ledgerWindow(input.period, input.now);
  const q = new URLSearchParams({ from, to, limit: String(input.limit ?? 50), ...ledgerFilterParams(input.filter) });
  if (input.cursor) q.set('cursor', input.cursor);
  if (input.includeTotal) q.set('includeTotal', 'true');
  const w = await get<LedgerWire>(`/v1/payments?${q}`);
  return { rows: (w.items ?? []).map(ledgerRow), nextCursor: w.nextCursor ?? null, total: w.total ?? null };
}

/** The record panel's client list: people a payment can be recorded for. */
export async function listPickableClients(): Promise<PickableClient[]> {
  const rows = await listAll<ClientWire>('/v1/clients?view=summary');
  return rows
    .filter((c) => c.status === 'active' || c.status === 'invited')
    .map((c) => ({
      id: c.id,
      name: c.name ?? 'Unnamed',
      clientType: c.clientType === 'gym' ? 'gym' : 'independent',
    }));
}

/**
 * The packages a payment can be recorded against: a running pack, or a finished
 * one that still owes. `amountDue` and the share are the server's — the panel
 * shows the SELECTED package's split from here and never from a trainer-wide
 * percentage, because on a gym package the trainer's cut varies with the price.
 */
export async function listPickablePackages(clientId: string): Promise<PickablePackage[]> {
  const rows = await listAll<PackageWire>(`/v1/packages?clientId=${encodeURIComponent(clientId)}`);
  return rows
    .filter((p) => p.status === 'active' || n(p.amountDue) > 0)
    .map((p) => ({
      id: p.id, name: p.name, service: p.service,
      sessionsTotal: p.sessionsTotal, sessionsRemaining: p.sessionsRemaining,
      amount: n(p.amount), amountDue: n(p.amountDue), status: p.status,
      trainerSharePercent: maybeN(p.trainerSharePercent),
      trainerShareAmount: maybeN(p.trainerShareAmount),
    }));
}

/* --------------------------------------------------------------- overview ── */

function todayIn(timezone: string, now: number): string {
  try {
    // `en-CA` formats as yyyy-MM-dd, which is the shape the wire wants.
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(now));
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

export async function getOverview(): Promise<{ data: OverviewData; setupComplete: boolean }> {
  const now = Date.now();

  const [me, period, year, activity, packages, clients, practice] = await Promise.all([
    get<MeWire>('/v1/me'),
    getSummary(currentMonth(now)),
    get<SummaryWire>('/v1/money/summary?months=12').then(summary),
    get<ListEnvelope<ActivityWire>>('/v1/money/activity?limit=8'),
    listAll<PackageWire>('/v1/packages?scope=current', (p) => get<ListEnvelope<PackageWire>>(p)),
    listAll<ClientWire>('/v1/clients?view=summary&status=all', (p) => get<ListEnvelope<ClientWire>>(p)),
    // The one read allowed to fail silently: it feeds *Where the money comes from* and nothing else.
    get<PracticeWire>('/v1/reports/practice?months=12').catch((e) => {
      if (e instanceof BusinessApiError && (e.status === 401 || e.status === 403)) throw e;
      return null;
    }),
  ]);

  const names: Record<string, string> = {};
  for (const c of clients) names[c.id] = c.name ?? 'Unnamed';

  return {
    setupComplete: me.setupCompletedAt !== null,
    data: {
      now,
      today: todayIn(me.workspace.timezone, now),
      currency: me.workspace.currency,
      hasGym: me.gymName !== null || year.total.gymCut > 0,
      period,
      year,
      activity: (activity.items ?? []).map((a, i) => ({
        id: `${a.kind}:${a.packageId}:${a.at}:${i}`,
        kind: a.kind, at: a.at, clientId: a.clientId, clientName: a.clientName,
        amount: n(a.amount), packageName: a.packageName,
      })),
      packages: packages.map((p) => ({
        id: p.id, clientId: p.clientId, name: p.name, service: p.service,
        sessionsTotal: p.sessionsTotal, sessionsRemaining: p.sessionsRemaining,
        amount: n(p.amount), amountDue: n(p.amountDue), dueDate: p.dueDate, endDate: p.endDate,
        status: p.status, pausedAt: p.pausedAt, closedAt: p.closedAt, createdAt: p.createdAt,
      })),
      names,
      topClients: practice
        ? {
            rows: practice.topClients.map((t) => ({
              clientId: t.clientId, name: t.clientName, yours: n(t.yours), sessions: t.sessions,
            })),
            totalYours: n(practice.headline.takeHome),
          }
        : null,
    },
  };
}

/**
 * What the ledger page opens on: the current month, all rows, with the count.
 *
 * Two one-row reads ride along, both on indexes, for two things a page of THIS
 * month cannot know: whether the trainer has *ever* recorded a payment (an
 * empty month and a brand-new book need different words), and whether any
 * client pays through a gym's desk (the *Gym share* chip is a filter over
 * exactly those rows, so it should exist whenever there is something to filter —
 * not only when the profile happens to carry a gym name).
 */
export async function getLedgerStart(): Promise<{
  now: number;
  hasGym: boolean;
  /** Any payment at all, in any period. */
  hasAnyPayments: boolean;
  setupComplete: boolean;
  summary: MoneySummary;
  page: LedgerPage;
}> {
  const now = Date.now();
  const period = currentMonth(now);
  const [me, sum, page, anyRow, gymRow] = await Promise.all([
    get<MeWire>('/v1/me'),
    getSummary(period),
    getLedgerPage({ period, now, filter: null, includeTotal: true }),
    get<LedgerWire>('/v1/payments?limit=1'),
    get<LedgerWire>('/v1/payments?clientType=gym&limit=1'),
  ]);
  return {
    now,
    hasGym: me.gymName !== null || sum.total.gymCut > 0 || (gymRow.items ?? []).length > 0,
    hasAnyPayments: (anyRow.items ?? []).length > 0,
    setupComplete: me.setupCompletedAt !== null,
    summary: sum,
    page,
  };
}

/* ---------------------------------------------------------------- gym share ── */

interface GymWire {
  currency: string;
  gymName: string | null;
  stats: {
    floorBilled: string; floorSessions: number; gymCut: string; gymCutPercent: number;
    remoteBilled: string; remoteSessions: number; yours: string;
  };
  shares: {
    packId: string | null; packName: string;
    trainerSharePercent: number | null; trainerShareAmount: string | null;
    gymSharePercent: number | null; gymShareAmount: string | null;
    sold: number; billed: string; trainerTake: string; gymCut: string;
  }[];
  settlement: {
    arrangement: ArrangementWire | null;
    months: {
      month: string; soFar: boolean; clients: number; yourShare: string; owed: string;
      received: string; balance: string | null;
    }[];
    balanceDue: string;
    recentPayouts: PayoutWire[];
  } | null;
}

export interface ArrangementWire {
  id: string; gymName: string; baseKind: 'minimum' | 'basic' | null; baseAmount: string;
  startsMonth: string; endsMonth: string | null; note: string | null; version: string;
}

export interface PayoutWire {
  id: string; amount: string; method: Payout['method']; reference: string | null;
  receivedAt: number; note: string | null;
}

export function parseArrangement(a: ArrangementWire): Arrangement {
  return {
    id: a.id, gymName: a.gymName, baseKind: a.baseKind, baseAmount: n(a.baseAmount),
    startsMonth: a.startsMonth, endsMonth: a.endsMonth, note: a.note, version: a.version,
  };
}

function payout(p: PayoutWire): Payout {
  return {
    id: p.id, amount: n(p.amount), method: p.method, reference: p.reference,
    receivedAt: p.receivedAt, note: p.note,
  };
}

function gymMoney(w: GymWire): GymMoney {
  const settlement: GymSettlement | null = w.settlement
    ? {
        arrangement: w.settlement.arrangement ? parseArrangement(w.settlement.arrangement) : null,
        months: w.settlement.months.map((m) => ({
          month: m.month, soFar: m.soFar, clients: m.clients, yourShare: n(m.yourShare),
          owed: n(m.owed), received: n(m.received), balance: m.balance === null ? null : n(m.balance),
        })),
        balanceDue: n(w.settlement.balanceDue),
        recentPayouts: w.settlement.recentPayouts.map(payout),
      }
    : null;
  return {
    currency: w.currency,
    gymName: w.gymName,
    stats: {
      floorBilled: n(w.stats.floorBilled), floorSessions: w.stats.floorSessions,
      gymCut: n(w.stats.gymCut), gymCutPercent: w.stats.gymCutPercent,
      remoteBilled: n(w.stats.remoteBilled), remoteSessions: w.stats.remoteSessions,
      yours: n(w.stats.yours),
    },
    shares: w.shares.map((s) => ({
      packId: s.packId, packName: s.packName,
      trainerSharePercent: s.trainerSharePercent, trainerShareAmount: maybeN(s.trainerShareAmount),
      gymSharePercent: s.gymSharePercent, gymShareAmount: maybeN(s.gymShareAmount),
      sold: s.sold, billed: n(s.billed), trainerTake: n(s.trainerTake), gymCut: n(s.gymCut),
    })),
    settlement,
  };
}

export async function getGymMoney(period: Period, now: number): Promise<GymMoney> {
  return gymMoney(await get<GymWire>(`/v1/money/gym?${gymQuery(period, now)}`));
}

/** What the gym page opens on: the current month, and whether there is anything to show. */
export async function getGymStart(): Promise<{
  now: number;
  setupComplete: boolean;
  gym: GymMoney;
}> {
  const now = Date.now();
  const [me, gym] = await Promise.all([get<MeWire>('/v1/me'), getGymMoney(currentMonth(now), now)]);
  return { now, setupComplete: me.setupCompletedAt !== null, gym };
}

/* ----------------------------------------------------------- practice report ── */

interface PracticeFullWire {
  currency: string;
  months: {
    month: string; delivered: number; noShows: number; cancelled: number; activeClients: number;
    newClients: number; archived: number; billed: string; collected: string; takeHome: string;
  }[];
  headline: {
    delivered: number; retentionPercent: number | null; busiestMonth: string | null;
    averageSessionsPerClientPerWeek: number | null; takeHome: string;
  };
  topClients: { clientId: string; clientName: string; sessions: number; collected: string; yours: string }[];
}

export async function getPractice(months = 12): Promise<Practice> {
  const w = await get<PracticeFullWire>(`/v1/reports/practice?months=${months}`);
  return {
    currency: w.currency,
    months: w.months.map((m) => ({
      month: m.month, delivered: m.delivered, noShows: m.noShows, cancelled: m.cancelled,
      activeClients: m.activeClients, newClients: m.newClients, archived: m.archived,
      billed: n(m.billed), collected: n(m.collected), takeHome: n(m.takeHome),
    })),
    headline: {
      delivered: w.headline.delivered,
      retentionPercent: w.headline.retentionPercent ?? null,
      busiestMonth: w.headline.busiestMonth ?? null,
      averageSessionsPerClientPerWeek: w.headline.averageSessionsPerClientPerWeek ?? null,
      takeHome: n(w.headline.takeHome),
    },
    topClients: w.topClients.map((t) => ({
      clientId: t.clientId, name: t.clientName, sessions: t.sessions,
      collected: n(t.collected), yours: n(t.yours),
    })),
  };
}

/** What the Reports page opens on: a year, and the clock the month cells are labelled against. */
export async function getReportsStart(): Promise<{
  now: number;
  setupComplete: boolean;
  practice: Practice;
}> {
  const now = Date.now();
  const [me, practice] = await Promise.all([get<MeWire>('/v1/me'), getPractice(12)]);
  return { now, setupComplete: me.setupCompletedAt !== null, practice };
}
