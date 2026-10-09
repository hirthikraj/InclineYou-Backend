'use client';

import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Chevron, Plus } from '@/components/shell/Icons';
import { ScheduleSheet } from '@/components/clients/assessments/ScheduleSheet';
import { endCycle } from '@/lib/assessments/actions';
import { assessmentHref } from '@/lib/assessments/address';
import {
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

import { DAY_MS, startOfDay } from '@/lib/today/time';

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
/**
 * ── v1 · THE TRAINER TAKES IT, SO THE WORDS ARE THE TRAINER'S ───────────────
 *
 * Nothing is sent to the client in v1, so this tab says what a trainer does and not what a client
 * did: *To take* and *Taken*, never *asked for and not back yet* / *has sent back*; a row that has
 * gone by is *Not taken*, in neutral ink and with how long ago — a trainer's own omission is a
 * debt to nobody, and an amber tag beside a client on the screen said otherwise. The one verb
 * that matters in the room is *Take it*, and it is on the row.
 */
const STATE_LABEL: Record<AssessmentStatus, string> = {
  booked: 'Booked',
  missed: 'Not taken',
  done: 'Done',
};
const STATE_TONE: Record<AssessmentStatus, 'neutral' | 'ok'> = {
  booked: 'neutral',
  missed: 'neutral',
  done: 'ok',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** *Today*, *Tomorrow*, *5 days ago* — against the server's instant, never `Date.now()` (trap 20). */
function relative(dueOn: string, now: number): string {
  const d = Math.round((Date.parse(`${dueOn}T00:00:00`) - startOfDay(now)) / DAY_MS);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export function ChecksTab({
  clientId,
  clientName,
  rows,
  schedules,
  templates,
  now,
}: {
  clientId: string;
  clientName: string;
  now: number;
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

  const schedule = () => setAssigning(true);
  /* THE VERB LIVES IN THE FIRST CARD'S HEAD, not on a bar of its own. It was a lone lime pill
     right-aligned on a row between the pinned note and the first card — on a phone a 190px button
     with nothing beside it and 30px of air either side, and on a desk a 1,200px gap from the title it
     belongs to. In the head it sits with the thing it adds to; *Schedule* is enough there, and the
     accessible name keeps the whole phrase. */
  const assign = (
    <Button
      variant="primary"
      size="sm"
      icon={<Plus size={14} />}
      aria-label="Schedule an assessment"
      onClick={schedule}
      disabled={templates === null}
    >
      Schedule
    </Button>
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
        {/* The empty card's OWN action is the page's primary one. It was a secondary *Go to
            Assessments* that left the file, with the real button drawn after it at the far right. */}
        <Nothing clientName={clientName} onSchedule={schedule} disabled={templates === null} />
        {sheet}
      </>
    );
  }

  return (
    <div className="cfchk">
      {sheet}
      {schedules && schedules.length > 0 && (
        <Cycles rows={schedules} clientId={clientId} action={assign} />
      )}
      {owed.length > 0 && (
        <Section
          title="To take"
          caption={`${plural(owed.length, 'assessment', 'assessments')} to take, soonest first`}
          n={owed.length}
          rows={owed}
          when={(r) => Date.parse(`${r.dueOn}T00:00:00`)}
          clientId={clientId}
          now={now}
          action={schedules && schedules.some((c) => c.endedAt === null) ? undefined : assign}
        />
      )}
      {back.length > 0 && (
        <Section
          title="Taken"
          caption={`${plural(back.length, 'assessment', 'assessments')} taken with ${clientName}, newest first`}
          n={back.length}
          rows={back}
          when={whenOf}
          clientId={clientId}
          now={now}
          action={owed.length === 0 && !(schedules && schedules.some((c) => c.endedAt === null)) ? assign : undefined}
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
  now,
  action,
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
  now: number;
  /** The page's one primary verb, drawn in whichever card is first on the page. */
  action?: ReactNode;
}) {
  return (
    <Card className="cfchk__card">
      <Card.Head title={title} level={3} actions={action}>
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
              /* THE WHOLE ROW IS THE DOOR, AND THE DOOR IS A REAL LINK. It was `role="link"` on the `<tr>`
                 with a key handler, which replaced the row's own role (a reader heard only *Open Monthly
                 check, 4 Oct 2026* and lost the status and both counts) and was not an anchor: no new tab,
                 no copy-link, and Space navigated. Now the name is an `<a>` whose `::after` is stretched over
                 the `<tr>` (`position:relative`), so the row keeps its table semantics and the click, the
                 middle-click and the keyboard all do what a link does. *Take it* sits above that layer. */
              header={
                <span className="cfchk__d">
                  {longDateStr(when(r))}
                  {r.state !== 'done' && <span className="cfchk__rel"> · {relative(r.dueOn, now)}</span>}
                </span>
              }
              cells={[
                {
                  key: 'name',
                  /* *Assessment*, which is the assessments list's own column
                     head — the two tables name the same column the same way. */
                  label: 'Assessment',
                  className: 'cfchk__c-name',
                  content: (
                    <Link
                      className="cfchk__lk"
                      href={assessmentHref(r.id, 'summary', null, clientId)}
                      title={r.name}
                    >
                      {r.name}
                    </Link>
                  ),
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
                  content: <Tag tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Tag>,
                },
                {
                  key: 'go',
                  /* `data-l=""` is how the phone rung marks the cell that takes
                     no label — this one is not a fact, it is the affordance. */
                  label: '',
                  className: r.state === 'done' ? 'cfchk__go cfchk__go--done' : 'cfchk__go',
                  content: (
                    <>
                      {r.state !== 'done' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="cfchk__take"
                          href={`/clients/assessments/${r.id}/take`}
                        >
                          Take it
                        </Button>
                      )}
                      <Chevron size={15} />
                    </>
                  ),
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
function Cycles({
  rows,
  clientId,
  action,
}: {
  rows: ScheduleWire[];
  clientId: string;
  action?: ReactNode;
}) {
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
      <Card.Head title="Cycles" level={3} actions={action}>
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
  if (!count) {
    return (
      <span className="cfchk__n cfchk__n--none">
        <span aria-hidden="true">&mdash;</span>
        <span className="vh">Not asked</span>
      </span>
    );
  }
  /* `12 / 15` takes no tone any more: a short count on a screen a client may be looking at read as
     a mark against them, and the figure says it. */
  return <span className="cfchk__n">{count.text}</span>;
}

function Nothing({
  clientName,
  onSchedule,
  disabled,
}: {
  clientName: string;
  onSchedule: () => void;
  disabled: boolean;
}) {
  const first = clientName.split(' ')[0];
  return (
    <div className="cfchk">
      <EmptyState
        kind="first-run"
        title="No assessments yet"
        body={`Take a set of measurements and questions with ${first} in a session, and it is kept here.`}
        action={
          <Button variant="primary" onClick={onSchedule} disabled={disabled}>
            Schedule the first assessment
          </Button>
        }
      />
    </div>
  );
}
