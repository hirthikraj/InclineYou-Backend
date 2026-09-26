/**
 * WEEKLY VOLUME — what a week actually asks of each muscle group.
 *
 * Pure, like `blueprint.ts`, and deliberately a separate file: the blueprint
 * knows what a program MEANS, and this knows one thing a coach reads off it.
 *
 * ── WHY A SET COUNT AND NOT A TONNAGE ───────────────────────────────────────
 *
 * Hard sets per muscle per week is the unit the training literature is written
 * in and the unit a trainer already thinks in. Tonnage needs a load on every
 * row, and `targetLoad` is optional on a template by design — §22's rule that
 * "a load is not a field a template has" — so a tonnage figure would be blank
 * on most blueprints and, worse, would move when a trainer filled in a starting
 * weight for one exercise.
 *
 * ── THE TWO LANDMARKS ───────────────────────────────────────────────────────
 *
 * MEV and MAV are read as a BAND, never as a target. Ten is roughly where a
 * muscle group starts adapting for most people and twenty is roughly where the
 * returns stop paying for the fatigue; both move with the individual, the
 * exercise selection and the phase of the block. So every sentence this feeds
 * says *under the floor* or *above the ceiling* — a statement about a threshold
 * — and never *you should do 15*, which the numbers cannot support.
 *
 * `SCALE` is the bar's full width and is a DRAWING constant, not a landmark: it
 * is 30 so that a group at the ceiling fills two-thirds, leaving somewhere for
 * an over-reaching group to go. A bar pinned at 100% cannot show the difference
 * between 20 sets and 34.
 */

import { entriesFor, type Entry } from './blueprint';
import { tonnage } from './weeksheet';
import type { ExerciseNameWire } from './api';

/* THE READING ORDER, and it is not alphabetical. A trainer reads a week as
   push / pull / legs / everything else, so the panel lists the groups in the
   order the body is trained rather than the order the strings sort in — which
   would open on *Arms*. Anything the catalogue holds that is not in this list
   is appended after it rather than dropped. */
export const MUSCLE_ORDER = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'];
export const PATTERN_ORDER = [
  'Horizontal push', 'Vertical push', 'Horizontal pull', 'Vertical pull',
  'Squat', 'Hinge', 'Lunge', 'Isolation', 'Anti-extension', 'Flexion',
];

/** Known-first, in the reading order, then anything else alphabetically. */
export function inOrder(counts: Record<string, number>, order: string[]): string[] {
  const known = order.filter(k => counts[k] != null);
  const rest = Object.keys(counts).filter(k => !order.includes(k)).sort();
  return [...known, ...rest];
}

export const MEV = 10;
export const MAV = 20;
export const SCALE = 30;

export type BandState = 'empty' | 'under' | 'in' | 'over';

export function bandOf(sets: number): BandState {
  if (sets <= 0) return 'empty';
  if (sets < MEV) return 'under';
  if (sets > MAV) return 'over';
  return 'in';
}

export interface Balance {
  /** Sets per muscle group, this week. */
  muscle: Record<string, number>;
  /** Sets per movement pattern, this week. */
  pattern: Record<string, number>;
  /** Sets across every group — the week's total working sets. */
  total: number;
  /** Rows whose exercise the library could not name, so they count nowhere. */
  unknown: number;
  /** How many rows the week holds, across every day. */
  exercises: number;
  /** Push and pull, folded from the four directional patterns. */
  push: number;
  pull: number;
  /** Volume load, and the rows that could not contribute one. */
  ton: { kgs: number; skipped: number };
}

/**
 * A ROW'S SETS, and the one place the two spellings of "sets" are reconciled.
 *
 * Law 4 says sets is a LIST — `setDetail` — and that `sets` stays authoritative
 * while the sets agree. So a straight 4 × 12 counts 4 from the integer, and a
 * "four sets, the last two to failure" row counts 4 from the list. Reading only
 * `sets` would under-count every row a trainer took the trouble to detail, which
 * is precisely the row they care most about.
 */
export function setsOf(entry: Entry): number {
  if (entry.setDetail && entry.setDetail.length > 0) return entry.setDetail.length;
  return entry.sets ?? 0;
}

/**
 * The week's volume, by muscle group and by movement pattern.
 *
 * `week` is the week being READ, and the caller passes the rows that week
 * actually shows — a repeating week is week 1's rows, per law 3, so the balance
 * of week 5 in an eight-week block is the balance of week 1 unless week 5 was
 * authored. `effectiveWeek` is what resolves that, and it is the caller's job
 * because the builder has already done it to draw the columns.
 *
 * A row whose exercise is not in `names` is counted in `unknown` rather than
 * silently dropped: a balance panel that quietly ignores four rows is a panel
 * that disagrees with the column beside it, and the trainer has no way to see
 * why.
 */
export function balance(
  rows: Entry[],
  days: number[],
  week: number,
  names: Record<string, ExerciseNameWire>,
): Balance {
  const muscle: Record<string, number> = {};
  const pattern: Record<string, number> = {};
  let total = 0;
  let unknown = 0;

  for (const day of days) {
    for (const entry of entriesFor(rows, week, day)) {
      const sets = setsOf(entry);
      if (sets <= 0) continue;
      const name = names[entry.exerciseId];
      if (!name) {
        unknown += sets;
        continue;
      }
      total += sets;
      if (name.muscleGroup) muscle[name.muscleGroup] = (muscle[name.muscleGroup] ?? 0) + sets;
      if (name.movementPattern) {
        pattern[name.movementPattern] = (pattern[name.movementPattern] ?? 0) + sets;
      }
    }
  }

  const push = (pattern['Horizontal push'] ?? 0) + (pattern['Vertical push'] ?? 0);
  const pull = (pattern['Horizontal pull'] ?? 0) + (pattern['Vertical pull'] ?? 0);
  const all = days.flatMap(d => entriesFor(rows, week, d));

  return {
    muscle, pattern, total, unknown,
    exercises: all.length,
    push, pull,
    ton: tonnage(all),
  };
}

/** What the panel says out loud, and it names the groups rather than counting
 *  them: *two groups are out of band* is a number a trainer then has to go and
 *  resolve against six tracks. */
export function balanceFlags(b: Balance): { low: string[]; high: string[]; say: string } {
  const order = inOrder(b.muscle, MUSCLE_ORDER);
  const low = order.filter(m => b.muscle[m] < MEV);
  const high = order.filter(m => b.muscle[m] > MAV);
  const bits: string[] = [];
  if (high.length) {
    bits.push(`${high.join(', ')} ${high.length === 1 ? 'is' : 'are'} above the ${MAV}-set ceiling`);
  }
  if (low.length) {
    bits.push(`${low.join(', ')} ${low.length === 1 ? 'is' : 'are'} under the ${MEV}-set floor`);
  }
  return {
    low,
    high,
    say: bits.length === 0
      ? `Every muscle group is inside the ${MEV}–${MAV} set band.`
      : `${bits.join(', and ')}.`,
  };
}

/** Highest first, then alphabetically so equal groups do not shuffle. */
export function ranked(counts: Record<string, number>): { key: string; sets: number }[] {
  return Object.entries(counts)
    .map(([key, sets]) => ({ key, sets }))
    .sort((a, b) => b.sets - a.sets || a.key.localeCompare(b.key));
}

/**
 * Which days this week carry a given exercise, and how many sets it is worth.
 *
 * Read by the exercise panel, which is opened while CHOOSING — so the question
 * is "have I already got this in, and where", not "what did I prescribe".
 */
export function placementOf(
  rows: Entry[],
  days: number[],
  week: number,
  exerciseId: string,
): { days: number[]; sets: number } {
  const on: number[] = [];
  let sets = 0;
  for (const day of days) {
    let here = 0;
    for (const entry of entriesFor(rows, week, day)) {
      if (entry.exerciseId === exerciseId) here += setsOf(entry);
    }
    if (here > 0) {
      on.push(day);
      sets += here;
    }
  }
  return { days: on, sets };
}
