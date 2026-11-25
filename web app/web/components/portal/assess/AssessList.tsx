import type { AssessItemWire, TemplateWire } from '@/lib/portal/assess-api';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Tag } from '@/web-components/ui/Tag';

import { day } from '../plan/format';
import { StartAssessment } from './StartAssessment';

function asks(a: { measurements: number; questions: number }): string {
  const n = a.measurements + a.questions;
  return `${n} ${n === 1 ? 'thing' : 'things'} to answer`;
}

/**
 * The Assessments tab, laid out like the trainer's: what is waiting first, what is done below. An assessment is how a body gets measured —
 * there is no loose weigh-in — so this is the only place a client records one.
 *
 * ── 21 Nov 2026 ──────────────────────────────────────────────────────────────
 *
 *   · **Late carries no tone.** It was an amber *A little late* tag, which is `--tx-warn` on the one thing §1 says never to colour:
 *     a client who is behind. A neutral *Late* tag and *Still open*, led with so it survives the ellipsis at 390px.
 *   · **One verb, not one per row.** Every open row carried its own `primary` *Open*, so a client with three waiting saw three
 *     primaries; the row is the door now (`ListRow`'s link form) and the card has one `secondary` for the first of them.
 *   · **The History rows lost their *Done* tag** — every row under a heading called History is done, so the tag said nothing twenty
 *     times. Dates are in the client's own zone, not a hard-coded Asia/Kolkata.
 */
export function AssessList({
  open,
  done,
  counts,
  templates,
  nextCursor,
  trainerFirstName,
  zone,
}: {
  open: AssessItemWire[];
  done: AssessItemWire[];
  counts: { open: number; done: number };
  templates: TemplateWire[];
  nextCursor: string | null;
  trainerFirstName: string;
  zone: string;
}) {
  const completed = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone });

  /* ONE DOOR PER CHECK-IN (25 Nov 2026). A template whose open copy is already under *To do* was listed again here
     with *Continue* — the same check-in behind *Fill it in* and *Continue*, under a heading that says *Start a new
     one*. Such a template is left out; the card goes when nothing is left to start. */
  const waiting = new Set(open.map((a) => a.id));
  const startable = templates.filter((t) => !t.openAssessmentId || !waiting.has(t.openAssessmentId));

  return (
    <div className="portal col gap4">
      <Card>
        <CardHead title="To do">{counts.open > 0 && <span className="small ink3">{counts.open} waiting</span>}</CardHead>
        {open.length === 0 ? (
          <CardBody>
            <p className="small ink2">Nothing waiting. {trainerFirstName} will send the next one when it’s due.</p>
          </CardBody>
        ) : (
          <>
            <CardBody flush>
              <ListRows label="Assessments waiting for you">
                {open.map((a) => (
                  <ListRow
                    key={a.id}
                    href={`/me/assessments/${a.id}`}
                    title={a.name}
                    sub={`${a.late ? 'Still open' : `Due ${day(a.dueOn)}`} · ${asks(a.asks)}`}
                    right={a.late ? <Tag>Late</Tag> : undefined}
                    rightInline
                  />
                ))}
              </ListRows>
            </CardBody>
            <CardBody divided>
              <Button variant="secondary" href={`/me/assessments/${open[0].id}`}>
                {open.length === 1 ? 'Fill it in' : `Start with ${open[0].name}`}
              </Button>
            </CardBody>
          </>
        )}
      </Card>

      {startable.length > 0 && (
        <Card>
          <CardHead title="Start a new one">
            <span className="small ink3">whenever you like</span>
          </CardHead>
          <CardBody flush>
            <ListRows label="Assessments you can start yourself">
              {startable.map((t) => (
                <ListRow
                  key={t.id}
                  title={t.name}
                  sub={t.description ?? asks(t.asks)}
                  right={<StartAssessment templateId={t.id} continueId={t.openAssessmentId} />}
                  rightInline
                />
              ))}
            </ListRows>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHead title="History">{counts.done > 0 && <span className="small ink3">{counts.done} handed in</span>}</CardHead>
        {done.length === 0 ? (
          <CardBody>
            <EmptyState inCard title="Nothing handed in yet" body="Each one you hand in is kept here, with what changed since the last." />
          </CardBody>
        ) : (
          <CardBody flush>
            <ListRows label="Assessments you have handed in">
              {done.map((a) => (
                <ListRow
                  key={a.id}
                  href={`/me/assessments/${a.id}`}
                  title={a.name}
                  sub={[a.completedAt ? completed(a.completedAt) : null, asks(a.asks)].filter(Boolean).join(' · ')}
                />
              ))}
            </ListRows>
          </CardBody>
        )}
        {nextCursor && (
          <CardBody divided>
            <Button variant="secondary" href={`/me/progress/assessments?cursor=${encodeURIComponent(nextCursor)}`}>
              Older ones
            </Button>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
