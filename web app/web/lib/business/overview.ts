import type { TrendBar } from '@/lib/money/compute';
import type {
  MoneySummary,
  OverviewActivity,
  OverviewPackage,
  TopClient,
} from './types';

/**
 * WHAT THE OVERVIEW SAYS ABOUT THE BOOK — as pure functions over the v1.1 reads.
 *
 * ── THE SHAPE CHANGED, THE QUESTIONS DID NOT ─────────────────────────────────
 *
 * This file used to take every payment, package and client the trainer had and
 * work the five answers out in the browser. The server states them now:
 * `GET /v1/money/summary` has the period and the year, `GET /v1/money/activity`
 * has *what happened*, and `GET /v1/packages?scope=current` has each package's
 * `amountDue`. What is left here is the part that is a judgement and not a sum —
 * which of those rows is a thing the trainer has to DO, and in what order.
 *
 * The one rule that did not move: nothing here adds up payment rows to make a
 * total the server already gave. A figure that exists in two places will, one
 * day, disagree in both.
 */

const DAY = 86_400_000;

/**
 * "Overdue" is owed past its due date by MORE than this — the server's own
 * `MoneySummaryService.OVERDUE_GRACE_DAYS`. It is copied and not invented: the
 * *Needs you* list and the summary's `now.overdue` are two views of one fact, and
 * a list that used a stricter day count would name people the headline figure
 * does not include.
 */
export const OVERDUE_GRACE_DAYS = 7;

/** How long after a pack closed it is still news. Past this it is a client who left, not one to chase. */
const FRESH_DAYS = 30;

/** Whole days from `a` to `b`, both `yyyy-MM-dd` — the workspace's calendar, never the browser's. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

/* ------------------------------------------------------------------ actions */

export type ActionKind = 'overdue' | 'exhausted' | 'lapsed';

export interface ActionItem {
  id: string;
  kind: ActionKind;
  clientId: string;
  clientName: string;
  detail: string;
  /** The amount owed, on an overdue row. */
  amount: number | null;
  severity: 'alert' | 'warn';
  weight: number;
}

export interface ActionsSummary {
  items: ActionItem[];
  count: number;
  overdueCount: number;
}

/**
 * The queue — what has not been done, ranked by what ignoring it costs.
 *
 * Money owed outranks everything: it is work already delivered and not paid for.
 * Below it are the two ways a client stops being on a pack, and both are drawn
 * only for a client with NO live pack, because a client who has already been sold
 * the next one is not a thing the trainer has to do anything about.
 */
export function computeActions(
  packages: OverviewPackage[],
  names: Record<string, string>,
  today: string,
  now: number,
): ActionsSummary {
  const nameOf = (id: string) => names[id] ?? 'Unknown';
  const items: ActionItem[] = [];

  const byClient = new Map<string, OverviewPackage[]>();
  for (const p of packages) byClient.set(p.clientId, [...(byClient.get(p.clientId) ?? []), p]);

  for (const p of packages) {
    if (p.amountDue <= 0 || p.dueDate === null) continue;
    const late = daysBetween(p.dueDate, today);
    if (late <= OVERDUE_GRACE_DAYS) continue;
    items.push({
      id: p.id, kind: 'overdue', clientId: p.clientId, clientName: nameOf(p.clientId),
      detail: `${late} days past the due date`, amount: p.amountDue, severity: 'alert', weight: late,
    });
  }

  for (const [clientId, list] of byClient) {
    const live = list.filter((p) => p.status === 'active');

    /* A pack the CLOCK ended while sessions were still on it: the one nothing else
       on any screen changes for on the day it happens. */
    for (const p of live) {
      if (p.endDate === null || p.endDate >= today) continue;
      const days = daysBetween(p.endDate, today);
      const left = p.sessionsRemaining ?? 0;
      items.push({
        id: `${p.id}:lapsed`, kind: 'lapsed', clientId, clientName: nameOf(clientId),
        detail: left > 0
          ? `Ended ${days} day${days === 1 ? '' : 's'} ago with ${left} session${left === 1 ? '' : 's'} unused`
          : `Ended ${days} day${days === 1 ? '' : 's'} ago`,
        amount: null, severity: 'warn', weight: days,
      });
    }

    if (live.length > 0) continue;

    /* The newest pack closed recently and nothing replaced it. The server closes a
       pack the moment its last session is charged, so *finished* is a status now
       and not a count of zero on an active row. */
    const newest = [...list].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!newest || newest.closedAt === null || now - newest.closedAt > FRESH_DAYS * DAY) continue;
    const days = Math.max(0, Math.round((now - newest.closedAt) / DAY));
    if (newest.status === 'completed' && (newest.sessionsTotal ?? 0) > 0) {
      items.push({
        id: `${newest.id}:done`, kind: 'exhausted', clientId, clientName: nameOf(clientId),
        detail: `All ${newest.sessionsTotal} sessions delivered · not renewed`,
        amount: null, severity: 'warn', weight: days,
      });
    } else if (newest.status === 'expired') {
      items.push({
        id: `${newest.id}:expired`, kind: 'lapsed', clientId, clientName: nameOf(clientId),
        detail: `Expired ${days} day${days === 1 ? '' : 's'} ago · not renewed`,
        amount: null, severity: 'warn', weight: days,
      });
    }
  }

  items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'alert' ? -1 : 1;
    return b.weight - a.weight;
  });

  return { items, count: items.length, overdueCount: items.filter((i) => i.kind === 'overdue').length };
}

/* ----------------------------------------------------------------- activity */

export interface ActivityLine {
  id: string;
  kind: OverviewActivity['kind'];
  clientId: string;
  clientName: string;
  at: number;
  text: string;
  amount: number | null;
}

/**
 * The feed's sentences. An *invoiced* line is gone — there are no invoices in
 * v1, and a pending row is expectation and not an event — and a refund is new.
 */
export function activityLines(items: OverviewActivity[]): ActivityLine[] {
  return items.map((a) => ({
    id: a.id, kind: a.kind, clientId: a.clientId, clientName: a.clientName, at: a.at,
    text: a.kind === 'paid' ? 'paid'
      : a.kind === 'sold' ? `started ${a.packageName}`
      : a.kind === 'write_off' ? 'had an amount written off'
      : 'was refunded',
    amount: a.amount,
  }));
}

/* ----------------------------------------------------------------- renewals */

export interface RenewalItem {
  id: string;
  clientId: string;
  clientName: string;
  packName: string;
  amount: number;
  reason: 'ending' | 'running-out';
  daysLeft: number | null;
  sessionsLeft: number | null;
  paused: boolean;
  weight: number;
}

export const RENEWAL_WINDOW_DAYS = 7;
export const RENEWAL_SESSIONS = 2;

/**
 * Whose pack needs selling again — a date inside the window, or two sessions or
 * fewer. A pack the client has already been sold the next of (a newer live pack
 * of the same service) is not listed: the backend stops raising *pack ending* for
 * it, and this page must not disagree with Today about who to call.
 */
export function computeRenewals(
  packages: OverviewPackage[],
  names: Record<string, string>,
  today: string,
): { items: RenewalItem[]; value: number } {
  const items: RenewalItem[] = [];
  const live = packages.filter((p) => p.status === 'active');

  for (const p of live) {
    const total = p.sessionsTotal ?? 0;
    const left = p.sessionsRemaining ?? 0;
    if (total > 0 && left <= 0) continue;
    if (live.some((q) => q.id !== p.id && q.clientId === p.clientId && q.service === p.service && q.createdAt > p.createdAt)) continue;

    const daysLeft = p.endDate === null ? null : daysBetween(today, p.endDate);
    const byDate = daysLeft !== null && daysLeft >= 0 && daysLeft <= RENEWAL_WINDOW_DAYS;
    const byCount = total > 0 && left > 0 && left <= RENEWAL_SESSIONS;
    if (!byDate && !byCount) continue;

    items.push({
      id: p.id, clientId: p.clientId, clientName: names[p.clientId] ?? 'Unknown', packName: p.name,
      amount: p.amount, reason: byDate ? 'ending' : 'running-out',
      daysLeft: byDate ? daysLeft : null, sessionsLeft: total > 0 ? left : null,
      paused: p.pausedAt !== null, weight: byDate ? (daysLeft as number) : RENEWAL_WINDOW_DAYS + left,
    });
  }

  items.sort((a, b) => a.weight - b.weight);
  return { items, value: items.reduce((s, i) => s + i.amount, 0) };
}

export interface UpcomingStats { value: number; pausedValue: number }

/** Coaching sold and not yet delivered: each live pack's price, pro rata to the sessions still on it. */
export function computeUpcoming(packages: OverviewPackage[]): UpcomingStats {
  let value = 0;
  let pausedValue = 0;
  for (const p of packages) {
    if (p.status !== 'active') continue;
    const total = p.sessionsTotal ?? 0;
    const left = p.sessionsRemaining ?? 0;
    const undelivered = total > 0 ? Math.round(p.amount * (Math.max(0, Math.min(left, total)) / total)) : p.amount;
    value += undelivered;
    if (p.pausedAt !== null) pausedValue += undelivered;
  }
  return { value, pausedValue };
}

/* ------------------------------------------------------------- over time */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The chart's bars: the LAST SIX of the twelve months the server sent, on the
 * trainer's take-home — what arrived, the gym's part already off. Six on the
 * chart and twelve under *Best month* is the old split kept on purpose, so the
 * best-of is never just the tallest bar in view.
 */
export function trendBars(year: MoneySummary, bars = 6): {
  bars: TrendBar[]; best: number; total: number; averagePerMonth: number;
} {
  const last = year.months.slice(-bars);
  const out: TrendBar[] = last.map((m, i) => {
    const [y, mo] = m.month.split('-').map(Number);
    return { year: y, month: mo, label: MONTHS_SHORT[mo - 1], amount: m.takeHome, isCurrent: i === last.length - 1 };
  });
  const total = out.reduce((s, b) => s + b.amount, 0);
  return {
    bars: out,
    best: out.reduce((m, b) => Math.max(m, b.amount), 0),
    total,
    /* Whole months only: the current one is a fraction of a month, and averaging it
       in drags the line down every time a trainer opens this on the 2nd. */
    averagePerMonth: out.length > 1 ? Math.round((total - out[out.length - 1].amount) / (out.length - 1)) : total,
  };
}

export interface PeakMonth { label: string; amount: number; isCurrent: boolean; aboveAverage: number | null }

export function computePeakMonth(year: MoneySummary): PeakMonth | null {
  const ms = year.months;
  if (ms.length === 0) return null;
  const peak = ms.reduce((m, b) => (b.takeHome > m.takeHome ? b : m), ms[0]);
  if (peak.takeHome <= 0) return null;
  const whole = ms.slice(0, -1);
  const average = whole.length > 0 ? whole.reduce((s, b) => s + b.takeHome, 0) / whole.length : 0;
  const [y, mo] = peak.month.split('-').map(Number);
  return {
    label: `${MONTHS_SHORT[mo - 1]} ${y}`,
    amount: peak.takeHome,
    isCurrent: peak === ms[ms.length - 1],
    aboveAverage: average > 0 ? Math.round(((peak.takeHome - average) / average) * 100) : null,
  };
}

/* ------------------------------------------------------------ where from */

export interface Concentration {
  top: (TopClient & { share: number })[];
  topThreeShare: number;
  /** The share of the twelve months the top ten account for, so a short list is not read as the whole. */
  coveredShare: number;
}

/**
 * Who the income rests on, from the practice report's top ten and its year total.
 * The window is twelve months and is NOT the period picker's: the report has no
 * `from`/`to`, so this section states its window rather than pretending to follow
 * a control it cannot.
 */
export function computeConcentration(rows: TopClient[], totalYours: number, limit = 5): Concentration {
  const ranked = [...rows].sort((a, b) => b.yours - a.yours);
  const share = (v: number) => (totalYours > 0 ? Math.round((v / totalYours) * 100) : 0);
  return {
    top: ranked.slice(0, limit).map((r) => ({ ...r, share: share(r.yours) })),
    topThreeShare: share(ranked.slice(0, 3).reduce((s, r) => s + r.yours, 0)),
    coveredShare: share(ranked.reduce((s, r) => s + r.yours, 0)),
  };
}
