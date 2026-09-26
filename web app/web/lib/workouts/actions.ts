'use server';

import { revalidatePath } from 'next/cache';

import {
  createWorkoutTemplate,
  deleteWorkoutTemplate,
  getWorkoutTemplate,
  getWorkoutTemplates,
  updateWorkoutTemplate,
  WorkoutsApiError,
  type WorkoutTemplateInput,
  type WorkoutTemplateWire,
} from './api';
import { getExercises } from '@/lib/exercises/api';
import type { ExerciseWire } from '@/lib/exercises/api';

/**
 * THE BUILDER'S WRITES — one per verb, and the same `Result` shape
 * `lib/programs/actions.ts` established.
 *
 * `ok: false` is a refusal a trainer can act on; a thrown error is a bug and
 * stays thrown. The distinction matters more here than usual because the dialog
 * this serves holds an unsaved session: a catch-all that reported every failure
 * as *the server said no* would let a genuine crash close a dialog over work
 * that was never written.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

function refusal(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof WorkoutsApiError) {
    if (error.status === null) {
      return { ok: false, message: 'Could not reach the server. Nothing was saved.' };
    }
    return { ok: false, message: `${fallback} (${error.status}).` };
  }
  throw error;
}

/* Both tabs of Fitness list these — the shelf's Templates tab draws them and
   the builder is opened from its header. */
const TOUCHED = '/programs/workouts';

export async function saveWorkoutTemplate(
  body: WorkoutTemplateInput,
  id?: string,
): Promise<Result<WorkoutTemplateWire>> {
  try {
    const row = id ? await updateWorkoutTemplate(id, body) : await createWorkoutTemplate(body);
    revalidatePath(TOUCHED);
    return { ok: true, value: row };
  } catch (error) {
    return refusal(error, 'The workout could not be saved');
  }
}

/**
 * REMOVE SEVERAL — the shelf's bulk delete, and `lib/programs/actions.ts`'s
 * `removeTemplates` line for line, deliberately.
 *
 * The wire has one verb (`DELETE /v1/workout-templates/:id`), so this is a
 * loop, and it is SEQUENTIAL: eight parallel connections at a server doing one
 * row each buys nothing, and a rejection mid-flight leaves the caller unable to
 * say which of the eight actually went.
 *
 * IT DOES NOT STOP AT THE FIRST REFUSAL, for that screen's reason: a trainer
 * who ticked eight and lost the third would otherwise be told nothing about the
 * other five and would have to guess which are still there. One
 * `revalidatePath` at the end, because the shelf is one list however many rows
 * left it.
 *
 * A copy and not a shared helper: the two live on opposite sides of a
 * `server-only` fetcher each (`lib/programs/api.ts`, `lib/workouts/api.ts`) and
 * answer two different `Result` types with two different refusal wordings. The
 * shared thing is the SHAPE, and a generic over it would be a function whose
 * only argument is which delete to call.
 */
export async function removeWorkoutTemplates(
  ids: string[],
): Promise<Result<{ deleted: number; failed: { id: string; message: string }[] }>> {
  if (ids.length === 0) return { ok: false, message: 'Nothing was selected.' };

  let deleted = 0;
  const failed: { id: string; message: string }[] = [];

  for (const id of ids) {
    try {
      await deleteWorkoutTemplate(id);
      deleted += 1;
    } catch (error) {
      /* `refusal` rethrows anything that is not a `WorkoutsApiError` — this
         file's own line, and a loop is not a reason to soften it. */
      failed.push({ id, message: refusal(error, 'The workout could not be deleted').message });
    }
  }

  revalidatePath(TOUCHED);
  return { ok: true, value: { deleted, failed } };
}

export async function removeWorkoutTemplate(id: string): Promise<Result<null>> {
  try {
    await deleteWorkoutTemplate(id);
    revalidatePath(TOUCHED);
    return { ok: true, value: null };
  } catch (error) {
    return refusal(error, 'The workout could not be deleted');
  }
}

/**
 * ONE SAVED WORKOUT, PLUS THE MOVEMENTS IT NAMES.
 *
 * Two reads and deliberately one action: the wire carries `exerciseId` and
 * nothing else about a movement, so opening a saved workout for editing without
 * the names is a dialog full of cards that cannot say what they are. The week
 * sheet's own notes record that exact defect — a freshly added row reading
 * *Exercise not in your library* because the overlay had not caught up — and the
 * cheapest fix is to not have a window in which it is true.
 *
 * The library read is a SEARCH windowed to the ids this workout uses, not a
 * request per movement: a twelve-movement session is twelve round trips the
 * other way. `size` is the count itself, so nothing is fetched that is not
 * about to be drawn.
 */
export async function fetchWorkoutTemplate(id: string): Promise<
  | { ok: true; template: WorkoutTemplateWire; names: Record<string, ExerciseWire> }
  | { ok: false; message: string }
> {
  try {
    const template = await getWorkoutTemplate(id);
    /* THE SUBSTITUTES ARE IN THE SET TOO. They are drawn on the card beside the
       movement and named again in the alternatives panel, so leaving them out
       of the window is the same defect this function exists to prevent, one
       line lower down. */
    const wanted = new Set(
      template.exercises.flatMap(e => [e.exerciseId, ...(e.alternatives ?? []).map(a => a.exerciseId)]),
    );
    const names: Record<string, ExerciseWire> = {};
    if (wanted.size > 0) {
      const page = await getExercises({ size: 200 });
      for (const row of page.exercises) {
        if (wanted.has(row.id)) names[row.id] = row;
      }
    }
    return { ok: true, template, names };
  } catch (error) {
    return refusal(error, 'The workout could not be opened');
  }
}

/**
 * THE SHELF, FOR THE LIBRARY PANE'S *Workout Templates* SOURCE.
 *
 * The summary rows only — `exerciseCount` and `setCount` are what the list
 * draws, and a pane that fetched every session's whole prescription to print
 * *5 movements · 16 sets* would pull the entire shelf through the browser to
 * label it. The click that pours one INTO the draft is `fetchWorkoutTemplate`,
 * one template at a time, which is the read that actually needs the sets.
 *
 * `[]` on a failure rather than a refusal: this is a source in a picker beside
 * two that still work, and the pane says *nothing here* in the same place it
 * says it for a search that matched nothing.
 */
export async function fetchWorkoutTemplates(): Promise<WorkoutTemplateWire[]> {
  try {
    return await getWorkoutTemplates();
  } catch {
    return [];
  }
}
