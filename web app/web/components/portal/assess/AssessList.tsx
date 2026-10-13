import Link from 'next/link';

import type { AssessItemWire, TemplateWire } from '@/lib/portal/assess-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Tag } from '@/web-components/ui/Tag';

import { day } from '../plan/format';
import { StartAssessment } from './StartAssessment';

function asks(a: { measurements: number; questions: number }): string {
  const n = a.measurements + a.questions;
  return `${n} ${n === 1 ? 'thing' : 'things'} to answer`;
}

/**
 * The Assessments tab, laid out like the trainer's: what is waiting first, what is done below. An assessment is how a body gets measured —
 * there is no loose weigh-in — so this is the only place a client records one. Late is said gently and never as a fault.
 */
export function AssessList({ open, done, counts, templates, nextCursor, trainerFirstName }: {
  open: AssessItemWire[]; done: AssessItemWire[]; counts: { open: number; done: number }; templates: TemplateWire[]; nextCursor: string | null; trainerFirstName: string;
}) {
  return (
    <div className="pl">
      <Card>
        <Card.Head title={`To do${counts.open ? ` · ${counts.open}` : ''}`} level={3} />
        <Card.Body>
          {open.length === 0 ? (
            <p className="pl__s">Nothing waiting. {trainerFirstName} will send the next one when it’s due.</p>
          ) : (
            <ul className="pl__list">
              {open.map((a) => (
                <li key={a.id} className="pl__row">
                  <div>
                    <p className="pl__t"><Link href={`/me/assessments/${a.id}`}>{a.name}</Link></p>
                    <p className="pl__s">{asks(a.asks)} · due {day(a.dueOn)}</p>
                  </div>
                  <div className="pl__tags">
                    {a.late && <Tag tone="warn">A little late</Tag>}
                    <Button variant="primary" size="sm" href={`/me/assessments/${a.id}`}>Open</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card.Body>
      </Card>

      {templates.length > 0 && (
        <Card>
          <Card.Head title="Start a new one" level={3} />
          <Card.Body>
            <ul className="pl__list">
              {templates.map((t) => (
                <li key={t.id} className="pl__row">
                  <div>
                    <p className="pl__t">{t.name}</p>
                    <p className="pl__s">{t.description ?? asks(t.asks)}</p>
                  </div>
                  <StartAssessment templateId={t.id} continueId={t.openAssessmentId} />
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      <Card>
        <Card.Head title={`History${counts.done ? ` · ${counts.done}` : ''}`} level={3} />
        <Card.Body>
          {done.length === 0 ? (
            <EmptyState title="Nothing handed in yet" body="Each one you hand in is kept here, with what changed since the last." />
          ) : (
            <ul className="pl__list">
              {done.map((a) => (
                <li key={a.id} className="pl__row">
                  <div>
                    <p className="pl__t"><Link href={`/me/assessments/${a.id}`}>{a.name}</Link></p>
                    <p className="pl__s">{a.completedAt ? new Date(a.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : ''} · {asks(a.asks)}</p>
                  </div>
                  <Tag tone="ok">Done</Tag>
                </li>
              ))}
            </ul>
          )}
          {nextCursor && <div style={{ marginTop: 12 }}><Button variant="secondary" href={`/me/progress/assessments?cursor=${encodeURIComponent(nextCursor)}`}>Older ones</Button></div>}
        </Card.Body>
      </Card>
    </div>
  );
}
