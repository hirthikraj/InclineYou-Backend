import Link from 'next/link';

import type { FinishedWire } from '@/lib/portal/workout-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';

import { clock, trim } from './units';

/** What finishing says: the day in three numbers, any personal bests, and a milestone if one was reached. Never a score and never a scold. */
export function Summary({ finished, trainerFirstName }: { finished: FinishedWire; trainerFirstName: string }) {
  const s = finished.summary;
  return (
    <div className="pwk">
      <Card className="pwk__hero">
        <Card.Body>
          <p className="pwk__k">Workout done</p>
          <h1 className="pwk__h">Nice work.</h1>
          <p className="pwk__s">{trainerFirstName} will see this on your file.</p>
          <dl className="pwk__facts">
            <div><dt>Time</dt><dd>{clock(s.durationSeconds)}</dd></div>
            <div><dt>Sets</dt><dd>{s.setsDone}<span> of {s.setsPlanned}</span></dd></div>
            {s.volumeKg > 0 && <div><dt>Lifted</dt><dd>{trim(s.volumeKg)}<span> kg</span></dd></div>}
          </dl>
          {s.milestones.map((m) => (
            <p key={m.kind} className="pwk__s"><Tag tone="acc">Milestone</Tag> {m.label}</p>
          ))}
        </Card.Body>
      </Card>

      {s.newBests.length > 0 && (
        <Card>
          <Card.Head title="New personal bests" level={3} />
          <Card.Body>
            <ul className="pwk__bests">
              {s.newBests.map((b) => (
                <li key={b.exerciseId}>
                  <b>{b.name}</b> — {trim(b.loadValue)} kg × {trim(b.effortValue)} <Tag tone="pr">PR</Tag>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      <div className="pwk__actions">
        <Button variant="primary" size="lg" href="/me/today">Back to today</Button>
        <Link href={`/me/session/${finished.session.id}`} prefetch={false}>See this workout</Link>
      </div>
    </div>
  );
}
