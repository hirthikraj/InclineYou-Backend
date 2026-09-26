'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { AssessmentsData } from '@/lib/assessments/api';
import { setRead } from '@/lib/assessments/actions';
import {
  PAGE_SIZE,
  assessmentsHref,
  assessmentsTabs,
  refine,
  type Query,
} from '@/lib/assessments/address';
import {
  STATUS_FILTERS,
  STATUS_LABEL,
  STATUS_TONE,
  blockCount,
  type AssessmentStatus,
  type StatusFilter,
} from '@/lib/assessments/vocab';
import { TopBar } from '@/components/shell/TopBar';
import { PageTabs } from '@/components/shell/PageTabs';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { CheckboxCell } from '@/web-components/ui/Checkbox';
import { BulkBar } from '@/web-components/ui/BulkBar';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Facet } from '@/web-components/ui/Facet';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Pager } from '@/web-components/ui/Pager';
import { RowMenu } from '@/web-components/ui/RowMenu';
import { SearchField } from '@/web-components/ui/SearchField';
import { Table, Row, type Column } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';
import { Checklist, Envelope, Plus } from './Icons';
import { ScheduleSheet } from './ScheduleSheet';

/**
 * `/clients/assessments` — WHO OWES ME TWENTY MINUTES AND A TAPE.
 *
 * The second page of the Clients section. `nav.tsx` carries why it is a page of
 * that section rather than a rail row or a tab of the roster; the short version
 * is that it is a second list of the same people asked a different question.
 *
 * ── THE FILTERS ARE IN THE URL AND THE LIST IS FETCHED WITH THEM ────────────
 *
 * Every control on the bar changes which rows come back, so every one of them
 * is a search parameter and a server round trip — trap 25's own test. The
 * editor being open, which block inside it is folded and which measurement
 * group is expanded are all state, and none of them is in the address.
 *
 * That is also why the counts on the facets come from `grandTotal` rather than
 * from the rows on screen: a chip that says *Missed 2* and then selects three
 * rows is worse than a chip that says nothing, and the rows on screen are one
 * page of a filtered list.
 *
 * ── AND THE SELECTION IS NOT ────────────────────────────────────────────────
 *
 * Ticks live here and are cleared on every page turn and every filter, keyed
 * off the address — `WorkoutTable`'s rule: a tick that outlives the list it was
 * made on names a row nobody can see.
 */
export function Assessments({ data, query }: { data: AssessmentsData; query: Query }) {
  const router = useRouter();
  const [search, setSearch] = useState(query.q);
  const [picked, setPicked] = useState<string[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const [busy, startWrite] = useTransition();

  const names = useMemo(
    () => new Map(data.clients.map((c) => [c.id, c.name])),
    [data.clients],
  );

  /** Every write to the address goes through here. `refine` puts you on page one. */
  const go = (patch: Partial<Query>) => {
    setPicked([]);
    router.push(assessmentsHref(refine(query, patch)));
  };

  /* The search is a round trip, so it commits on Enter and on blur rather than
     on every keystroke — a live search here would be one request per letter
     against a route that also recounts the whole book. The field still narrows
     nothing until it is committed, and that is the honest reading of a URL that
     carries `?q=`. */
  const commitSearch = () => {
    if (search.trim() === query.q.trim()) return;
    go({ q: search });
  };

  const unread = data.rows.filter((r) => r.unread);

  const rows = data.rows;
  const anyPicked = picked.length > 0;

  function markRead(ids: string[], read: boolean) {
    startWrite(async () => {
      for (const id of ids) await setRead(id, read);
      setPicked([]);
      router.refresh();
    });
  }

  return (
    <>
      <TopBar crumb="Clients · Assessments" title="Assessments" />

      <main className="main body--flush asm" id="main-content">
        <PageHeader
          className="ph--pglist"
          title="Assessments"
          sub={
            <>
              {data.grandTotal} in the book
              {unread.length > 0 && ` · ${unread.length} unread on this page`}
            </>
          }
          actions={
            <>
              {/* ONE PRIMARY, AND IT IS THE ONE THAT PRODUCES A ROW.
                  The reference this was drawn from puts three verbs up here —
                  an assistant, *Complete assessment* and *Schedule an
                  assessment*. The assistant is not a thing this product has.
                  *Complete* is the trainer filling one in with the client in
                  front of them, which is a SESSION-side act: it belongs on the
                  client's own file beside the tape, where `?measure=1` already
                  opens a sheet, not on the list of everything outstanding. So
                  the header carries the verb this screen owns. */}
              <Button variant="primary" onClick={() => setScheduling(true)}>
                <Plus size={15} />
                Schedule an assessment
              </Button>
            </>
          }
        >
          <div className="asm__tabs">
            <PageTabs
              label="Assessments view"
              current="list"
              tabs={assessmentsTabs('list', { templates: data.templates.length })}
            />
            <SearchField
              className="asm__q"
              label="Search assessments"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={commitSearch}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSearch(); }}
              count={
                query.q.trim()
                  ? { shown: rows.length, total: data.grandTotal, noun: 'assessments' }
                  : undefined
              }
            />
          </div>
        </PageHeader>

        <div className="asm__body">
          <div className="asm__facets">
            <div className="facets">
              <Facet
                label="Client"
                single
                /* THE ONE AXIS WHOSE VALUES ARE PEOPLE. The other two are four
                   words and two words; this one is the whole roster, and a
                   trainer opening it is looking for a name they already know.
                   So it is the only facet with a find field, and the only one
                   wide enough to hold one. `find` carries the phone, because
                   the number on a message is often all they have. */
                width={288}
                search={{
                  placeholder: 'Search by name or phone',
                  empty: 'No client matches your search',
                  noun: 'clients',
                }}
                selected={query.clientId ? [query.clientId] : []}
                onChange={(next) => go({ clientId: next[0] ?? null })}
                options={data.clients
                  .filter((c) => c.status !== 'archived')
                  .map((c) => ({ value: c.id, label: c.name, find: c.phone ?? undefined }))}
              />
              <Facet
                label="Status"
                /* SINGLE, with *All* in the list — `StatusFilter` carries both
                   halves of why. The pill stays OFF on *All*: `Facet` draws
                   `facet--on` from a non-empty selection, and a filter that
                   lights up to say it is not filtering is a filter a trainer
                   learns to ignore. That is also what makes the toggle read
                   right — picking the value already set clears to *All*, which
                   is the same answer as picking *All*. */
                single
                selected={query.status === 'all' ? [] : [query.status]}
                onChange={(next) => go({ status: (next[0] as StatusFilter) ?? 'all' })}
                options={STATUS_FILTERS}
              />
              <Facet
                label="Read status"
                single
                selected={query.read === 'all' ? [] : [query.read]}
                onChange={(next) => go({ read: (next[0] as Query['read']) ?? 'all' })}
                options={[
                  { value: 'unread', label: 'Unread' },
                  { value: 'read', label: 'Read' },
                ]}
              />
            </div>
          </div>

          {anyPicked && (
            <BulkBar
              inline
              count={picked.length}
              total={rows.length}
              noun="assessments"
              one="assessment"
              onSelectAll={() => setPicked(rows.map((r) => r.id))}
              actions={
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => markRead(picked, true)}
                  >
                    <Envelope size={14} />
                    Mark read
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPicked([])}>
                    Clear
                  </Button>
                </>
              }
            />
          )}

          {rows.length === 0 ? (
            <Empty query={query} onClear={() => { setSearch(''); router.push('/clients/assessments'); }} />
          ) : (
            <div className="asm__t">
              <Table
                caption={`${rows.length} of ${data.total} assessments, newest first`}
                columns={COLUMNS}
                sort={{ key: 'date', direction: 'descending' }}
              >
                {rows.map((r) => {
                  const client = names.get(r.clientId) ?? 'A client';
                  const when = new Date(r.dueAt);
                  return (
                    <Row
                      key={r.id}
                      selected={picked.includes(r.id)}
                      select={
                        <CheckboxCell
                          label={`Select ${client}'s ${r.name}`}
                          checked={picked.includes(r.id)}
                          onChange={() =>
                            setPicked((v) =>
                              v.includes(r.id) ? v.filter((x) => x !== r.id) : [...v, r.id],
                            )
                          }
                        />
                      }
                      cells={[
                        {
                          key: 'date',
                          className: 'asm-c-date',
                          label: 'Date',
                          content: (
                            <span className="asm__d">
                              <b>
                                {/* THE UNREAD MARK, on the date's own line — a
                                    dot in the cell's gutter rather than a bold
                                    row, since weight on the whole row would
                                    make *I have not opened it* the loudest
                                    thing in a table a trainer scans for *who
                                    has not answered*. */}
                                <span
                                  className={r.unread ? 'asm__dot' : 'asm__dot asm__dot--off'}
                                  aria-hidden="true"
                                />
                                {/* THE WORD, CLIPPED RATHER THAN DROPPED —
                                    trap 5, and it is what let the status cell
                                    stop saying it. *Done · unread* measured
                                    122px into a 104px cell and `.tag` is
                                    `nowrap`; the dot is the sighted mark and
                                    this is the same fact for a reader, said
                                    once, on the row it belongs to. */}
                                {r.unread && <span className="vh">Unread. </span>}
                                {DATE.format(when)}
                              </b>
                              <em>{TIME.format(when)}</em>
                            </span>
                          ),
                        },
                        {
                          key: 'client',
                          className: 'asm-c-who',
                          label: 'Client',
                          content: (
                            <span className="asm__who">
                              <Avatar name={client} id={r.clientId} size="sm" />
                              <b>{client}</b>
                            </span>
                          ),
                        },
                        {
                          key: 'name',
                          className: 'asm-c-name',
                          label: 'Assessment',
                          /* THE ROW'S DOOR, and it is the NAME rather than the
                             whole row: a `<tr>` cannot be an anchor, and this
                             row already holds a checkbox and a menu — wrapping
                             every cell in one would put two targets inside a
                             third.

                             `.asm-open` is the family the Templates tab already
                             uses for exactly this — *a line of text that is also
                             the control that opens it* — in its navigating form.
                             It is also the `auto` track, so it is the one that
                             ellipsises, and `title` finishes a name the column
                             could not. */
                          content: (
                            <Link
                              className="asm-open asm-open--name"
                              href={`/clients/assessments/${r.id}`}
                              title={r.name}
                            >
                              {r.name}
                            </Link>
                          ),
                        },
                        {
                          key: 'measurements',
                          className: 'asm-c-n',
                          numeric: true,
                          label: 'Measurements',
                          content: <Count block={r.measurements} status={r.status} />,
                        },
                        {
                          key: 'questions',
                          className: 'asm-c-n',
                          numeric: true,
                          label: 'Questions',
                          content: <Count block={r.questions} status={r.status} />,
                        },
                        {
                          key: 'status',
                          className: 'asm-c-status',
                          label: 'Status',
                          content: (
                            <Tag tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Tag>
                          ),
                        },
                        {
                          key: 'act',
                          className: 'asm-c-act',
                          label: '',
                          content: (
                            <RowMenu
                              label={`${client}'s ${r.name}`}
                              items={[
                                {
                                  key: 'read-it',
                                  label: 'Open the check-in',
                                  href: `/clients/assessments/${r.id}`,
                                },
                                {
                                  key: 'open',
                                  label: 'Open the client file',
                                  href: `/clients/${r.clientId}`,
                                },
                                {
                                  key: 'read',
                                  label: r.readAt ? 'Mark unread' : 'Mark read',
                                  disabled: r.status !== 'done',
                                  onSelect: () => markRead([r.id], !r.readAt),
                                },
                              ]}
                            />
                          ),
                        },
                      ]}
                    />
                  );
                })}
              </Table>
            </div>
          )}
        </div>

        {/* PINNED TO THE FOOT, not scrolling with the rows — `Pager`'s own rule
            on `/programs/workouts`: a control reached by scrolling past
            everything it exists to save you scrolling past is not a control. */}
        <Pager
          className="asm__foot"
          page={query.page}
          size={PAGE_SIZE}
          total={data.total}
          href={(p) => assessmentsHref({ ...query, page: p })}
          label="Assessment list pages"
          noun="assessments"
        />
      </main>

      {scheduling && (
        <ScheduleSheet
          clients={data.clients}
          templates={data.templates}
          onClose={(booked) => {
            setScheduling(false);
            if (booked) router.refresh();
          }}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── the cells ── */

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

/**
 * `12 / 15`, `3`, or nothing at all.
 *
 * The three states are `blockCount`'s and the argument is there: a block that
 * was never asked for answers `null` rather than a zero, because *0 / 11* is a
 * client who answered nothing and a template with its questions off is not a
 * client who did anything.
 */
function Count({
  block,
  status,
}: {
  block: { got: number; asked: number };
  status: AssessmentStatus;
}) {
  const count = blockCount(block, status);
  if (!count) return <span className="asm__n asm__n--none">—</span>;
  return (
    <span className={count.short ? 'asm__n asm__n--short' : 'asm__n'}>{count.text}</span>
  );
}

const COLUMNS: Column[] = [
  { key: 'sel', bare: true, className: 'sel asm-c-sel', label: '' },
  { key: 'date', label: 'Date', className: 'asm-c-date' },
  { key: 'client', label: 'Client', className: 'asm-c-who' },
  { key: 'name', label: 'Assessment', className: 'asm-c-name' },
  { key: 'measurements', label: 'Measurements', numeric: true, className: 'asm-c-n' },
  { key: 'questions', label: 'Questions', numeric: true, className: 'asm-c-n' },
  { key: 'status', label: 'Status', className: 'asm-c-status' },
  { key: 'act', bare: true, label: '', className: 'asm-c-act' },
];

/**
 * THREE EMPTY STATES, AND ONLY ONE OF THEM IS *nothing here yet*.
 *
 * A filtered list with nothing in it is a filter to loosen; a page past the end
 * is a link to leave; an empty book is a first run. `/programs/workouts` draws
 * the same three and the middle one is the one screens forget — `?page=40` on a
 * two-page list is reachable by hand and reachable honestly, from a link sent
 * last month, and `Pager` draws nothing at all when there is one page, so
 * without it the trainer gets a blank pane and no control to leave it.
 */
function Empty({ query, onClear }: { query: Query; onClear: () => void }) {
  const filtered =
    query.status !== 'all' || query.read !== 'all' || query.clientId !== null || query.q.trim() !== '';

  if (query.page > 0) {
    return (
      <EmptyState
        kind="filtered"
        title="That page is past the end"
        body="The link you followed points past the last page of this list."
        action={
          <Button variant="secondary" href={assessmentsHref({ ...query, page: 0 })}>
            Back to the first page
          </Button>
        }
      />
    );
  }

  if (filtered) {
    return (
      <EmptyState
        kind="filtered"
        icon={<Checklist size={28} />}
        title="No check-ins match"
        body="Try a wider status, or clear the search."
        action={<Button variant="secondary" onClick={onClear}>Clear the filters</Button>}
      />
    );
  }

  return (
    <EmptyState
      kind="first-run"
      icon={<Checklist size={28} />}
      title="No check-ins yet"
      body="An assessment is a set of measurements and questions you send a client on a date. Write one on the Templates tab, then schedule it against somebody."
      action={<Button variant="secondary" href="/clients/assessments/templates">Write an assessment</Button>}
    />
  );
}
