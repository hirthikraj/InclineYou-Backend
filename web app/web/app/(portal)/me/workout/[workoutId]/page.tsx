import { TopBar } from '@/components/shell/TopBar';
import { WorkoutPreview } from '@/components/portal/workout/WorkoutPreview';
import { WorkoutError, getPreview } from '@/lib/portal/workout-api';
import { requirePortalSession } from '@/lib/portal/session';
import { redirect } from 'next/navigation';
import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Workout · InclineYou' };

/**
 * `/me/workout/:id` — the preview of a program day (api-contract 1.2, pw-l1). A workout has a URL; the moment of doing it is
 * `/me/session/:id`, which Start opens. A client who locks their phone and comes back lands in the same log either way.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ workoutId: string }> }) {
  const { workoutId } = await params;
  const session = await requirePortalSession();
  if (!session.ok) return null;

  let preview;
  try {
    preview = await getPreview(workoutId);
  } catch (e) {
    if (!(e instanceof WorkoutError)) throw e;
    if (e.code === 'PORTAL_PAUSED') redirect('/sign-in/paused');
    if (e.code === 'PORTAL_REMOVED') redirect('/sign-in/removed');
    if (e.status === 401) redirect('/sign-in');
    return (
      <>
        <TopBar crumb="Workout" title="Workout" />
        <main className="main" id="main-content">
          <PageHeader title="Workout" />
          <div className="body">
            <EmptyState
              title={e.status === 404 ? 'That workout isn’t in your plan' : 'We couldn’t load this workout'}
              body={e.status === 404 ? 'The link may be out of date. Nothing you logged is lost.' : 'Reload in a moment — nothing has been lost.'}
              action={<Button variant="primary" href="/me/today">Back to today</Button>}
            />
          </div>
        </main>
      </>
    );
  }

  const first = (session.me.trainer?.name ?? 'Your trainer').split(' ')[0];
  return (
    <>
      <TopBar crumb="Workout" title={preview.workout.name} />
      <main className="main" id="main-content">
        <div className="body">
          <WorkoutPreview preview={preview} trainerFirstName={first} />
        </div>
      </main>
    </>
  );
}
