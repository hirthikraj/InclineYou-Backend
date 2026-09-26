import { Flow } from '@/components/portal/workout/Flow';
import { TopBar } from '@/components/shell/TopBar';
import { PortalApiError, getPortalWorkout } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { Button } from '@/web-components/ui/Button';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Workout · InclineYou' };

/**
 * §2 · the workout flow, at `/me/workout/:id`.
 *
 * ── THE WORKOUT HAS A URL, AND THE STAGE INSIDE IT DOES NOT ─────────────────
 *
 * *A place gets a URL; a moment does not* — `Console.tsx`'s rule for the
 * trainer's own log, and it decides both halves of this route. The WORKOUT is a
 * place: a client who locks their phone between sets, or opens the link on a
 * laptop, has to land back in the same log with the same sets in it. Which
 * exercise they are on and whether they have read the overview are moments,
 * and they live in `Flow`'s local state.
 *
 * ── ONE REQUEST, AND IT IS A SCREEN ENDPOINT ────────────────────────────────
 *
 * `GET /v1/me/workouts/{id}` returns the movements, their targets, their cues,
 * their clips, what is logged and what was logged last time. `lib/portal/api.ts`
 * carries why that is not the mistake `sync/pull` is refused for: `pull()`
 * returns the whole account to draw one screen, and this returns one workout's
 * own rows — to a client standing at a rack on a gym's wifi, where five round
 * trips to draw one screen is the difference between logging a set and giving
 * up.
 *
 * ── AND THE RAIL LIGHTS *HOME* WHILE THIS IS OPEN ───────────────────────────
 *
 * `PortalShell.currentFor` falls through to `me-home` for this path, which is
 * `AppShell.currentFor`'s own call for `/sessions`: the flow is launched from
 * Home's one button and finishing returns there, so lighting nothing would read
 * as *you are nowhere* and lighting *Plan* would claim the client had opened a
 * screen they had not.
 */
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ workoutId: string }>;
}) {
  const { workoutId } = await params;
  const result = await requirePortal();
  if (!result.ok) return null;

  let workout;
  try {
    workout = await getPortalWorkout(workoutId);
  } catch (e) {
    /* A workout id that is not theirs, or one that no longer exists. NOT the
       shell's `Unavailable`: the portal is working perfectly and one URL is
       wrong, which is a different sentence and a different way out. The shell
       stays up so the client can get back to today in one tap. */
    if (e instanceof PortalApiError && (e.status === 404 || e.status === 403)) {
      return (
        <>
          <TopBar crumb="Workout" />
          <main className="main" id="main-content">
            <PageHeader title="Workout" />
            <div className="body">
              <div className="portal">
                <EmptyState
                  title="That workout is not here"
                  body="It may have been finished on another device, or the link is out of date. Everything you logged is safe."
                  action={
                    <Button variant="primary" href="/me/today">
                      Back to today
                    </Button>
                  }
                />
              </div>
            </div>
          </main>
        </>
      );
    }
    throw e;
  }

  const finished = workout.endedAt !== null;

  return (
    <>
      {/* `title` overrides the crumb's last segment, and this is exactly the
          case `TopBar` documents it for: the crumb is *Workout* on every log a
          client ever opens, and the one thing worth the 44px at the top of this
          screen is WHICH workout — `Upper A`, not the word *Workout* again. */}
      <TopBar crumb="Workout" title={workout.dayLabel ?? 'Workout'} />
      <main className="main" id="main-content">
        <PageHeader
          title={workout.dayLabel ?? 'Today’s workout'}
          sub={
            finished
              ? 'Finished'
              : workout.programName
                ? workout.programName
                : 'In progress'
          }
          crumbs={
            /* The only way out of the flow other than the tab bar, and it is
                worth having: the bar is at the other end of the screen from
                where a thumb sits mid-set, and `.ph` scrolls away with the
                page — so this is the way back that is where the eye already is
                when the client is reading the header. */
            <Crumbs
              items={[
                { label: 'Home', href: '/me/today' },
                { label: finished ? 'Finished' : 'Workout' },
              ]}
            />
          }
        />
        <div className="body">
          {/* The cue on every card is the trainer's own line, so it is
              attributed to them by name — see `HowTo` for why the personal
              line and the library's generic pointers must not read alike. */}
          <Flow workout={workout} trainerFirstName={result.me.trainer.name.split(' ')[0]} />
        </div>
      </main>
    </>
  );
}
