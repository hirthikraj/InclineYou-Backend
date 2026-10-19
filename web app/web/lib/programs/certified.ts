/**
 * THE CERTIFIED SHELF'S VOCABULARY, AND THE FILTER THAT READS IT.
 *
 * Pure. No server, no React, no DOM — the same line `blueprint.ts` draws, and
 * for the same reason: every one of these is a function from a list of rows to a
 * shorter list, so the shelf's whole behaviour is testable without a browser.
 *
 * ── THE LABELS ARE HERE AND NOT IN THE COMPONENTS ────────────────────────────
 *
 * `lib/setup/options.ts` opens by explaining what happens when the two halves of
 * this product disagree about an answer set: one profile carrying two spellings
 * of one certificate, and `labelFor` rendering the loser as raw text. A level
 * spelled *Intermediate* on a card and *intermediate* on a filter chip is the
 * same bug at a smaller scale, so the id → label map is written once.
 *
 * These are NOT in `options.ts` itself, deliberately: that file is a
 * character-for-character copy of the phone's, and a catalogue the phone has no
 * counterpart for would make it stop being a copy of anything. Same call
 * `lib/profile/work.ts` made for `TRAINING_MODES`.
 */

import type { CertifiedWire } from './api';
import { daysOf, goalKeyOf, toEntries, weekCountOf, type GoalKey } from './blueprint';

export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Equipment = 'full-gym' | 'dumbbells' | 'bodyweight';

/** Ordered by progression, never alphabetically — a level row that reads
 *  advanced, beginner, intermediate is a row nobody can scan. */
export const LEVEL_ORDER: Level[] = ['beginner', 'intermediate', 'advanced'];

export const LEVELS: Record<Level, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** Ordered by how much kit each needs, descending — the same reason. */
export const EQUIPMENT_ORDER: Equipment[] = ['full-gym', 'dumbbells', 'bodyweight'];

export const EQUIPMENT: Record<Equipment, string> = {
  'full-gym': 'Full gym',
  dumbbells: 'Dumbbells only',
  bodyweight: 'Bodyweight',
};

/**
 * The five filter groups, as one object.
 *
 * `days` and `weeks` are SETS rather than single values, because "three or four
 * days a week" is one question a trainer asks and two chips is how they ask it.
 * `goal`, `level` and `equipment` are sets for the same reason.
 */
export interface CertifiedFilter {
  query: string;
  goal: Set<GoalKey>;
  days: Set<number>;
  weeks: Set<number>;
  level: Set<Level>;
  equipment: Set<Equipment>;
  /** Hide the ones already on the trainer's shelf. Off by default: a trainer
   *  browsing for the second time is usually looking for what they took. */
  hideMine: boolean;
}

export function emptyFilter(): CertifiedFilter {
  return {
    query: '',
    goal: new Set(),
    days: new Set(),
    weeks: new Set(),
    level: new Set(),
    equipment: new Set(),
    hideMine: false,
  };
}

export function filterIsEmpty(f: CertifiedFilter): boolean {
  return (
    !f.query.trim() &&
    f.goal.size === 0 &&
    f.days.size === 0 &&
    f.weeks.size === 0 &&
    f.level.size === 0 &&
    f.equipment.size === 0 &&
    !f.hideMine
  );
}

/** One certified row with the three figures the shelf sorts and filters on
 *  already derived, so nothing recomputes them per chip press. */
export interface CertifiedRow {
  row: CertifiedWire;
  dayCount: number;
  weeks: number;
  goalKey: GoalKey;
}

export function readRows(certified: CertifiedWire[]): CertifiedRow[] {
  return certified.map(row => {
    const entries = toEntries(row.exercises);
    return {
      row,
      dayCount: daysOf(row, entries).length,
      weeks: weekCountOf(row, entries),
      goalKey: goalKeyOf(row.goal),
    };
  });
}

/**
 * An empty group means *all*, never *none*.
 *
 * A trainer who has ticked nothing under **Level** has not asked for zero
 * programs, and a filter that read it the other way would open on an empty
 * catalogue — which is the first impression this whole screen exists to avoid.
 */
export function applyFilter(rows: CertifiedRow[], f: CertifiedFilter): CertifiedRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(({ row, dayCount, weeks, goalKey }) => {
    if (f.hideMine && row.mine) return false;
    if (f.goal.size && !f.goal.has(goalKey)) return false;
    if (f.days.size && !f.days.has(dayCount)) return false;
    if (f.weeks.size && !f.weeks.has(weeks)) return false;
    if (f.level.size && (!row.certified || !f.level.has(row.certified.level))) return false;
    if (f.equipment.size && (!row.certified || !f.equipment.has(row.certified.equipment)))
      return false;
    if (!q) return true;
    // The summary is searched as well as the name, because a trainer looking
    // for "post-natal" is describing a client and not remembering a title.
    return (
      row.name.toLowerCase().includes(q) ||
      (row.goal ?? '').toLowerCase().includes(q) ||
      (row.certified?.summary ?? '').toLowerCase().includes(q)
    );
  });
}

/**
 * By name, and the tie-break is the id.
 *
 * Not by `usedCount` (18 Oct 2026): the shelf no longer says anything about use,
 * and an order the screen does not state is one a trainer cannot learn. Not by
 * recency either — a catalogue reordered by whichever program we last revised is
 * the same problem. The total sort is the shelf's lesson: ties may come back in
 * any order they like, and a grid picked from by position cannot do that between
 * two page loads.
 */
export function rank(rows: CertifiedRow[]): CertifiedRow[] {
  return [...rows].sort((a, b) => a.row.name.localeCompare(b.row.name) || a.row.id.localeCompare(b.row.id));
}

/**
 * WHAT THE FILTERS DID, AS A SENTENCE THAT NAMES THE TERMS THAT FAILED.
 *
 * The house rule on empty states: a no-results state names the term, never the
 * word *results*. "No certified program is 5 days a week and bodyweight only" is
 * a sentence a trainer can act on; "0 results" is one they have to decode by
 * un-ticking chips one at a time.
 */
export function describeFilter(f: CertifiedFilter): string[] {
  const parts: string[] = [];
  if (f.query.trim()) parts.push(`matching “${f.query.trim()}”`);
  if (f.goal.size) parts.push([...f.goal].join(' or '));
  if (f.days.size) parts.push(`${[...f.days].sort().join(' or ')} days a week`);
  if (f.weeks.size) parts.push(`${[...f.weeks].sort((a, b) => a - b).join(' or ')} weeks long`);
  if (f.level.size) parts.push([...f.level].map(l => LEVELS[l].toLowerCase()).join(' or '));
  if (f.equipment.size) parts.push([...f.equipment].map(e => EQUIPMENT[e].toLowerCase()).join(' or '));
  if (f.hideMine) parts.push('not already on your shelf');
  return parts;
}

/**
 * The week lengths worth offering as chips, WITH WHAT EACH ONE HOLDS.
 *
 * Derived from what is on the shelf rather than hard-coded: four chips over a
 * catalogue holding two lengths is two ways to find nothing, which is the
 * argument the goal row already makes.
 *
 * — AND THE COUNT IS NOT OPTIONAL, WHICH IS WHAT THIS RETURN TYPE IS FOR —
 *
 * `FilterRail`'s own docstring states the rail's rule as *every group counts
 * what it would show*, and four of its six groups did. **Days a week** and
 * **Length** printed bare numbers, because these two functions handed back
 * bare numbers and there was nothing at the call-site to count with. So a
 * trainer read `Fat loss 1` and `Hypertrophy 2` in one group and `2  3  4` in
 * the next, and had no way to tell that `2` was a single card — the chip that
 * empties the grid looked exactly like the chip that barely narrows it.
 *
 * Returning `{ value, count }` rather than a number is what stops that coming
 * back: a caller cannot render one of these as a bare chip by forgetting to.
 *
 * The count is against the CATALOGUE, not against the other filters — it is the
 * figure that decides whether the chip is drawn at all, and a chip that comes
 * and goes as its neighbours are ticked is a rail that reflows under the
 * pointer. What the OTHER filters would leave is the rail's own `countFor`,
 * which dims a chip rather than removing it.
 */
export interface Choice {
  value: number;
  count: number;
}

export function weekChoices(rows: CertifiedRow[]): Choice[] {
  return tally(rows.map(r => r.weeks));
}

export function dayChoices(rows: CertifiedRow[]): Choice[] {
  return tally(rows.map(r => r.dayCount));
}

/** Ascending, because these are quantities: a row reading 4, 6, 8 is one a
 *  trainer scans, and 6, 4, 8 is one they read. */
function tally(values: number[]): Choice[] {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value - b.value);
}
