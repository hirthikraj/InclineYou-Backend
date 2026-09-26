import { notFound } from 'next/navigation';

import { ExerciseDetail } from '@/components/portal/ExerciseDetail';
import { getPortalSets, getPortalWorkouts } from '@/lib/portal/api';
import { buildExercises, findExercise } from '@/lib/portal/exercises';
import { requirePortal } from '@/lib/portal/guard';
import { resolveNames } from '@/lib/portal/names';
import { buildHistory } from '@/lib/portal/progress';

export const dynamic = 'force-dynamic';

/**
 * §3 · Progress → Exercises → one movement.
 *
 * ── THE READS ARE THE OVERVIEW'S, AND THAT IS DELIBERATE ────────────────────
 *
 * `getPortalSets` is unwindowed and is the largest response in the portal, so
 * fetching all of it to draw one movement looks wasteful — and the alternative
 * is worse. `GET /v1/me/sets?exerciseId=` exists on the mock, but `buildExercises`
 * is what classifies a movement as holding or climbing, and it can only do that
 * over the same set it classifies the others in. Fetching one movement's sets
 * would mean a second rule for a single row, which is the drift `holdingCount`
 * was passed in to avoid on the summary.
 *
 * It also feeds the picker, which needs every movement's name anyway.
 */
export async function generateMetadata(props: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await props.params;
  const names = await resolveNames([exerciseId]);
  const name = names.get(exerciseId);
  return { title: `${name ?? 'Movement'} · Progress · InclineYou` };
}

export default async function Page(props: {
  params: Promise<{ exerciseId: string }>;
}) {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me, now } = result;

  const { exerciseId } = await props.params;

  const [sets, workouts] = await Promise.all([getPortalSets(), getPortalWorkouts()]);
  const names = await resolveNames(sets.map((s) => s.exerciseId));

  const all = buildExercises(sets, names, now, null);
  const row = findExercise(all, exerciseId);

  /* ── AN UNKNOWN MOVEMENT IS A 404, AND NOW IT CAN ONLY BE ONE ───────────

     This used to be arguable: the tab was windowed, so a client who narrowed
     the range while reading one movement fell through to a 404 for a lift they
     had certainly logged. The window is gone — `buildExercises` is handed
     every set on record — so the only way to reach this branch is an id the
     client has never logged at all, which is a 404's own case. */
  if (!row) notFound();

  const { workoutByDate } = buildHistory(workouts, null);

  return (
    <div className="body">
      <ExerciseDetail
        me={me}
        row={row}
        all={all}
        workoutByDate={workoutByDate}
      />
    </div>
  );
}
