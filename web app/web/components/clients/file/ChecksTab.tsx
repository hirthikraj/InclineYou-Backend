'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Chevron } from '@/components/shell/Icons';
import { ScheduleSheet } from '@/components/clients/assessments/ScheduleSheet';
import { endCycle } from '@/lib/assessments/actions';
import { assessmentHref } from '@/lib/assessments/address';
import {
  STATUS_LABEL,
  STATUS_TONE,
  blockCount,
  type AssessmentStatus,
  type AssessmentWire,
  type ScheduleWire,
  type TemplateWire,
} from '@/lib/assessments/vocab';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { CountBadge } from '@/web-components/ui/CountBadge';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Message } from '@/web-components/ui/Message';
import { Row, Table, type Column } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';

import { longDateStr } from './shared';

/**
 * THE CLIENT FILE'S CHECK-INS — `/clients/:id/assessments`, beside Progress.
 *
 * ── WHY IT IS BESIDE PROGRESS AND NOT INSIDE IT ─────────────────────────────
 *
 * They are the same subject read two ways and the difference is who took the
 * number. **Progress is what the trainer recorded** — body metrics off their
 * own tape, volume off the set logs — and it answers *is this client changing
 * shape*. **A check-in is what the CLIENT sent back**, on a date, against a set
 * of questions somebody wrote in advance, and half of it is not a number at
 * all. Folded into Progress the answers would have nowhere to go, and the
 * eleven sentences a client wrote about their sleep would sit under a chart of
 * their waist as though they were an annotation on it.
 *
 * ── AND IT IS TWO SECTIONS, NOT ONE LIST ────────────────────────────────────
 *
 * `SessionsTab`'s own split, for its reason: a check-in is either OWED or
 * ANSWERED, and those are two different things to do about it. The first
 * section is the one a trainer acts on — chase it, send it, take the tape out
 * on Tuesday — and it runs soonest-first because the next thing due is the
 * next thing to do. The second is the record and runs newest-first.
 *
 * Neither is capped. `SessionsTab` shows four of twenty-six bookings because a
 * client has twenty-six; a client on a check-in every eight weeks has three a
 * year, and a disclosure over four rows is a control that exists to say *there
 * is no more*.
 */
export function ChecksTab({
  clientId,
  clientName,
  rows,
  schedules,
  templates,
}: {
  clientId: string;
  clientName: string;
  /** `null` where the read failed — see `loadClientAssessments`. */
  rows: AssessmentWire[] | null;
  /** This client's cycles, live first. `null` where the read failed. */
  schedules: ScheduleWire[] | null;
  /** The trainer's forms, for *Assign*. */
  templates: TemplateWire[] | null;
}) {
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  if (rows === null) {
    return (
      <div className="cfchk">
        {/* NOT AN EMPTY STATE. A failed read drawn as *nothing asked yet* is
            the screen inventing a fact about somebody's coaching, and the
            other seven tabs of this file are still standing — so this says
            what actually happened and offers the one thing that fixes it. */}
        <Message tone="warn">
          The check-ins could not be loaded just now. Everything else on this
          file is up to date; try again in a moment.
        </Message>
      </div>
    );
  }

  /* OWED is every state that is not `done`, and the order is the one a trainer
     reads it in: soonest first. `missed` sorts in with the rest rather than to
     the top — its date IS its urgency, and a check-in missed in March is not
     more pressing than one due on Friday. The tag says which is which. */
  const owed = rows
    .filter((r) => r.state !== 'done')
    .slice()
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  /* Back, newest first — on `completedAt`, because the point of the row is the
     day the tape was read and a check-in dated the 1st and answered on the 9th
     belongs where it was answered. */
  const back = rows
    .filter((r) => r.state === 'done')
    .slice()
    .sort((a, b) => whenOf(b) - whenOf(a));

  const assign = (
    <div className="cfchk__bar">
      <Button variant="primary" onClick={() => setAssigning(true)} disabled={templates === null}>
        Assign an assessment
      </Button>
    </div>
  );
  const sheet = assigning && templates && (
    <ScheduleSheet
      clients={[]}
      clientId={clientId}
      templates={templates}
      onClose={(booked) => {
        setAssigning(false);
        if (booked) router.refresh();
      }}
    />
  );

  if (rows.length === 0 && (schedules?.length ?? 0) === 0) {
    return (
      <>
        <Nothing clientName={clientName} />
        {assign}
        {sheet}
      </>
    );
  }

  return (
    <div className="cfchk">
      {assign}
      {sheet}
      {schedules && schedules.length > 0 && <Cycles rows={schedules} clientId={clientId} />}
      {owed.length > 0 && (
        <Section
          title="Outstanding"
          caption={`${owed.length} check-ins asked for and not back yet, soonest first`}
          n={owed.length}
          rows={owed}
          when={(r) => Date.parse(`${r.dueOn}T00:00:00`)}
          clientId={clientId}
        />
      )}
      {back.length > 0 && (
        <Section
          title="Answered"
          caption={`${back.length} check-ins ${clientName} has sent back, newest first`}
          n={back.length}
          rows={back}
          when={whenOf}
          clientId={clientId}
        />
      )}
    </div>
  );
}

function Section({
  title,
  caption,
  n,
  rows,
  when,
  clientId,
}: {
  title: string;
  caption: string;
  n: number;
  rows: AssessmentWire[];
  when: (r: AssessmentWire) => number;
  /* THE ROWS OPEN THE CHECK-IN INSIDE THIS FILE, which is the whole of why
     this prop is threaded down: `/clients/:clientId/assessments/:id` rather
     than the book-wide `/clients/assessments/:id`. A row clicked in a person's
     file used to land on a screen whose only exit was the list of everyone —
     the trainer came from Meera and went back to forty strangers. The nested
     route's own page carries the rest of the argument. */
  clientId: string;
}) {
  const router = useRouter();
  return (
    <Card className="cfchk__card">
      <Card.Head title={title} level={3}>
        <CountBadge n={n} label={caption} />
      </Card.Head>
      <Card.Body flush>
        {/* `Cell.label` on every cell, and the head is clipped rather than
            dropped below 620 — `.cftx`'s answer, and this table needs it for
            `.cftx`'s exact reason: `12 / 15` and `Waiting` are unreadable
            without their column names. Trap 13 is why the head cannot simply
            go: the reflow drops the table role, which is affordable only where
            there is no `<thead>` to lose. */}
        <Table caption={caption} className="cfchk__t" columns={COLUMNS}>
          {rows.map((r) => (
            <Row
              key={r.id}
              /* THE WHOLE ROW IS THE DOOR, which is `SessionsTab`'s form one
                 tab along and the reason this table grew a chevron column: a
                 date carrying a link and a chevron carrying another would be
                 two targets to the same screen on one row, and the file's
                 other table settled that. `role="link"` plus a key handler
                 rather than wrapping the cells in an anchor — a `<tr>` cannot
                 be one, and a row that answers Enter is the half a `<div>`
                 with an onClick forgets. */
              role="link"
              tabIndex={0}
              aria-label={`Open ${r.name}, ${longDateStr(when(r))}`}
              onClick={() => router.push(assessmentHref(r.id, 'summary', null, clientId))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(assessmentHref(r.id, 'summary', null, clientId));
                }
              }}
              header={
                <span className="cfchk__d">
                  {longDateStr(when(r))}
                </span>
              }
              cells={[
                {
                  key: 'name',
                  /* *Assessment*, which is the assessments list's own column
                     head — the two tables name the same column the same way. */
                  label: 'Assessment',
                  className: 'cfchk__c-name',
                  content: <span title={r.name}>{r.name}</span>,
                },
                {
                  key: 'measurements',
                  label: 'Measurements',
                  numeric: true,
                  className: 'cfchk__c-n',
                  content: <Count block={r.measurements} status={r.state} />,
                },
                {
                  key: 'questions',
                  label: 'Questions',
                  numeric: true,
                  className: 'cfchk__c-n',
                  content: <Count block={r.questions} status={r.state} />,
                },
                {
                  key: 'status',
                  label: 'Status',
                  className: 'cfchk__c-st',
                  content: <Tag tone={STATUS_TONE[r.state]}>{STATUS_LABEL[r.state]}</Tag>,
                },
                {
                  key: 'go',
                  /* `data-l=""` is how the phone rung marks the cell that takes
                     no label — this one is not a fact, it is the affordance. */
                  label: '',
                  className: 'cfchk__go',
                  content: <Chevron size={15} />,
                },
              ]}
            />
          ))}
        </Table>
      </Card.Body>
    </Card>
  );
}

/** The day it counts for, as ms: when it was done, else when it is due. */
function whenOf(r: AssessmentWire): number {
  return r.completedAt ?? Date.parse(`${r.dueOn}T00:00:00`);
}

/**
 * THE CYCLES — a client on an assessment every N weeks. Each live one shows
 * what is next and how to take it; ending one books nothing more (an
 * assessment somebody has already started stays takeable).
 */
function Cycles({ rows, clientId }: { rows: ScheduleWire[]; clientId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const live = rows.filter((c) => c.endedAt === null);
  if (live.length === 0) return null;

  function end(id: string) {
    setError(null);
    start(async () => {
      const res = await endCycle(id, clientId);
      if (!res.ok) setError(res.message ?? 'That did not save.');
      else router.refresh();
    });
  }

  return (
    <Card className="cfchk__card">
      <Card.Head title="Cycles" level={3}>
        <CountBadge n={live.length} label={`${live.length} live cycles`} />
      </Card.Head>
      <Card.Body>
        {error && <Message tone="err">{error}</Message>}
        <ul className="cfchk__cycles">
          {live.map((c) => (
            <li key={c.id} className="cfchk__cycle">
              <span>
                <b>{c.templateName}</b> · every {c.intervalDays} days · next{' '}
                {longDateStr(Date.parse(`${c.nextDueOn}T00:00:00`))}
              </span>
              {c.openAssessmentId && (
                <Button variant="secondary" size="sm" href={`/clients/assessments/${c.openAssessmentId}/take`}>
                  Take it
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => end(c.id)}>
                End cycle
              </Button>
            </li>
          ))}
        </ul>
      </Card.Body>
    </Card>
  );
}

const COLUMNS: Column[] = [
  { key: 'when', label: 'Date', className: 'cfchk__c-date' },
  { key: 'name', label: 'Assessment', className: 'cfchk__c-name' },
  { key: 'measurements', label: 'Measurements', numeric: true, className: 'cfchk__c-n' },
  { key: 'questions', label: 'Questions', numeric: true, className: 'cfchk__c-n' },
  { key: 'status', label: 'Status', className: 'cfchk__c-st' },
  /* ONE ELASTIC TRACK AND IT IS THE CHEVRON'S — `.cfses__t`'s answer, measured
     there and re-measured here. Every column above is capped at the widest ink
     it draws; this one has no width, which under `table-layout:fixed` means
     *take whatever the others did not*. MEASURED at 1536 before it existed:
     the NAME was the elastic track at **676px** holding ~190px of ink, so
     486px of nothing sat between the check-in and its counts on every row —
     the interior void `.wkrow` was fixed for. In front of an edge control the
     same surplus reads as an edge control sitting at the edge. */
  { key: 'go', bare: true, label: '', className: 'cfchk__c-go' },
];

/**
 * `12 / 15`, `15`, or an em-dash — `blockCount`'s three states, and the same
 * rendering the assessments list gives them. A block that was never asked for
 * answers nothing rather than a zero: *0 / 11* is a client who answered
 * nothing, and a template with its questions switched off is not that.
 */
function Count({
  block,
  status,
}: {
  block: { got: number; asked: number };
  status: AssessmentStatus;
}) {
  const count = blockCount(block, status);
  if (!count) return <span className="cfchk__n cfchk__n--none">&mdash;</span>;
  return (
    <span className={count.short ? 'cfchk__n cfchk__n--short' : 'cfchk__n'}>{count.text}</span>
  );
}

function Nothing({ clientName }: { clientName: string }) {
  const first = clientName.split(' ')[0];
  return (
    <div className="cfchk">
      <EmptyState
        kind="first-run"
        title="No check-ins yet"
        body={`A check-in is a set of measurements and questions you send on a date. Nothing has been asked of ${first} yet.`}
        action={
          <Button variant="secondary" href="/clients/assessments">
            Go to Assessments
          </Button>
        }
      />
    </div>
  );
}
