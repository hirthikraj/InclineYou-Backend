/**
 * 7a–7c · The weekly report, from the trainer's side.
 *
 * The client role has had this screen since the beginning — Sunday's report
 * lands on their phone and they read it. The trainer, who is the person the
 * report is *from*, had no way to see what went out. That is the gap this
 * closes, and it is not a nicety: a trainer asked "what did you send me on the
 * 3rd?" in a session cannot answer, and a report they cannot see is a report
 * they cannot stand behind.
 *
 * ── One row, two readers ──────────────────────────────────────────────────
 *
 * Everything here reads `weekly_reports`, which the **server** writes and
 * nothing on either phone recomputes. So the figures a trainer sees on this
 * screen are the same figures the client saw, because they are the same row —
 * not a second calculation that agrees today and drifts in November when a set
 * from the 3rd gets corrected.
 *
 * ── Delivery state comes from the nudge log, not from the report ──────────
 *
 * This is the trap in this feature and it is worth spelling out. `weekly_report
 * .sent_at` looks like the delivery timestamp and is not: `WeeklyReportWriter`
 * sets it to `NOW()` in the same INSERT that creates the row, so it means
 * **written**. Reading it as delivery would mark every report on this screen
 * "Sent" the instant it existed — including a report for a client with no phone
 * number, which cannot have gone anywhere.
 *
 * The real delivery record is the `nudge_log` row the weekly job writes beside
 * it: channel `whatsapp`, template `weekly_report`, status `queued`. That status
 * is the one field in the system that can honestly say sent, queued or failed,
 * and it already rides the trainer's sync. So:
 *
 *   · **Sent** — a delivery row says so.
 *   · **Failed** — a delivery row says so. Nothing writes this yet; it becomes
 *     real the day a BSP is wired, and the screen is ready for it rather than
 *     needing a change then.
 *   · **No number** — no phone on file. It is not going anywhere until somebody
 *     adds one, and unlike "failed" that names the fix.
 *   · **Queued** — everything else: written, not out yet. Which is the honest
 *     state of every report in the build as it stands.
 *
 * A client with no row for a finished week is simply absent from that week. The
 * server had nothing to report on, and a zero-filled row would be a claim we
 * did not make.
 *
 * ── Share on demand · 7b ──────────────────────────────────────────────────
 *
 * Any past week, over WhatsApp, built from the stored row and therefore working
 * with no signal. The app never sends — `whatsappUri` opens the conversation
 * with the text in it, which is the same refusal every nudge makes.
 */

export type DeliveryState = 'sent' | 'queued' | 'failed' | 'unreachable';

/** The template name the weekly job stamps on its `nudge_log` row. */
export const WEEKLY_TEMPLATE = 'weekly_report';

/** How long after a week closes a delivery row still belongs to that week. */
const DELIVERY_WINDOW_MS = 8 * 86_400_000;

/** One weekly_reports row, flattened. Mirrors the client role's `ClientReport`. */
export interface WeeklyReportRecord {
  id: string;
  clientId: string;
  weekStart: string;
  weekEnd: string;
  sessionsKept: number;
  sessionsPlanned: number;
  trainedDays: string | null;
  volumeKg: number;
  setsDone: number;
  newBests: number;
  bestLine: string | null;
  bestPrevious: string | null;
  /**
   * The column is `sent_at`; the meaning is **written at**.
   *
   * Named for what it does rather than what it is called, because the whole
   * delivery model above turns on not confusing the two. Nothing reads it for
   * state — it is here so the row is represented honestly and so the next
   * person to open this file sees the warning before the field.
   */
  writtenAt: number | null;
}

export interface WeeklyClient {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * One `nudge_log` row — the only place a delivery is recorded.
 *
 * Narrowed to the weekly template by the caller, because the same table carries
 * every reminder a trainer has ever sent and matching on client alone would let
 * a Tuesday payment chase decide whether Sunday's report arrived.
 */
export interface WeeklyDelivery {
  clientId: string;
  /** 'queued' | 'sent' | 'failed', as the server wrote it. */
  status: string;
  /** When the row was written. Used to decide which week it belongs to. */
  at: number;
}

export interface WeeklyInput {
  reports: WeeklyReportRecord[];
  clients: WeeklyClient[];
  deliveries: WeeklyDelivery[];
}

export const EMPTY_WEEKLY_INPUT: WeeklyInput = { reports: [], clients: [], deliveries: [] };

/* ------------------------------------------------------------ 7a · the list */

export interface WeekOption {
  weekStart: string;
  weekEnd: string;
  /** "3–9 Aug" — short, because these are chips. */
  label: string;
  count: number;
}

export interface WeeklyRow {
  reportId: string;
  clientId: string;
  name: string;
  /** "4 of 4 kept · 12,400 kg" */
  line: string;
  state: DeliveryState;
  percent: number;
}

export interface WeeklyListView {
  weeks: WeekOption[];
  /** The week being shown. Null only when there is not a single report yet. */
  week: WeekOption | null;
  subtitle: string;
  sent: WeeklyRow[];
  queued: WeeklyRow[];
  failed: WeeklyRow[];
  unreachable: WeeklyRow[];
  empty: boolean;
}

/**
 * @param weekStart Which week to open on. Omitted means the most recent one
 *   that has any reports — which is what a trainer opening this screen means.
 */
export function buildWeeklyList(
  input: WeeklyInput,
  weekStart?: string | null,
): WeeklyListView {
  const names = new Map(input.clients.map((c) => [c.id, c]));

  const byWeek = new Map<string, WeeklyReportRecord[]>();
  for (const report of input.reports) {
    const rows = byWeek.get(report.weekStart) ?? [];
    rows.push(report);
    byWeek.set(report.weekStart, rows);
  }

  const weeks: WeekOption[] = [...byWeek.entries()]
    .map(([start, rows]) => ({
      weekStart: start,
      weekEnd: rows[0].weekEnd,
      label: shortRange(start, rows[0].weekEnd),
      count: rows.length,
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));

  const week = weeks.find((w) => w.weekStart === weekStart) ?? weeks[0] ?? null;
  const rows = week ? (byWeek.get(week.weekStart) ?? []) : [];

  const buckets: Record<DeliveryState, WeeklyRow[]> = {
    sent: [],
    queued: [],
    failed: [],
    unreachable: [],
  };

  for (const report of rows) {
    const client = names.get(report.clientId);
    // A report for somebody who is no longer on the roster still happened. It
    // is listed under the id it has rather than dropped, because dropping it
    // would silently change the count the header just quoted.
    const row = listRow(report, client ?? null, input.deliveries);
    buckets[row.state].push(row);
  }

  const byName = (a: WeeklyRow, b: WeeklyRow) => a.name.localeCompare(b.name);
  for (const rows of Object.values(buckets)) rows.sort(byName);

  return {
    weeks,
    week,
    subtitle: subtitle(week, buckets),
    ...buckets,
    empty: weeks.length === 0,
  };
}

function listRow(
  report: WeeklyReportRecord,
  client: WeeklyClient | null,
  deliveries: WeeklyDelivery[],
): WeeklyRow {
  const kept = `${report.sessionsKept} of ${report.sessionsPlanned} kept`;
  const volume = report.volumeKg > 0 ? ` · ${kilos(report.volumeKg)}` : '';

  return {
    reportId: report.id,
    clientId: report.clientId,
    name: client?.name ?? 'Former client',
    line: `${kept}${volume}`,
    state: deliveryState(report, client, deliveries),
    percent:
      report.sessionsPlanned > 0
        ? Math.round((report.sessionsKept / report.sessionsPlanned) * 100)
        : 100,
  };
}

/**
 * The delivery row that belongs to this report, if there is one.
 *
 * Matched by client and by time: the job runs on the Monday after the week it
 * reports on, so the row lands just after `week_end`. A week's worth of slack
 * either side of that covers a job re-run by hand without ever letting last
 * week's delivery answer for this week's report.
 */
function deliveryFor(
  report: WeeklyReportRecord,
  deliveries: WeeklyDelivery[],
): WeeklyDelivery | null {
  const closed = endOfWeek(report.weekEnd);
  const mine = deliveries
    .filter((d) => d.clientId === report.clientId && d.at >= closed && d.at < closed + DELIVERY_WINDOW_MS)
    .sort((a, b) => b.at - a.at);
  return mine[0] ?? null;
}

export function deliveryState(
  report: WeeklyReportRecord,
  client: WeeklyClient | null,
  deliveries: WeeklyDelivery[],
): DeliveryState {
  const delivery = deliveryFor(report, deliveries);
  const status = delivery?.status.toLowerCase();

  if (status === 'sent' || status === 'delivered' || status === 'read') return 'sent';
  if (status === 'failed' || status === 'undelivered') return 'failed';

  // Nothing has gone out. Whether it CAN is the useful thing to say next, and a
  // missing number is the one cause a trainer can fix from here.
  if (!client?.phone) return 'unreachable';
  return 'queued';
}

/** The label and tone a delivery state wears, stated once for both screens. */
export const DELIVERY: Record<
  DeliveryState,
  { label: string; tone: 'ok' | 'info' | 'warn' | 'danger' }
> = {
  sent: { label: 'Sent', tone: 'ok' },
  queued: { label: 'Queued', tone: 'info' },
  failed: { label: 'Failed', tone: 'danger' },
  unreachable: { label: 'No number', tone: 'warn' },
};

function subtitle(week: WeekOption | null, buckets: Record<DeliveryState, WeeklyRow[]>): string {
  if (!week) return 'Written every Sunday night';
  const parts: string[] = [];
  if (buckets.failed.length) parts.push(`${buckets.failed.length} failed`);
  if (buckets.unreachable.length) parts.push(`${buckets.unreachable.length} with no number`);
  if (buckets.queued.length) parts.push(`${buckets.queued.length} queued`);
  if (buckets.sent.length) parts.push(`${buckets.sent.length} sent`);
  return parts.length ? `${week.label} · ${parts.join(' · ')}` : week.label;
}

/* ---------------------------------------------------------- 7a · one report */

export interface WeeklyDay {
  label: string;
  trained: boolean;
}

export interface WeeklyReportView {
  reportId: string;
  clientId: string;
  name: string;
  /** "3–9 August" */
  range: string;
  kept: number;
  planned: number;
  percent: number;
  days: WeeklyDay[];
  trainedLabel: string;
  restLabel: string;
  volume: string;
  sets: string;
  newBests: string;
  best: { line: string; previous: string | null } | null;
  state: DeliveryState;
  /** "Sent 10 August" or the reason it has not gone. */
  stateLine: string;
  /** Null when there is no number to open a conversation with. */
  phone: string | null;
  /** True when they kept everything the plan asked for — no miss to soften. */
  perfect: boolean;
}

/**
 * The most recent report a client has, or null if they have never had one.
 *
 * What "their weekly report" means when somebody arrives from the client file
 * rather than from a week. Newest, not nearest-to-today: a client who was
 * paused for a month should land on the last real week they had, not on an
 * empty screen for a week nobody trained.
 */
export function latestReportFor(input: WeeklyInput, clientId: string): string | null {
  const mine = input.reports
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  return mine[0]?.id ?? null;
}

export function buildWeeklyReport(
  input: WeeklyInput,
  reportId: string,
): WeeklyReportView | null {
  const report = input.reports.find((r) => r.id === reportId);
  if (!report) return null;

  const client = input.clients.find((c) => c.id === report.clientId) ?? null;

  const trained = new Set(
    (report.trainedDays ?? '')
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => n >= 1 && n <= 7),
  );

  // Monday-first, matching the week the report covers and the client's own
  // copy of it. A trainer comparing the two must not have to re-read the axis.
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = letters.map((label, i) => ({ label, trained: trained.has(i + 1) }));
  const rest = 7 - trained.size;
  const state = deliveryState(report, client, input.deliveries);
  const delivery = deliveryFor(report, input.deliveries);

  return {
    reportId: report.id,
    clientId: report.clientId,
    name: client?.name ?? 'Former client',
    range: longRange(report.weekStart, report.weekEnd),
    kept: report.sessionsKept,
    planned: report.sessionsPlanned,
    percent:
      report.sessionsPlanned > 0
        ? Math.round((report.sessionsKept / report.sessionsPlanned) * 100)
        : 100,
    days,
    trainedLabel: trained.size
      ? `Trained · ${[...trained].sort((a, b) => a - b).map((n) => names[n - 1]).join(', ')}`
      : 'Nothing logged',
    restLabel: `${rest} rest day${rest === 1 ? '' : 's'}`,
    volume: kilos(report.volumeKg),
    sets: String(report.setsDone),
    newBests: String(report.newBests),
    best: report.bestLine ? { line: report.bestLine, previous: report.bestPrevious } : null,
    state,
    stateLine: stateLine(state, delivery),
    phone: client?.phone ?? null,
    perfect: report.sessionsPlanned > 0 && report.sessionsKept >= report.sessionsPlanned,
  };
}

function stateLine(state: DeliveryState, delivery: WeeklyDelivery | null): string {
  switch (state) {
    case 'sent':
      return delivery ? `Sent ${stamp(delivery.at)}` : 'Sent';
    case 'failed':
      return 'The message did not get through. The report itself is safe — send it again below.';
    case 'unreachable':
      return 'No phone number on file, so this has not gone anywhere. Add one and it goes with the next Sunday run.';
    default:
      return 'Written and queued to go out. Send it yourself below if you would rather not wait.';
  }
}

/* ------------------------------------------------------- 7b · share on demand */

/**
 * The message, in the trainer's voice rather than the app's.
 *
 * Short enough to read in a notification. It leads with what they kept — the
 * same warmth rule the client's own copy keeps — and it never mentions XRep,
 * because this is going out of the trainer's WhatsApp and it should read like
 * they wrote it.
 */
export function reportMessage(view: WeeklyReportView): string {
  const first = view.name.trim().split(/\s+/)[0] || view.name;
  const lines = [`${first} — your week, ${view.range}.`];

  lines.push(
    view.planned > 0
      ? `${view.kept} of ${view.planned} sessions kept.`
      : `${view.kept} session${view.kept === 1 ? '' : 's'} done.`,
  );

  if (Number(view.sets) > 0) {
    lines.push(`${view.sets} sets · ${view.volume} moved.`);
  }
  if (view.best) {
    lines.push(
      view.best.previous ? `Best: ${view.best.line} (was ${view.best.previous}).` : `Best: ${view.best.line}.`,
    );
  }
  if (Number(view.newBests) > 0) {
    lines.push(`${view.newBests} new personal best${view.newBests === '1' ? '' : 's'}.`);
  }

  lines.push(view.perfect ? 'Everything the plan asked for. See you this week.' : 'See you this week.');

  return lines.join('\n');
}

/* -------------------------------------------------------------------- words */

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Kilos with Indian grouping — the same figure the client's report shows. */
function kilos(volumeKg: number): string {
  return `${Math.round(volumeKg).toLocaleString('en-IN')} kg`;
}

/**
 * Midnight at the end of a week's last day, local time.
 *
 * The ISO dates on a report are dates, not instants — the job writes them in
 * IST and a phone reads them wherever it is. Parsing with an explicit
 * `T00:00:00` keeps them local rather than letting the engine treat a bare
 * `YYYY-MM-DD` as UTC, which would shift the whole window by a day.
 */
function endOfWeek(endIso: string): number {
  return new Date(`${endIso}T00:00:00`).getTime() + 86_400_000;
}

function stamp(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "3–9 Aug", collapsing the month when both ends share it. */
function shortRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
  }
  return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
}

/** "3–9 August" — the detail screen has the room for the long month. */
function longRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const month = end.toLocaleDateString('en-GB', { month: 'long' });
  if (sameMonth) return `${start.getDate()}–${end.getDate()} ${month}`;
  return `${start.getDate()} ${start.toLocaleDateString('en-GB', { month: 'long' })} – ${end.getDate()} ${month}`;
}
