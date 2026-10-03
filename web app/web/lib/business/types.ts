import { periodRange, type Period } from '@/lib/money/period';

/**
 * WHAT THE BUSINESS PAGES READ — the v1.1 wire after it has been parsed once.
 *
 * ── MONEY IS A STRING ON THE WIRE AND A NUMBER HERE, AND THE CONVERSION HAPPENS
 *    EXACTLY ONCE ─────────────────────────────────────────────────────────────
 *
 * The backend sends `"4000.00"` so no float ever carries a rupee. The pages only
 * DISPLAY these figures (`rupees()` rounds to the whole rupee anyway) and compare
 * them, so a `number` is the right currency for the screen — but it must never be
 * the currency for ADDING: every total on these pages is a total the server
 * computed (`total`, `now`, `takeHome`), and nothing here sums payment rows to
 * make a figure the server already stated. That is the bug the old
 * `computeLedger` had, and the reason the whole-book read is gone.
 *
 * This file has no `server-only` import on purpose: the client components import
 * the types and the two window helpers, and the server actions return these
 * shapes across the boundary.
 */

export interface SummaryMonth {
  /** `yyyy-MM`, in the workspace's time zone. */
  month: string;
  billed: number;
  collected: number;
  gymCut: number;
  /** Billed less the gym's cut — the billed basis. */
  yours: number;
  writtenOff: number;
  refunded: number;
  /** Collected less the gym's part of it — the cash basis, which is what a trainer banks. */
  takeHome: number;
  packagesSold: number;
  paymentsCount: number;
}

export interface MoneySummary {
  currency: string;
  months: SummaryMonth[];
  total: Omit<SummaryMonth, 'month'> & { trendPercent: number | null };
  /** As of today, not as of the span: pending and overdue belong to no month. */
  now: { pending: number; overdue: number; clientsOwing: number; clientsOverdue: number };
}

export interface LedgerRow {
  id: string;
  clientId: string;
  clientName: string;
  packageId: string;
  packageName: string;
  amount: number;
  collectedBy: 'trainer' | 'gym';
  method: 'upi' | 'cash' | 'bank_transfer' | null;
  status: 'pending' | 'paid' | 'write_off' | 'refund';
  reference: string | null;
  note: string | null;
  /** The instant the row counts on — paid, written off, refunded, or created while pending. */
  bookAt: number;
  /** When the money arrived — what *Edit* offers back to change. Null unless paid. */
  paidAt: number | null;
  /** `updated_at` as epoch ms: sent as `If-Match` so an edit made on a stale screen is refused, not merged. */
  version: string;
  /** The server's split of a gym-desk payment; null when the package has no trainer share. */
  split: { gym: number; trainer: number } | null;
}

export interface LedgerPage {
  rows: LedgerRow[];
  nextCursor: string | null;
  /** Only when asked for (`includeTotal`) — the first page of a view. */
  total: number | null;
}

/** The ledger's chips. `null` is *All*. Each one is a server-side filter, never a slice of a held page. */
export type LedgerFilter = 'collected' | 'owed' | 'writeoff' | 'gymshare' | null;

/** A client the record panel can pick — a summary row cut down to what it needs. */
export interface PickableClient {
  id: string;
  name: string;
  clientType: 'independent' | 'gym';
}

/** A package the record panel can pick, with the server's own `amountDue` and share. */
export interface PickablePackage {
  id: string;
  name: string;
  service: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number;
  amountDue: number;
  status: string;
  /** Exactly one of the two is set on a gym package; both null means the trainer keeps all of it. */
  trainerSharePercent: number | null;
  trainerShareAmount: number | null;
}

/* --------------------------------------------------------------- overview ── */

export interface OverviewPackage {
  id: string;
  clientId: string;
  name: string;
  service: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number;
  amountDue: number;
  dueDate: string | null;
  endDate: string | null;
  status: string;
  pausedAt: number | null;
  closedAt: number | null;
  createdAt: number;
}

export interface OverviewActivity {
  id: string;
  kind: 'paid' | 'sold' | 'write_off' | 'refund';
  at: number;
  clientId: string;
  clientName: string;
  amount: number;
  packageName: string;
}

export interface TopClient {
  clientId: string;
  name: string;
  /** The trainer's own part of what the client paid over the window — the gym's cut already off. */
  yours: number;
  sessions: number;
}

export interface OverviewData {
  /** The Next server's clock, stamped once so a render cannot straddle a minute boundary. */
  now: number;
  /** `yyyy-MM-dd` today, in the workspace's own time zone. */
  today: string;
  currency: string;
  /** Whether the trainer works at a gym — it decides whether the gym's cut is drawn at all. */
  hasGym: boolean;
  /** The picked period's summary; the page opens on the current month. */
  period: MoneySummary;
  /** Twelve months, oldest first: the chart's six and the best month's twelve. */
  year: MoneySummary;
  activity: OverviewActivity[];
  packages: OverviewPackage[];
  names: Record<string, string>;
  /** Null when the practice report could not be read — that one section goes quiet. */
  topClients: { rows: TopClient[]; totalYours: number } | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The `/v1/money/summary` query for a picked period. A month is `from=to=yyyy-MM`
 * and *last 3/6 months* is `months=N` — the period picker's values map straight
 * onto the contract's two spellings.
 */
export function summaryQuery(p: Period): string {
  if (p.kind === 'month') {
    const m = `${p.year}-${pad(p.month)}`;
    return `from=${m}&to=${m}`;
  }
  return `months=${p.months}`;
}

/**
 * The `[from, to)` DATES of a period, for the ledger and its CSV. The server
 * resolves them in the workspace's time zone; the month arithmetic is done here
 * on the parts of `periodRange`, which is the same arithmetic the old ledger
 * sliced its book with, so a period means the same days on every Business page.
 */
export function ledgerWindow(p: Period, now: number): { from: string; to: string } {
  const { from, to } = periodRange(p, now);
  const f = new Date(from);
  const t = new Date(to);
  return {
    from: `${f.getFullYear()}-${pad(f.getMonth() + 1)}-01`,
    to: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-01`,
  };
}

/** The ledger query string for a chip over a window — one place, so the page and the CSV cannot disagree. */
export function ledgerFilterParams(filter: LedgerFilter): Record<string, string> {
  switch (filter) {
    case 'collected': return { status: 'paid' };
    case 'owed': return { status: 'pending' };
    case 'writeoff': return { status: 'write_off' };
    case 'gymshare': return { clientType: 'gym' };
    default: return {};
  }
}

/* ──────────────────────────────────────────────────────────────── gym share ── */

/**
 * The gym page's figures — `GET /v1/money/gym`, parsed. Money is a number from
 * here on; the server's strings are converted once at the edge in `api.ts`.
 *
 * "Floor" is every package sold with a trainer share — a gym package — and
 * "remote" is everything else; the names are the contract's. `gymCutPercent` is
 * the weighted average actually applied in the span, a number and not a setting,
 * because the split is per pack and no single percentage describes it (R3, R52).
 */
export interface GymStats {
  floorBilled: number;
  floorSessions: number;
  gymCut: number;
  gymCutPercent: number;
  remoteBilled: number;
  remoteSessions: number;
  yours: number;
}

/** One gym pack's line: what it sold in the span and how each rupee of it split. */
export interface GymShareRow {
  /** Null on the one *custom gym sale* row — packages sold off the price list. */
  packId: string | null;
  packName: string;
  trainerSharePercent: number | null;
  trainerShareAmount: number | null;
  gymSharePercent: number | null;
  gymShareAmount: number | null;
  sold: number;
  billed: number;
  trainerTake: number;
  gymCut: number;
}

export interface GymMonth {
  month: string;
  /** The running month: it owes nothing yet — a minimum is not owed on the 3rd. */
  soFar: boolean;
  clients: number;
  yourShare: number;
  owed: number;
  received: number;
  /** Null while `soFar`. */
  balance: number | null;
}

/** The pay terms with a gym — a base fee and when it applies. */
export interface Arrangement {
  id: string;
  gymName: string;
  baseKind: 'minimum' | 'basic' | null;
  baseAmount: number;
  startsMonth: string;
  endsMonth: string | null;
  note: string | null;
  version: string;
}

export interface Payout {
  id: string;
  amount: number;
  method: 'upi' | 'cash' | 'bank_transfer' | null;
  reference: string | null;
  receivedAt: number;
  note: string | null;
}

export interface GymSettlement {
  arrangement: Arrangement | null;
  months: GymMonth[];
  /** Σ balance over closed months — what the gym owes you, as of the last closed month. */
  balanceDue: number;
  recentPayouts: Payout[];
}

export interface GymMoney {
  currency: string;
  gymName: string | null;
  stats: GymStats;
  shares: GymShareRow[];
  /** Null until the trainer has recorded any pay terms: then there is nothing to settle. */
  settlement: GymSettlement | null;
}

/**
 * A period as the gym endpoint wants it: MONTHS, inclusive, with no `months=N`
 * spelling. *Last 3 months* is therefore this month and the two before it.
 */
export function gymQuery(p: Period, now: number): string {
  if (p.kind === 'month') {
    const m = `${p.year}-${pad(p.month)}`;
    return `from=${m}&to=${m}`;
  }
  const d = new Date(now);
  const to = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const first = new Date(d.getFullYear(), d.getMonth() - (p.months - 1), 1);
  return `from=${first.getFullYear()}-${pad(first.getMonth() + 1)}&to=${to}`;
}

/* ──────────────────────────────────────────────────────── practice report ── */

/**
 * `GET /v1/reports/practice`, parsed — what the Reports page draws. Every figure
 * is the server's; the page derives only ratios of them (a quarter against the
 * quarter before, attendance from delivered and no-shows).
 */
export interface PracticeMonth {
  /** `yyyy-MM`. */
  month: string;
  delivered: number;
  noShows: number;
  cancelled: number;
  activeClients: number;
  newClients: number;
  archived: number;
  billed: number;
  collected: number;
  takeHome: number;
}

export interface PracticeTopClient {
  clientId: string;
  name: string;
  sessions: number;
  collected: number;
  yours: number;
}

export interface Practice {
  currency: string;
  months: PracticeMonth[];
  headline: {
    delivered: number;
    /** Null when nobody was on the books at the start of the span. */
    retentionPercent: number | null;
    busiestMonth: string | null;
    averageSessionsPerClientPerWeek: number | null;
    takeHome: number;
  };
  topClients: PracticeTopClient[];
}
