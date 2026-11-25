import type { PageTab } from '@/components/shell/PageTabs';
import type { ExerciseSource, LibraryMeta } from './api';

/**
 * THE LIBRARY'S TWO WAYS IN, AND THE ADDRESS THAT HOLDS EACH.
 *
 * **Categories** is the default: pick a body part and then its muscles — the way a
 * trainer who is building a session thinks. **Search** is every filter at once, for
 * the trainer who knows what they want and wants it narrowed by several things —
 * including kit, which is how a home-visit trainer asks what they can do with a
 * barbell and two kettlebells. (An **Equipment** tab of kit tiles was removed on
 * 23 Nov 2026; an old `?view=equipment&ekey=…` link lands on Search with that kit.)
 *
 * Every choice is a search parameter, so the first paint is already the right
 * page, a link can be sent, and the back button leaves a drill-down rather than
 * the screen. The drill-down parameters (`group`, `muscle`) and
 * the search filters (`body`, `muscles`, …) have DIFFERENT names on purpose: the
 * first narrow a tile the trainer opened, the second are a form they filled in,
 * and one parameter doing both would make a tab switch carry over a filter the
 * new tab does not draw.
 */
export type LibraryView = 'categories' | 'search';

export const LIBRARY_TABS: { key: LibraryView; label: string }[] = [
  { key: 'categories', label: 'Categories' },
  { key: 'search', label: 'Search & filter' },
];

export const EXERCISES_BASE = '/programs/exercises';
export const EXERCISES_PAGE_SIZE = 24;

export interface LibraryQuery {
  view: LibraryView;
  /** Categories: the body part opened, and optionally one of its muscles. */
  group: string;
  muscle: string;
  /** Search: every filter. Lists are OR-ed within a filter and AND-ed between filters. */
  q: string;
  body: string[];
  muscles: string[];
  also: string[];
  kit: string[];
  pattern: string[];
  level: string[];
  counted: string[];
  type: string[];
  source: ExerciseSource;
  page: number;
}

export const emptyQuery = (view: LibraryView = 'categories'): LibraryQuery => ({
  view, group: '', muscle: '', q: '',
  body: [], muscles: [], also: [], kit: [], pattern: [], level: [], counted: [], type: [],
  source: 'all', page: 0,
});

const LISTS = ['body', 'muscles', 'also', 'kit', 'pattern', 'level', 'counted', 'type'] as const;

/** The address of a state. Defaults are left out, so the bare route is the categories grid. */
export function libraryHref(next: Partial<LibraryQuery>): string {
  const q = { ...emptyQuery(), ...next };
  const qs = new URLSearchParams();
  if (q.view !== 'categories') qs.set('view', q.view);
  if (q.view === 'categories') {
    if (q.group) qs.set('group', q.group);
    if (q.group && q.muscle) qs.set('muscle', q.muscle);
  }
  if (q.view === 'search') {
    if (q.q) qs.set('q', q.q);
    for (const key of LISTS) if (q[key].length > 0) qs.set(key, q[key].join(','));
    if (q.source !== 'all') qs.set('source', q.source);
  }
  if (q.page) qs.set('page', String(q.page));
  const s = qs.toString();
  return s ? `${EXERCISES_BASE}?${s}` : EXERCISES_BASE;
}

type Raw = Record<string, string | string[] | undefined>;
const one = (raw: string | string[] | undefined) => ((Array.isArray(raw) ? raw[0] : raw) ?? '').trim();
const many = (raw: string | string[] | undefined) =>
  one(raw).split(',').map(v => v.trim()).filter(Boolean).slice(0, 20);

const SOURCES: ExerciseSource[] = ['all', 'incline', 'mine', 'draft'];

export function parseQuery(sp: Raw): LibraryQuery {
  /* the retired Equipment tab: its links still land somewhere useful — Search, with the kit they had opened */
  const legacyKit = one(sp.view) === 'equipment';
  const view = legacyKit ? 'search' : LIBRARY_TABS.some(t => t.key === one(sp.view)) ? (one(sp.view) as LibraryView) : 'categories';
  const n = Number.parseInt(one(sp.page), 10);
  const source = SOURCES.includes(one(sp.source) as ExerciseSource) ? (one(sp.source) as ExerciseSource) : 'all';
  return {
    view,
    group: one(sp.group), muscle: one(sp.muscle),
    q: one(sp.q).slice(0, 100),
    body: many(sp.body), muscles: many(sp.muscles), also: many(sp.also),
    kit: legacyKit ? many(sp.ekey) : many(sp.kit),
    pattern: many(sp.pattern), level: many(sp.level), counted: many(sp.counted), type: many(sp.type),
    source, page: Number.isFinite(n) && n > 0 ? n : 0,
  };
}

/**
 * Does this state ask for a list of exercises at all, or is it a grid of tiles?
 *
 * Categories has three levels — the body parts, the muscles inside one, then that one's
 * exercises — so a body part with more than one muscle is still a grid. One with a single
 * muscle (shoulders, neck) has nothing to choose, and lists at once.
 */
export function wantsList(q: LibraryQuery, meta: LibraryMeta): boolean {
  if (q.view === 'categories') {
    /* A body part LISTS at once (25 Nov 2026). It used to open onto a tile per muscle and list nothing, so
       a chest exercise was three clicks away and the list's own *All muscles* pill jumped back to the tiles.
       The muscles are pills over the list now, *All muscles* first. `meta` stays a parameter for callers. */
    void meta;
    return q.group !== '';
  }
  return true;
}

export function libraryTabs(): PageTab[] {
  return LIBRARY_TABS.map(t => ({
    key: t.key,
    label: t.label,
    /* Pressing a tab means *show me that tab's front door*, from wherever you are:
       a strip that remembered the drill-down would be a tab that cannot be used to
       leave it. */
    href: libraryHref({ view: t.key }),
    count: null,
  }));
}

export const EXERCISE_SOURCES: { value: ExerciseSource; label: string }[] = [
  { value: 'all', label: 'All exercises' },
  { value: 'incline', label: 'InclineYou exercises' },
  { value: 'mine', label: 'My exercises' },
  { value: 'draft', label: 'Draft' },
];
