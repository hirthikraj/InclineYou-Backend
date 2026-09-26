import { ProgressSummary } from '@/components/portal/ProgressSummary';
import {
  getPortalMilestones,
  getPortalWorkouts,
  getPortalProgram,
  getPortalSessions,
  getPortalSets,
} from '@/lib/portal/api';
import { buildExercises, countStates } from '@/lib/portal/exercises';
import { requirePortal } from '@/lib/portal/guard';
import { resolveNames } from '@/lib/portal/names';
import { buildProgress } from '@/lib/portal/progress';
import { readRange } from '@/lib/portal/range';
import { DAY_MS, startOfDay } from '@/lib/today/time';

export const metadata = { title: 'Progress · InclineYou' };

/**
 * §3 · Progress → **Summary**, the first of four tabs.
 *
 * ── THE SESSION WINDOW IS THE WHOLE ARRANGEMENT, NOT NINETY DAYS ────────────
 *
 * `buildConsistency` states its own figure over the chosen range and windows
 * internally, so this read has to reach at least as far as the widest range on
 * offer. It reaches to `startedAt`, because the lead is *N weeks with Arun* and
 * the summary's third line is a total, and both are claims about the whole
 * arrangement.
 *
 * That is affordable here and would not be on Home: this is a screen somebody
 * opens when they are NOT training, a couple of times a week, where Home is
 * opened every morning.
 *
 * ── AND THE PLATEAU COUNT COMES FROM THE EXERCISES TAB'S OWN BUILDER ────────
 *
 * `holdingCount` is the one figure here computed by a file this page otherwise
 * has nothing to do with, and that is deliberate: `lib/portal/exercises.ts`
 * owns what a plateau IS. Recomputing it with a second rule would let the
 * summary say *2 holding* over a tab that lists three, which is the drift
 * `templateForKind` exists to prevent on the trainer's half.
 *
 * It costs no extra request — the sets are already fetched for `buildStrength`.
 *
 * ── AND THAT CLASSIFICATION IS NOT WINDOWED, WHERE EVERYTHING ELSE IS ────────
 *
 * `buildExercises` is handed `null` rather than this page's `from`, and it is
 * the one derivation here the range does not reach. The two figures it feeds —
 * *N movements* and *M holding* — are CROSS-TAB claims: they are printed here
 * and the client presses *See which*, which opens a tab that reads every set on
 * record. Windowing them here would put *2 holding* above a list of three, and
 * that disagreement is the exact thing passing `holdingCount` in was for.
 *
 * Everything else on this screen — strength, consistency, the tape, weight —
 * is a claim about a period and takes the window.
 */
export const dynamic = 'force-dynamic';

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me, now } = result;

  /* ── THE RANGE IS A SEARCH PARAM, AND THAT IS THE TRAINER HALF'S RULE ─────

     `AGENTS.md` for the same control on the same client's data: *"a chosen
     range is a PLACE, and a trainer showing a client six months should be able
     to send that link."* Read on the SERVER rather than filtered in the
     browser, because every figure on this screen is a derivation over rows the
     page has already fetched.

     `readRange` falls back to the default for anything else, so a hand-typed
     `?range=lifetime` draws the screen rather than an error. */
  const q = await props.searchParams;
  const range = readRange(typeof q.range === 'string' ? q.range : undefined);

  /* ── `getPortalMetrics` IS NOT HERE ANY MORE, AND THAT IS THE SPLIT ───────

     This tab drew a weight chart and quoted the biggest mover on the tape, so
     it read every body metric on record. Both moved to Assessments on 23 Sep —
     see `lib/portal/progress-tabs.ts` — and the read went with them. The
     Progress tab now reads nothing about the client's body at all, which is
     also the clearest statement of what the tab is: five requests, every one of
     them about the training. */
  const [sessions, sets, milestones, workouts, program] = await Promise.all([
    getPortalSessions(startOfDay(me.client.startedAt) - DAY_MS, now + DAY_MS),
    getPortalSets(),
    getPortalMilestones(),
    getPortalWorkouts(),
    getPortalProgram(),
  ]);

  const names = await resolveNames(sets.map((s) => s.exerciseId));
  /* The Exercises tab's OWN classification, over the SAME rows that tab reads —
     every set on record, not this page's window. See the note above: the two
     figures it feeds are links into that tab, and a windowed count under an
     unwindowed list is the disagreement `holdingCount` exists to prevent. It
     costs no request — the sets are already fetched for `buildStrength`. */
  const exercises = buildExercises(sets, names, now, null);
  const holding = countStates(exercises).holding;

  const data = buildProgress(
    me,
    sessions,
    sets,
    milestones,
    workouts,
    names,
    program,
    now,
    range,
    holding,
    exercises.length,
  );

  return (
    <div className="body">
      <ProgressSummary me={me} data={data} />
    </div>
  );
}
