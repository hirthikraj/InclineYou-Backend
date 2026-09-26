import {
  daysLate,
  isCollected,
  isPending,
  isWriteOff,
  monthBounds,
  monthLabel,
  settledAt,
  type MoneyClient,
  type MoneyPackage,
  type MoneyPayment,
} from '@/lib/money/compute';

/**
 * THE OVERVIEW'S ARITHMETIC — five questions the other five pages cannot answer.
 *
 * ── WHY THIS IS A NEW FILE AND NOT SIX MORE EXPORTS IN `compute.ts` ──────────
 *
 * `lib/money/compute.ts` is the BOOK's arithmetic: every function in it takes
 * payments and a half-open range and returns rows plus totals, because every one
 * of them backs a table of payments. Nothing here returns a payment row. These
 * are questions about PEOPLE and about PACKS — who has stopped paying, whose
 * pack runs out on Thursday, which five clients are most of the income — and
 * they are joined across three of the four things `getMoney()` fetches.
 *
 * Keeping them apart is also what keeps the Overview honest about redundancy.
 * The rule this page is built to is that **no figure is stated in two places**,
 * and the cheapest way to break that rule is to reach for a `compute*` that
 * already backs a table on Transactions and draw its total again up here. So the
 * Overview imports the book's *predicates* — `isCollected`, `isPending`,
 * `settledAt` — and none of its *totals*. Where the two pages genuinely need the
 * same number, the Overview links to the page that owns it rather than printing
 * it twice: *Needs you* links into the pending filter, it does not restate the
 * pending total that filter's own header carries.
 *
 * ── THE TWO EXCEPTIONS, NAMED ────────────────────────────────────────────────
 *
 * `computeTrend` and `computeUpcoming` ARE reused verbatim, and both moved HERE
 * from the ledger rather than being copied: the six-month chart and the
 * still-to-deliver figure are drawn on the Overview and nowhere else now. See
 * `TransactionsPage.tsx` for what came off the ledger to make that true.
 */

const DAY = 86_400_000;

/* ------------------------------------------------------------- needs you */

/**
 * WHAT THE TRAINER HAS TO DO SOMETHING ABOUT, ranked by what it costs to ignore.
 *
 * Three kinds, and the ranking is the point — a queue that sorts by date puts a
 * pack that quietly ran out last week above ₹8,000 that went thirty days late
 * this morning. `severity` decides the group, `weight` decides the order inside
 * it, and both are computed here rather than in the component so the count in
 * the sub-rail and the list on the page cannot disagree about what counts.
 *
 * ── WHY *DUE TODAY* IS NOT ONE OF THEM ───────────────────────────────────────
 *
 * `computeOwed` splits pending into late and not-yet-late, and only the late
 * half is an action. An invoice raised this morning is not something a trainer
 * has failed to do; putting it in a list headed *Needs you* teaches them that
 * the list contains things that do not. It is counted on the Transactions page's
 * pending filter, where it is a fact rather than a demand.
 */
export type ActionKind = 'overdue' | 'exhausted' | 'lapsed';

export interface ActionItem {
  /** The row this came from — a payment id or a package id. Keys the list. */
  id: string;
  kind: ActionKind;
  clientId: string;
  clientName: string;
  /** The headline, already in the trainer's words. */
  title: string;
  /** The line under it — how late, how empty, how long ago. */
  detail: string;
  /** Rupees, where the action is about money. Null where it is about sessions. */
  amount: number | null;
  severity: 'alert' | 'warn';
  /** Bigger sorts first inside a severity group. Days, mostly. */
  weight: number;
}

export interface ActionsSummary {
  items: ActionItem[];
  /** Everything in `items`, for the sub-rail badge and the section heading. */
  count: number;
  /** Rupees across the overdue items only — the figure worth chasing. */
  overdueAmount: number;
  overdueCount: number;
}

export function computeActions(
  payments: MoneyPayment[],
  packages: MoneyPackage[],
  clients: MoneyClient[],
  now: number,
): ActionsSummary {
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const items: ActionItem[] = [];

  /* 1 · Money that is late. The only `alert` kind, because it is the only one
     where the trainer has already done the work and not been paid for it. */
  for (const p of payments) {
    if (!isPending(p)) continue;
    const late = daysLate(p, now);
    if (late <= 0) continue;
    items.push({
      id: p.id,
      kind: 'overdue',
      clientId: p.clientId,
      clientName: nameOf.get(p.clientId) ?? 'Unknown',
      title: `${nameOf.get(p.clientId) ?? 'Unknown'} owes you`,
      detail: `${late} day${late === 1 ? '' : 's'} past the invoice`,
      amount: p.amount,
      severity: 'alert',
      weight: late,
    });
  }

  /* 2 · A live pack with nothing left on it. The client has not stopped
     training; they have stopped having anything paid for, which is the moment a
     renewal either happens or does not. `sessionsTotal` guards the open-ended
     packs, where zero remaining is the resting state rather than an event. */
  for (const pkg of packages) {
    if (pkg.status !== 'active') continue;
    if ((pkg.sessionsTotal ?? 0) <= 0) continue;
    if ((pkg.sessionsRemaining ?? 0) > 0) continue;
    items.push({
      id: pkg.id,
      kind: 'exhausted',
      clientId: pkg.clientId,
      clientName: nameOf.get(pkg.clientId) ?? 'Unknown',
      title: `${nameOf.get(pkg.clientId) ?? 'Unknown'} has finished their pack`,
      detail: `All ${pkg.sessionsTotal} sessions delivered · not renewed`,
      amount: null,
      severity: 'warn',
      /* Older exhaustions are more urgent, so age is the weight. `updatedAt` is
         when the last session came off it, which is as close to "when did it run
         out" as the wire carries. */
      weight: Math.max(0, Math.round((now - pkg.updatedAt) / DAY)),
    });
  }

  /* 3 · A pack whose end date has passed while it was still marked active. That
     is a different failure from running out of sessions — the clock expired, not
     the count — and it is the one a trainer never notices, because nothing on
     any other screen changes on the day it happens. */
  for (const pkg of packages) {
    if (pkg.status !== 'active' || pkg.endDate === null) continue;
    const ended = Date.parse(pkg.endDate);
    if (Number.isNaN(ended) || ended >= now) continue;
    /* Not both. A pack that ran out of sessions AND ran past its date is one
       thing that needs doing, and the count above already has it. */
    if ((pkg.sessionsTotal ?? 0) > 0 && (pkg.sessionsRemaining ?? 0) <= 0) continue;
    const days = Math.round((now - ended) / DAY);
    const left = pkg.sessionsRemaining ?? 0;
    items.push({
      id: `${pkg.id}:lapsed`,
      kind: 'lapsed',
      clientId: pkg.clientId,
      clientName: nameOf.get(pkg.clientId) ?? 'Unknown',
      title: `${nameOf.get(pkg.clientId) ?? 'Unknown'}’s pack has run past its end date`,
      detail: left > 0
        ? `Ended ${days} day${days === 1 ? '' : 's'} ago with ${left} session${left === 1 ? '' : 's'} unused`
        : `Ended ${days} day${days === 1 ? '' : 's'} ago`,
      amount: null,
      severity: 'warn',
      weight: days,
    });
  }

  items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'alert' ? -1 : 1;
    return b.weight - a.weight;
  });

  const overdue = items.filter((i) => i.kind === 'overdue');

  return {
    items,
    count: items.length,
    overdueAmount: overdue.reduce((s, i) => s + (i.amount ?? 0), 0),
    overdueCount: overdue.length,
  };
}

/* -------------------------------------------------------- recent activity */

/**
 * WHAT HAPPENED, MOST RECENT FIRST — and it is deliberately not a payments list.
 *
 * Transactions draws every payment row with its method, its reference and its
 * note, and a second list of the same rows up here would be the exact redundancy
 * this page is built to avoid. So this one is a different SELECTION: it is what
 * moved, across payments *and* packs, at the grain a trainer remembers things at
 * — "Priya paid", "Arjun bought a 12-pack", "Kavya's pack was written off" —
 * with no method, no reference and no amount column to line up.
 *
 * A pack being sold is the event that has no home anywhere else in Business. It
 * is on the client's own file and it is a row in the price list's sold count,
 * and neither is a place a trainer looks to answer *what happened this week*.
 */
export type ActivityKind = 'paid' | 'raised' | 'sold' | 'writeoff';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  clientId: string;
  clientName: string;
  at: number;
  /** The sentence. Subject first, because the list is scanned down the names. */
  text: string;
  amount: number | null;
}

export function computeActivity(
  payments: MoneyPayment[],
  packages: MoneyPackage[],
  clients: MoneyClient[],
  limit = 8,
): ActivityItem[] {
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const out: ActivityItem[] = [];

  for (const p of payments) {
    const name = nameOf.get(p.clientId) ?? 'Unknown';
    if (isWriteOff(p)) {
      out.push({
        id: `${p.id}:w`, kind: 'writeoff', clientId: p.clientId, clientName: name,
        at: p.createdAt, text: 'written off', amount: p.amount,
      });
    } else if (isCollected(p)) {
      out.push({
        id: `${p.id}:p`, kind: 'paid', clientId: p.clientId, clientName: name,
        /* `settledAt` and not `createdAt`: this list answers *what happened*,
           and what happened on the day the money arrived is that it arrived.
           The ledger dates the same row by when it was BILLED, which is the
           right answer to its own question and the wrong one to this. */
        at: settledAt(p), text: 'paid', amount: p.amount,
      });
    } else if (isPending(p)) {
      out.push({
        id: `${p.id}:r`, kind: 'raised', clientId: p.clientId, clientName: name,
        at: p.createdAt, text: 'was invoiced', amount: p.amount,
      });
    }
  }

  for (const pkg of packages) {
    const name = nameOf.get(pkg.clientId) ?? 'Unknown';
    const what = (pkg.sessionsTotal ?? 0) > 0
      ? `started a ${pkg.sessionsTotal}-session pack`
      : 'started a package';
    out.push({
      id: `${pkg.id}:s`, kind: 'sold', clientId: pkg.clientId, clientName: name,
      at: pkg.createdAt, text: what, amount: null,
    });
  }

  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

/* ------------------------------------------------------------- renewals */

/**
 * WHOSE PACK NEEDS SELLING AGAIN, INSIDE THE WINDOW — and a pack runs out two
 * ways, so the window is measured two ways.
 *
 * A calendar end date is the easy one: seven days is seven days. The other one
 * is sessions, and a pack with two left is not seven days from empty — it is
 * however long two sessions takes, which nothing on the wire says. Rather than
 * invent a rate, the count-based half uses a THRESHOLD and says so in its own
 * words: *2 sessions left* is a renewal conversation whether that is next
 * Tuesday or next month, and it is the sentence the trainer will actually use.
 *
 * Both halves land in one list because the trainer's question is one question.
 * `reason` is what the row says about itself, so a pack caught by the date and a
 * pack caught by the count never read as the same row twice.
 */
export interface RenewalItem {
  id: string;
  clientId: string;
  clientName: string;
  /** `12-session pack`, or `Single session`. */
  packName: string;
  amount: number;
  reason: 'ending' | 'running-out';
  /** Days until `endDate`, where that is what caught it. Null otherwise. */
  daysLeft: number | null;
  sessionsLeft: number | null;
  /** Stopped clock — drawn as a note, because a paused pack is not urgent. */
  paused: boolean;
  /** Sorts the list: smaller is sooner. */
  weight: number;
}

export const RENEWAL_WINDOW_DAYS = 7;
/** A pack at or under this many sessions is a renewal conversation. */
export const RENEWAL_SESSIONS = 2;

export function computeRenewals(
  packages: MoneyPackage[],
  clients: MoneyClient[],
  now: number,
  windowDays = RENEWAL_WINDOW_DAYS,
): { items: RenewalItem[]; value: number } {
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const items: RenewalItem[] = [];

  for (const pkg of packages) {
    if (pkg.status !== 'active') continue;

    const total = pkg.sessionsTotal ?? 0;
    const left = pkg.sessionsRemaining ?? 0;
    /* Empty packs are an ACTION, not a renewal — `computeActions` has them, and
       a pack in both lists is the same sentence read twice. */
    if (total > 0 && left <= 0) continue;

    const ended = pkg.endDate ? Date.parse(pkg.endDate) : NaN;
    const daysLeft = Number.isNaN(ended) ? null : Math.ceil((ended - now) / DAY);
    /* A date already past is a lapsed pack, which `computeActions` also has. */
    const byDate = daysLeft !== null && daysLeft >= 0 && daysLeft <= windowDays;
    const byCount = total > 0 && left > 0 && left <= RENEWAL_SESSIONS;
    if (!byDate && !byCount) continue;

    items.push({
      id: pkg.id,
      clientId: pkg.clientId,
      clientName: nameOf.get(pkg.clientId) ?? 'Unknown',
      packName: total > 0 ? `${total}-session pack` : 'Package',
      amount: pkg.amount,
      /* The date wins the label where both caught it: a fixed day is a thing a
         trainer can put in a sentence, and "2 left" is not. */
      reason: byDate ? 'ending' : 'running-out',
      daysLeft: byDate ? daysLeft : null,
      sessionsLeft: total > 0 ? left : null,
      paused: pkg.pausedAt !== null,
      weight: byDate ? (daysLeft as number) : windowDays + left,
    });
  }

  items.sort((a, b) => a.weight - b.weight);
  return { items, value: items.reduce((s, i) => s + i.amount, 0) };
}

/* -------------------------------------------------------- client metrics */

/**
 * WHO THE INCOME ACTUALLY COMES FROM.
 *
 * Every figure here is the trainer's OWN share — the gym's cut subtracted per
 * row — for the reason the trend chart and the GST page both use that figure:
 * half of ₹6,000 collected on a gym floor is not income, and a "top client" list
 * ranked on gross would promote whichever clients happen to train on the floor.
 *
 * ── AND IT IS WINDOWED BY THE PERIOD PICKER, WHICH IS A CHOICE ───────────────
 *
 * A lifetime top-five is a more stable list and a less useful one: it is a fact
 * about the last two years that does not change when this month goes badly. The
 * picker is on this page, the rest of the page moves with it, and a metrics
 * block that quietly ignored it would be the one control on the screen that does
 * not do what it says.
 */
export interface TopClient {
  clientId: string;
  name: string;
  /** The trainer's share of what this client settled in the window. */
  revenue: number;
  payments: number;
  /** Their slice of `total`, 0–100, for the bar. */
  share: number;
}

export interface ClientMetrics {
  /** Distinct clients who settled anything in the window. */
  payingClients: number;
  /** Every client on the books, whether they paid in the window or not. */
  totalClients: number;
  /** The trainer's share of everything settled in the window. */
  revenue: number;
  /** `revenue / payingClients`, rounded. Zero where nobody paid. */
  averagePerClient: number;
  /** Ranked, longest first. Capped by the caller. */
  top: TopClient[];
  /** How much of `revenue` the top three are — the concentration risk. */
  topThreeShare: number;
}

export function computeClientMetrics(
  payments: MoneyPayment[],
  clients: MoneyClient[],
  range: { from: number; to: number },
  limit = 5,
): ClientMetrics {
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));

  const inWindow = payments.filter(
    (p) => isCollected(p) && settledAt(p) >= range.from && settledAt(p) < range.to,
  );

  const byClient = new Map<string, { revenue: number; payments: number }>();
  for (const p of inWindow) {
    const yours = p.amount - (p.gymShareAmount ?? 0);
    const row = byClient.get(p.clientId) ?? { revenue: 0, payments: 0 };
    row.revenue += yours;
    row.payments += 1;
    byClient.set(p.clientId, row);
  }

  const revenue = [...byClient.values()].reduce((s, r) => s + r.revenue, 0);

  const ranked = [...byClient.entries()]
    .map(([clientId, r]) => ({
      clientId,
      name: nameOf.get(clientId) ?? 'Unknown',
      revenue: r.revenue,
      payments: r.payments,
      share: revenue > 0 ? Math.round((r.revenue / revenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topThree = ranked.slice(0, 3).reduce((s, r) => s + r.revenue, 0);

  return {
    payingClients: byClient.size,
    /* Not `clients.length`: the book carries archived people, and a ratio whose
       denominator counts clients who left overstates how many are not paying. */
    totalClients: clients.filter((c) => c.status === 'active').length,
    revenue,
    averagePerClient: byClient.size > 0 ? Math.round(revenue / byClient.size) : 0,
    top: ranked.slice(0, limit),
    topThreeShare: revenue > 0 ? Math.round((topThree / revenue) * 100) : 0,
  };
}

/* ------------------------------------------------------------ peak month */

/**
 * THE BEST MONTH IN THE LAST TWELVE, and why it is twelve when the chart is six.
 *
 * The chart under it is six bars, fixed, and `computeTrend`'s own docstring
 * carries the argument for that ceiling — "a trainer wants to know whether this
 * month is better or worse than the last few". *Peak* is the other question and
 * six months is too short a window to answer it: a best-of-six is beaten every
 * half year by definition, so it would read as news when it is arithmetic.
 *
 * Twelve is also the window that keeps this off the Reports page. Reports draws
 * twelve months of revenue beside delivered sessions, joiners and leavers, and
 * states no single best month anywhere; this states the month and nothing else.
 * Neither page prints a figure the other prints.
 */
export interface PeakMonth {
  label: string;
  amount: number;
  /** True when the peak is the month `now` is in — "you are having it now". */
  isCurrent: boolean;
  /** How far above the twelve-month average it stood, as a percentage. */
  aboveAverage: number | null;
}

export function computePeakMonth(
  payments: MoneyPayment[],
  now: number,
  months = 12,
): PeakMonth | null {
  const d = new Date(now);
  const collected = payments.filter(isCollected);

  const bars: Array<{ year: number; month: number; amount: number }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const anchor = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const year = anchor.getFullYear();
    const month = anchor.getMonth() + 1;
    const { from, to } = monthBounds(year, month);
    const amount = collected
      .filter((p) => settledAt(p) >= from && settledAt(p) < to)
      .reduce((s, p) => s + (p.amount - (p.gymShareAmount ?? 0)), 0);
    bars.push({ year, month, amount });
  }

  const peak = bars.reduce((m, b) => (b.amount > m.amount ? b : m), bars[0]);
  if (!peak || peak.amount <= 0) return null;

  /* The average excludes the current month for `computeTrend`'s reason: it is a
     fraction of a month, and averaging it in drags the comparison down every
     time a trainer opens this on the 2nd. */
  const whole = bars.slice(0, -1);
  const average = whole.length > 0
    ? whole.reduce((s, b) => s + b.amount, 0) / whole.length
    : 0;

  return {
    label: monthLabel(peak.year, peak.month),
    amount: peak.amount,
    isCurrent: peak.year === d.getFullYear() && peak.month === d.getMonth() + 1,
    aboveAverage: average > 0 ? Math.round(((peak.amount - average) / average) * 100) : null,
  };
}
