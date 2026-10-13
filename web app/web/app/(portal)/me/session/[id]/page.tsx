import { redirect } from 'next/navigation';

import { Player } from '@/components/portal/workout/Player';
import { Recap } from '@/components/portal/workout/Recap';
import { TopBar } from '@/components/shell/TopBar';
import { WorkoutError, getLog } from '@/lib/portal/workout-api';
import { requirePortalSession } from '@/lib/portal/session';
import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Workout · InclineYou' };

/**
 * `/me/session/:id` — the player for the client's own unfinished workout, and the read-only recap for anything else: a finished one, or a
 * session their trainer logged (api-contract 1.2, pw-l2). The same read draws both, so a number here can never disagree with the trainer's.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const first = (session.me.trainer?.name ?? 'Your trainer').split(' ')[0];
  let log;
  try {
    log = await getLog(id);
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
              title={e.status === 404 ? 'That workout isn’t here' : 'We couldn’t load this workout'}
              body={e.status === 404 ? 'The link may be out of date. Everything you logged is safe.' : 'Reload in a moment — nothing you logged is lost.'}
              action={<Button variant="primary" href="/me/today">Back to today</Button>}
            />
          </div>
        </main>
      </>
    );
  }

  const playing = !log.readOnly && log.session.status === 'scheduled';
  return (
    <>
      <TopBar crumb="Workout" title={log.session.workout?.name ?? 'Workout'} />
      <main className="main" id="main-content">
        <div className="body">{playing ? <Player log={log} trainerFirstName={first} /> : <Recap log={log} trainerFirstName={first} />}</div>
      </main>
    </>
  );
}
