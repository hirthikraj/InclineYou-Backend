import type { PageTab } from '@/components/shell/PageTabs';

/**
 * THE FOUR VIEWS OF WORKOUTS, and they are the Programs strip's twin.
 *
 * `lib/programs/tabs.ts` owns *Programs · Templates* so the shelf and the
 * catalogue cannot disagree about what is on the strip. This owns the same for
 * *Completed · Scheduled · Missed · Templates*, and for the same reason.
 *
 * They are LINKS to one route with a `?view=`, not three routes. All three
 * session buckets come out of ONE `requireSessions()` — they are filters over
 * one array — so a segment per tab is three round trips for data the server
 * already sent. The parameter is the tab now, not the one-shot it used to be:
 * a reload, a back press and a shared link all land on the tab that was open.
 */
export type WorkoutsView = 'completed' | 'scheduled' | 'missed' | 'templates';

export const WORKOUTS_TABS: { key: WorkoutsView; label: string }[] = [
  { key: 'completed', label: 'Completed' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'missed', label: 'Missed' },
  { key: 'templates', label: 'Templates' },
];

const BASE = '/programs/workouts';

/**
 * WHAT A PAGE OF THIS LIST IS.
 *
 * Twenty-five, which is `EXERCISES_PAGE_SIZE`'s figure and is deliberately the
 * same: the two long lists in Fitness walked at different strides is one more
 * thing to learn about a section whose whole argument is that its pages are
 * drawn alike.
 *
 * ── WHY THERE IS A PAGE SIZE AT ALL NOW ─────────────────────────────────────
 *
 * There was not one. The Completed tab rendered **every** row it had — 361 on
 * the seeded book — into a scroller 466px tall, which measured **16,981px of
 * content: thirty-six screens**, ending in a line that read *1 to 361 of 361*.
 * That line is a range control with nothing outside its range, and thirty-six
 * screens of uniform rows is a list with no position in it: no way to say
 * where you are, no way to get back to the row you scrolled past, and no way
 * to send a colleague the place you found it. `Pager`'s own header makes that
 * argument for the exercise library; a year of one trainer's sessions is the
 * same list one section over.
 */
export const WORKOUTS_PAGE_SIZE = 25;

/**
 * The filters, as the URL carries them.
 *
 * Every field optional, and an absent field means the default — which is why
 * `workoutsHref` writes none of the defaults. Two addresses that draw one
 * screen are two entries in the trainer's history and two different things to
 * paste into a message.
 *
 * `q` IS NOT IN HERE, and that is the one deliberate difference from
 * `ExercisesQuery`. The exercise library searches 1,324 rows the server holds
 * and has to ask for the matches; every row of this screen is already in the
 * browser, because all four views come out of one `requireSessions()`. Putting
 * the query in the address would turn a filter that costs nothing into a
 * server round trip per keystroke, on a route that is `force-dynamic` and
 * makes four fetches. So typing narrows in place, and it resets the page —
 * see `Workouts.tsx`, which is where that reset lives.
 */
export interface WorkoutsQuery {
  /** `floor` | `remote`, or absent for both. */
  mode?: 'floor' | 'remote';
  /** The window, in days either side of today. `0`/absent is everything. */
  days?: number;
  /** Zero-based, as every API in this codebase counts. Never written for page one. */
  page?: number;
}

/** The address of one view of the list, filters and page included. */
export function workoutsHref(view: WorkoutsView, query: WorkoutsQuery = {}): string {
  const qs = new URLSearchParams();
  if (view !== 'completed') qs.set('view', view);
  if (query.mode) qs.set('mode', query.mode);
  if (query.days) qs.set('days', String(query.days));
  if (query.page) qs.set('page', String(query.page));
  const s = qs.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/** Unknown values fall through — a hand-typed parameter is a typo, not a
 *  broken page. */
export function parseView(raw: string | string[] | undefined): WorkoutsView {
  const one = Array.isArray(raw) ? raw[0] : raw;
  return WORKOUTS_TABS.some(v => v.key === one) ? (one as WorkoutsView) : 'completed';
}

export function parseMode(raw: string | string[] | undefined): 'floor' | 'remote' | undefined {
  const one = Array.isArray(raw) ? raw[0] : raw;
  return one === 'floor' || one === 'remote' ? one : undefined;
}

/**
 * The window, clamped to the one the server actually read.
 *
 * `getSessions` fetches 90 days back and 30 ahead, so `?days=365` is a filter
 * over data that does not exist and would print *Last 365 days* over three
 * months of rows. Anything unrecognised is the default rather than an error,
 * for `parseView`'s reason.
 */
export const WORKOUTS_DAY_WINDOWS = [7, 30, 90] as const;

export function parseDays(raw: string | string[] | undefined): number | undefined {
  const one = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(one);
  return WORKOUTS_DAY_WINDOWS.includes(n as 7 | 30 | 90) ? n : undefined;
}

/** Zero-based and never negative. `?page=-1` is a typo, not a page. */
export function parsePage(raw: string | string[] | undefined): number {
  const one = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(one);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** The strip, with a count on every tab but the one you are reading — the
 *  count on the current tab is the figure the page below already states.
 *  The filters do NOT ride along: a tab is a different list, and carrying
 *  *last 7 days* onto *Templates* would filter a shelf that has no dates. */
export function workoutsTabs(
  current: WorkoutsView,
  counts: Partial<Record<WorkoutsView, number | null>> = {},
): PageTab[] {
  return WORKOUTS_TABS.map(t => ({
    key: t.key,
    label: t.label,
    href: workoutsHref(t.key),
    count: t.key === current ? null : counts[t.key] ?? null,
  }));
}
