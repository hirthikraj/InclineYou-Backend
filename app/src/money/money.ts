/**
 * The book — everything screen 06 shows, derived from local tables.
 *
 * Pure, like `home/deck`, `clients/roster` and `diary/diary`: `now` and the
 * rows come in as arguments, nothing here reads the database or the clock.
 *
 * The finding this file encodes: **every coaching platform in the teardown
 * builds its money screen as a payment processor** — a Stripe balance, payouts,
 * failed charges. InclineYou can't and shouldn't. The money arrives as cash on a
 * gym floor, as UPI straight into the trainer's own bank, or at the gym's
 * counter, so a balance is a screen about money that doesn't exist. What this
 * models instead is a bahi khata: two-directional, chronological, with a
 * running balance you can point at.
 *
 * Two axes run through here and they are deliberately different:
 *
 *   · The month's FIGURES are on the debt axis — what was billed in that month,
 *     what has come in against it, what is still out. That is an account, and
 *     the three numbers always add up.
 *   · The LEDGER is on the movement axis — money that actually moved, newest
 *     first. That is a diary, and it is what a shopkeeper reads.
 *
 * A month is "Everything clear" when its account has nothing left out. That phrase
 * is OkCredit's, and it is the right words — not "all invoices settled", which
 * is what a western app would say to a trainer in Adyar.
 */

import { readMode, type DeliveryMode } from '../home/mode';
import { DAY_MS, MONTHS_LONG, rupees, rupeesShort, startOfDay } from '../home/time';

/* -------------------------------------------------------------- thresholds */

/** Services cross into GST at ₹20 lakh a year. ₹10 lakh in a few NE states. */
export const GST_LINE = 2_000_000;

/** Warn a month before the line is crossed, never after — late costs a penalty. */
export const GST_WARN_FRACTION = 0.8;

/** A pack with this many sessions left or fewer is "ending soon". */
export const PACK_ENDING_AT = 3;

/** How long a recorded payment can be taken back. Same window as the diary. */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Nudge templates that count as "you already asked about money". */
const PAYMENT_NUDGES = ['payment_due', 'payment_reminder', 'payment_overdue'];

/* ------------------------------------------------------------------- input */

export interface MoneyClient {
  id: string;
  name: string;
  phone?: string | null;
  deliveryMode?: string | null;
  /** 'trainer_collects' (freelance) or 'gym_collects' (the gym's client). */
  paymentMode?: string | null;
  metadata?: unknown;
  /** What the TRAINER keeps on this client, when the gym's usual cut differs. */
  trainerSplitPercent?: number | null;
}

export interface MoneyPackage {
  id: string;
  clientId: string;
  type: string;
  sessionsTotal?: number | null;
  sessionsRemaining?: number | null;
  amount: number;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  packId?: string | null;
  dueDate?: string | null;
  writtenOffAt?: Date | number | null;
  writtenOffAmount?: number | null;
  createdAt: Date | number;
}

export interface MoneyPayment {
  id: string;
  clientId: string;
  packageId?: string | null;
  amount: number;
  method: string;
  collectedBy: string;
  status: string;
  upiReference?: string | null;
  paidAt?: Date | number | null;
  gymShareAmount?: number | null;
  sharePercent?: number | null;
  receiptNo?: string | null;
  note?: string | null;
  createdAt: Date | number;
}

export interface MoneyPack {
  id: string;
  name: string;
  type: string;
  sessions?: number | null;
  amount: number;
  validityDays?: number | null;
  status: string;
  /** 'trainer' | 'gym'. Null on anything written before the gym price list. */
  owner?: string | null;
  orderIndex: number;
}

export interface MoneySettlement {
  id: string;
  period: string;
  amount: number;
  sessionsCounted?: number | null;
  gymName?: string | null;
  status: string;
  dueAt?: Date | number | null;
  settledAt?: Date | number | null;
}

export interface MoneySession {
  id: string;
  clientId: string;
  scheduledAt: Date | number;
  status: string;
  deliveryMode?: string | null;
}

export interface MoneyNudge {
  id: string;
  clientId: string;
  templateName?: string | null;
  sentAt: Date | number;
}

/** The gym arrangement. A null name means no gym — not a 0% cut. */
export interface GymProfile {
  name: string | null;
  /** What the GYM keeps, on floor sessions only. */
  percent: number | null;
  upiVpa: string | null;
  trainerName: string;
}

export interface MoneyInput {
  clients: MoneyClient[];
  packages: MoneyPackage[];
  payments: MoneyPayment[];
  packs: MoneyPack[];
  settlements: MoneySettlement[];
  sessions: MoneySession[];
  nudges: MoneyNudge[];
  gym: GymProfile;
}

export const EMPTY_GYM: GymProfile = { name: null, percent: null, upiVpa: null, trainerName: '' };

/* ------------------------------------------------------------------- time */

export function ms(at: Date | number | null | undefined): number {
  if (at == null) return 0;
  return at instanceof Date ? at.getTime() : at;
}

/** 'YYYY-MM'. The key every month-shaped thing in this file is grouped by. */
export function monthKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function startOfMonthAt(at: number): number {
  const d = new Date(at);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addMonths(at: number, delta: number): number {
  const d = new Date(startOfMonthAt(at));
  d.setMonth(d.getMonth() + delta);
  return d.getTime();
}

/**
 * The Indian financial year containing `at` — April to March.
 *
 * The GST line is annual and the CA works to this calendar, so the year view
 * is not January to December. Getting this wrong would put the turnover meter
 * three months out.
 */
export function financialYear(at: number): { from: number; to: number; label: string } {
  const d = new Date(at);
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const from = new Date(startYear, 3, 1, 0, 0, 0, 0).getTime();
  const to = new Date(startYear + 1, 3, 1, 0, 0, 0, 0).getTime();
  return { from, to, label: `${startYear}–${String((startYear + 1) % 100).padStart(2, '0')}` };
}

function dateOnly(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parts = iso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
}

/* -------------------------------------------------------------- formatting */

export { rupees, rupeesShort };

/** "+₹6,000" / "−₹49,000". The sign is the direction, and it is never dropped. */
export function signed(amount: number, direction: Direction): string {
  return `${direction === 'in' ? '+' : '−'}${rupees(amount)}`;
}

/** "11 days late" · "due today" · "due in 3 days". */
export function dueLabel(dueAt: number | null, now: number): string {
  if (dueAt == null) return 'no due date';
  const days = Math.round((startOfDay(now) - startOfDay(dueAt)) / DAY_MS);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} late`;
  if (days === 0) return 'due today';
  return `due in ${-days} day${days === -1 ? '' : 's'}`;
}

export function daysLate(dueAt: number | null, now: number): number {
  if (dueAt == null) return 0;
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(dueAt)) / DAY_MS));
}

/** "UPI" · "Cash in hand" · "Gym counter" — what the trainer would say aloud. */
export const METHOD_LABELS: Record<string, string> = {
  upi_intent: 'UPI',
  upi: 'UPI',
  cash: 'Cash in hand',
  gym_front_office: 'Gym counter',
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

/* ------------------------------------------------------------------ output */

export type Direction = 'in' | 'out';

/** One line in the book. A payment, a pack sold, or the gym's cut going out. */
export interface LedgerEntry {
  id: string;
  kind: 'payment' | 'debt' | 'settlement';
  direction: Direction;
  at: number;
  title: string;
  detail: string;
  amount: number;
  /** Second line under the amount — "−₹3,000 cut", "queued", "settled". */
  note?: string;
  /** Money already gone sits back: history, not an alarm. */
  settled?: boolean;
  clientId?: string;
  packageId?: string;
  /** Only a payment can be taken back, and only for 24 hours. */
  undoable?: boolean;
}

/** A running-balance divider inside a client's book. Not tappable. */
export interface BalanceMark {
  id: string;
  label: string;
  value: string;
  clear: boolean;
}

export interface ChaseRow {
  clientId: string;
  packageId: string;
  name: string;
  phone: string | null;
  amount: number;
  dueAt: number | null;
  late: number;
  /** How many times money has already been mentioned. Second-most useful fact. */
  reminders: number;
  severity: 'critical' | 'alert';
  detail: string;
  packLabel: string;
}

export interface MonthFigures {
  key: string;
  at: number;
  label: string;
  billed: number;
  collected: number;
  owed: number;
  writtenOff: number;
}

export interface MonthView extends MonthFigures {
  /** Bar fractions, always summing to 1 when anything was billed. */
  parts: { collected: number; owed: number; writtenOff: number };
  hisaabClear: boolean;
  /** Empty when this trainer has no gym. */
  share: ShareSplit | null;
  chase: ChaseRow[];
  ledger: LedgerEntry[];
  ledgerLabel: string;
  subtitle: string;
}

export interface ShareSplit {
  gymName: string;
  percent: number;
  yours: number;
  theirs: number;
  /** Of what came in this month; the projection is not counted as earned. */
  collected: number;
}

/* ------------------------------------------------- the arithmetic, one place */

function isCollected(p: MoneyPayment): boolean {
  // A 'pending' row is an intent, not money. Only what actually landed counts,
  // and the trainer is the one who says it landed.
  return p.status === 'paid';
}

function paidAt(p: MoneyPayment): number {
  return ms(p.paidAt) || ms(p.createdAt);
}

/** When a debt came into being. `start_date` when set, else the row's birth. */
function billedAt(pkg: MoneyPackage): number {
  return dateOnly(pkg.startDate) ?? ms(pkg.createdAt);
}

function dueAt(pkg: MoneyPackage): number | null {
  return dateOnly(pkg.dueDate) ?? dateOnly(pkg.startDate) ?? ms(pkg.createdAt);
}

function writtenOff(pkg: MoneyPackage): number {
  if (!ms(pkg.writtenOffAt)) return 0;
  // A write-off with no amount means the whole outstanding balance was let go.
  return pkg.writtenOffAmount ?? 0;
}

/** Everything credited against one debt. */
function paidOn(payments: MoneyPayment[], packageId: string): number {
  let total = 0;
  for (const p of payments) if (p.packageId === packageId && isCollected(p)) total += p.amount;
  return total;
}

/**
 * What is still out on one debt.
 *
 * A write-off does not reduce this to zero by deleting anything — the amount
 * moves into `writtenOff`, the row stays in the client's book, and the year's
 * written-off total is the truth in March.
 */
export function outstanding(pkg: MoneyPackage, payments: MoneyPayment[]): number {
  const gone = paidOn(payments, pkg.id) + writtenOff(pkg);
  return Math.max(0, round2(pkg.amount - gone));
}

/** Money is integer paise in spirit; a rupee that drifts is the end of a ledger. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The gym's cut on one payment.
 *
 * Read off the row when it is there, because the cut is applied at record time
 * and stored — if the contract changes in October, September must not move.
 * Only projected for money that has not arrived yet.
 */
function cutOn(payment: MoneyPayment): number {
  return payment.gymShareAmount ?? 0;
}

/**
 * What the gym would take on a fresh amount for this client, right now.
 *
 * Remote sessions are always 0% — which is exactly why a trainer pushes remote,
 * and why this is a rule in code rather than a second column on the client.
 */
export function projectedCut(
  amount: number,
  client: MoneyClient | undefined,
  gym: GymProfile,
): { amount: number; percent: number } {
  if (!gym.name || gym.percent == null) return { amount: 0, percent: 0 };
  // The split exists only on the gym's own clients. A trainer's own client
  // pays the trainer everything, even when they train on the gym floor.
  if (client?.paymentMode !== 'gym_collects') return { amount: 0, percent: 0 };
  const mode = modeOf(client);
  if (mode === 'remote') return { amount: 0, percent: 0 };
  // `trainerSplitPercent` is what the TRAINER keeps, so the gym keeps the rest.
  const percent =
    client?.trainerSplitPercent != null
      ? Math.max(0, Math.min(100, 100 - client.trainerSplitPercent))
      : gym.percent;
  return { amount: round2((amount * percent) / 100), percent };
}

function modeOf(client: MoneyClient | undefined): DeliveryMode {
  return readMode({ client: client?.deliveryMode, metadata: client?.metadata });
}

/* ------------------------------------------------------------ the month view */

/**
 * One month's account, plus the two lists under it.
 *
 * @param anchor Any instant inside the month being looked at.
 */
export function buildMonth(input: MoneyInput, anchor: number, now: number): MonthView {
  const key = monthKey(anchor);
  const figures = figuresFor(input, key);
  const total = figures.billed || 1;

  const chase = buildChase(input, now);
  const ledger = ledgerFor(input, key, now);
  const share = shareFor(input, key);

  const current = key === monthKey(now);
  const hisaabClear = figures.billed > 0 && figures.owed <= 0;

  return {
    ...figures,
    parts: {
      collected: figures.collected / total,
      owed: figures.owed / total,
      writtenOff: figures.writtenOff / total,
    },
    hisaabClear,
    share,
    // The chase list is always "what is owed right now" — a trainer chasing
    // money does not care which month it was billed in.
    chase: current ? chase : chase.filter((row) => monthKey(row.dueAt ?? now) === key),
    ledger,
    ledgerLabel: current ? 'This week' : monthLabel(anchor),
    subtitle: hisaabClear
      ? `${monthLabel(anchor)} · everything collected`
      : figures.billed === 0
        ? 'Nothing recorded yet'
        : `${monthLabel(anchor)} · ${rupees(figures.billed)} billed`,
  };
}

function monthLabel(at: number): string {
  return MONTHS_LONG[new Date(at).getMonth()];
}

/** The debt axis: billed in this month, and what has happened to it since. */
function figuresFor(input: MoneyInput, key: string): MonthFigures {
  let billed = 0;
  let collected = 0;
  let off = 0;

  for (const pkg of input.packages) {
    if (monthKey(billedAt(pkg)) !== key) continue;
    if (pkg.status === 'cancelled') continue;
    billed += pkg.amount;
    collected += paidOn(input.payments, pkg.id);
    off += writtenOff(pkg);
  }

  // Money taken with no package attached still arrived, and hiding it would
  // make the ledger and the figures disagree in front of a client.
  for (const p of input.payments) {
    if (p.packageId) continue;
    if (!isCollected(p) || monthKey(paidAt(p)) !== key) continue;
    billed += p.amount;
    collected += p.amount;
  }

  const owed = Math.max(0, round2(billed - collected - off));
  const at = firstOfMonth(key);
  return {
    key,
    at,
    label: MONTHS_LONG[new Date(at).getMonth()].slice(0, 3),
    billed: round2(billed),
    collected: round2(collected),
    owed,
    writtenOff: round2(off),
  };
}

function firstOfMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
}

/**
 * The movement axis: money that actually moved this month, newest first.
 *
 * Money in is a credit with a down arrow; money out is a debit with an up
 * arrow. That is the जमा / उधार convention OkCredit taught ten million people,
 * and inverting it to match a western accounting app would be a self-inflicted
 * wound.
 */
function ledgerFor(input: MoneyInput, key: string, now: number): LedgerEntry[] {
  const names = nameIndex(input.clients);
  const out: LedgerEntry[] = [];

  for (const p of input.payments) {
    if (!isCollected(p)) continue;
    const at = paidAt(p);
    if (monthKey(at) !== key) continue;
    const cut = cutOn(p);
    out.push({
      id: p.id,
      kind: 'payment',
      direction: 'in',
      at,
      title: names.get(p.clientId) ?? 'Someone',
      detail: paymentDetail(p, at, now),
      amount: p.amount,
      note: cut > 0 ? `−${rupees(cut)} cut` : undefined,
      clientId: p.clientId,
      packageId: p.packageId ?? undefined,
      undoable: now - at < UNDO_WINDOW_MS,
    });
  }

  for (const s of input.settlements) {
    const at = ms(s.settledAt) || ms(s.dueAt);
    if (!at || monthKey(at) !== key) continue;
    out.push({
      id: s.id,
      kind: 'settlement',
      direction: 'out',
      at,
      title: `Gym share · ${periodLabel(s.period)}`,
      detail: settlementDetail(s),
      amount: s.amount,
      note: s.status === 'settled' ? 'settled' : undefined,
      settled: s.status === 'settled',
    });
  }

  return out.sort((a, b) => b.at - a.at);
}

function paymentDetail(p: MoneyPayment, at: number, now: number): string {
  const bits = [methodLabel(p.method)];
  if (p.upiReference) bits.push(`ref ${p.upiReference}`);
  bits.push(whenLabel(at, now));
  return bits.join(' · ');
}

function settlementDetail(s: MoneySettlement): string {
  const bits: string[] = [];
  if (s.gymName) bits.push(s.gymName);
  // Zero is not a fact worth printing — a settlement worked out from no
  // sessions at all reads as a bug, and the amount already says what it was.
  if (s.sessionsCounted != null && s.sessionsCounted > 0) {
    bits.push(`${s.sessionsCounted} floor session${s.sessionsCounted === 1 ? '' : 's'}`);
  }
  if (s.status === 'settled' && ms(s.settledAt)) bits.push(`paid ${shortDate(ms(s.settledAt))}`);
  else if (ms(s.dueAt)) bits.push(`due ${shortDate(ms(s.dueAt))}`);
  return bits.join(' · ');
}

/** "today 08:14" · "yesterday" · "6 Aug". */
function whenLabel(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days === 0) {
    const d = new Date(at);
    return `today ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (days === 1) return 'yesterday';
  return shortDate(at);
}

function shortDate(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()].slice(0, 3)}`;
}

/** '2026-08' → 'August'. */
export function periodLabel(period: string): string {
  const [, m] = period.split('-').map(Number);
  return MONTHS_LONG[(m || 1) - 1] ?? period;
}

function nameIndex(clients: MoneyClient[]): Map<string, string> {
  return new Map(clients.map((c) => [c.id, c.name]));
}

/* ----------------------------------------------------------- chasing what's owed */

/**
 * Who owes what, sorted by HOW LATE rather than how much.
 *
 * A ₹3,000 debt eleven days old is a worse problem than a ₹9,000 one due
 * tomorrow, and sorting by amount would put them the wrong way round.
 */
export function buildChase(input: MoneyInput, now: number): ChaseRow[] {
  const clients = new Map(input.clients.map((c) => [c.id, c]));
  const rows: ChaseRow[] = [];

  for (const pkg of input.packages) {
    if (pkg.status === 'cancelled') continue;
    if (ms(pkg.writtenOffAt)) continue;
    const left = outstanding(pkg, input.payments);
    if (left <= 0) continue;

    const client = clients.get(pkg.clientId);
    if (!client) continue;

    const due = dueAt(pkg);
    const late = daysLate(due, now);
    const reminders = reminderCount(input.nudges, pkg.clientId);

    rows.push({
      clientId: pkg.clientId,
      packageId: pkg.id,
      name: client.name,
      phone: client.phone ?? null,
      amount: left,
      dueAt: due,
      late,
      reminders,
      severity: late > 0 ? 'critical' : 'alert',
      detail: [`${rupees(left)} for ${packDescription(pkg)}`, dueLabel(due, now), remindedLabel(reminders)]
        .filter(Boolean)
        .join(' · '),
      packLabel: packDescription(pkg),
    });
  }

  return rows.sort((a, b) => b.late - a.late || b.amount - a.amount);
}

function remindedLabel(count: number): string {
  if (count === 0) return 'not reminded';
  if (count === 1) return 'reminded once';
  return `reminded ${count} times`;
}

function reminderCount(nudges: MoneyNudge[], clientId: string): number {
  let n = 0;
  for (const nudge of nudges) {
    if (nudge.clientId !== clientId) continue;
    if (!PAYMENT_NUDGES.includes(nudge.templateName ?? '')) continue;
    n += 1;
  }
  return n;
}

export function packDescription(pkg: MoneyPackage): string {
  if (pkg.type === 'monthly') return 'a monthly pack';
  const n = pkg.sessionsTotal;
  return n ? `a ${n}-session pack` : 'training';
}

/* --------------------------------------------------------------- your share */

/**
 * Whose money it actually is.
 *
 * Indian gyms take 50–70% of personal-training fees — trainers keep "30% to
 * 50%" — so a screen that shows ₹1,06,500 collected and stops there is telling
 * a trainer a number that isn't theirs.
 *
 * Computed from the cut stored on each payment, never recomputed from today's
 * percentage: last month's split has to stay last month's split.
 */
function shareFor(input: MoneyInput, key: string): ShareSplit | null {
  if (!input.gym.name || input.gym.percent == null) return null;

  let collected = 0;
  let theirs = 0;
  for (const p of input.payments) {
    if (!isCollected(p) || monthKey(paidAt(p)) !== key) continue;
    collected += p.amount;
    theirs += cutOn(p);
  }

  return {
    gymName: input.gym.name,
    percent: input.gym.percent,
    collected: round2(collected),
    theirs: round2(theirs),
    yours: round2(collected - theirs),
  };
}

/* ------------------------------------------------------ the month strip · 1a */

/**
 * The month scroller, oldest to newest, stopping at the first month that has
 * anything in it. A strip that runs back to 1970 is a strip nobody scrolls.
 */
export function buildMonths(input: MoneyInput, now: number): MonthFigures[] {
  let earliest = startOfMonthAt(now);
  for (const pkg of input.packages) earliest = Math.min(earliest, startOfMonthAt(billedAt(pkg)));
  for (const p of input.payments) {
    if (isCollected(p)) earliest = Math.min(earliest, startOfMonthAt(paidAt(p)));
  }

  const out: MonthFigures[] = [];
  for (let at = earliest; at <= startOfMonthAt(now); at = addMonths(at, 1)) {
    out.push(figuresFor(input, monthKey(at)));
    // A guard, not a rule: 60 months of strip means something upstream is wrong.
    if (out.length >= 60) break;
  }
  return out;
}

/* -------------------------------------------------------- one client's book */

export interface BookView {
  clientId: string;
  name: string;
  phone: string | null;
  /** What they owe right now, across every open pack. */
  owed: number;
  allTime: number;
  since: number | null;
  sessionsLeft: number | null;
  sessionsTotal: number | null;
  /** Entries and balance markers, interleaved, newest first. */
  rows: (
    | { kind: 'entry'; entry: LedgerEntry }
    | { kind: 'balance'; mark: BalanceMark }
  )[];
  /** "4 of 5 packs on time" — context before judgement. */
  record: string | null;
  subtitle: string;
}

/**
 * The screen a trainer turns their phone around to show somebody.
 *
 * A running balance in reverse-chronological order, with the pack that created
 * each debt and the payment that cleared it — and a balance marker wherever the
 * account hit zero, so you can point at the exact moment it was clear.
 */
export function buildBook(input: MoneyInput, clientId: string, now: number): BookView | null {
  const client = input.clients.find((c) => c.id === clientId);
  if (!client) return null;

  const packages = input.packages
    .filter((p) => p.clientId === clientId && p.status !== 'cancelled')
    .sort((a, b) => billedAt(a) - billedAt(b));
  const payments = input.payments
    .filter((p) => p.clientId === clientId && isCollected(p))
    .sort((a, b) => paidAt(a) - paidAt(b));

  // Oldest first, so the running balance can be accumulated forward.
  const entries: LedgerEntry[] = [];
  for (const pkg of packages) {
    entries.push({
      id: `pkg-${pkg.id}`,
      kind: 'debt',
      direction: 'out',
      at: billedAt(pkg),
      title: packTitle(pkg),
      detail: [shortDate(billedAt(pkg)), packPriceLine(pkg)].filter(Boolean).join(' · '),
      amount: pkg.amount,
      packageId: pkg.id,
      clientId,
    });
    const off = writtenOff(pkg);
    if (off > 0) {
      entries.push({
        id: `off-${pkg.id}`,
        kind: 'debt',
        direction: 'in',
        at: ms(pkg.writtenOffAt),
        title: 'Written off',
        detail: `${shortDate(ms(pkg.writtenOffAt))} · stays in the year's written-off total`,
        amount: off,
        note: 'written off',
        settled: true,
        packageId: pkg.id,
        clientId,
      });
    }
  }
  for (const p of payments) {
    const at = paidAt(p);
    const pkg = packages.find((x) => x.id === p.packageId);
    const full = pkg ? paidOn([p], pkg.id) >= pkg.amount : false;
    entries.push({
      id: p.id,
      kind: 'payment',
      direction: 'in',
      at,
      title: full ? 'Paid in full' : 'Part payment',
      detail: paymentDetail(p, at, now),
      amount: p.amount,
      note: cutOn(p) > 0 ? `−${rupees(cutOn(p))} cut` : undefined,
      clientId,
      packageId: p.packageId ?? undefined,
      undoable: now - at < UNDO_WINDOW_MS,
    });
  }
  entries.sort((a, b) => a.at - b.at || (a.direction === 'out' ? -1 : 1));

  // Walk forward, noting every moment the account came back to zero.
  const clears: { after: string; at: number }[] = [];
  let balance = 0;
  for (const e of entries) {
    balance = round2(balance + (e.direction === 'out' ? e.amount : -e.amount));
    if (balance <= 0 && e.direction === 'in') clears.push({ after: e.id, at: e.at });
  }
  const owed = Math.max(0, balance);

  const rows: BookView['rows'] = [];
  rows.push({
    kind: 'balance',
    mark: {
      id: 'today',
      label: 'Balance today',
      value: owed > 0 ? `${rupees(owed)} due` : 'Everything clear',
      clear: owed <= 0,
    },
  });
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    rows.push({ kind: 'entry', entry: e });
    const clear = clears.find((c) => c.after === e.id);
    // Skip the one at the very top — "balance today" already said it.
    if (clear && i < entries.length - 1) {
      rows.push({
        kind: 'balance',
        mark: {
          id: `clear-${e.id}`,
          label: `Balance on ${shortDate(clear.at)}`,
          value: 'Everything clear',
          clear: true,
        },
      });
    }
  }

  const active = packages.find((p) => p.status === 'active' && (p.sessionsRemaining ?? 0) > 0);
  const allTime = round2(payments.reduce((sum, p) => sum + p.amount, 0));
  const since = packages.length > 0 ? billedAt(packages[0]) : null;

  return {
    clientId,
    name: client.name,
    phone: client.phone ?? null,
    owed,
    allTime,
    since,
    sessionsLeft: active?.sessionsRemaining ?? null,
    sessionsTotal: active?.sessionsTotal ?? null,
    rows,
    record: payRecord(packages, input.payments, now),
    subtitle: since
      ? `Since ${MONTHS_LONG[new Date(since).getMonth()]} · ${rupees(allTime)} all time`
      : 'No packs yet',
  };
}

function packTitle(pkg: MoneyPackage): string {
  if (pkg.type === 'monthly') return 'Monthly pack';
  return pkg.sessionsTotal ? `${pkg.sessionsTotal}-session pack` : 'Training';
}

function packPriceLine(pkg: MoneyPackage): string {
  return pkg.sessionsTotal
    ? `${rupees(pkg.amount)} for ${pkg.sessionsTotal}`
    : rupees(pkg.amount);
}

/**
 * "4 of 5 packs on time." Context before judgement — the sentence that stops a
 * trainer writing somebody off over one late month.
 */
function payRecord(packages: MoneyPackage[], payments: MoneyPayment[], now: number): string | null {
  const closed = packages.filter((p) => outstanding(p, payments) <= 0 || ms(p.writtenOffAt) > 0);
  if (closed.length < 2) return null;

  let onTime = 0;
  for (const pkg of closed) {
    const due = dueAt(pkg);
    const last = payments
      .filter((p) => p.packageId === pkg.id && isCollected(p))
      .reduce((latest, p) => Math.max(latest, paidAt(p)), 0);
    if (due != null && last > 0 && startOfDay(last) <= startOfDay(due)) onTime += 1;
  }

  const openLate = packages.some(
    (p) => outstanding(p, payments) > 0 && daysLate(dueAt(p), now) > 0,
  );
  const stem = `paid ${onTime} of ${closed.length} packs on time`;
  return openLate ? `${stem}. This is the first one they've been late on.` : `${stem}.`;
}

/* ------------------------------------------------------------------- packs */

export interface PackRow {
  id: string;
  name: string;
  type: string;
  sessions: number | null;
  amount: number;
  perSession: number | null;
  active: boolean;
  /** Whose price list it sits on. Never null here — a missing owner is the trainer's. */
  owner: 'trainer' | 'gym';
  /** How many clients are on this pack right now. */
  clients: number;
  detail: string;
}

export interface EndingRow {
  packageId: string;
  clientId: string;
  name: string;
  remaining: number;
  total: number | null;
  detail: string;
}

export interface PacksView {
  /** The trainer's own price list — the packs they set and can discount. */
  selling: PackRow[];
  /**
   * The gym's, when the trainer works at one.
   *
   * Kept apart from `selling` rather than flagged inside it, because the two
   * lists answer different questions: one is what this trainer charges, the
   * other is what the gym's counter charges, and the pricing note below only
   * makes sense about prices the trainer actually controls.
   */
  gymSelling: PackRow[];
  retired: PackRow[];
  ending: EndingRow[];
  activePackages: number;
  /** The arithmetic nobody does: a shorter pack should cost more per session. */
  priceNote: string | null;
  subtitle: string;
}

export function buildPacks(input: MoneyInput, now: number): PacksView {
  const live = input.packages.filter((p) => p.status === 'active');
  const rows: PackRow[] = [...input.packs]
    .sort((a, b) => a.orderIndex - b.orderIndex || a.amount - b.amount)
    .map((pack) => {
      const on = live.filter((p) => p.packId === pack.id).length;
      const per = pack.sessions && pack.sessions > 0 ? Math.round(pack.amount / pack.sessions) : null;
      return {
        id: pack.id,
        name: pack.name,
        type: pack.type,
        sessions: pack.sessions ?? null,
        amount: pack.amount,
        perSession: per,
        active: pack.status === 'active',
        owner: pack.owner === 'gym' ? 'gym' : 'trainer',
        clients: on,
        detail: [
          per ? `${rupees(per)} each` : pack.type === 'monthly' ? 'per month' : null,
          `${on} client${on === 1 ? '' : 's'} on this`,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    });

  const names = nameIndex(input.clients);
  const ending: EndingRow[] = live
    .filter((p) => (p.sessionsRemaining ?? 0) > 0 && (p.sessionsRemaining ?? 0) <= PACK_ENDING_AT)
    .map((p) => ({
      packageId: p.id,
      clientId: p.clientId,
      name: names.get(p.clientId) ?? 'Someone',
      remaining: p.sessionsRemaining ?? 0,
      total: p.sessionsTotal ?? null,
      detail: `${p.sessionsRemaining} session${p.sessionsRemaining === 1 ? '' : 's'} left${
        p.sessionsTotal ? ` · ${p.sessionsTotal}-session pack` : ''
      }`,
    }))
    .sort((a, b) => a.remaining - b.remaining);

  const selling = rows.filter((r) => r.active && r.owner === 'trainer');
  const gymSelling = rows.filter((r) => r.active && r.owner === 'gym');
  return {
    selling,
    gymSelling,
    retired: rows.filter((r) => !r.active),
    ending,
    activePackages: live.length,
    // Only the trainer's own prices are judged. Telling someone their gym has
    // priced its own packs badly is advice they cannot act on.
    priceNote: pricingNote(selling),
    subtitle: gymSelling.length
      ? `${selling.length} yours · ${gymSelling.length} the gym's · ${live.length} active`
      : `${selling.length} you sell · ${live.length} active`,
  };
}

/**
 * Checks the one thing that is easy to get wrong and expensive to leave wrong:
 * a shorter pack should cost MORE per session than a longer one. Pricing them
 * the other way round means the discount is being given for nothing.
 */
function pricingNote(rows: PackRow[]): string | null {
  const priced = rows
    .filter((r) => r.sessions != null && r.perSession != null && r.sessions > 1)
    .sort((a, b) => (a.sessions as number) - (b.sessions as number));
  if (priced.length < 2) return null;

  const short = priced[0];
  const long = priced[priced.length - 1];
  const shortPer = short.perSession as number;
  const longPer = long.perSession as number;

  if (shortPer > longPer) {
    return `Your ${short.sessions}-session pack is ${rupees(shortPer)} a session against ${rupees(
      longPer,
    )} on the ${long.sessions}. That's the right way round — shorter packs should cost more per session.`;
  }
  if (shortPer === longPer) {
    return `Your ${short.sessions} and ${long.sessions}-session packs both work out to ${rupees(
      shortPer,
    )} a session. The longer one gives no reason to commit.`;
  }
  return `Your ${short.sessions}-session pack is ${rupees(shortPer)} a session against ${rupees(
    longPer,
  )} on the ${long.sessions} — the wrong way round. A shorter pack should cost more per session.`;
}

/* --------------------------------------------------------------- gym share */

export interface GymView {
  gymName: string;
  percent: number;
  yours: number;
  theirs: number;
  floorBilled: number;
  remoteBilled: number;
  floorSessions: number;
  settlements: LedgerEntry[];
  monthLabel: string;
}

export function buildGymShare(input: MoneyInput, anchor: number, now: number): GymView | null {
  const share = shareFor(input, monthKey(anchor));
  if (!share) return null;

  const key = monthKey(anchor);
  const clients = new Map(input.clients.map((c) => [c.id, c]));

  let floorBilled = 0;
  let remoteBilled = 0;
  for (const p of input.payments) {
    if (!isCollected(p) || monthKey(paidAt(p)) !== key) continue;
    if (modeOf(clients.get(p.clientId)) === 'remote') remoteBilled += p.amount;
    else floorBilled += p.amount;
  }

  let floorSessions = 0;
  for (const s of input.sessions) {
    if (s.status !== 'done' || monthKey(ms(s.scheduledAt)) !== key) continue;
    const mode = readMode({ session: s.deliveryMode, client: clients.get(s.clientId)?.deliveryMode });
    if (mode === 'floor') floorSessions += 1;
  }

  const settlements = [...input.settlements]
    .sort((a, b) => b.period.localeCompare(a.period))
    .map<LedgerEntry>((s) => ({
      id: s.id,
      kind: 'settlement',
      direction: 'out',
      at: ms(s.settledAt) || ms(s.dueAt) || now,
      title: `${periodLabel(s.period)} share`,
      detail: settlementDetail(s),
      amount: s.amount,
      note: s.status === 'settled' ? 'settled' : undefined,
      settled: s.status === 'settled',
    }));

  return {
    gymName: share.gymName,
    percent: share.percent,
    yours: share.yours,
    theirs: share.theirs,
    floorBilled: round2(floorBilled),
    remoteBilled: round2(remoteBilled),
    floorSessions,
    settlements,
    monthLabel: monthLabel(anchor),
  };
}

/* -------------------------------------------------------------- the year */

export interface YearBar {
  key: string;
  label: string;
  collected: number;
  owed: number;
  /** Heights as fractions of the tallest month. */
  collectedPart: number;
  owedPart: number;
  empty: boolean;
  current: boolean;
  at: number;
}

export interface GstView {
  turnover: number;
  projected: number;
  fraction: number;
  near: boolean;
  over: boolean;
  fromLabel: string;
  note: string;
}

export interface YearView {
  label: string;
  bars: YearBar[];
  turnover: number;
  best: number;
  average: number;
  writtenOff: number;
  gst: GstView;
  subtitle: string;
}

export function buildYear(input: MoneyInput, anchor: number, now: number): YearView {
  const { from, label } = financialYear(anchor);
  const bars: YearBar[] = [];
  const nowKey = monthKey(now);

  let peak = 0;
  const figures: MonthFigures[] = [];
  for (let i = 0; i < 12; i += 1) {
    const at = addMonths(from, i);
    const f = figuresFor(input, monthKey(at));
    figures.push(f);
    peak = Math.max(peak, f.billed);
  }

  const scale = peak || 1;
  for (let i = 0; i < 12; i += 1) {
    const f = figures[i];
    const at = addMonths(from, i);
    bars.push({
      key: f.key,
      label: MONTHS_LONG[new Date(at).getMonth()][0],
      collected: f.collected,
      owed: f.owed,
      collectedPart: f.collected / scale,
      owedPart: f.owed / scale,
      empty: f.billed === 0,
      current: f.key === nowKey,
      at,
    });
  }

  const withMoney = figures.filter((f) => f.billed > 0);
  const turnover = round2(figures.reduce((sum, f) => sum + f.billed, 0));
  const best = withMoney.reduce((max, f) => Math.max(max, f.billed), 0);
  const average = withMoney.length > 0 ? Math.round(turnover / withMoney.length) : 0;
  const off = round2(figures.reduce((sum, f) => sum + f.writtenOff, 0));

  return {
    label,
    bars,
    turnover,
    best,
    average,
    writtenOff: off,
    gst: buildGst(turnover, withMoney.length, from),
    subtitle: `${label} · ${rupeesShort(turnover)} so far`,
  };
}

/**
 * The turnover meter.
 *
 * Nobody in the category warns about this because nobody in the category is
 * built for India. The projection is a straight run-rate — deliberately crude,
 * because a trainer needs a month's notice, not a forecast.
 */
function buildGst(turnover: number, monthsWithMoney: number, from: number): GstView {
  const elapsed = Math.max(1, monthsWithMoney);
  const projected = Math.round((turnover / elapsed) * 12);
  const fraction = Math.min(1, turnover / GST_LINE);
  const near = projected >= GST_LINE * GST_WARN_FRACTION;
  const over = turnover >= GST_LINE;

  const note = over
    ? `You've crossed ₹20 lakh this year. Registration is due — this is the point to talk to a CA.`
    : near
      ? `On this run rate you reach ₹20 lakh before March. Registration takes a few days, and late registration carries a penalty — worth starting now.`
      : `Services cross into GST at ₹20 lakh a year — ₹10 lakh in a few north-eastern states. You're on track for ${rupeesShort(
          projected,
        )}, comfortably under. We'll say so a month before that changes.`;

  return {
    turnover,
    projected,
    fraction,
    near,
    over,
    fromLabel: `${MONTHS_LONG[new Date(from).getMonth()].slice(0, 3)} ${new Date(from).getFullYear()}`,
    note,
  };
}

/* ------------------------------------------------------------------ export */

export type ExportScope = 'month' | 'year' | 'all';

export interface ExportSummary {
  entries: number;
  billed: number;
  collected: number;
  writtenOff: number;
  gymSharePaid: number;
  yours: number;
  label: string;
}

/**
 * What is about to leave the phone, shown before it does.
 *
 * "Yours" is the only figure on that screen that is really theirs, which is why
 * it is the total line.
 */
export function buildExport(input: MoneyInput, scope: ExportScope, anchor: number): ExportSummary {
  const rows = exportRows(input, scope, anchor);
  const { from, to, label } = scopeRange(scope, anchor);

  let billed = 0;
  let off = 0;
  for (const pkg of input.packages) {
    const at = billedAt(pkg);
    if (at < from || at >= to || pkg.status === 'cancelled') continue;
    billed += pkg.amount;
    off += writtenOff(pkg);
  }

  const collected = rows.reduce((sum, r) => sum + r.amount, 0);
  const cut = rows.reduce((sum, r) => sum + r.cut, 0);

  let settled = 0;
  for (const s of input.settlements) {
    const at = ms(s.settledAt);
    if (s.status !== 'settled' || !at || at < from || at >= to) continue;
    settled += s.amount;
  }

  return {
    entries: rows.length,
    billed: round2(billed),
    collected: round2(collected),
    writtenOff: round2(off),
    gymSharePaid: round2(settled),
    yours: round2(collected - cut),
    label,
  };
}

interface ExportRow {
  at: number;
  client: string;
  amount: number;
  method: string;
  cut: number;
  receipt: string;
}

function exportRows(input: MoneyInput, scope: ExportScope, anchor: number): ExportRow[] {
  const { from, to } = scopeRange(scope, anchor);
  const names = nameIndex(input.clients);
  return input.payments
    .filter((p) => isCollected(p) && paidAt(p) >= from && paidAt(p) < to)
    .sort((a, b) => paidAt(a) - paidAt(b))
    .map((p) => ({
      at: paidAt(p),
      client: names.get(p.clientId) ?? 'Unknown',
      amount: p.amount,
      method: methodLabel(p.method),
      cut: cutOn(p),
      receipt: p.receiptNo ?? '',
    }));
}

function scopeRange(scope: ExportScope, anchor: number): { from: number; to: number; label: string } {
  if (scope === 'month') {
    const from = startOfMonthAt(anchor);
    return { from, to: addMonths(from, 1), label: `${monthLabel(anchor)} ${new Date(from).getFullYear()}` };
  }
  if (scope === 'year') {
    const fy = financialYear(anchor);
    return { from: fy.from, to: fy.to, label: fy.label };
  }
  return { from: 0, to: Number.MAX_SAFE_INTEGER, label: 'Everything' };
}

/**
 * A CSV a chartered accountant can actually open.
 *
 * Date, client, amount, method, gym share, receipt number — in that order,
 * because that is the order they were promised on the export sheet.
 */
export function buildCsv(input: MoneyInput, scope: ExportScope, anchor: number): string {
  const rows = exportRows(input, scope, anchor);
  const lines = ['Date,Client,Amount,Method,Gym share,Receipt no'];
  for (const r of rows) {
    lines.push(
      [isoDate(r.at), csv(r.client), r.amount.toFixed(2), csv(r.method), r.cut.toFixed(2), csv(r.receipt)].join(
        ',',
      ),
    );
  }
  const summary = buildExport(input, scope, anchor);
  lines.push('');
  lines.push(`Billed,${summary.billed.toFixed(2)}`);
  lines.push(`Collected,${summary.collected.toFixed(2)}`);
  lines.push(`Written off,${summary.writtenOff.toFixed(2)}`);
  lines.push(`Gym share paid,${summary.gymSharePaid.toFixed(2)}`);
  lines.push(`Yours,${summary.yours.toFixed(2)}`);
  return lines.join('\n');
}

function isoDate(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/* ------------------------------------------------------------- the reminder */

export type Tone = 'polite' | 'firm' | 'custom';

/**
 * Three separate chats, each with their own name, amount and UPI link. Never a
 * group message about money — the debt is small and the relationship is
 * personal, and a broadcast about money costs clients.
 */
export function reminderText(
  tone: Tone,
  row: { name: string; amount: number; packLabel: string; late: number },
  gym: GymProfile,
): string {
  const first = row.name.split(' ')[0];
  const pay = gym.upiVpa
    ? `You can pay on UPI here: ${gym.upiVpa} — or cash at the gym.`
    : `Cash or UPI, whichever is easier.`;

  if (tone === 'firm') {
    return `Hi ${first}, ${rupees(row.amount)} for your ${stripArticle(row.packLabel)} is now ${
      row.late
    } days overdue. ${pay} Please settle it this week so we can carry on as usual.`;
  }
  return `Hi ${first}, ${rupees(row.amount)} is pending for your ${stripArticle(
    row.packLabel,
  )}. ${pay} Thanks!`;
}

function stripArticle(label: string): string {
  return label.replace(/^an? /, '');
}

/** The UPI intent link. Money goes straight to the trainer; we never see it. */
export function upiUri(gym: GymProfile, amount: number, note: string): string | null {
  if (!gym.upiVpa) return null;
  const params = [
    `pa=${encodeURIComponent(gym.upiVpa)}`,
    `pn=${encodeURIComponent(gym.trainerName || 'Trainer')}`,
    `am=${Math.round(amount)}`,
    'cu=INR',
    `tn=${encodeURIComponent(note)}`,
  ];
  return `upi://pay?${params.join('&')}`;
}

/** wa.me needs digits only, and an Indian number needs its country code. */
export function whatsappUri(phone: string | null, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}
