import { hasOwnArt } from './kitArt';
import type { PageTab } from '@/components/shell/PageTabs';
import type { ExerciseSource, LibraryMeta } from './api';

/**
 * THE LIBRARY'S THREE WAYS IN, AND THE ADDRESS THAT HOLDS EACH.
 *
 * **Categories** is the default: pick a body part and then its muscles — the way a
 * trainer who is building a session thinks. **Equipment** is the same drill by
 * kit, because the question a home-visit trainer asks is what they can do with a
 * barbell and two kettlebells. **Search** is every filter at once, for the
 * trainer who knows what they want and wants it narrowed by several things.
 *
 * Every choice is a search parameter, so the first paint is already the right
 * page, a link can be sent, and the back button leaves a drill-down rather than
 * the screen. The drill-down parameters (`group`, `muscle`, `ecat`, `ekey`) and
 * the search filters (`body`, `muscles`, …) have DIFFERENT names on purpose: the
 * first narrow a tile the trainer opened, the second are a form they filled in,
 * and one parameter doing both would make a tab switch carry over a filter the
 * new tab does not draw.
 */
export type LibraryView = 'categories' | 'equipment' | 'search';

export const LIBRARY_TABS: { key: LibraryView; label: string }[] = [
  { key: 'categories', label: 'Categories' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'search', label: 'Search & filter' },
];

export const EXERCISES_BASE = '/programs/exercises';
export const EXERCISES_PAGE_SIZE = 24;

export interface LibraryQuery {
  view: LibraryView;
  /** Categories: the body part opened, and optionally one of its muscles. */
  group: string;
  muscle: string;
  /** Equipment: the category opened, and optionally one kind of kit in it. */
  ecat: string;
  ekey: string;
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
  view, group: '', muscle: '', ecat: '', ekey: '', q: '',
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
  if (q.view === 'equipment') {
    if (q.ecat) qs.set('ecat', q.ecat);
    if (q.ecat && q.ekey) qs.set('ekey', q.ekey);
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
  const view = LIBRARY_TABS.some(t => t.key === one(sp.view)) ? (one(sp.view) as LibraryView) : 'categories';
  const n = Number.parseInt(one(sp.page), 10);
  const source = SOURCES.includes(one(sp.source) as ExerciseSource) ? (one(sp.source) as ExerciseSource) : 'all';
  return {
    view,
    group: one(sp.group), muscle: one(sp.muscle), ecat: one(sp.ecat), ekey: one(sp.ekey),
    q: one(sp.q).slice(0, 100),
    body: many(sp.body), muscles: many(sp.muscles), also: many(sp.also), kit: many(sp.kit),
    pattern: many(sp.pattern), level: many(sp.level), counted: many(sp.counted), type: many(sp.type),
    source, page: Number.isFinite(n) && n > 0 ? n : 0,
  };
}

/**
 * Does this state ask for a list of exercises at all, or is it a grid of tiles?
 *
 * Both Categories and Equipment have three levels — the top tiles, the kinds or muscles
 * inside one, then that one's exercises — so a tile opened with more than one thing in it
 * is still a grid. One with a single thing (bodyweight, shoulders) has nothing to choose,
 * and lists at once. So does a category of kit that is only partly drawn (the machines), which narrows by a filter.
 */
export function wantsList(q: LibraryQuery, meta: LibraryMeta): boolean {
  if (q.view === 'categories') {
    if (q.group === '') return false;
    if (q.muscle !== '') return true;
    /* a body part with one muscle (shoulders, neck) has nothing to choose between and lists at once */
    return meta.muscles.filter(m => m.bodyPart === q.group).length <= 1;
  }
  if (q.view === 'equipment') {
    if (q.ekey !== '') return true;
    if (q.ecat === '') return false;
    const items = meta.equipmentGroups.find(g => g.category === q.ecat)?.items ?? [];
    if (items.length <= 1) return true;
    /* a category whose kinds are not ALL drawn (the selectorised machines: twenty-odd kinds, one family picture) has
       nothing to show as tiles, so it lists at once and narrows with a filter instead */
    return !items.every(i => hasOwnArt(i.key));
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
