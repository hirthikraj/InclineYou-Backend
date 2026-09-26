import type { PageTab } from '@/components/shell/PageTabs';
import type { ExerciseSource } from './api';

/**
 * THE TWO VIEWS OF THE EXERCISE LIBRARY.
 *
 * `lib/sessions/tabs.ts` and `lib/programs/tabs.ts` own the other two strips in
 * this section and this is the third, written the same way for the reason those
 * two give: a strip drawn at its call-site is a strip the next screen draws
 * slightly differently.
 *
 * ── WHY THESE ARE TABS AND NOT TWO ROUTES ────────────────────────────────────
 *
 * `nav.tsx` draws the line: **a strip above a page is views of THIS page; a
 * column beside the rail is other pages.** *By categories* and *By exercises*
 * are the same question — *which movement* — asked at two grains. Neither is a
 * different screen, and a trainer who switches between them has not gone
 * anywhere; so the strip is right, and a `/categories` segment would have been
 * the mistake that pass was written to undo.
 *
 * ── AND WHY THE VIEW IS IN THE URL ───────────────────────────────────────────
 *
 * It costs nothing and it buys the three things a component-local `useState`
 * cannot: a reload lands where you were, the back button leaves the drill-down
 * you just entered, and a category link a trainer sends to themselves opens the
 * category. The filters ride along for the same reason — *Legs, barbell, page 2*
 * is a place, and a place should have an address.
 *
 * ── THE CATEGORY GRID IS A DOOR INTO THE LIST, NOT A THIRD VIEW ──────────────
 *
 * Clicking *Chest 9* lands on `?group=Chest` — the exercises view, filtered,
 * with the strip showing *By exercises* selected. That is honest about where the
 * click took you, and it means there is exactly one list of exercises in this
 * screen rather than one inside a category and another beside it.
 */
export type ExercisesView = 'exercises' | 'categories';

export const EXERCISES_TABS: { key: ExercisesView; label: string }[] = [
  { key: 'exercises', label: 'By exercises' },
  { key: 'categories', label: 'By categories' },
];

export const EXERCISES_BASE = '/programs/exercises';

/** What a page of exercises is, everywhere — the server's read and the pager
 *  both take this number, and a second copy is how the two disagree. */
export const EXERCISES_PAGE_SIZE = 25;

/** The filters, as the URL carries them. Every field optional; an absent field
 *  and an empty one mean the same thing, which is why `href` drops both. */
export interface ExercisesQuery {
  q?: string;
  group?: string;
  equipment?: string;
  /** Whose movements, and whether finished. `all` is the default and is never
   *  written to the URL. */
  source?: ExerciseSource;
  /** Zero-based, as the API counts. Never written to the URL for page one. */
  page?: number;
}

/**
 * The address of one view of the library.
 *
 * Empty strings and page zero are OMITTED rather than written as `&q=&page=0`.
 * Two URLs that draw the same screen are two entries in the trainer's history
 * and two different things to paste into a message, and the tab strip compares
 * `href`s to decide what is current.
 */
export function exercisesHref(view: ExercisesView, query: ExercisesQuery = {}): string {
  const qs = new URLSearchParams();
  if (view !== 'exercises') qs.set('view', view);
  if (query.q) qs.set('q', query.q);
  if (query.group) qs.set('group', query.group);
  if (query.equipment) qs.set('equipment', query.equipment);
  if (query.source && query.source !== 'all') qs.set('source', query.source);
  if (query.page) qs.set('page', String(query.page));
  const s = qs.toString();
  return s ? `${EXERCISES_BASE}?${s}` : EXERCISES_BASE;
}

/** Unknown values fall through to the list — a hand-typed parameter is a typo,
 *  not a broken page. `lib/sessions/tabs.ts` makes the same call. */
export function parseView(raw: string | string[] | undefined): ExercisesView {
  const one = Array.isArray(raw) ? raw[0] : raw;
  return EXERCISES_TABS.some(v => v.key === one) ? (one as ExercisesView) : 'exercises';
}

/** One search parameter, as a string, with the array case flattened. */
export function parseOne(raw: string | string[] | undefined): string {
  const one = Array.isArray(raw) ? raw[0] : raw;
  return (one ?? '').trim();
}

/** A page number that cannot be negative, fractional or `NaN` — all three are
 *  reachable by hand and all three would ask the API for a slice from nowhere. */
export function parsePage(raw: string | string[] | undefined): number {
  const n = Number.parseInt(parseOne(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The strip, with a count on the tab you are NOT reading.
 *
 * The rule is `lib/programs/tabs.ts`'s and it holds here: the exercises view
 * states its own total in the page header's subtitle, so a count on it would be
 * the same figure twice on one screen. On the categories tab the count is the
 * one thing the strip can say that the page cannot — how many groups are over
 * there.
 */
export function exercisesTabs(
  current: ExercisesView,
  query: ExercisesQuery,
  counts: Partial<Record<ExercisesView, number | null>> = {},
): PageTab[] {
  return EXERCISES_TABS.map(t => ({
    key: t.key,
    label: t.label,
    /* The filters ride to the exercises tab and are DROPPED on the way to the
       categories tab — including `group`, which that view now understands.
       Pressing *By categories* means *show me the categories*, whether you are
       on the other tab or three rows into Chest; a strip that remembered the
       drill-down would be a tab that cannot be used to leave it. The back
       control inside the drill-down points at this same address. */
    href: t.key === 'exercises' ? exercisesHref('exercises', query) : exercisesHref('categories'),
    count: t.key === current ? null : counts[t.key] ?? null,
  }));
}

/** The four options, in the order they are drawn. The labels are what a trainer
 *  reads; the values are what the wire carries. */
export const EXERCISE_SOURCES: { value: ExerciseSource; label: string }[] = [
  { value: 'all', label: 'All exercises' },
  { value: 'incline', label: 'InclineYou exercises' },
  { value: 'mine', label: 'My exercises' },
  { value: 'draft', label: 'Draft' },
];

/** Unknown values fall through to `all`, the way `parseView` does. */
export function parseSource(raw: string | string[] | undefined): ExerciseSource {
  const one = Array.isArray(raw) ? raw[0] : raw;
  return EXERCISE_SOURCES.some(s => s.value === one) ? (one as ExerciseSource) : 'all';
}
