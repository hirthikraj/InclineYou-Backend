/**
 * Pure business logic for the money screen.
 *
 * No imports from api.ts — this file holds the arithmetic, api.ts holds the
 * wire, and a component can import either without pulling the other.
 */

import type { MoneyClient, MoneyPackage, MoneyPayment, MoneyTrainer } from './api';

export type { MoneyClient, MoneyPackage, MoneyPayment, MoneyTrainer };

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------------------------------------------ helpers */

export function isCollected(p: MoneyPayment): boolean {
  return p.status === 'paid' || p.status === 'confirmed';
}

export function isPending(p: MoneyPayment): boolean {
  return p.status === 'pending';
}

export function isWriteOff(p: MoneyPayment): boolean {
  return p.status === 'write_off';
}

/** Start of the Nth day of the month in epoch ms (1-based). */
export function monthBounds(year: number, month: number): { from: number; to: number } {
  const from = new Date(year, month - 1, 1).getTime();
  const to = new Date(year, month, 1).getTime();
  return { from, to };
}

/* `parseMonthSlug` and `monthSlug` lived here to serve `/business/[month]`. That
   segment is gone — the period is client state now, see `lib/money/period.ts` —
   and a slug nothing reads or writes is a slug that will drift. */

/** `Aug 2026` — for the page subtitle. */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS_SHORT[month - 1]} ${year}`;
}

/** `August 2026` — for card headings. */
export function monthLong(year: number, month: number): string {
  const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${LONG[month - 1]} ${year}`;
}

/**
 * Short name for a payment method as stored.
 *
 * `method` is free text in the column (V1, `VARCHAR(30)`), which is what let
 * *bank* be added without a migration — the brief's third mode is a bank
 * transfer, and Indian trainers are paid by all three plus the gym's counter.
 * The two `upi_intent` / `gym_front_office` spellings are V1's, still written by
 * the sync path's defaults, and are mapped here rather than migrated: the
 * schema law forbids repurposing a column, and a display name is not worth one.
 */
export function methodLabel(method: string | null): string {
  if (!method) return '—';
  if (method === 'upi' || method === 'upi_intent') return 'UPI';
  if (method === 'cash') return 'Cash';
  if (method === 'bank') return 'Bank transfer';
  if (method === 'gym' || method === 'gym_front_office') return 'Gym front office';
  return method;
}

/** Returns the three most recent months ending at (and including) the given year/month. */
export function recentMonths(year: number, month: number): Array<{ year: number; month: number; label: string }> {
  const result = [];
  for (let i = 2; i >= 0; i--) {
    let y = year;
    let m = month - i;
    if (m <= 0) { m += 12; y -= 1; }
    result.push({ year: y, month: m, label: MONTHS_SHORT[m - 1] });
  }
  return result;
}

/** Days since a payment was created. */
export function daysLate(payment: MoneyPayment, now: number): number {
  return Math.floor((now - payment.createdAt) / (86_400_000));
}

/* ----------------------------------------------------------------- ledger */

export interface LedgerRow {
  id: string;
  clientId: string;
  clientName: string;
  date: number; // createdAt
  method: string | null;
  collectedBy: string | null;
  amount: number;
  gymShareAmount: number | null;
  status: string;
  isWriteOff: boolean;
  packageId: string | null;
  upiReference: string | null;
  /** V11's free-text note. Null on every row written before REST selected it. */
  note: string | null;
}

export interface LedgerStats {
  billed: number;
  collected: number;
  gymShare: number;
  yours: number;
  billedCount: number;
  collectedCount: number;
  owedAmount: number;
  owedPercent: number;
  gymSharePercent: number | null;
}

/**
 * Every `compute*` that windows takes a half-open `[from, to)` rather than a
 * year and a month. That is the whole of what it took to let Business ask for a
 * span: the arithmetic never cared that the window was a calendar month, only
 * `monthBounds` did, and `lib/money/period.ts` now supplies the bounds.
 */
export function computeLedger(
  payments: MoneyPayment[],
  clients: MoneyClient[],
  range: { from: number; to: number },
): { stats: LedgerStats; rows: LedgerRow[] } {
  const { from, to } = range;
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  const monthPayments = payments.filter((p) => p.createdAt >= from && p.createdAt < to);

  const rows: LedgerRow[] = monthPayments
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => ({
      id: p.id,
      clientId: p.clientId,
      clientName: clientMap.get(p.clientId) ?? 'Unknown',
      date: p.createdAt,
      method: p.method,
      collectedBy: p.collectedBy,
      amount: p.amount,
      gymShareAmount: p.gymShareAmount,
      status: p.status,
      isWriteOff: isWriteOff(p),
      packageId: p.packageId,
      upiReference: p.upiReference,
      note: p.note,
    }));

  const billableRows = rows.filter((r) => !r.isWriteOff);
  const collectedRows = rows.filter((r) => isCollected({ status: r.status } as MoneyPayment));

  const billed = billableRows.reduce((s, r) => s + r.amount, 0);
  const collected = collectedRows.reduce((s, r) => s + r.amount, 0);
  const gymShare = collectedRows.reduce((s, r) => s + (r.gymShareAmount ?? 0), 0);
  const yours = collected - gymShare;
  const owedAmount = billed - collected;

  return {
    stats: {
      billed,
      collected,
      gymShare,
      yours,
      billedCount: billableRows.length,
      collectedCount: collectedRows.length,
      owedAmount,
      owedPercent: billed > 0 ? Math.round((owedAmount / billed) * 100) : 0,
      gymSharePercent: billed > 0 ? Math.round((gymShare / billed) * 100) : null,
    },
    rows,
  };
}

/* ------------------------------------------------------------------- owed */

export interface OwedRow {
  id: string;
  clientId: string;
  clientName: string;
  packageName: string;
  amount: number;
  /** When the invoice was raised — `daysLate` counted from here. */
  raisedAt: number;
  daysLate: number;
  isLate: boolean; // true if > 0 days since billing
  nudgeCount: number; // placeholder — we don't have this on the wire
  packageId: string | null;
}

export interface OwedStats {
  lateAmount: number;
  lateCount: number;
  dueAmount: number;
  dueCount: number;
  oldestDays: number;
  oldestClientName: string;
}

export function computeOwed(
  payments: MoneyPayment[],
  clients: MoneyClient[],
  packages: MoneyPackage[],
  now: number,
): { stats: OwedStats; rows: OwedRow[] } {
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));
  const packageMap = new Map(packages.map((p) => [p.id, p]));

  const pending = payments
    .filter((p) => isPending(p))
    .sort((a, b) => a.createdAt - b.createdAt); // oldest first

  const rows: OwedRow[] = pending.map((p) => {
    const pkg = p.packageId ? packageMap.get(p.packageId) : undefined;
    const packageName = pkg
      ? (pkg.type === 'single' ? 'Single session' : `${pkg.sessionsTotal ?? '?'}-session pack`)
      : 'Package';
    const days = daysLate(p, now);
    return {
      id: p.id,
      clientId: p.clientId,
      clientName: clientMap.get(p.clientId) ?? 'Unknown',
      packageName,
      amount: p.amount,
      raisedAt: p.createdAt,
      daysLate: days,
      isLate: days > 0,
      nudgeCount: 0,
      packageId: p.packageId,
    };
  });

  const lateRows = rows.filter((r) => r.isLate);
  const dueRows = rows.filter((r) => !r.isLate);

  const oldest = rows.reduce<OwedRow | null>((acc, r) => (acc === null || r.daysLate > acc.daysLate ? r : acc), null);

  return {
    stats: {
      lateAmount: lateRows.reduce((s, r) => s + r.amount, 0),
      lateCount: lateRows.length,
      dueAmount: dueRows.reduce((s, r) => s + r.amount, 0),
      dueCount: dueRows.length,
      oldestDays: oldest?.daysLate ?? 0,
      oldestClientName: oldest?.clientName ?? '',
    },
    rows,
  };
}

/* ---------------------------------------------------------------- packages */

export interface PackageSummary {
  name: string;
  amount: number;
  sessionsTotal: number | null;
  perSession: number | null;
  isMostSold: boolean;
  sold12mo: number;
  activeNow: number;
}

export function computePackages(
  packages: MoneyPackage[],
  now: number,
): { your: PackageSummary[] } {
  const twelveMonthsAgo = now - 365 * 86_400_000;

  // Group packages by (type, sessionsTotal, amount) to get unique price points
  const keyOf = (p: MoneyPackage) => `${p.type}|${p.sessionsTotal ?? 0}|${p.amount}`;
  const groups = new Map<string, MoneyPackage[]>();
  for (const p of packages) {
    const k = keyOf(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }

  let maxSold = 0;
  const summaries: PackageSummary[] = [];

  for (const [, group] of groups) {
    const rep = group[0];
    const name = rep.type === 'single' ? 'Single session' : `${rep.sessionsTotal ?? '?'}-session pack`;
    const sold12mo = group.filter((p) => p.createdAt >= twelveMonthsAgo).length;
    const activeNow = group.filter((p) => p.status === 'active').length;
    const perSession =
      rep.sessionsTotal && rep.sessionsTotal > 0 && rep.amount > 0
        ? Math.round(rep.amount / rep.sessionsTotal)
        : rep.type === 'single' && rep.amount > 0
        ? rep.amount
        : null;

    if (sold12mo > maxSold) maxSold = sold12mo;

    summaries.push({
      name,
      amount: rep.amount,
      sessionsTotal: rep.sessionsTotal,
      perSession,
      isMostSold: false,
      sold12mo,
      activeNow,
    });
  }

  // Mark most sold
  for (const s of summaries) {
    s.isMostSold = s.sold12mo > 0 && s.sold12mo === maxSold;
  }

  return {
    your: summaries.sort((a, b) => b.sold12mo - a.sold12mo),
  };
}

/* ---------------------------------------------------------------- gym share */

export interface GymShareRow {
  id: string;
  clientId: string;
  clientName: string;
  date: number;
  amount: number;
  gymShareAmount: number;
  yours: number;
  isFloor: boolean;
}

export interface GymShareStats {
  floorBilled: number;
  floorSessions: number;
  gymCut: number;
  gymCutPercent: number;
  remoteBilled: number;
  remoteSessions: number;
  yours: number;
}

export function computeGymShare(
  payments: MoneyPayment[],
  clients: MoneyClient[],
  trainer: MoneyTrainer,
  range: { from: number; to: number },
): { stats: GymShareStats; rows: GymShareRow[] } {
  const { from, to } = range;
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  const monthCollected = payments.filter(
    (p) => p.createdAt >= from && p.createdAt < to && isCollected(p),
  );

  const rows: GymShareRow[] = monthCollected.map((p) => {
    const gymCut = p.gymShareAmount ?? 0;
    const isFloor = gymCut > 0 || p.collectedBy === 'gym';
    return {
      id: p.id,
      clientId: p.clientId,
      clientName: clientMap.get(p.clientId) ?? 'Unknown',
      date: p.createdAt,
      amount: p.amount,
      gymShareAmount: gymCut,
      yours: p.amount - gymCut,
      isFloor,
    };
  });

  const floorRows = rows.filter((r) => r.isFloor);
  const remoteRows = rows.filter((r) => !r.isFloor);

  const floorBilled = floorRows.reduce((s, r) => s + r.amount, 0);
  const gymCut = floorRows.reduce((s, r) => s + r.gymShareAmount, 0);
  const remoteBilled = remoteRows.reduce((s, r) => s + r.amount, 0);

  return {
    stats: {
      floorBilled,
      floorSessions: floorRows.length,
      gymCut,
      gymCutPercent: trainer.gymSharePercent ?? 0,
      remoteBilled,
      remoteSessions: remoteRows.length,
      yours: floorBilled - gymCut + remoteBilled,
    },
    rows: rows.sort((a, b) => b.date - a.date),
  };
}

/* --------------------------------------------------------------------- gst */

/** Indian financial year: April (month 4) to March (month 3). */
export function financialYear(year: number, month: number): { fyStart: number; fyEnd: number; label: string } {
  // If month >= April, FY started this calendar year; else last year
  const fyYear = month >= 4 ? year : year - 1;
  const fyStart = new Date(fyYear, 3, 1).getTime(); // 1 Apr
  const fyEnd = new Date(fyYear + 1, 3, 1).getTime(); // 1 Apr next year
  return { fyStart, fyEnd, label: `${fyYear}–${String(fyYear + 1).slice(2)}` };
}

export interface GstMonthBar {
  year: number;
  month: number;
  label: string;
  amount: number;
}

export interface GstStats {
  rolling12mo: number;
  gstThreshold: number;
  headroom: number;
  monthsToThreshold: number | null;
  bestMonth: number;
  bestMonthLabel: string;
  fyLabel: string;
}

export function computeGst(
  payments: MoneyPayment[],
  now: number,
): { stats: GstStats; monthBars: GstMonthBar[] } {
  const GST_THRESHOLD = 2_000_000; // ₹20L

  // Rolling 12 months of TRAINER share from collected payments
  const rolling12Start = now - 365 * 86_400_000;
  const rolling12mo = payments
    .filter((p) => isCollected(p) && p.createdAt >= rolling12Start)
    .reduce((s, p) => s + (p.amount - (p.gymShareAmount ?? 0)), 0);

  // Financial year bars (April to March)
  const d = new Date(now);
  const { fyStart, fyEnd, label: fyLabel } = financialYear(d.getFullYear(), d.getMonth() + 1);

  const fyPayments = payments.filter(
    (p) => isCollected(p) && p.paidAt !== null && p.paidAt >= fyStart && p.paidAt < fyEnd,
  );

  // Build 12 monthly bars for the FY
  const monthBars: GstMonthBar[] = [];
  let barYear = new Date(fyStart).getFullYear();
  let barMonth = 4; // April = month 4

  for (let i = 0; i < 12; i++) {
    const { from: mFrom, to: mTo } = monthBounds(barYear, barMonth);
    const monthTotal = fyPayments
      .filter((p) => (p.paidAt ?? 0) >= mFrom && (p.paidAt ?? 0) < mTo)
      .reduce((s, p) => s + (p.amount - (p.gymShareAmount ?? 0)), 0);

    monthBars.push({
      year: barYear,
      month: barMonth,
      label: MONTHS_SHORT[barMonth - 1],
      amount: monthTotal,
    });

    barMonth++;
    if (barMonth > 12) { barMonth = 1; barYear++; }
  }

  const headroom = Math.max(0, GST_THRESHOLD - rolling12mo);
  const avgMonth = rolling12mo / 12;
  const monthsToThreshold = avgMonth > 0 && rolling12mo < GST_THRESHOLD
    ? Math.ceil(headroom / avgMonth)
    : null;

  const best = monthBars.reduce((a, b) => (b.amount > a.amount ? b : a), monthBars[0] ?? { year: 0, month: 0, label: '', amount: 0 });

  return {
    stats: {
      rolling12mo,
      gstThreshold: GST_THRESHOLD,
      headroom,
      monthsToThreshold,
      bestMonth: best.amount,
      bestMonthLabel: `${best.label} ${best.year}`,
      fyLabel,
    },
    monthBars,
  };
}

/* --------------------------------------------------------------- write-offs */

export interface WriteOffRow {
  id: string;
  clientId: string;
  clientName: string;
  date: number;
  amount: number;
  packageId: string | null;
  method: string | null;
}

export interface WriteOffStats {
  totalWriteOff: number;
  count: number;
  percentOfBilled: number;
}

export function computeWriteOffs(
  payments: MoneyPayment[],
  clients: MoneyClient[],
  range: { from: number; to: number },
): { stats: WriteOffStats; rows: WriteOffRow[] } {
  const { from, to } = range;
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  const monthPayments = payments.filter((p) => p.createdAt >= from && p.createdAt < to);
  const writeOffs = monthPayments.filter((p) => isWriteOff(p));
  const totalBilled = monthPayments.filter((p) => !isWriteOff(p)).reduce((s, p) => s + p.amount, 0);
  const totalWO = writeOffs.reduce((s, p) => s + p.amount, 0);

  return {
    stats: {
      totalWriteOff: totalWO,
      count: writeOffs.length,
      percentOfBilled: totalBilled > 0 ? parseFloat(((totalWO / totalBilled) * 100).toFixed(2)) : 0,
    },
    rows: writeOffs
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({
        id: p.id,
        clientId: p.clientId,
        clientName: clientMap.get(p.clientId) ?? 'Unknown',
        date: p.createdAt,
        amount: p.amount,
        packageId: p.packageId,
        method: p.method,
      })),
  };
}

/* ------------------------------------------------------- what's coming (3/3) */

/**
 * THE THIRD QUESTION THE SCREEN OPENS WITH: *what is coming?*
 *
 * Not money owed and not money collected — **the value of coaching already sold
 * and not yet delivered**. A trainer with ₹40,000 of sessions on the books and
 * an empty ledger week is in a different position from one with neither, and
 * until now this screen could not tell them apart: *Billed* is history, *Pending* is
 * a debt, and the work standing between a paid-up client and their last session
 * appeared nowhere.
 *
 * It is deliberately **not** a debt and not a forecast. Every rupee here has
 * already been agreed; the question is only how much of it has been earned.
 *
 * ── HOW A PACK IS VALUED ─────────────────────────────────────────────────────
 *
 * Pro-rata by sessions where there are sessions to count: a ₹12,000 twelve-pack
 * with five left is ₹5,000 of undelivered coaching, whatever has been paid
 * against it. Where there is no session count — a monthly pack is a duration,
 * not a block — the whole amount stands while the pack is live, because there is
 * no smaller unit to divide it into and pretending otherwise would invent one.
 *
 * ── WHAT COUNTS AS LIVE ──────────────────────────────────────────────────────
 *
 * `status === 'active'` and nothing else, and since V30 that predicate means it:
 * the lifecycle sweep closes a pack the day its sessions run out or its validity
 * lapses. **A paused pack is still counted** — `paused_at` is a column and not a
 * status precisely so every `WHERE status = 'active'` read keeps counting a
 * client who is on holiday, and their remaining sessions are still owed to them.
 * They are counted separately as well, so the tile can say so: a large figure
 * made mostly of paused packs is a different month from the same figure running.
 */
export interface UpcomingStats {
  /** Value of sold, undelivered coaching, in rupees. */
  value: number;
  /** Live packs it is spread across. */
  packCount: number;
  /** Clients those packs belong to. */
  clientCount: number;
  /** Sessions still to deliver, where the pack counts sessions at all. */
  sessionsRemaining: number;
  /** How many of `packCount` have their clock stopped. */
  pausedCount: number;
  /** Value sitting inside those paused packs. */
  pausedValue: number;
}

export function computeUpcoming(packages: MoneyPackage[]): UpcomingStats {
  const live = packages.filter((p) => p.status === 'active');

  let value = 0;
  let sessionsRemaining = 0;
  let pausedCount = 0;
  let pausedValue = 0;
  const clients = new Set<string>();

  for (const p of live) {
    const total = p.sessionsTotal ?? 0;
    const left = p.sessionsRemaining ?? 0;
    const undelivered =
      total > 0 ? Math.round(p.amount * (Math.max(0, Math.min(left, total)) / total)) : p.amount;

    value += undelivered;
    if (total > 0) sessionsRemaining += Math.max(0, left);
    clients.add(p.clientId);
    if (p.pausedAt !== null) {
      pausedCount++;
      pausedValue += undelivered;
    }
  }

  return {
    value,
    packCount: live.length,
    clientCount: clients.size,
    sessionsRemaining,
    pausedCount,
    pausedValue,
  };
}

/* ------------------------------------------------------------ monthly trend */

/**
 * SIX BARS, AND NOTHING MORE.
 *
 * The brief is explicit about the ceiling — "a simple bar chart of the last 6
 * months. Nothing more" — and the ceiling is the point. A trainer wants to know
 * whether this month is better or worse than the last few; they do not want a
 * date-range picker, a second series or a trend line, and every one of those
 * turns a glance into a reading.
 *
 * ── IT DATES BY WHEN THE MONEY ARRIVED, WHICH IS THE OPPOSITE OF PAYMENTS ──
 *
 * `computeLedger` windows on `createdAt`, deliberately, and `GET /v1/payments`
 * does the same: a month's BILLING is what was raised that month, and dating by
 * settlement would move an invoice into whichever month it was paid in and drop
 * every unpaid one — which is the figure *still pending* is made of.
 *
 * This chart asks the other question. "Is my income going up" is about money
 * that ARRIVED, so a bar is `paidAt`, falling back to `createdAt` for the rows
 * that carry no settlement date — every payment the phone has ever pushed, and
 * every one this API wrote before `paidAt` became a field on the record route.
 * Without that fallback the chart would read as six empty months on any book
 * that predates it.
 *
 * The figure is the trainer's OWN share, gym cut already subtracted, for the
 * reason the GST tab uses the same one: half of ₹6,000 collected on a gym floor
 * is not income, and a bar chart that says it is will be believed.
 */
export interface TrendBar {
  year: number;
  month: number;
  /** `Aug` — the axis label. */
  label: string;
  /** The trainer's share of everything collected that month. */
  amount: number;
  /** True for the month `now` falls in — the one bar drawn in the accent. */
  isCurrent: boolean;
}

/** When a payment counts as income: settled date, else the day it was raised. */
export function settledAt(p: MoneyPayment): number {
  return p.paidAt ?? p.createdAt;
}

export function computeTrend(
  payments: MoneyPayment[],
  now: number,
  months = 6,
): { bars: TrendBar[]; best: number; total: number; averagePerMonth: number } {
  const d = new Date(now);
  const nowYear = d.getFullYear();
  const nowMonth = d.getMonth() + 1;

  const collected = payments.filter(isCollected);

  const bars: TrendBar[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const anchor = new Date(nowYear, d.getMonth() - i, 1);
    const year = anchor.getFullYear();
    const month = anchor.getMonth() + 1;
    const { from, to } = monthBounds(year, month);

    const amount = collected
      .filter((p) => settledAt(p) >= from && settledAt(p) < to)
      .reduce((s, p) => s + (p.amount - (p.gymShareAmount ?? 0)), 0);

    bars.push({
      year,
      month,
      label: MONTHS_SHORT[month - 1],
      amount,
      isCurrent: year === nowYear && month === nowMonth,
    });
  }

  const total = bars.reduce((s, b) => s + b.amount, 0);

  return {
    bars,
    best: bars.reduce((m, b) => Math.max(m, b.amount), 0),
    total,
    /* Whole months only. The current one is a fraction of a month and averaging
       it in drags the line down every time a trainer opens this on the 2nd. */
    averagePerMonth: months > 1 ? Math.round((total - bars[bars.length - 1].amount) / (months - 1)) : total,
  };
}
