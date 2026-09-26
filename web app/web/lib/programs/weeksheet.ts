/**
 * THE WEEK SHEET's arithmetic — the figures a day states about itself.
 *
 * Pure, and separate from `blueprint.ts` for the reason `balance.ts` is: the
 * blueprint knows what a program MEANS, and this knows what one screen prints.
 */

import type { Entry } from './blueprint';
import { setsOf } from './balance';
import type { ExerciseNameWire } from './api';

/** Indian grouping — 1,20,000, not 120,000. `Intl` with `en-IN` does it. */
const grouped = (n: number) => Math.round(n).toLocaleString('en-IN');

/**
 * A day's tonnage, and how many rows could not contribute one.
 *
 * A row with no load, no reps or no sets is SKIPPED rather than counted as
 * zero: a pull-up has no external load and a plank has no reps, and folding
 * either into the total as 0 kg would make a day of bodyweight work read as
 * having done nothing.
 */
export function tonnage(rows: Entry[]): { kgs: number; skipped: number } {
  let kgs = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.targetLoad == null || r.reps == null || !r.sets) {
      skipped += 1;
      continue;
    }
    kgs += r.sets * r.reps * r.targetLoad;
  }
  return { kgs, skipped };
}

/**
 * The line a day card states about itself — `6 ex · 23 sets · 4,120 kg`.
 *
 * `0 ex · 0 sets` is two facts where there is one, so an empty day says only
 * how empty it is. A day where any row has no set count says only the exercise
 * count, because a partial sum is worse than none: it looks like a total.
 */
export function figures(rows: Entry[]): string {
  const n = rows.length;
  const head = `${n} ex`;
  if (n === 0) return head;
  let sets = 0;
  for (const r of rows) {
    const c = setsOf(r);
    if (!c) return head;
    sets += c;
  }
  const { kgs } = tonnage(rows);
  return kgs > 0 ? `${head} · ${sets} sets · ${grouped(kgs)} kg` : `${head} · ${sets} sets`;
}

/** What a day is made of — its total sets and its muscle groups, biggest first. */
export function dayShape(
  rows: Entry[],
  names: Record<string, ExerciseNameWire | undefined>,
): { sets: number; top: string[] } {
  let sets = 0;
  const byMuscle: Record<string, number> = {};
  for (const r of rows) {
    const c = setsOf(r);
    if (!c) continue;
    sets += c;
    const mg = names[r.exerciseId]?.muscleGroup;
    if (mg) byMuscle[mg] = (byMuscle[mg] ?? 0) + c;
  }
  return {
    sets,
    top: Object.entries(byMuscle)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([m]) => m),
  };
}

/* ═══════════════════════════════════════════════════════ editable fields ══ */

export type NumField = 'sets' | 'reps' | 'load' | 'rest';

/**
 * WHICH KEY A COLUMN WRITES, HOW BIG A STEP IS, AND HOW LOW IT MAY GO.
 *
 * One authority, asked by the typed cell, the phone's stepper and the picker's
 * draft alike — so "what does the Reps column do to a plank" has exactly one
 * answer in the app rather than three that agree until one of them is edited.
 *
 * A held movement's second column is its DURATION, from the same row that makes
 * it held. That is why this takes the entry and not just the field name.
 */
export function fieldOf(r: Entry, field: NumField): [keyof Entry, number, number] {
  if (field === 'sets') return ['sets', 1, 1];
  if (field === 'reps') {
    return r.durationSeconds != null ? ['durationSeconds', 5, 5] : ['reps', 1, 1];
  }
  if (field === 'load') return ['targetLoad', 2.5, 0];
  return ['restSeconds', 15, 0];
}

/** The unit a column's number is in, for the suffix and the accessible name. */
export function unitOf(key: keyof Entry): 'kg' | 's' | '' {
  if (key === 'targetLoad') return 'kg';
  if (key === 'restSeconds' || key === 'durationSeconds') return 's';
  return '';
}

/** `62.5`, `60` — a trailing `.0` on a load is noise, and `.5` is not. */
export function kg(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/**
 * Apply a typed or stepped value to one row.
 *
 * ── AN ABSOLUTE, AND THE PROTOTYPE'S DELTA DELIBERATELY DID NOT PORT ────────
 *
 * `week-sheet.html` writes a typed number as a DELTA across every week, and it
 * is right there for a reason that does not exist here: that prototype
 * GENERATES weeks 2–8 from a progression rule, so typing 65 into week 3 would
 * flatten a computed ladder into one repeated load, silently, by an edit that
 * looked local.
 *
 * This model has no generated weeks. Law 3 says a week with nothing of its own
 * repeats week 1, and every other week is rows a trainer or `applyProgression`
 * actually wrote. So a number typed against week 3 belongs to week 3's row and
 * to nothing else — and the ladder is safe because the other weeks are not
 * derived from this one. Porting the delta would have made every edit reach
 * seven weeks the trainer could not see.
 *
 * `null` is left alone in both directions: a pull-up has no load to set and a
 * plank has no reps, and writing 0 into either invents a prescription.
 */
export function withField(r: Entry, field: NumField, next: number): Entry {
  const [key, , min] = fieldOf(r, field);
  const current = r[key];
  if (typeof current !== 'number') return r;
  const value = Math.max(min, Math.round(next * 10) / 10);
  if (value === current) return r;
  return { ...r, [key]: value };
}

/** One step of a column, in that column's own unit. */
export function steppedField(r: Entry, field: NumField, direction: -1 | 1): Entry {
  const [key, step] = fieldOf(r, field);
  const current = r[key];
  if (typeof current !== 'number') return r;
  return withField(r, field, current + direction * step);
}
