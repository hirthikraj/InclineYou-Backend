import type { ProgramTreeWire } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';

import { prescription } from '../workout/units';
import { day } from './format';

/** One plan, read-only: its days and what is in them, with the trainer's cue to the client. Nothing here is the trainer's alone. */
export function PlanTree({ tree, trainerFirstName }: { tree: ProgramTreeWire; trainerFirstName: string }) {
  return (
    <div className="pl">
      <Card>
        <Card.Body>
          <p className="pl__k">{tree.status === 'completed' ? 'Finished plan' : 'Plan'}</p>
          <h1 className="pl__h">{tree.name}</h1>
          <p className="pl__s">
            {tree.weeks} weeks{tree.startDate ? ` · ${day(tree.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            {tree.endDate ? ` – ${day(tree.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </p>
        </Card.Body>
      </Card>
      {tree.workouts.map((w) => (
        <Card key={w.id}>
          <Card.Head title={w.name} level={3} actions={w.week ? <Tag>{`Week ${w.week}${w.day ? ` · Day ${w.day}` : ''}`}</Tag> : undefined} />
          <Card.Body>
            <ul className="pl__list">
              {w.exercises.map((e) => (
                <li key={e.id} className="pl__ex">
                  <p className="pl__t">{e.name}{e.target ? <span className="pl__s"> · {e.target}</span> : null}</p>
                  <p className="pl__s">{prescription(e.sets.map((s) => ({ loadKind: s.loadKind, effortKind: s.effortKind, targetLoad: s.targetLoad, targetEffort: s.targetEffort })))}</p>
                  {e.cue && <p className="pl__cue"><b>{trainerFirstName} says</b> {e.cue}</p>}
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      ))}
      <div><Button variant="secondary" href="/me/plan/history">All past plans</Button></div>
    </div>
  );
}
