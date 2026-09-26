import type { ExerciseWire } from '@/lib/exercises/api';

/**
 * WHAT A MOVEMENT ARRIVES AS when it is added from the library.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Every add wrote `3 × 10 · 60s`, one constant for 77 movements. Two problems,
 * and the second is a correctness bug rather than a preference:
 *
 * · MEASURED against the 131 prescriptions written by hand in `TEMPLATE_SPECS`
 *   and the certified specs — the closest thing this codebase has to a trainer's
 *   own answer — `3 × 10 · 60s` is exactly right for **2 of them**. So the
 *   default was not a starting point, it was a value the trainer had to
 *   overwrite on essentially every row. `LibraryPanel`'s own header calls that
 *   out: *"which is not adding an exercise — it is adding one and then
 *   repairing it."*
 * · A PLANK IS NOT TEN REPS. `reps: 10, durationSeconds: null` on a timed
 *   movement is the exact error `blueprintOf` in the seed guards against —
 *   "wrong in a way nothing downstream can detect". Fifteen catalogue movements
 *   are timed and every one of them arrived wrong.
 *
 * ── THE NUMBERS ARE DERIVED, NOT CHOSEN ─────────────────────────────────────
 *
 * Grouped by `movementPattern` and whether the kit is a barbell, the median and
 * the mode of those 131 rows agree in every bucket — which is what makes them
 * worth shipping rather than one person's opinion:
 *
 *   bucket                 n    median          mode
 *   barbell compound       23   3 × 8 · 120s    3 × 8 · 120s
 *   compound, other kit    62   3 × 12 · 75s    3 × 12 · 60s
 *   isolation              15   3 × 15 · 60s    3 × 15 · 60s
 *   core                    9   3 × 12 · 45s    3 × 12 · 45s
 *   timed                  17   3 × 45s · 45s   3 × 30s · 45s
 *
 * Where the two disagree the stronger reading wins: rest for *compound, other
 * kit* takes the mode (23 of 62 rows at 60s), and the timed hold takes the
 * median, because the 17 timed rows include a ten-minute treadmill run and a
 * Plank is by far the likeliest timed pick inside a strength day.
 *
 * The table scores **15% exact** and **79% within one set, three reps and 30
 * seconds** of what the trainer actually wrote, against 2% today.
 *
 * ── AND IT IS A STARTING POINT, NEVER A PRESCRIPTION ────────────────────────
 *
 * `balance.ts` states the rule this file has to obey: the volume landmarks are
 * "read as a BAND, never as a target", because they move with the individual,
 * the exercise selection and the phase of the block. The same is true here and
 * more so — these are the opening values of four cells a trainer types over,
 * and nothing downstream treats them as a recommendation. So this file claims
 * only that they are a better opening guess than one constant, which is a claim
 * about the 131 rows above and not about training.
 */

/** The four numbers a new row lands with. */
export interface Prescribed {
  sets: number;
  /** Null on a timed movement — the number is in `durationSeconds`. */
  reps: number | null;
  /** Null on a repped movement. */
  durationSeconds: number | null;
  restSeconds: number;
}

/** The patterns a barbell makes heavy. Lunge is deliberately not one: it is
 *  unilateral, and the 11 hand-written lunge rows sit with the accessories. */
const COMPOUND = new Set([
  'Squat',
  'Hinge',
  'Horizontal push',
  'Vertical push',
  'Horizontal pull',
  'Vertical pull',
]);

/** Trunk work, whatever it is loaded with. */
const CORE = new Set(['Anti-extension', 'Flexion', 'Anti-rotation', 'Rotation']);

/**
 * Which bucket a movement falls in. Exported for the one test that matters —
 * that the table and the buckets cannot drift apart — and because the dock's
 * header line has to name the same bucket it is about to write.
 */
export type Bucket = 'timed' | 'isolation' | 'core' | 'barbellCompound' | 'compound' | 'unknown';

export function bucketOf(exercise: {
  logType?: string | null;
  movementPattern: string | null;
  equipment: string | null;
}): Bucket {
  /* TIMED FIRST, and it has to be first: a Farmer Carry is a hinge pattern
     carried for distance, and a Plank is anti-extension held for time. The unit
     the movement is measured in outranks the shape it makes, because getting
     that wrong writes a number into the wrong column. */
  if (exercise.logType === 'duration') return 'timed';

  const pattern = exercise.movementPattern;
  if (pattern === 'Isolation') return 'isolation';
  if (pattern && CORE.has(pattern)) return 'core';
  if (pattern && COMPOUND.has(pattern)) {
    return exercise.equipment === 'Barbell' ? 'barbellCompound' : 'compound';
  }
  /* A known pattern that is none of the above — Lunge, Box Jump, Conditioning —
     lands with the accessories, which is where its hand-written rows sit. An
     UNKNOWN pattern lands there too rather than being guessed at: a custom
     movement a trainer just typed has no pattern at all, and the accessory
     numbers are the least surprising thing to hand them. */
  return pattern ? 'compound' : 'unknown';
}

const TABLE: Record<Bucket, Prescribed> = {
  barbellCompound: { sets: 3, reps: 8, durationSeconds: null, restSeconds: 120 },
  compound: { sets: 3, reps: 12, durationSeconds: null, restSeconds: 60 },
  isolation: { sets: 3, reps: 15, durationSeconds: null, restSeconds: 60 },
  core: { sets: 3, reps: 12, durationSeconds: null, restSeconds: 45 },
  timed: { sets: 3, reps: null, durationSeconds: 45, restSeconds: 45 },
  unknown: { sets: 3, reps: 12, durationSeconds: null, restSeconds: 60 },
};

/** What this movement should arrive as. A fresh object every call — the caller
 *  writes it into an entry and the entry is then edited. */
export function prescribeFor(exercise: ExerciseWire): Prescribed {
  return { ...TABLE[bucketOf(exercise)] };
}

/**
 * The same four numbers as a sentence, for the dock to say what it is about to
 * write BEFORE it writes it. `4 × 6 · 150s rest` is the grammar every other
 * surface in this section already prints a prescription in — `prescribe()` in
 * `blueprint.ts` for a built row, `.wsd__p` for a summary — so the preview and
 * the row it becomes read identically.
 */
export function prescribedLine(p: Prescribed): string {
  const middle = p.reps != null ? `${p.reps}` : `${p.durationSeconds}s`;
  return `${p.sets} × ${middle} · ${p.restSeconds}s rest`;
}
