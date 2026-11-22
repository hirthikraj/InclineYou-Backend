import { redirect } from 'next/navigation';

import { Player } from '@/components/portal/workout/Player';
import { Recap } from '@/components/portal/workout/Recap';
import { TopBar } from '@/components/shell/TopBar';
import { WorkoutError, getLog } from '@/lib/portal/workout-api';
import { requirePortalSession } from '@/lib/portal/session';
import { Button } from '@/web-components/ui/Button';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Workout · InclineYou' };

/**
 * `/me/session/:id` — the player for the client's own unfinished workout, and the read-only recap for anything else: a finished one, or a
 * session their trainer logged (api-contract 1.2, pw-l2). The same read draws both, so a number here can never disagree with the trainer's.
 *
 * ── 21 Nov 2026 ──────────────────────────────────────────────────────────────
 *
 * The recap has a `PageHeader` in the portal column — the workout's name is the `<h1>`, the date (in the CLIENT's zone, where it was
 * pinned to Asia/Kolkata) and who logged it are the sub, and the crumb is *Progress / History*, the one screen that lists sessions.
 * Every door into it (Home's last session, the inbox, the bell, History) lands on the same path, the session console's rule. The player
 * keeps no header: its sticky bar is the screen's top, and a header above it is a band to scroll past mid-set.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const trainerName = session.me.trainer?.name ?? 'Your trainer';
  const first = trainerName.split(' ')[0];
  const zone = session.me.myDetails?.timezone ?? 'Asia/Kolkata';
  let log;
  try {
    log = await getLog(id);
  } catch (e) {
    if (!(e instanceof WorkoutError)) throw e;
    if (e.code === 'PORTAL_PAUSED') redirect('/sign-in/paused');
    if (e.code === 'PORTAL_REMOVED') redirect('/sign-in/removed');
    if (e.status === 401) redirect('/sign-in');
    const gone = e.status === 404;
    return (
      <>
        <TopBar crumb="Workout" title="Workout" />
        <main className="main" id="main-content">
          <PageHeader className="ph--portal" title="Workout" />
          <div className="body">
            <div className="portal col gap4">
              <EmptyState
                title={gone ? 'That workout isn’t here' : 'We couldn’t load this workout just now'}
                body={gone ? 'The link may be out of date. Everything you logged is safe.' : 'Nothing has been lost. Give it a moment and try again.'}
                action={
                  gone ? (
                    <Button variant="primary" href="/me/progress/history">See your sessions</Button>
                  ) : (
                    <Button variant="primary" href={`/me/session/${encodeURIComponent(id)}`}>Try again</Button>
                  )
                }
              />
            </div>
          </div>
        </main>
      </>
    );
  }

  const name = log.session.workout?.name ?? 'Workout';
  const playing = !log.readOnly && log.session.status === 'scheduled';
  const at = log.session.startedAt;
  const when = at
    ? new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(new Date(at))
    : null;
  const who = log.session.loggedBy === 'trainer' ? `${first} logged this one with you` : 'Your own workout';

  return (
    <>
      <TopBar crumb={playing ? 'Workout' : `Progress / History / ${name}`} title={name} />
      <main className="main" id="main-content">
        {!playing && (
          <PageHeader
            className="ph--portal"
            crumbs={
              <Crumbs
                items={[
                  { label: 'Progress', href: '/me/progress' },
                  { label: 'History', href: '/me/progress/history' },
                  { label: name },
                ]}
              />
            }
            title={name}
            sub={[when, who].filter(Boolean).join(' · ')}
          />
        )}
        <div className="body">{playing ? <Player log={log} trainerFirstName={first} /> : <Recap log={log} trainerName={trainerName} />}</div>
      </main>
    </>
  );
}
