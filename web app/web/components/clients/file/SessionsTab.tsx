'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Chevron } from '@/components/shell/Icons';
import { markDone, markNoShow, reopenSession } from '@/lib/schedule/actions';
import { useToast } from '@/lib/toast/store';
import type { ClientSessionWire } from '@/lib/clients/client-api';
import {
  buildSessionRows,
  columnsFor,
  countsOf,
  filterSessionRows,
  groupByMonth,
  monthRecords,
  onePlanFor,
  splitSessionRows,
  visibleOptions,
  type MonthGroup,
  type MonthRecord,
  type SessionColumn,
  type SessionStatusFilter,
  type SessionTableRow,
} from '@/lib/clients/sessions-table';

import { type SessionFilter } from './shared';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { DayRule } from '@/web-components/ui/DayRule';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Segment, SegmentButton } from '@/web-components/ui/Segment';
import { Tag } from '@/web-components/ui/Tag';
import { Table, Row, GroupRow, type Cell, type Column } from '@/web-components/ui/Table';

/**
 * SESSIONS — THE FILE'S HISTORY, AND ITS DIARY, AS TWO TABLES.
 *
 * `lib/clients/sessions-table.ts` holds the row join, the split, the month
 * grouping and the counts, and carries the argument for all four — including
 * the measurements that produced this pass. This file is the chrome around
 * them, and it is responsible for exactly three things the module is not: the
 * cells, the filter row, and the empty state.
 *
 * ── WHAT WENT, AND WHAT CAME BACK ───────────────────────────────────────────
 *
 * Six filter chips became a `<select>` on 14 Sep because four options that
 * behave as a radio group are a radio group drawn wrong. The pills are back on
 * 19 Sep, and the objection is answered rather than ignored: `Segment` has a
 * `single` mode now — `role="radiogroup"`, `aria-checked`, one tab stop, arrow
 * keys — so this is a radio group drawn as a radio group.
 *
 * What brought them back is the COUNTS. *Has this client been missing sessions*
 * is the question the tab is opened with, and the answer is a number per
 * outcome. A `<select>` can show one option at a time and only once you open
 * it; five pills say `13 · 8 · 3 · 2` without being touched. The old chips had
 * no counts on them, which is why they were only ever a radio group drawn
 * wrong and never also an answer.
 *
 * ── EVERY ROW OPENS ITS SESSION, AND NOW IT LOOKS LIKE IT DOES ──────────────
 *
 * `role="link"` on the `<tr>` with Enter and Space, the same pattern the
 * roster's rows use in `Clients.tsx` — a `<tr>` cannot contain an `<a>` that
 * covers it, and a link per cell would be five tab stops a row. What was
 * missing was any sign of it: the only affordance was a pointer cursor, which
 * a keyboard user never sees and a reader only finds by accident. The trailing
 * chevron column is that sign, and it earns its place twice over — see
 * `columnsFor` for what it does to the row's surplus width.
 */

/* ────────────────────────────────────────────────────────── the columns ── */

const HEAD: Record<SessionColumn, Column> = {
  date: { key: 'date', label: 'Date', className: 'cfses__c-date' },
  clock: { key: 'clock', label: 'Clock', className: 'cfses__c-clock' },
  time: { key: 'time', label: 'Time', className: 'cfses__c-clock' },
  session: { key: 'session', label: 'Session', className: 'cfses__c-ses' },
  duration: { key: 'duration', label: 'Duration', className: 'cfses__c-dur' },
  exercises: { key: 'exercises', label: 'Exercises', numeric: true, className: 'cfses__c-ex' },
  when: { key: 'when', label: 'When', className: 'cfses__c-when' },
  status: { key: 'status', label: 'Status', className: 'cfses__c-st' },
  /* The name is clipped rather than absent — `.vh`, not an empty string. A
     column with no header is announced as nothing at all, and a reader moving
     across the row reaches a cell that belongs to no column; drawn, the word
     would be a caption over a glyph repeated on every row. The roster spells
     its selection column the same way. */
  go: { key: 'go', label: <span className="vh">Open</span>, bare: true, className: 'cfses__c-go' },
};

function statusTag(cls: SessionFilter) {
  if (cls === 'done') return <Tag tone="ok">Done</Tag>;
  if (cls === 'no_show') return <Tag tone="danger">No-show</Tag>;
  if (cls === 'cancelled') return <Tag>Cancelled</Tag>;
  if (cls === 'booked') return <Tag tone="info">Booked</Tag>;
  /* `warn` AND NOT `info`, which is `c-workoutrow`'s correction and the same
     one: an unmarked past slot used to wear *Booked* — a future-tense word, in
     the blue reserved for a commitment still ahead, on the one row that has
     already happened. It is not an outcome the trainer recorded; it is a
     question they have not answered. */
  return <Tag tone="warn">Unmarked</Tag>;
}

/**
 * The dash a cell draws when there is no figure, never a zero or a blank.
 *
 * It carries a class because the reflowed row treats it differently: a column
 * head over a dash is a table saying *this row has no clock*, which is worth a
 * track on a desk and is noise on a phone, where the same absence arrives as
 * the words `CLOCK —` on a line of its own. Below 1080 those cells are dropped
 * and the Status tag beside them carries the reason.
 */
const NONE = <span className="ink3 cfses__none">—</span>;

/**
 * One cell.
 *
 * `showPlan` is false wherever the whole file is on one plan and the section
 * head has already said so — see `onePlanFor`. It is a parameter rather than
 * something read off the row because the answer is a property of the TABLE,
 * and a row deciding it for itself would draw the plan on the one session that
 * happens to have been logged under a different one.
 */
function cellFor(column: SessionColumn, r: SessionTableRow, showPlan: boolean): Cell {
  const href = `/sessions/${r.id}`;
  switch (column) {
    case 'date':
      /* THE WEEKDAY LEADS, and it is new. A standing arrangement is spoken in
         weekdays — the Overview prints "Tuesdays and Thursdays at 10:00 AM" —
         and a bare `22 Sep 2026` could not be checked against it. The month and
         year stay on the row rather than moving wholly into the rule: a row
         read on its own, or announced by itself, still has to say which day it
         is. */
      return {
        key: 'date',
        label: 'Date',
        /* THE DOOR: a real anchor, stretched over the `<tr>` by `.cfses__lk::after`. The row was
           `role="link"` with an `aria-label`, which replaced its row role (a screen reader heard the date
           and the name and never the outcome), was not an anchor (no new tab, no copy-link) and answered
           Space. Now the cells keep their own names, in order, and the link does what a link does. */
        content: (
          <Link className="cfses__lk" href={href}>
            <span className="cfses__wd">{r.weekday}</span>
            {r.date}
          </Link>
        ),
      };
    case 'clock':
      return { key: 'clock', label: 'Clock', className: 'cfses__dim', content: r.clock ?? NONE };
    case 'time':
      return { key: 'time', label: 'Time', className: 'cfses__dim', content: r.time };
    case 'session':
      /* Two registers, one cell — see the module docstring. Where there is no
         day label the program becomes the line, because a row whose only
         identity is set in 11.5px grey is a row that reads as empty. */
      if (!r.name && !r.program) return { key: 'session', label: 'Session', content: NONE };
      /* Line two is the plan, the trainer's note, or both — and it is drawn
         only where there is something to put on it, so a row without a note is
         still §11's 44px. `·` between them is the separator this product uses
         wherever two facts share a line. */
      const sub = [showPlan && r.name ? r.program : null, r.note].filter(Boolean).join(' · ');
      return {
        key: 'session',
        label: 'Session',
        content: (
          <>
            <span className="cfses__nm" title={r.name ?? r.program ?? undefined}>
              {r.name ?? r.program}
            </span>
            {sub ? (
              <span className="cfses__sub" title={r.note ?? undefined}>
                {sub}
              </span>
            ) : null}
          </>
        ),
      };
    case 'duration':
      return { key: 'duration', label: 'Duration', className: 'cfses__dim', content: r.duration ?? NONE };
    case 'exercises':
      return { key: 'exercises', label: 'Exercises', numeric: true, content: r.exercises ?? NONE };
    case 'when':
      /* `relativeDay` goes null past six days out, on the grounds that "In 63
         days" is a subtraction printed down a page and the date beside it
         already said it better. So most of this column is empty most of the
         time, and that is the column working: what it marks is the near end of
         the list, which is the part that is about to matter. */
      return {
        key: 'when',
        label: 'When',
        content: r.relative ? <span className="cfses__rel">{r.relative}</span> : <span />,
      };
    case 'status':
      return { key: 'status', label: 'Status', content: statusTag(r.cls) };
    case 'go':
      return {
        key: 'go',
        /* `data-l=""` is how the phone rung marks the cell that takes no label.
           This one takes none because it is not a fact; it is the affordance. */
        label: '',
        className: 'cfses__go',
        /* An UNMARKED row is the only one on this tab that is silently making the pack wrong, so its
           edge is the two answers rather than a chevron — the same two the diary gives, and both undoable. */
        content: r.cls === 'not_marked' ? <MarkButtons row={r} /> : <Chevron size={15} />,
      };
  }
}

/* ────────────────────────────────────────────────────────── the sections ── */

/**
 * *Done* and *No-show* on an unmarked row. `POST /v1/sessions/{id}/done` charges the pack under a row
 * lock; `no-show` charges too (the diary's own button sends `true`, and the session screen is where a
 * trainer says otherwise). Neither is a one-way door: the receipt carries *Undo*, which is
 * `reopenSession` — the charge is reversed, never deleted.
 */
function MarkButtons({ row }: { row: SessionTableRow }) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, start] = useTransition();

  const run = (kind: 'done' | 'no-show') =>
    start(async () => {
      const res = kind === 'done' ? await markDone(row.id) : await markNoShow({ id: row.id, costsASession: true });
      if (!res.ok) {
        show({ tone: 'danger', title: <>Could not mark it</>, body: res.message });
        return;
      }
      router.refresh();
      show({
        tone: 'ok',
        variant: 'receipt',
        title: <>{kind === 'done' ? 'Marked done' : 'No-show recorded'}</>,
        body: <>{row.weekday} {row.date}.{res.message ? <> {res.message}</> : null}</>,
        action: {
          label: 'Undo',
          onClick: () =>
            void reopenSession(row.id).then((back) => {
              if (back.ok) router.refresh();
              else show({ tone: 'danger', title: <>Could not undo</>, body: back.message });
            }),
        },
      });
    });

  return (
    <span className="cfses__mark">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => run('done')}>
        Done
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run('no-show')}>
        No-show
      </Button>
    </span>
  );
}

function Rows({
  rows,
  columns,
  showPlan,
}: {
  rows: SessionTableRow[];
  columns: SessionColumn[];
  showPlan: boolean;
}) {
  return (
    <>
      {rows.map((r) => (
        <Row
          key={r.id}
          className={
            r.cls === 'no_show' ? 'crit' : r.cls === 'not_marked' ? 'alert' : undefined
          }
          cells={columns.map((c) => cellFor(c, r, showPlan))}
        />
      ))}
    </>
  );
}

function Section({
  title,
  caption,
  plan,
  aside,
  note,
  columns,
  variant,
  foot,
  children,
}: {
  title: string;
  /** A line over the table that is about the table's rows as a set. */
  note?: React.ReactNode;
  caption: string;
  /**
   * The one plan every row is on, said once in the head instead of 26 times
   * down a 714px column. Null where the file has moved between plans, in which
   * case `twoLine` is true and the rows carry it.
   */
  plan?: string | null;
  aside?: React.ReactNode;
  columns: SessionColumn[];
  /**
   * Which column model the stylesheet should size this table by.
   *
   * It is a class and not a width, because the trailing chevron track is
   * stated as `calc(100% - <sum of every other track>)` and the sum differs by
   * section — leaving that column `auto` to take the remainder was measured
   * correct at 1536 and 1920 and wrong at 1152, 1280 and 1440.
   */
  variant: 'up' | 'up-st' | 'hist';
  /** A disclosure under the table — the diary's *show the rest of them*. */
  foot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="cfses">
      <Card.Head title={title} level={3}>
        {plan ? <span className="cfses__plan">{plan}</span> : null}
        {aside}
      </Card.Head>
      <Card.Body flush>
        {note ? <p className="cfses__warn">{note}</p> : null}
        <Table
          caption={caption}
          /* NOT `.cftbl`, and that is trap 13 read properly. That rule turns
             each `<tr>` into a wrapping flex row below 620px, which drops the
             table role — affordable on the four tables it was written for
             because, as its own comment says, "none of these tables has a
             `<thead>`, so there are no column names to lose". This one has a
             `<thead>`, and MEASURED at 390 before this pass the header alone
             held the old table open at **478px inside a 363px card** — 128px of
             it, Status and Edited on, clipped away by `.main`'s
             `overflow:hidden` with every document-level overflow probe reading
             zero. `.cftx` already answers this exact case one table along:
             clip the head, carry the column names into the cells as `data-l`.
             Hence `Cell.label` on every cell above. */
          className={
            variant === 'hist' ? 'cfses__t' : `cfses__t cfses__t--${variant}`
          }
          columns={columns.map((c) => HEAD[c])}
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          {children}
        </Table>
      </Card.Body>
      {/* A `Card.Band` and not a `<tfoot>`: §11 gives `tfoot td` a
          `--tx-surface-2` fill, a strong top rule and weight 700, which is the
          treatment of a TOTAL. A disclosure is not a total. */}
      {foot ? <Card.Band>{foot}</Card.Band> : null}
    </Card>
  );
}

/**
 * How many bookings the diary shows before it asks.
 *
 * MEASURED: the content window on this screen is `div.body`, which at
 * 1536x695 is **470px** — the shell's chrome plus the file's header take the
 * other 225. Eight booked rows plus a head and a column row is 512px, so the
 * whole first screen was the FUTURE and the record this tab is named for began
 * below the fold. Four is a fortnight of a twice-a-week client, which is the
 * horizon a trainer actually checks, and the head states the real count either
 * way so the disclosure is never how you find out there are more.
 */
const DIARY_PREVIEW = 4;

/* ───────────────────────────────────────────────────────────── the tab ── */

/**
 * The window is a place (R76): `?range=30d|90d|all` picks it, `all` being the
 * newest 400 days (L4's cap), and *Load older* is `?older=n` — n whole windows
 * back, one range scan each. The outcome pills filter inside the window.
 */
const WINDOWS: { value: '30d' | '90d' | 'all'; label: string }[] = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

/** *the last 30 days*, or the window before it — said so, rather than *no sessions on this file*. */
function windowPhrase(range: '30d' | '90d' | 'all', older: number): string {
  if (older > 0) return `the ${older === 1 ? 'window' : `${older} windows`} before the latest`;
  return range === '30d' ? 'the last 30 days' : range === '90d' ? 'the last 90 days' : 'the last 400 days';
}

export function SessionsTab({
  clientId,
  sessions,
  range,
  older,
  now,
}: {
  clientId: string;
  sessions: ClientSessionWire[];
  range: '30d' | '90d' | 'all';
  older: number;
  now: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<SessionStatusFilter>('all');
  const [wholeDiary, setWholeDiary] = useState(false);

  const place = (r: string, n: number) =>
    router.push(`/clients/${clientId}/sessions?range=${r}${n > 0 ? `&older=${n}` : ''}`);
  const rows = useMemo(() => buildSessionRows(sessions, now), [sessions, now]);
  /* The counts are taken from the WHOLE file and never from the filtered view.
     A pill whose number changes when you press its neighbour is a pill that
     cannot be read before you press it, which is the only thing these are for. */
  const counts = useMemo(() => countsOf(rows), [rows]);
  const options = useMemo(() => visibleOptions(counts), [counts]);

  const visible = useMemo(() => filterSessionRows(rows, filter), [rows, filter]);
  const { upcoming, history } = useMemo(() => splitSessionRows(visible), [visible]);
  const months: MonthGroup[] = useMemo(() => groupByMonth(history), [history]);

  /* Drawn only when the upcoming rows disagree about it — see `columnsFor`. */
  const upcomingStatus = upcoming.some((r) => r.cls !== 'booked');
  const upcomingCols = columnsFor('upcoming', upcomingStatus);
  const historyCols = columnsFor('history', true);
  const label = options.find((o) => o.value === filter)?.label ?? 'All';
  const phrase = windowPhrase(range, older);
  const unmarkedCount = counts.unmarked;

  /* Off the WHOLE file, not the filtered view: a heading that appeared and
     disappeared as pills were pressed would be a heading nobody trusts. */
  const records = useMemo(() => monthRecords(rows.filter((r) => !r.upcoming)), [rows]);
  const onePlan = useMemo(() => onePlanFor(rows), [rows]);
  const showPlan = onePlan === null;

  /* Under the *Booked* pill the diary IS the page, so it is never clipped. */
  const diaryAll = wholeDiary || filter === 'booked';
  const diary = diaryAll ? upcoming : upcoming.slice(0, DIARY_PREVIEW);

  return (
    <div className="cfses__wrap">
      <div className="cfses__tools">
        <Segment label="Sessions window" mode="single">
          {WINDOWS.map((w) => (
            <SegmentButton
              key={w.value}
              mode="single"
              pressed={range === w.value}
              onClick={() => place(w.value, 0)}
            >
              {w.label}
            </SegmentButton>
          ))}
        </Segment>
        {/* No outcome pills over a window with nothing in it: four zeros are a control with nothing to filter. */}
        {counts.all > 0 && (
        <Segment label="Filter sessions by outcome" mode="single">
          {options.map((o) => (
            <SegmentButton
              key={o.value}
              mode="single"
              pressed={filter === o.value}
              onClick={() => setFilter(o.value)}
              count={o.count}
            >
              {o.label}
            </SegmentButton>
          ))}
        </Segment>
        )}
      </div>

      {/* TWO EMPTY STATES, BECAUSE THEY ARE TWO DIFFERENT FACTS. A filter that
          matched nothing is a control to undo; a file with no sessions on it is
          a client nobody has booked, and offering *Show all 0* is the screen
          answering a question about the person with a question about itself.
          `kind` carries the difference to a reader too: only `filtered` is a
          live region, because only it appears in response to a press. */}
      {counts.all === 0 ? (
        <Card bare>
          {/* WHAT IS EMPTY IS THE WINDOW, not the client: Rohan's file says 10 sessions logged, and
              *Load older* used to land on "No sessions on this file yet". Each answer names its window and
              offers the next step — back to the latest, all time, or the first booking. */}
          {older > 0 ? (
            <EmptyState
              inCard
              title={`Nothing in ${phrase}`}
              body="Their earlier sessions are not in this window."
              action={
                <Button variant="secondary" size="sm" onClick={() => place(range, 0)}>
                  Back to the latest
                </Button>
              }
            />
          ) : range !== 'all' ? (
            <EmptyState
              inCard
              title={`No sessions in ${phrase}`}
              body="Look further back, or book the next one."
              action={
                <Button variant="secondary" size="sm" onClick={() => place('all', 0)}>
                  Show all time
                </Button>
              }
            />
          ) : (
            <EmptyState
              inCard
              title="No sessions on this file yet"
              body="Book the first one and it is kept here."
              action={
                <Button variant="primary" size="sm" href={`/schedule?new=1&client=${clientId}`}>
                  Book the first session
                </Button>
              }
            />
          )}
        </Card>
      ) : visible.length === 0 ? (
        <Card bare>
          <EmptyState
            kind="filtered"
            inCard
            title={`Nothing ${label.toLowerCase()} in ${phrase}`}
            body="Every other outcome is still on the record."
            action={
              <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                Show all {counts.all}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* NOTHING BOOKED IS SAID, not shown by a card that is simply not there. For a client who has
              drifted it is the most useful fact on the tab. */}
          {upcoming.length === 0 && filter === 'all' && older === 0 && history.length > 0 && (
            <Card className="cfses">
              <Card.Head title="Upcoming" level={3}>
                <span className="cfses__n">nothing booked ahead</span>
              </Card.Head>
              <Card.Body>
                <div className="cfses__none-up">
                  <span className="small ink3">No session is booked after today.</span>
                  <Button variant="secondary" size="sm" href={`/schedule?new=1&client=${clientId}`}>
                    Book a session
                  </Button>
                </div>
              </Card.Body>
            </Card>
          )}

          {upcoming.length > 0 && (
            <Section
              title="Upcoming"
              caption={`${upcoming.length} sessions booked ahead on this client's file`}
              aside={
                <span className="cfses__n">
                  {upcoming.length} booked
                  {upcoming[0].relative
                    ? ` · next ${upcoming[0].relative.toLowerCase()}`
                    : ` · through ${upcoming[upcoming.length - 1].date}`}
                </span>
              }
              plan={onePlan}
              columns={upcomingCols}
              variant={upcomingStatus ? 'up-st' : 'up'}
              foot={
                upcoming.length > diary.length || wholeDiary ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWholeDiary((v) => !v)}
                    aria-expanded={diaryAll}
                  >
                    {diaryAll
                      ? `Show the next ${DIARY_PREVIEW}`
                      : `Show all ${upcoming.length} booked`}
                  </Button>
                ) : null
              }
            >
              <Rows rows={diary} columns={upcomingCols} showPlan={showPlan} />
            </Section>
          )}

          {history.length > 0 && (
            <Section
              title="History"
              caption={`${history.length} sessions on this client's record — ${label}`}
              aside={<span className="cfses__n">{history.length} on the record</span>}
              note={
                unmarkedCount > 0 ? (
                  <>
                    {unmarkedCount} unmarked. A pack moves on <b>Done</b> or <b>No-show</b>, so{' '}
                    {unmarkedCount === 1 ? 'this one has' : 'these have'} not counted yet.
                  </>
                ) : undefined
              }
              plan={onePlan}
              columns={historyCols}
              variant="hist"
            >
              {months.map((m) => (
                <MonthRows
                  key={m.at}
                  month={m}
                  record={records.get(m.at)}
                  filtered={filter !== 'all'}
                  columns={historyCols}
                  showPlan={showPlan}
                  filterLabel={label}
                />
              ))}
            </Section>
          )}
        </>
      )}

      <p className="cfses__note">
        {older > 0 ? `${older} window${older === 1 ? '' : 's'} back. ` : ''}
        {counts.all > 0 || older > 0 ? 'Older sessions are on the record. ' : ''}
        <Button variant="ghost" size="sm" onClick={() => place(range, older + 1)}>
          Load older
        </Button>
        {older > 0 && counts.all > 0 && (
          <Button variant="ghost" size="sm" onClick={() => place(range, 0)}>
            Back to the latest
          </Button>
        )}
      </p>
    </div>
  );
}

/**
 * One month of the history: the rule, then its rows.
 *
 * The trailing figure on the band is *how many were kept*, not how many there
 * were — the count of rows is what the eye gets for free by looking at the
 * group, and `5 of 6 kept` is the one thing about a month that has to be
 * counted. Cancelled sessions are in neither half, which is the rule
 * `adherenceOver` states on the Overview: a cancellation gave the slot back, so
 * it is not a miss and it did not spend anything.
 */
function MonthRows({
  month,
  record,
  filtered,
  columns,
  showPlan,
  filterLabel,
}: {
  month: MonthGroup;
  /** The month's own record, before the filter. See `monthRecords`. */
  record: MonthRecord | undefined;
  /** Whether the list under this band is a subset of the month. */
  filtered: boolean;
  columns: SessionColumn[];
  showPlan: boolean;
  /** The outcome the pill says, so a filtered band keeps its noun. */
  filterLabel: string;
}) {
  /* Unfiltered, the band answers the question a month raises — how much of it
     was kept. Filtered, that figure describes rows that are not on the screen,
     so the band says how much of the month IS on the screen instead. Both
     denominators are the month's own. */
  const trailing = filtered
    ? `${month.rows.length} ${filterLabel.toLowerCase()} of ${record?.total ?? month.rows.length}`
    : record && record.spent > 0
      ? `${record.kept} of ${record.spent} kept`
      : `${month.rows.length} sessions`;
  return (
    <>
      <GroupRow span={columns.length}>
        <DayRule className="dayr--sec" day={month.label} trailing={<span className="dayr__n">{trailing}</span>} />
      </GroupRow>
      <Rows rows={month.rows} columns={columns} showPlan={showPlan} />
    </>
  );
}
