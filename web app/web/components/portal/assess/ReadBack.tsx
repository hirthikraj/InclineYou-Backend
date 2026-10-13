import Link from 'next/link';

import type { AssessDetailWire } from '@/lib/portal/assess-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { TrendChart } from '@/web-components/ui/TrendChart';

import { day, num } from '../plan/format';

/**
 * An assessment handed in, read back: each measurement with the last completed one's value and the change, the answers, and — the only place a
 * client sees a body measurement — the series for what it asked. A change is a number, never a verdict: no good or bad colour, no target.
 */
export function ReadBack({ a }: { a: AssessDetailWire }) {
  const when = a.completedAt ? new Date(a.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';
  const series = (a.history ?? []).filter((h) => h.points.length > 1);
  return (
    <div className="pl">
      <Card className="ppg__hero">
        <Card.Body>
          <p className="pl__k">Handed in {when}</p>
          <h1 className="pl__h">{a.name}</h1>
          {a.healthNotice && <p className="pl__s">{a.healthNotice}</p>}
        </Card.Body>
      </Card>

      {(a.readings?.length ?? 0) > 0 && (
        <Card>
          <Card.Head title="Measurements" level={3} />
          <Card.Body>
            <ul className="pl__list">
              {a.readings!.map((r) => (
                <li key={r.key} className="pl__row">
                  <div>
                    <p className="pl__t">{r.label}</p>
                    {r.previous !== null && <p className="pl__s">Last time {num(r.previous)}{r.unit ? ` ${r.unit}` : ''}</p>}
                  </div>
                  <div className="pl__tags">
                    <span className="pl__t">{num(r.value)}{r.unit ? ` ${r.unit}` : ''}</span>
                    {r.change !== null && r.change !== 0 && <Tag>{r.change > 0 ? '+' : '−'}{num(Math.abs(r.change))}</Tag>}
                  </div>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      {(a.answers?.length ?? 0) > 0 && (
        <Card>
          <Card.Head title="Your answers" level={3} />
          <Card.Body>
            <ul className="pl__list">
              {a.answers!.map((x) => (
                <li key={x.questionId} className="pl__ex">
                  <p className="pl__s">{x.text}</p>
                  <p className="pl__t">
                    {x.kind === 'yesno' ? (x.yes ? 'Yes' : 'No') : x.kind === 'rating' ? `${x.rating} of ${x.scale}` : x.kind === 'choice' ? [...(x.chosen ?? []), ...(x.answer ? [x.answer] : [])].join(', ') : x.answer}
                  </p>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      {series.map((h) => {
        const m = a.readings?.find((r) => r.key === h.key);
        return (
          <Card key={h.key}>
            <Card.Head title={`${m?.label ?? h.key} over time`} level={3} />
            <Card.Body>
              <TrendChart values={h.points.map((p) => p.value)} label={`${m?.label ?? h.key} across your assessments`} from={day(new Date(h.points[0].at).toISOString().slice(0, 10))}
                to={day(new Date(h.points[h.points.length - 1].at).toISOString().slice(0, 10))} markIndex="last" unit={m?.unit || undefined} />
            </Card.Body>
          </Card>
        );
      })}

      {(a.returned?.length ?? 0) > 0 && (
        <Card>
          <Card.Head title="Compare with another" level={3} />
          <Card.Body>
            <ul className="pl__list">
              {a.returned!.map((r) => (
                <li key={r.id} className="pl__row">
                  <Link href={`/me/assessments/${r.id}`}>{r.name}</Link>
                  <span className="pl__s">{new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}
      <div><Button variant="secondary" href="/me/progress/assessments">All assessments</Button></div>
    </div>
  );
}
