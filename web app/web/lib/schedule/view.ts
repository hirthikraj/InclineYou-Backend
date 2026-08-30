import {
  DAY_MS, MONTHS_LONG, dayLong, startOfDay, startOfMonth, startOfWeek,
} from '@/lib/today/time';

/**
 * WHICH WEEK, AND WHICH VIEW — AND BOTH LIVE IN THE URL.
 *
 * `webapp-schedule.html` draws three views of one route and never says where the
 * choice is kept. It is kept in the query string, and that is a decision with
 * consequences worth writing down:
 *
 *  · **Reload lands on the same week.** A trainer who opens a session panel, gets
 *    interrupted and comes back an hour later is looking at the week they left,
 *    not at this one.
 *  · **A week is linkable.** `/schedule?view=week&d=2026-08-10` is a thing a
 *    trainer can paste to a teammate, and `webapp-rail.html`'s pins already point
 *    into this screen by date.
 *  · **The server can fetch exactly the window that is drawn.** The alternative —
 *    view state in React — means every screen fetches a month and throws most of
 *    it away, on the one screen whose data volume is sessions.
 *
 * NO WIDTH EVER CHANGES THE VIEW. It is tempting to open a phone on Day and a
 * desk on Week, and it is the same mistake `Rail.tsx` records for the shell: a
 * component that branches on a measured width renders the wrong half for one
 * frame after every resize and cannot be server-rendered at all. Worse here,
 * because the view is a thing the trainer CHOSE — silently overruling it on a
 * narrow window is the product forgetting an answer, which is the one behaviour
 * `lib/setup/steps.ts` is arranged to prevent. The week is made to work at 390px
 * instead; see *THE WEEK ON A PHONE* in `app/styles/app.css`.
 */

export type ScheduleView = 'day' | 'week' | 'month';

export const VIEWS: ScheduleView[] = ['day', 'week', 'month'];

export const VIEW_LABELS: Record<ScheduleView, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

/** What `<` and `>` step by, in the words the button's accessible name needs. */
export const STEP_LABELS: Record<ScheduleView, { prev: string; next: string }> = {
  day: { prev: 'Previous day', next: 'Next day' },
  week: { prev: 'Previous week', next: 'Next week' },
  month: { prev: 'Previous month', next: 'Next month' },
};

export function isScheduleView(raw: unknown): raw is ScheduleView {
  return raw === 'day' || raw === 'week' || raw === 'month';
}

export function parseView(raw: string | undefined): ScheduleView {
  return isScheduleView(raw) ? raw : 'week';
}

/**
 * `d=YYYY-MM-DD` → the local midnight of that day, or NULL for "not given".
 *
 * Null rather than a default, because the caller that resolves it is not allowed
 * to read a clock: a page component is subject to React's purity rule and
 * `Date.now()` in one is a value that changes between a render and its replay.
 * `requireSchedule` resolves it, which is a request-scoped function and the right
 * place for "now".
 *
 * Parsed by hand rather than through `new Date(string)`, and the reason is the
 * bug that convention produces: `new Date('2026-08-10')` is parsed as **UTC
 * midnight**, which in IST is 05:30 on the 10th — fine — but west of Greenwich it
 * is the 9th, so the same link opens a different week depending on where it is
 * clicked. Every other date in this product is a local instant; this one is too.
 */
export function parseAnchor(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const [, y, mo, d] = m;
  const at = new Date(Number(y), Number(mo) - 1, Number(d)).getTime();
  return Number.isFinite(at) ? startOfDay(at) : null;
}

/** The inverse, for every link this screen writes. */
export function stampAnchor(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * One step forward or back, in the view's own unit.
 *
 * A month steps by calendar month and not by 30 days, which matters at the two
 * ends of February: `anchor + 30 * DAY_MS` from 31 January lands on 2 March and
 * skips February altogether. `setMonth` on a day-of-month that the target month
 * does not have overflows the same way, so the day is clamped first.
 */
export function stepAnchor(view: ScheduleView, anchor: number, delta: 1 | -1): number {
  if (view === 'day') return startOfDay(anchor + delta * DAY_MS);
  if (view === 'week') return startOfWeek(anchor) + delta * 7 * DAY_MS;

  const d = new Date(startOfMonth(anchor));
  d.setMonth(d.getMonth() + delta);
  return startOfDay(d.getTime());
}

/** The first day the view draws — Monday for a week, and for a month's first row. */
export function gridStart(view: ScheduleView, anchor: number): number {
  if (view === 'day') return startOfDay(anchor);
  if (view === 'week') return startOfWeek(anchor);
  return startOfWeek(startOfMonth(anchor));
}

/**
 * How many days the view draws.
 *
 * A month is always **42**, never 28–35 as the calendar happens to need. The same
 * reason `MonthGrid.tsx` gives on the phone: a grid whose row count changes with
 * the month is a grid that reflows under the trainer between March and April, and
 * six rows is the only count that fits every month. Cells outside the month are
 * dimmed, not dropped — the week rail totals whole weeks, and a half-drawn first
 * row would make its total look wrong.
 */
export function gridDays(view: ScheduleView): number {
  return view === 'day' ? 1 : view === 'week' ? 7 : 42;
}

/** The fetch window: `[from, to)`, and `to` is exclusive on `GET /v1/sessions`. */
export function rangeFor(view: ScheduleView, anchor: number): { from: number; to: number } {
  const from = gridStart(view, anchor);
  return { from, to: from + gridDays(view) * DAY_MS };
}

/**
 * What the toolbar prints between the two arrows.
 *
 * A week that straddles a month names both — "31 August — 6 September 2026", not
 * "31 — 6 September", which is a range running backwards. It straddles a year
 * about once a year, and then both years are named for the same reason.
 */
export function labelFor(view: ScheduleView, anchor: number): string {
  if (view === 'day') return dayLong(anchor);

  if (view === 'month') {
    const d = new Date(startOfMonth(anchor));
    return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  }

  const from = new Date(startOfWeek(anchor));
  const to = new Date(startOfWeek(anchor) + 6 * DAY_MS);

  if (from.getFullYear() !== to.getFullYear()) {
    return `${from.getDate()} ${MONTHS_LONG[from.getMonth()]} ${from.getFullYear()} — `
      + `${to.getDate()} ${MONTHS_LONG[to.getMonth()]} ${to.getFullYear()}`;
  }
  if (from.getMonth() !== to.getMonth()) {
    return `${from.getDate()} ${MONTHS_LONG[from.getMonth()]} — `
      + `${to.getDate()} ${MONTHS_LONG[to.getMonth()]} ${to.getFullYear()}`;
  }
  return `${from.getDate()} — ${to.getDate()} ${MONTHS_LONG[from.getMonth()]} ${from.getFullYear()}`;
}

/** The crumb in the top bar, which has less room than the toolbar. */
export function crumbFor(view: ScheduleView, anchor: number): string {
  if (view === 'day') return dayLong(anchor);
  if (view === 'month') return labelFor('month', anchor);
  const from = new Date(startOfWeek(anchor));
  return `Week of ${from.getDate()} ${MONTHS_LONG[from.getMonth()]}`;
}

/**
 * EVERY LINK THIS SCREEN WRITES, AND THE LINE THE URL IS DRAWN AT.
 *
 * The URL carries the VIEW and the ANCHOR, and nothing else. That line is not
 * cosmetic — it is the difference between a chip toggle costing six backend
 * requests and costing nothing.
 *
 * View and anchor change WHAT IS FETCHED: `rangeFor` turns them into the window
 * `GET /v1/sessions` is asked for, so changing either has to be a navigation and
 * belongs in the URL, where it is also linkable, reloadable and in the back
 * button's history — the three things `webapp-rail.html`'s date pins need.
 *
 * The delivery-mode filters, the gap overlay, the open session panel and the open
 * booking form change only WHAT IS DRAWN from rows the browser already holds. In
 * the App Router a search-param change is a server round trip, so putting them
 * here would mean re-reading the roster, the programs, the packages and the
 * working hours to un-tick *Remote* — latency on a control whose whole value is
 * that it is instant. They are client state in `Schedule.tsx`.
 *
 * The cost is real and worth stating rather than hiding: a link to this screen
 * cannot carry "with remote hidden and the gaps showing", and reloading drops
 * those back to their defaults. That is the right trade — the filters are a way
 * of looking at a week, and the week is the thing worth sending somebody.
 */
export function hrefFor(view: ScheduleView, anchor: number): string {
  const params = new URLSearchParams();
  // The default view is OMITTED rather than written: `?view=week` on the default
  // makes two URLs for one screen, which halves the browser's own history dedupe.
  if (view !== 'week') params.set('view', view);
  params.set('d', stampAnchor(anchor));
  return `/schedule?${params.toString()}`;
}
