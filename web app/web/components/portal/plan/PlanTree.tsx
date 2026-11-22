import type { ProgramTreeWire } from '@/lib/portal/plan-api';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Crumbs } from '@/web-components/ui/Crumbs';

import { prescription } from '../workout/units';
import { day } from './format';

type Workout = ProgramTreeWire['workouts'][number];

/**
 * One past plan, read-only: its days and what is in them, with the trainer's cue to the client. Browsed, not performed — so no day
 * links anywhere (AGENTS.md: *an earlier plan gets no per-day route*).
 *
 * ── 21 Nov 2026 ──────────────────────────────────────────────────────────────
 *
 *   · **The name is an `<h2>` under a `Crumbs` row** (`Plan / Past plans / {name}`). It was an `<h1>` inside a card, under the
 *     layout's own *Your plan* `<h1>`, and the way back was a button after the last of up to forty workout cards.
 *   · **Workouts are grouped by week, and only the first week is open.** One card per workout put a twelve-week plan at thirty-six
 *     cards in one column; a week is the unit the client remembers it in. The weeks are native `<details>` (`.disc`).
 */
export function PlanTree({ tree, trainerFirstName }: { tree: ProgramTreeWire; trainerFirstName: string }) {
  const weeks = new Map<number, Workout[]>();
  for (const w of tree.workouts) weeks.set(w.week ?? 0, [...(weeks.get(w.week ?? 0) ?? []), w]);
  const groups = [...weeks.entries()].sort((a, b) => a[0] - b[0]);
  const range = [
    tree.startDate ? day(tree.startDate, { day: 'numeric', month: 'short', year: 'numeric' }) : null,
    tree.endDate ? day(tree.endDate, { day: 'numeric', month: 'short', year: 'numeric' }) : null,
  ]
    .filter(Boolean)
    .join(' – ');

  const workoutCard = (w: Workout) => (
    <Card key={w.id}>
      <CardHead title={w.name}>{w.day ? <span className="small ink3">Day {w.day}</span> : null}</CardHead>
      <CardBody>
        <ul className="pl__list">
          {w.exercises.map((e) => (
            <li key={e.id} className="pl__ex">
              <p className="pl__t">
                {e.name}
                {e.target ? <span className="pl__s"> · {e.target}</span> : null}
              </p>
              <p className="pl__s">
                {prescription(e.sets.map((s) => ({ loadKind: s.loadKind, effortKind: s.effortKind, targetLoad: s.targetLoad, targetEffort: s.targetEffort })))}
              </p>
              {e.cue && (
                <p className="pl__cue">
                  <b>{trainerFirstName} says</b> {e.cue}
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );

  return (
    <div className="portal col gap4">
      <Crumbs
        items={[
          { label: 'Plan', href: '/me/plan' },
          { label: 'Past plans', href: '/me/plan/history' },
          { label: tree.name },
        ]}
      />
      <div>
        <h2 className="pprog__h">{tree.name}</h2>
        <p className="small ink2 mt2">
          {tree.status === 'completed' ? 'Finished' : 'Ended'} · {tree.weeks} {tree.weeks === 1 ? 'week' : 'weeks'}
          {range ? ` · ${range}` : ''}
        </p>
      </div>

      {groups.map(([wk, ws], i) =>
        wk === 0 ? (
          <div key="days" className="col gap4">
            {ws.map(workoutCard)}
          </div>
        ) : (
          <details key={wk} className="disc" open={i === 0}>
            <summary className="disc__s">
              Week {wk} · {ws.length} {ws.length === 1 ? 'workout' : 'workouts'}
            </summary>
            <div className="col gap4 mt3">{ws.map(workoutCard)}</div>
          </details>
        ),
      )}
    </div>
  );
}
