import Link from 'next/link';
import type { PortalHomeWire, SessionCardWire } from '@/lib/portal/home-api';
import { StartRun } from '@/components/portal/workout/StartRun';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';

/**
 * The client's home: one hero and the quiet cards under it (api-contract 1.2, p-a2).
 *
 * The hero is exactly one of four things and each has a sentence, so the screen is never blank and never alarming: a session the
 * trainer has booked (which the client does not start — the trainer logs it), a day of their own programme, a rest day said warmly,
 * or the first-run welcome. Everything under it is optional and is simply not drawn when the client does not have it.
 *
 * Dates are the client's own: the server names their zone and every time here is formatted in it, so a session at 6:30 reads 6:30
 * wherever the browser happens to be.
 */
function when(ms: number, zone: string): { day: string; time: string } {
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(d);
  const time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(d).toLowerCase();
  return { day, time };
}

function sameDay(a: number, b: number, zone: string): boolean {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone });
  return f.format(new Date(a)) === f.format(new Date(b));
}

function SessionLine({ s, zone, now, lead }: { s: SessionCardWire; zone: string; now: number; lead: string }) {
  const w = when(s.scheduledAt, zone);
  const day = sameDay(s.scheduledAt, now, zone) ? 'Today' : w.day;
  return (
    <>
      <p className="pth__k">{lead}</p>
      <h2 className="pth__h">{day} · {w.time}</h2>
      <p className="pth__s">
        {s.workoutName ? `${s.workoutName} · ` : ''}{s.durationMinutes} min{s.place ? ` · ${s.place}` : s.mode === 'online' ? ' · Online' : ''}
      </p>
    </>
  );
}

export function HomeView({ home }: { home: PortalHomeWire }) {
  const { hero, trainer } = home;
  const first = trainer.name.split(' ')[0];
  const zone = home.timezone;

  return (
    <div className="pth">
      <Card className="pth__hero">
        <Card.Body>
          {hero.kind === 'session' && hero.session && (
            <>
              <SessionLine s={hero.session} zone={zone} now={home.now} lead={`${first} is seeing you`} />
              <p className="pth__s">{first} will log it with you — there is nothing to start.</p>
              {hero.session.rescheduleUrl && (
                <Button variant="secondary" href={hero.session.rescheduleUrl} target="_blank" rel="noopener noreferrer">
                  Ask to move it
                </Button>
              )}
            </>
          )}

          {hero.kind === 'selfRun' && hero.workout && (
            <>
              <p className="pth__k">Your next workout</p>
              <h2 className="pth__h">{hero.workout.name}</h2>
              <p className="pth__s">
                {hero.workout.week && hero.workout.day ? `Week ${hero.workout.week} · Day ${hero.workout.day} · ` : ''}
                {hero.workout.exerciseCount} {hero.workout.exerciseCount === 1 ? 'exercise' : 'exercises'} · about {hero.workout.estimatedMinutes} min
              </p>
              {hero.resume && <Tag tone="info">You started this one</Tag>}
              <StartRun workoutId={hero.workout.id} resumeSessionId={hero.resume?.sessionId} />
            </>
          )}

          {hero.kind === 'rest' && (
            <>
              <p className="pth__k">Rest day</p>
              <h2 className="pth__h">Nothing to do today.</h2>
              <p className="pth__s">That’s the plan working — recovery is when the training lands.</p>
              {hero.nextSession && (
                <p className="pth__s">
                  Next: {when(hero.nextSession.scheduledAt, zone).day} at {when(hero.nextSession.scheduledAt, zone).time}
                  {hero.nextSession.workoutName ? ` · ${hero.nextSession.workoutName}` : ''}.
                </p>
              )}
            </>
          )}

          {hero.kind === 'empty' && (
            <div className="pth__who">
              <Avatar name={trainer.name} size="lg" />
              <div>
                <p className="pth__k">Welcome</p>
                <h2 className="pth__h">{first} hasn’t set your plan up yet.</h2>
                <p className="pth__s">When they do, your sessions and workouts appear here. Say hello in the meantime.</p>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      {home.message && (
        <Card>
          <Card.Head title={`From ${first}`} level={3} actions={!home.message.readAt ? <Tag tone="info">New</Tag> : undefined} />
          <Card.Body>
            <p className="pth__q">{home.message.body}</p>
            <p className="pth__s"><Link href="/me/inbox">All messages from {first}</Link></p>
            <p className="pth__s">{when(home.message.at, zone).day}</p>
          </Card.Body>
        </Card>
      )}

      {home.lastRecap && (
        <Card>
          <Card.Head title="Your last session" level={3} />
          <Card.Body>
            <p className="pth__s">
              {when(home.lastRecap.at, zone).day} · {home.lastRecap.setsDone} {home.lastRecap.setsDone === 1 ? 'set' : 'sets'}
              {home.lastRecap.volumeKg > 0 ? ` · ${home.lastRecap.volumeKg.toLocaleString('en-IN')} kg moved` : ''}
            </p>
            {home.lastRecap.newBests.length > 0 && (
              <ul className="pth__bests">
                {home.lastRecap.newBests.map((b) => (
                  <li key={b.exerciseId}>
                    <Tag tone="ok">New best</Tag> {b.name} — {b.loadValue} kg{b.effortValue ? ` × ${b.effortValue}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {home.lastRecap.message && <p className="pth__q">{home.lastRecap.message.body}</p>}
          </Card.Body>
        </Card>
      )}

      <div className="pth__row">
        {home.package && (
          <Card>
            <Card.Head title="Your pack" level={3} />
            <Card.Body>
              <p className="pth__h2">
                {home.package.sessionsLeft} <span>of {home.package.sessionsTotal} sessions left</span>
              </p>
              {home.package.expiresOn && <p className="pth__s">Until {new Date(`${home.package.expiresOn}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
              {home.package.paused && <Tag>Paused</Tag>}
              <p className="pth__s"><Link href="/me/package">Details</Link></p>
            </Card.Body>
          </Card>
        )}

        {home.assessments && (
          <Card>
            <Card.Head title="Assessment" level={3} />
            <Card.Body>
              <p className="pth__s">
                <Link href={`/me/assessments/${home.assessments.next.id}`}>{home.assessments.next.name}</Link> · due {new Date(`${home.assessments.next.dueOn}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {home.assessments.late > 0 ? ' · a little late, no stress' : ''}
              </p>
            </Card.Body>
          </Card>
        )}
      </div>

      {home.recentMilestone && <p className="pth__s">🎉 {home.recentMilestone.label}</p>}
      <p className="pth__s"><Link href="/me/details">Your details</Link></p>
    </div>
  );
}
