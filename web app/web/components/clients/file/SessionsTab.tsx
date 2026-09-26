'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Chevron } from '@/components/shell/Icons';
import type { ClientProgramWire, ClientSessionWire, ClientWorkoutWire } from '@/lib/clients/client-api';
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
        content: (
          <>
            <span className="cfses__wd">{r.weekday}</span>
            {r.date}
          </>
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
            <span className="cfses__nm">{r.name ?? r.program}</span>
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
        content: <Chevron size={15} />,
      };
  }
}

/* ────────────────────────────────────────────────────────── the sections ── */

function Rows({
  rows,
  columns,
  showPlan,
  open,
}: {
  rows: SessionTableRow[];
  columns: SessionColumn[];
  showPlan: boolean;
  open: (id: string) => void;
}) {
  return (
    <>
      {rows.map((r) => (
        <Row
          key={r.id}
          className={
            r.cls === 'no_show' ? 'crit' : r.cls === 'not_marked' ? 'alert' : undefined
          }
          role="link"
          tabIndex={0}
          aria-label={`Open the session on ${r.weekday} ${r.date}${r.name ? `, ${r.name}` : ''}`}
          onClick={() => open(r.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open(r.id);
            }
          }}
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
  columns,
  variant,
  foot,
  children,
}: {
  title: string;
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

export function SessionsTab({
  sessions,
  workouts,
  programs,
  now,
}: {
  sessions: ClientSessionWire[];
  workouts: ClientWorkoutWire[];
  programs: ClientProgramWire[];
  now: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<SessionStatusFilter>('all');
  const [wholeDiary, setWholeDiary] = useState(false);
  const open = (id: string) => router.push(`/sessions/${id}`);

  const rows = useMemo(
    () => buildSessionRows(sessions, workouts, programs, now),
    [sessions, workouts, programs, now],
  );
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
      </div>

      {/* TWO EMPTY STATES, BECAUSE THEY ARE TWO DIFFERENT FACTS. A filter that
          matched nothing is a control to undo; a file with no sessions on it is
          a client nobody has booked, and offering *Show all 0* is the screen
          answering a question about the person with a question about itself.
          `kind` carries the difference to a reader too: only `filtered` is a
          live region, because only it appears in response to a press. */}
      {counts.all === 0 ? (
        <Card bare>
          <EmptyState
            inCard
            title="No sessions on this file yet"
            body="Anything booked ahead and everything trained in the last three months will be listed here."
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card bare>
          <EmptyState
            kind="filtered"
            inCard
            title={`Nothing ${label.toLowerCase()} on this file`}
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
              <Rows rows={diary} columns={upcomingCols} showPlan={showPlan} open={open} />
            </Section>
          )}

          {history.length > 0 && (
            <Section
              title="History"
              caption={`${history.length} sessions on this client's record — ${label}`}
              aside={<span className="cfses__n">{history.length} on the record</span>}
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
                  open={open}
                />
              ))}
            </Section>
          )}
        </>
      )}

      <p className="cfses__note">
        The last three months and everything booked ahead. Older sessions are on
        the record and are not drawn here.
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
  open,
}: {
  month: MonthGroup;
  /** The month's own record, before the filter. See `monthRecords`. */
  record: MonthRecord | undefined;
  /** Whether the list under this band is a subset of the month. */
  filtered: boolean;
  columns: SessionColumn[];
  showPlan: boolean;
  open: (id: string) => void;
}) {
  /* Unfiltered, the band answers the question a month raises — how much of it
     was kept. Filtered, that figure describes rows that are not on the screen,
     so the band says how much of the month IS on the screen instead. Both
     denominators are the month's own. */
  const trailing = filtered
    ? `${month.rows.length} of ${record?.total ?? month.rows.length}`
    : record && record.spent > 0
      ? `${record.kept} of ${record.spent} kept`
      : `${month.rows.length} sessions`;
  return (
    <>
      <GroupRow span={columns.length}>
        <DayRule className="dayr--sec" day={month.label} trailing={<span className="dayr__n">{trailing}</span>} />
      </GroupRow>
      <Rows rows={month.rows} columns={columns} showPlan={showPlan} open={open} />
    </>
  );
}
