import { ProgressExercises } from '@/components/portal/ProgressExercises';
import { getPortalSets } from '@/lib/portal/api';
import { buildExercises, countStates } from '@/lib/portal/exercises';
import { requirePortal } from '@/lib/portal/guard';
import { resolveNames } from '@/lib/portal/names';
import { buildTraining } from '@/lib/portal/training';

export const metadata = { title: 'Exercises · Progress · InclineYou' };

/**
 * §3 · Progress → **Exercises** — every movement on record, and which have
 * stopped moving.
 *
 * ── ONE READ, AND IT IS THE ONLY EXPENSIVE ONE IN THE PORTAL ────────────────
 *
 * This is the tab the whole four-route split pays for. The sets read is
 * unwindowed and is the largest response the portal makes — `getPortalSets`'
 * docstring prices it at ~430 rows for fourteen months — and before the split
 * every visit to Progress paid it whether the client came for their weight or
 * their workout history. Now only this tab and its detail screens do.
 *
 * `getPortalWorkouts` was a second read here, for the map that let each card's
 * best link to the day it was set. That link went to the detail screen with the
 * chart it belongs beside, and the read went with it: an overview of seventeen
 * rows has no use for every workout the client has ever logged.
 *
 * ── AND IT IS NOT WINDOWED, WHICH IT WAS ─────────────────────────────────────
 *
 * The range chips used to sit in the shared header and this tab read them, so
 * *8 weeks* meant *eleven of the seventeen movements you have recorded*. That
 * is the one window this tab cannot afford: the card above the list promises
 * **every movement you have logged**, and a client checking whether a lift has
 * stalled is asking a question a narrower window answers by hiding the lift.
 *
 * Recency is still carried, and honestly — `buildExercises` has its own
 * `STALE_DAYS`, so a movement nobody has touched in five weeks is *resting*
 * rather than absent. That is the difference between saying so and not drawing
 * it. The chips belong to Summary now; see the tab layout.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me, now } = result;

  /* One read now, not two. `getPortalWorkouts` was here for `workoutByDate`,
     which linked each card's best to the day it happened — and that link moved
     to the detail screen with the chart it belongs beside. An overview of
     seventeen rows has no use for every workout the client has ever logged. */
  const sets = await getPortalSets();

  /* Names resolve off the program first and fall back to the bulk route for
     anything logged and since dropped — see `lib/portal/names.ts`. This tab is
     the reason that route was added: it is the one screen whose entire content
     is movement names. */
  const names = await resolveNames(sets.map((s) => s.exerciseId));

  const rows = buildExercises(sets, names, now, null);

  /* ── A SECOND WALK OVER ROWS ALREADY IN HAND, AND NO SECOND REQUEST ───────

     `buildTraining` carries the two columns `buildExercises` does not compute —
     records and kilos lifted — and it is called with `null` for the same reason
     everything else on this tab is: the card above the list promises **every
     movement you have logged**, and a window is what hides some of them. It
     costs no round trip; the sets are already here for the classification, and
     the prop's own docstring says why the figures come from that builder rather
     than being added as two more fields to this one. */
  const figures = new Map(
    buildTraining(sets, names, now, null).movements.map((m) => [m.exerciseId, m]),
  );

  return (
    <div className="body">
      <ProgressExercises
        me={me}
        rows={rows}
        counts={countStates(rows)}
        figures={figures}
      />
    </div>
  );
}
