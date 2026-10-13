import type { ExerciseSeriesWire } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { TrendChart } from '@/web-components/ui/TrendChart';

import { day, num } from './format';

/**
 * One movement over time. The line is the estimated best set of each session for a weight × reps lift, and the effort itself (seconds,
 * reps, metres) for the rest. It carries no tone: a lighter week is a lighter week, not a fault — which is why the wire has no `trend`.
 */
export function ExerciseProgress({ data }: { data: ExerciseSeriesWire }) {
  const { exercise, series, bests } = data;
  const estimated = series.some((p) => p.e1rm !== null);
  const values = series.map((p) => (estimated ? p.e1rm ?? 0 : p.effortValue ?? p.loadValue ?? 0));

  return (
    <div className="pl">
      <Card>
        <Card.Body>
          <p className="pl__k">Exercise</p>
          <h1 className="pl__h">{exercise.name}</h1>
          {bests.e1rm && <p className="pl__s">Best set: {num(bests.e1rm.loadValue)} kg × {num(bests.e1rm.effortValue)} on {day(bests.e1rm.on, { day: 'numeric', month: 'short', year: 'numeric' })} · est. {num(bests.e1rm.e1rm)} kg</p>}
          {!bests.e1rm && series.length > 0 && <p className="pl__s">{series.length} {series.length === 1 ? 'session' : 'sessions'} logged.</p>}
        </Card.Body>
      </Card>

      {series.length === 0 ? (
        <EmptyState title="Nothing logged for this yet" body="After you’ve finished a session with it, each one shows here." />
      ) : (
        <>
          {series.length > 1 && (
            <Card>
              <Card.Head title={estimated ? 'Estimated best set, per session' : 'Best effort, per session'} level={3} />
              <Card.Body>
                <TrendChart values={values} label={`${exercise.name}, ${estimated ? 'estimated best set' : 'best effort'} per session`} from={day(series[0].on)} to={day(series[series.length - 1].on)} markIndex="last" unit={estimated ? 'kg' : undefined} />
              </Card.Body>
            </Card>
          )}
          <Card>
            <Card.Head title="Session by session" level={3} />
            <Card.Body>
              <ul className="pl__list">
                {[...series].reverse().map((p) => (
                  <li key={p.on} className="pl__row">
                    <span className="pl__t">{day(p.on, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="pl__s">
                      {[p.loadValue !== null ? `${num(p.loadValue)} kg` : null, p.effortValue !== null ? `× ${num(p.effortValue)}` : null].filter(Boolean).join(' ')}
                      {p.volume > 0 ? ` · ${num(p.volume)} kg moved` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card.Body>
          </Card>
        </>
      )}
      <div><Button variant="secondary" href="/me/progress/exercises">All exercises</Button></div>
    </div>
  );
}
