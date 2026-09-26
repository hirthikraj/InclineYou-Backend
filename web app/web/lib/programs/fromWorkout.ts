import type {
  WorkoutTemplateExerciseWire,
  WorkoutTemplateSetWire,
  WorkoutTemplateWire,
} from '@/lib/workouts/api';
import { newUid, newWorkoutId, type Entry, type SetDetail } from './blueprint';

/**
 * A WORKOUT TEMPLATE, LANDED ON A DAY OF A PROGRAM.
 *
 * The two models are deliberately a rung apart — `lib/workouts/api.ts` says why
 * — and this is the one direction that has to be lossy. A workout prescribes
 * PER SET (`percent_1rm`, `rpe_level`, a tempo and a note on set 3); a week
 * sheet row prescribes N × reps with one rest, plus `setDetail` for the case
 * where the sets genuinely differ. So the translation is:
 *
 * · **the set COUNT is exact** — it is `sets.length`, never guessed;
 * · **reps / seconds collapse when every set agrees**, and become `setDetail`
 *   when they do not, which is the field that exists for exactly this;
 * · **load survives only when it is a weight.** `% 1RM` and RPE have no home on
 *   `targetLoad` (a kg number), and writing 75 into a kilogram column because
 *   the workout said 75% is the kind of silent wrong number a client lifts.
 *   Dropped rather than mangled — the workout it came from still holds it.
 * · **rest, tempo and the note take the first set that states one.** A week
 *   sheet row has one of each by construction.
 *
 * Supersets travel: a `groupId` shared on the wire is re-minted here so two
 * movements chained in the workout arrive chained on the day.
 */
export function entriesFromWorkout(
  workout: WorkoutTemplateWire,
  where: {
    day: number;
    week: number;
    /** The order the first row takes. */
    from: number;
    /** The container these rows land in — law 5. Absent mints a new one, which
     *  is what *Create workout* wants; *Edit workout* passes the container it
     *  is rewriting, so the workout keeps its place in the day. */
    workoutId?: string;
  },
): Entry[] {
  /* RE-MINTED, not reused. A blueprint's group ids are local handles minted by
     `newUid`, and carrying a workout's server-side ids into them would put a
     foreign id space in the one field two rows are compared on. */
  const groups = new Map<string, string>();
  const workoutId = where.workoutId ?? newWorkoutId();
  const ordered = [...workout.exercises].sort((a, b) => a.orderIndex - b.orderIndex);

  return ordered.map((row, i) => {
    const sets = row.sets ?? [];
    const shape = shapeOf(sets);
    let groupId: string | null = null;
    if (row.groupId) {
      groupId = groups.get(row.groupId) ?? newUid();
      groups.set(row.groupId, groupId);
    }
    return {
      uid: newUid(),
      exerciseId: row.exerciseId,
      day: where.day,
      week: where.week,
      order: where.from + i,
      sets: sets.length || null,
      reps: shape.reps,
      durationSeconds: shape.durationSeconds,
      restSeconds: first(sets, s => s.restSeconds),
      targetLoad: first(sets, s => (s.loadKind === 'weight' ? s.loadValue : null)),
      tempo: first(sets, s => s.tempo),
      notes: first(sets, s => s.notes),
      /* THE FIRST SUBSTITUTE ONLY, and that is the model's ceiling rather than
         a shortcut: a week sheet row holds one `altExerciseId`, and
         `DraftExercise.alternatives`' own note argues why a session holds a
         ranked list. The first is the one the trainer would pick. */
      altExerciseId: row.alternatives?.[0]?.exerciseId ?? null,
      groupId,
      /* THE CONTAINER, ON EVERY ROW — law 5. This is the whole of what makes a
         session dropped onto a day stay one thing afterwards: the card draws it
         as a bordered workout, one drag moves all eight rows, and the name is
         the trainer's own from the dialog. */
      workoutId,
      workoutName: workout.name,
      setDetail: shape.detail,
    };
  });
}

/** What the whole run of sets says, collapsed when they agree. */
function shapeOf(sets: WorkoutTemplateSetWire[]): {
  reps: number | null;
  durationSeconds: number | null;
  detail: SetDetail[] | null;
} {
  if (sets.length === 0) return { reps: null, durationSeconds: null, detail: null };
  const detail = sets.map(setDetailOf);
  const same = detail.every(
    d =>
      d.reps === detail[0].reps &&
      d.durationSeconds === detail[0].durationSeconds &&
      d.toFailure === detail[0].toFailure,
  );
  /* STRAIGHT SETS STAY STRAIGHT. `prescribe` reads a null list as `N × reps`,
     and a three-entry `setDetail` holding the same pair three times would print
     the same line through a branch that exists for the ladder. */
  if (same && !detail[0].toFailure) {
    return { reps: detail[0].reps, durationSeconds: detail[0].durationSeconds, detail: null };
  }
  return { reps: null, durationSeconds: null, detail };
}

function setDetailOf(set: WorkoutTemplateSetWire): SetDetail {
  const time = set.effortKind === 'time' || set.effortKind === 'max_time';
  return {
    reps: time ? null : set.effortValue,
    durationSeconds: time ? set.effortValue : null,
    /* `max_reps` and `max_time` are *as many as you can* — which is what the
       week sheet calls to failure, and what `prescribe` prints in the fail
       tone. Every other kind is a number the trainer chose. */
    toFailure: set.effortKind === 'max_reps' || set.effortKind === 'max_time',
  };
}

function first<T>(sets: WorkoutTemplateSetWire[], read: (set: WorkoutTemplateSetWire) => T | null): T | null {
  for (const set of sets) {
    const value = read(set);
    if (value != null && value !== '') return value;
  }
  return null;
}

/** Every exercise a workout names, substitutes included — what the week sheet's
 *  name overlay has to learn before the rows it just gained can be drawn. */
export function exerciseIdsOf(workout: WorkoutTemplateWire): string[] {
  const ids = new Set<string>();
  for (const row of workout.exercises as WorkoutTemplateExerciseWire[]) {
    ids.add(row.exerciseId);
    for (const alt of row.alternatives ?? []) ids.add(alt.exerciseId);
  }
  return [...ids];
}

/**
 * THE OTHER DIRECTION — a container on a day, read back as a workout the dialog
 * can open.
 *
 * *Edit workout* has to put the trainer back in the surface they wrote the
 * session in, and that surface takes a `Draft`. Rather than a second translator
 * into the draft's private shape — whose uid minting is `lib/workouts/draft.ts`'
 * own and deliberately not exported — this rebuilds the WIRE shape and lets
 * `fromWire` do what it already does for a row off the shelf. One reader, so an
 * edited workout and a re-opened one cannot come out different.
 *
 * IT IS LOSSY IN THE ONE DIRECTION THE MODEL IS: a week-sheet row holds one
 * rest, one tempo and one note for the whole movement, so they are written onto
 * every set. `entriesFromWorkout` reads the first set that states one, which
 * makes the round trip stable — edit a container twice and the second dialog
 * opens on what the first one saved.
 */
export function workoutWireOf(rows: Entry[], name: string): WorkoutTemplateWire {
  const now = Date.now();
  const exercises: WorkoutTemplateExerciseWire[] = rows.map((row, i) => {
    const sets = setsOf(row);
    return {
      id: `local_${row.uid}`,
      exerciseId: row.exerciseId,
      orderIndex: i,
      groupId: row.groupId,
      /* THE ONE ALTERNATE THE WEEK SHEET HOLDS, given the movement's own
         prescription — `DraftAlternative`'s note argues why a substitute needs
         its own numbers, and a copy of these is the honest seed for them. */
      alternatives: row.altExerciseId
        ? [{ exerciseId: row.altExerciseId, sets: sets.map(s => ({ ...s })) }]
        : [],
      sets,
    };
  });
  return {
    id: `local_${rows[0]?.workoutId ?? 'w'}`,
    name,
    notes: null,
    exercises,
    dividers: [],
    createdAt: now,
    updatedAt: now,
    exerciseCount: exercises.length,
    setCount: exercises.reduce((n, e) => n + e.sets.length, 0),
  };
}

function setsOf(row: Entry): WorkoutTemplateSetWire[] {
  const base = {
    loadKind: 'weight' as const,
    loadValue: row.targetLoad,
    restSeconds: row.restSeconds,
    tempo: row.tempo,
    notes: row.notes,
  };
  if (row.setDetail && row.setDetail.length > 0) {
    return row.setDetail.map(d => ({
      ...base,
      effortKind: d.toFailure ? ('max_reps' as const) : d.durationSeconds != null ? ('time' as const) : ('reps' as const),
      effortValue: d.durationSeconds ?? d.reps,
    }));
  }
  const count = Math.max(1, row.sets ?? 1);
  const timed = row.durationSeconds != null;
  return Array.from({ length: count }, () => ({
    ...base,
    effortKind: timed ? ('time' as const) : ('reps' as const),
    effortValue: timed ? row.durationSeconds : row.reps,
  }));
}
