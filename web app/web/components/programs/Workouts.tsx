'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { SessionsData, SessionRow } from '@/lib/sessions/api';
import type { WorkoutTemplateWire } from '@/lib/workouts/api';
import { fetchWorkoutTemplate, removeWorkoutTemplates } from '@/lib/workouts/actions';
import { fromWire, type Draft } from '@/lib/workouts/draft';
import { durationLabel, estimateMinutes } from '@/lib/workouts/estimate';
import { markDone, markNoShow } from '@/lib/schedule/actions';
import { groupByDay } from '@/lib/sessions/group';
import {
  workoutsHref,
  workoutsTabs,
  WORKOUTS_PAGE_SIZE,
  type WorkoutsQuery,
  type WorkoutsView,
} from '@/lib/sessions/tabs';
import { clockParts, dateStamp, formatSpan } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { PageTabs } from '@/components/shell/PageTabs';
import { Glyph } from '@/components/shell/Icons';
import { PlusIcon, TrashIcon } from './Icons';
import { RowMenu, type RowMenuItem } from '@/web-components/ui/RowMenu';
import { useToast } from '@/lib/toast/store';
import { Button } from '@/web-components/ui/Button';
import { BulkBar } from '@/web-components/ui/BulkBar';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { DayRule } from '@/web-components/ui/DayRule';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Pager } from '@/web-components/ui/Pager';
import { SearchField } from '@/web-components/ui/SearchField';
import { WorkoutRow, WorkoutRowHead, type WorkoutStatus } from '@/web-components/ui/WorkoutRow';
import { TemplateRow, TemplateRowHead } from '@/web-components/ui/TemplateRow';
import { WorkoutBuilder } from './workout/WorkoutBuilder';

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 7.5V12l3.5 2" />
      <circle cx="12" cy="12" r="8.5" />
    </Glyph>
  );
}

/**
 * FOUR STATUSES NOW, AND THE FOURTH IS A CORRECTION.
 *
 * A row still `scheduled` whose slot is in the PAST is not booked — it is a
 * question nobody has answered. It was drawn as `Booked`, in the blue this
 * product reserves for a commitment still ahead, under a tab called *Missed*:
 * on the seeded book, five of that tab's twenty-seven rows said so.
 * `lib/sessions/api.ts` merges the two kinds into one bucket on the explicit
 * grounds that *"the status tag on the row is what tells them apart"* — this
 * is the function that makes that sentence true.
 */
function statusOf(row: SessionRow, now: number): WorkoutStatus {
  if (row.status === 'done' || row.status === 'completed') return 'done';
  if (row.status === 'no_show' || row.status === 'noshow') return 'missed';
  return row.scheduledAt < now ? 'unmarked' : 'scheduled';
}

/* ─────────────────────────────────────────────────────────── the table ── */

/**
 * THE THREE SESSION TABS, AS A PAGED AND DAY-RULED LIST.
 *
 * ── IT IS PAGED, AND IT WAS NOT ─────────────────────────────────────────────
 *
 * Every row of the bucket was rendered. On the seeded book that is **361 rows
 * in a 466px scroller — 16,981px of content, thirty-six screens** — closed by
 * a line reading *1 to 361 of 361*, which is a range statement with nothing
 * outside its range. `lib/sessions/tabs.ts` carries the argument for the page
 * size, and for why the page is in the address while the search is not.
 *
 * ── AND THE DAY IS A RULE, NOT A COLUMN ─────────────────────────────────────
 *
 * Those 361 rows sat across 52 days, so the 108px Date column printed
 * `Thu · 17 Sep` seven times, then `Wed · 16 Sep` eight, then `Mon · 14 Sep`
 * nine. The only information in a column of repeats is where the repeats
 * change, and that is a heading's job. `c-dayrule` draws it; `WorkoutRow` lost
 * the track and is seven columns.
 *
 * Grouping happens AFTER the slice — see `groupByDay`'s own note. A day
 * straddling a page boundary is ruled at the foot of one page and again at the
 * head of the next, which is exactly what it is.
 */
function WorkoutTable({
  rows,
  total,
  now,
  page,
  view,
  query,
  emptyText,
  filtered,
  onClearSearch,
  menuFor,
}: {
  /** The page. Already searched and sliced by the caller. */
  rows: SessionRow[];
  /** How many rows the tab holds after the search — the pager's denominator. */
  total: number;
  now: number;
  page: number;
  view: WorkoutsView;
  query: WorkoutsQuery;
  emptyText: string;
  /** Whether the search is narrowing — an empty list then means "no match". */
  filtered: boolean;
  onClearSearch: () => void;
  menuFor: (row: SessionRow) => RowMenuItem[];
}) {
  /* NO SELECTION HERE ANY MORE — `WorkoutRow`'s own header carries the whole
     argument. The short version: the tick boxes had no verb behind them on any
     of these three tabs, and the verb they implied is one a trainer must not
     have. A completed workout and a missed one are RECORDS of a day that has
     been; a booked one is a commitment somebody is expecting to be kept. The
     ways a session legitimately ends — marked done, marked a no-show, or
     cancelled from the schedule — are all one session at a time, all in front
     of the person and the time, and all with a pack balance behind them. */

  const groups = useMemo(() => groupByDay(rows, r => r.scheduledAt, now), [rows, now]);

  if (total === 0) {
    return (
      <div className="pgt__body">
        <EmptyState
          kind={filtered ? 'filtered' : 'first-run'}
          icon={<ClockIcon size={28} />}
          title={filtered ? 'No workouts match' : 'Nothing here yet'}
          body={filtered ? 'Try a shorter search, or a different tab.' : emptyText}
          action={filtered ? (
            <Button variant="secondary" onClick={onClearSearch}>Clear the search</Button>
          ) : undefined}
        />
      </div>
    );
  }

  /* PAST THE END — `?page=40` on a list three pages long, which is reachable by
     hand and reachable honestly: a link sent last month to page 9 of *Missed*
     is page 9 of nothing once those sessions are marked. `Pager` draws nothing
     at all when there is one page, so without this branch the trainer gets a
     blank pane and no control to leave it. `ExerciseLibrary` answers the same
     case the same way, and for the same reason it is not clamped silently in
     the guard: a URL that says page 40 and draws page 1 is a URL that lies. */
  if (rows.length === 0) {
    const pages = Math.ceil(total / WORKOUTS_PAGE_SIZE);
    return (
      <div className="pgt__body">
        <EmptyState
          kind="filtered"
          title="That page is past the end"
          body={`This list is ${pages} page${pages === 1 ? '' : 's'} long. The link you followed points past it.`}
          action={
            <Button variant="secondary" href={workoutsHref(view, { ...query, page: 0 })}>
              Back to the first page
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="pgt__body pgt__body--ruled">
        <WorkoutRowHead />
        <ul className="pgt__l" role="list">
          {groups.map(group => (
            /* THE RULE AND ITS ROWS ARE ONE ITEM WITH A NESTED LIST, not a rule
               loose among the rows. A flat `<ul>` with headings scattered
               through it is announced as a list of 29 things when there are 25
               sessions and four days; nested, it is *Thu · 17 Sep, list, 7
               items*, which is the structure the rules draw. */
            <li key={group.at} className="pgt__g">
              <DayRule
                day={group.label}
                relative={group.relative}
                count={group.rows.length}
                noun="workouts"
              />
              <ul className="pgt__l" role="list">
                {group.rows.map(row => {
                  const { time, meridiem } = clockParts(row.scheduledAt);
                  return (
                    <li key={row.id}>
                      <WorkoutRow
                        name={row.clientName}
                        clientId={row.clientId}
                        href={`/sessions/${row.id}`}
                        workout={row.dayLabel ?? row.programName}
                        program={row.dayLabel ? row.programName : null}
                        time={time}
                        meridiem={meridiem}
                        duration={formatSpan(row.minutes)}
                        mode={row.mode}
                        status={statusOf(row, now)}
                        menu={
                          <RowMenu
                            label={`${row.clientName}'s workout on ${group.label}`}
                            items={menuFor(row)}
                          />
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      {/* THE RANGE LINE IS THE PAGER'S NOW. It was a `.pgt__range` reading
          *1 to 361 of 361* under the last of 361 rows — the same sentence the
          pager's count line says, except that this one also moves you. Pinned
          to the foot of `.pgt` rather than scrolling with the rows: a control
          reached by scrolling past everything it exists to save you scrolling
          past is not a control. */}
      <Pager
        className="pgt__foot"
        page={page}
        size={WORKOUTS_PAGE_SIZE}
        total={total}
        href={p => workoutsHref(view, { ...query, page: p })}
        label="Workout list pages"
        noun="workouts"
      />
    </>
  );
}

/* ────────────────────────────────────────────────── the templates tab ── */

/**
 * THE WORKOUT-TEMPLATE SHELF — the fourth tab, which used to be an apology.
 *
 * It drew an empty state saying the model did not exist, and the header's
 * primary led here rather than to a builder "that would have nothing to save".
 * The model exists now (`/v1/workout-templates`), so both halves of that
 * sentence are gone: the primary opens the builder and this is the list it
 * saves onto.
 *
 * ── IT IS A TABLE, AND NOT A SHELF OF `ListRow`s ────────────────────────────
 *
 * It was the second: a name, with "~37 min · 5 movements · 16 sets · the heavy
 * press first" under it, on the argument that a blueprint is picked by NAME and
 * that the two facts deciding between two of them are a sentence rather than
 * four columns. What that left out is the STRIP ABOVE IT. This tab sits one
 * keystroke from *Completed*, *Scheduled* and *Missed*, which are `.wkrow`
 * tables with a sticky head — so switching tabs changed not just the rows but
 * what KIND of thing a list is.
 *
 * The two stamps settle it. *Created on* and *Updated on* are why the list is
 * scanned at all once there are thirty of them — *which of these have I touched
 * since the season changed* — and that is a question answered by running the eye
 * down one edge, which is exactly the test `Shelf.tsx` applies the other way.
 *
 * `TemplateRow` is the row; the selection lives here, as it does for
 * `WorkoutTable` above. THE RANGE LINE WENT THE SAME WAY as that table's: it
 * read *1 to 3 of 3* under three rows, which is three statements of the number
 * three. A shelf this short draws no pager either — `Pager` returns `null` at
 * one page, so the foot is simply not there until there is a second one.
 */
function TemplateShelf({
  rows,
  total,
  busyId,
  filtered,
  onOpen,
  onNew,
  onClearSearch,
}: {
  rows: WorkoutTemplateWire[];
  /** The shelf's size before the search, for the empty state's wording. */
  total: number;
  /** The row whose read is in flight. A click with no answer for a round trip
   *  is a click a trainer makes twice. */
  busyId: string | null;
  /** Whether the search is narrowing — an empty list then means "no match". */
  filtered: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onClearSearch: () => void;
}) {
  /* THIS TAB KEEPS ITS SELECTION AND THE OTHER THREE LOST THEIRS, and the
     difference is not that a template is less important — it is that a
     template is a BLUEPRINT NOBODY HAS DONE YET. Deleting one takes a plan off
     a shelf; deleting a session would take a fact out of a record. `WorkoutRow`
     carries that argument where the column used to be.

     Per LIST, and the caller keys this on the tab, so ticks cannot survive a
     switch onto a different set of rows. Derived against `rows` — which is the
     SEARCHED list — rather than read straight off the set, so a tick that the
     search box has hidden is in neither the count nor the delete; the ticks are
     remembered rather than cleared, so narrowing hides them and widening brings
     them back. `Shelf.tsx` argues both halves at length. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const router = useRouter();
  const { show } = useToast();

  const pickedRows = useMemo(
    () => rows.filter(r => selected.has(r.id)),
    [rows, selected],
  );
  const picked = pickedRows.length;

  function toggle(id: string, next: boolean) {
    setSelected(prev => {
      const out = new Set(prev);
      if (next) out.add(id); else out.delete(id);
      return out;
    });
  }

  /* All of what is on screen, and off again if it already is. Rows the search
     has hidden are left exactly as they were. */
  function toggleAll() {
    setSelected(prev => {
      const out = new Set(prev);
      const all = rows.every(r => out.has(r.id));
      for (const r of rows) {
        if (all) out.delete(r.id);
        else out.add(r.id);
      }
      return out;
    });
  }

  /**
   * THE BULK DELETE. `Shelf.tsx`'s twin, and the toast wording is the one thing
   * that differs: a program blueprint's confirm can promise that everybody
   * already training on a copy keeps theirs, and this one cannot make the
   * matching promise about a week the template was dropped into — the copy is
   * poured into a draft and saved, so it is already somebody else's rows. What
   * it CAN say is exactly that, which is the sentence the dialog carries.
   */
  function confirmDelete() {
    const ids = pickedRows.map(r => r.id);
    startDelete(async () => {
      const result = await removeWorkoutTemplates(ids);
      setConfirming(false);
      setSelected(new Set());

      if (!result.ok) {
        show({ tone: 'danger', title: <>Could not delete</>, body: result.message });
        return;
      }

      const { deleted, failed } = result.value;
      if (failed.length > 0) {
        show({
          tone: 'danger',
          title: <>{deleted} deleted, {failed.length} could not be</>,
          /* One sentence and not a list: eight refusals are eight copies of
             the same sentence. */
          body: failed[0].message,
        });
      } else {
        /* No Undo, so not a receipt — the wire has no inverse. */
        show({
          tone: 'ok',
          title: <>{deleted} workout template{deleted === 1 ? '' : 's'} deleted</>,
          body: <>Any week one was already dropped into keeps its copy.</>,
        });
      }
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="pgt">
        <div className="pgt__body">
          <EmptyState
            kind={filtered ? 'filtered' : 'first-run'}
            title={filtered ? 'No workout templates match' : 'No workout templates yet'}
            body={
              filtered
                ? `Nothing among the ${total} on this shelf answers that. Try a shorter search.`
                : 'A workout template is one session written once — the movements, the sets and the targets — ready to drop into anybody’s week. Program blueprints live under Programs; this shelf is for the single session.'
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={onClearSearch}>Clear the search</Button>
              ) : (
                <Button variant="primary" onClick={onNew}>
                  <PlusIcon />
                  New workout template
                </Button>
              )
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pgt">
      <div className="pgt__body">
        {/* THE BAR TAKES THE HEAD ROW'S PLACE, which is the only band on this
            tab it can take without moving anything: there is no toolbar here
            to replace — no sort chips, no goal filters — and `BulkBar`'s rule
            is *in place, so nothing on the screen moves when a checkbox is
            ticked*. Drawn ABOVE the head, the table under the pointer would
            drop by the bar's height on the first tick and the row a trainer
            meant to tick second would be a different row.

            Nothing is lost by standing the head down. The select-all it held
            is the bar's leading checkbox, in the same place on the same edge;
            the column names go, and every figure below already carries its own
            noun as text (`.wtrow__k`) precisely so that the head is
            expendable. `.wtrow__bulk` sits sticky in the head's own band and
            is sized to it. */}
        {picked > 0 ? (
          <BulkBar
            className="wtrow__bulk"
            count={picked}
            total={rows.length}
            noun="workout templates"
            one="workout template"
            onSelectAll={toggleAll}
            actions={
              <Button
                variant="danger"
                size="sm"
                icon={<TrashIcon size={13} />}
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            }
          />
        ) : (
          <TemplateRowHead
            allSelected={false}
            someSelected={false}
            onSelectAll={next => setSelected(next ? new Set(rows.map(r => r.id)) : new Set())}
          />
        )}
        <ul className="pgt__l" role="list">
          {rows.map(row => {
            const minutes = estimateMinutes(
              row.exercises.map(e => ({ sets: e.sets, groupId: e.groupId })),
            );
            return (
              <li key={row.id}>
                {/* THE NAME OPENS IT, and there is no second control on the
                    row: every verb a template has — rename, delete, save — is
                    in the builder the name opens, beside the Save each is the
                    opposite of. The duration is the SAME estimate the builder
                    prints; one module imported by both halves, which is the
                    whole reason `estimate.ts` refuses `server-only`. */}
                <TemplateRow
                  name={row.name}
                  notes={row.notes}
                  duration={durationLabel(minutes)}
                  movements={row.exerciseCount}
                  sets={row.setCount}
                  created={dateStamp(row.createdAt)}
                  updated={dateStamp(row.updatedAt)}
                  selected={selected.has(row.id)}
                  onSelect={next => toggle(row.id, next)}
                  onOpen={() => onOpen(row.id)}
                  busy={busyId === row.id}
                />
              </li>
            );
          })}
        </ul>
      </div>

      {/* THE CONFIRM. A delete with no inverse on the wire asks first — this
          product's standing rule for an irreversible write, and the dialog is
          the last place the count can be read back. */}
      {confirming && (
        <ModalHost onClose={() => (deleting ? undefined : setConfirming(false))}>
          <Modal
            title={
              picked === 1
                ? 'Delete this workout template?'
                : `Delete these ${picked} workout templates?`
            }
            width={460}
            cancel={{ label: 'Cancel', onClick: () => setConfirming(false) }}
            confirm={{
              label: deleting ? 'Deleting…' : 'Delete',
              danger: true,
              onClick: () => (deleting ? undefined : confirmDelete()),
            }}
          >
            {/* Named up to three, counted past it — a name each is a trainer
                checking they ticked the right row, eight names is a paragraph
                nobody reads and the list is still on the screen behind. */}
            <p className="small">
              {picked <= 3
                ? pickedRows.map(r => r.name).join(', ')
                : `${picked} workout templates`}{' '}
              will be removed from this shelf. This cannot be undone.
            </p>
            <p className="small mt3 ink3">
              Any week one was already dropped into keeps its copy — pouring a
              template into a program writes its own rows, and deleting the
              template never reaches them.
            </p>
          </Modal>
        </ModalHost>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── main component ── */

const EMPTY: Record<WorkoutsView, string> = {
  completed: 'No completed workouts yet. They appear here once a session is logged.',
  scheduled: 'Nothing booked. Add a session from the schedule.',
  /* Not "no missed workouts" — the bucket holds unmarked past slots too, and a
     trainer who reads an empty tab as "everybody turned up" when it really
     means "everything is marked" has been told the wrong thing. */
  missed: 'Nothing missed or unmarked. Every past session has been accounted for.',
  templates: '',
};

/**
 * WORKOUTS — the second page of **Fitness**, at `/programs/workouts`.
 *
 * ── IT IS `/sessions`, MOVED, AND THAT IS THE WHOLE POINT ────────────────────
 *
 * This screen existed and nothing in the chrome led to it. The five-destination
 * pass took *Sessions* off the rail on a correct argument — a session is a FLOW,
 * launched from Today or Schedule, not a place — and the LIST went with the row,
 * leaving a built screen reachable only from a breadcrumb on the console inside
 * it.
 *
 * The list is not a destination and it is not a flow either. It is a PAGE OF A
 * SECTION — *what my clients have actually done* sits beside *what I told them
 * to do*, which is what Fitness is. `/sessions` redirects here.
 *
 * ── IT IS DRAWN AS `/programs` IS DRAWN, DELIBERATELY ────────────────────────
 *
 * The header block, the `PageTabs` strip with the search ranged right on its
 * row, and the `.pgt` table below it are the shelf's, class for class. Two
 * pages of one section that answer the same shape of question — *which of
 * these* — drawn two ways is two screens a trainer has to learn.
 *
 * ── WHAT THE 18 SEP 2026 PASS CHANGED ───────────────────────────────────────
 *
 * Measured on the seeded book at 1536×695 before any of it: the Completed tab
 * put **361 rows into a 466px scroller — 16,981px of content, thirty-six
 * screens** — under a header whose count badge read **99+** and above a line
 * reading *1 to 361 of 361*. Five findings came out of that, each argued where
 * it landed rather than here:
 *
 * 1 · **The list is paged.** `lib/sessions/tabs.ts`, which also says why the
 *     page is in the address and the search is not.
 * 2 · **The day is a rule, not a column.** 52 days over 361 rows, so the Date
 *     column printed its value seven, eight and nine times running. `c-dayrule`
 *     draws the boundary; `WorkoutRow` lost the track.
 * 3 · **The workout cell is two lines and the second is the program.** It drew
 *     `dayLabel ?? programName`, which made `Upper A` the whole answer for 109
 *     of those rows and never said whose Upper A. The program was on the row
 *     and was being discarded.
 * 4 · **A past slot nobody has marked says `Unmarked`, not `Booked`.** Five of
 *     the twenty-seven rows on *Missed* wore a future-tense word in the calm
 *     blue kept for a commitment still ahead. `statusOf` above.
 * 5 · **That tab has verbs now** — `menuFor` below. It is the one tab on this
 *     screen that is a QUEUE rather than a record, and every item on its menu
 *     was a way to LEAVE it.
 *
 * ── AND THE TABS ARE LINKS ───────────────────────────────────────────────────
 *
 * `lib/sessions/tabs.ts` carries the argument. The short version: `?view=` was
 * a one-shot that named the tab to OPEN ON and was then stripped, so a reload
 * or a back press dropped a trainer back on *Completed*. It is the tab itself
 * now, and all four views still come out of the one `requireSessions()` the
 * page already made.
 */
export function Workouts({
  data,
  view,
  query,
  templates,
}: {
  data: SessionsData;
  /** Off the URL. The strip is links, so this is the tab and not a request. */
  view: WorkoutsView;
  /** The rest of the address — the page, and the filters that may join it. */
  query: WorkoutsQuery;
  /** The workout-template shelf, read beside the three session buckets. */
  templates: WorkoutTemplateWire[];
}) {
  const [search, setSearch] = useState('');
  const router = useRouter();
  const { show } = useToast();
  const [marking, setMarking] = useState<string | null>(null);
  const [, startMark] = useTransition();

  /* ── the builder ────────────────────────────────────────────────────────
     `null` is shut. `{}` is a new workout; `{id, draft}` is a saved one being
     edited. ONE piece of state and not three booleans, because the dialog is
     mounted by its presence — and a half-open state made of independent flags
     is how a dialog ends up drawn over nothing. */
  const [builder, setBuilder] = useState<
    { id?: string; draft?: Draft } | null
  >(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [, startOpen] = useTransition();

  /* A SAVED WORKOUT IS FETCHED BEFORE THE DIALOG OPENS, not inside it. The
     builder takes a draft and holds it — an editor that mounts empty and fills
     in a moment later is one where the first keystroke can be lost, and it
     would need a loading state for a request that takes one round trip. */
  function openSaved(id: string) {
    setOpenError(null);
    setOpening(id);
    startOpen(async () => {
      const result = await fetchWorkoutTemplate(id);
      setOpening(null);
      if (!result.ok) {
        setOpenError(result.message);
        return;
      }
      setBuilder({ id, draft: fromWire(result.template, result.names) });
    });
  }

  const counts = {
    completed: data.completed.length,
    scheduled: data.scheduled.length,
    missed: data.missed.length,
    templates: templates.length,
  };

  const bucket = useMemo(() => {
    /* Inside the memo, so the array identity is not a new dependency on every
       render — the three buckets are three filters over one fetch. */
    const rows =
      view === 'completed' ? data.completed
        : view === 'scheduled' ? data.scheduled
          : view === 'missed' ? data.missed
            : [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    /* THE PROGRAM IS SEARCHABLE NOW, BECAUSE IT IS DRAWN NOW. A trainer who can
       read *Hypertrophy Block 2* under a day label and cannot type it has been
       shown a fact the box pretends not to know. */
    return rows.filter(r =>
      r.clientName.toLowerCase().includes(q) ||
      (r.dayLabel ?? '').toLowerCase().includes(q) ||
      (r.programName ?? '').toLowerCase().includes(q));
  }, [data, view, search]);

  /* THE PAGE IS IN THE URL AND THE SEARCH IS NOT, so typing has to put the page
     back — otherwise a trainer on page 8 who types three letters is looking at
     page 8 of a four-page list, which is the "past the end" state arrived at by
     doing nothing wrong. `replace` and not `push`: eleven keystrokes must not be
     eleven back presses. `scroll:false` for the reason `Pager` passes it. */
  const page = query.page ?? 0;
  useEffect(() => {
    if (!search.trim() || !page) return;
    router.replace(workoutsHref(view, { ...query, page: 0 }), { scroll: false });
  }, [search, page, query, view, router]);

  const pageRows = useMemo(
    () => bucket.slice(page * WORKOUTS_PAGE_SIZE, (page + 1) * WORKOUTS_PAGE_SIZE),
    [bucket, page],
  );

  /* THE SEARCH NARROWS THE TEMPLATES TOO. It is the same box on the same row
     above the same table, and a field that filters three of four tabs and
     silently ignores the fourth is a field that looks broken on the one tab
     where the trainer has thirty rows to get through. Name and note, because
     those are the two strings a template has. */
  const shelf = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.notes ?? '').toLowerCase().includes(q));
  }, [templates, search]);

  const shown = view === 'templates' ? shelf.length : bucket.length;
  const searchTotal = counts[view];

  /**
   * THE ROW'S VERBS, AND WHY *MISSED* GETS TWO MORE.
   *
   * Every item was a destination: *Open the session*, *Log this workout*, *Open
   * the client file*. That is right for a RECORD — a logged session is a fact,
   * and what a trainer wants from a fact is to look at it — and it is wrong for
   * the one tab that is not one.
   *
   * An `unmarked` row is a past slot with a question still on it: *did they turn
   * up?* Nothing on this screen answered it, so answering it meant opening the
   * session or the diary, deciding there, and coming back — five times, on the
   * seeded book, for five rows sitting one under another.
   *
   * `markDone` and `markNoShow` already exist in `lib/schedule/actions.ts`, so
   * this adds no wire. The no-show is ONE PRESS AND IT TAKES A SESSION, which is
   * `SessionPanel`'s call on the diary, copied here deliberately: the server
   * settles the pack from what the session has already taken, so re-marking it
   * from the finish screen with the box clear puts the session back. A two-step
   * here would make the common case slower to serve the rare one — and this is
   * the faster of the two surfaces, because it is the one where five of them are
   * on the screen at once.
   *
   * They are SEPARATED from the three destinations and the no-show is `danger`,
   * so the item that moves money is not adjacent to the item that opens a page.
   */
  function menuFor(row: SessionRow): RowMenuItem[] {
    const status = statusOf(row, data.now);
    const items: RowMenuItem[] = [];

    if (status === 'unmarked') {
      const busy = marking === row.id;
      items.push(
        {
          key: 'done',
          label: busy ? 'Marking…' : 'Mark it done',
          disabled: busy,
          onSelect: () => mark(row, 'done'),
        },
        {
          key: 'noshow',
          label: 'No-show · −1 session',
          danger: true,
          disabled: busy,
          onSelect: () => mark(row, 'noshow'),
        },
        { separator: true, key: 'sep' },
      );
    }

    items.push({ key: 'open', label: 'Open the session', href: `/sessions/${row.id}` });
    /* No *see what they lifted* beside it — that is the session, which the first
       item and the name cell both already open. */
    if (status !== 'done') {
      items.push({ key: 'log', label: 'Log this workout', href: `/sessions/${row.id}/log` });
    }
    items.push({ key: 'client', label: 'Open the client file', href: `/clients/${row.clientId}` });
    return items;
  }

  function mark(row: SessionRow, kind: 'done' | 'noshow') {
    setMarking(row.id);
    startMark(async () => {
      const result = kind === 'done'
        ? await markDone(row.id)
        : await markNoShow({ id: row.id, costsASession: true });
      setMarking(null);

      if (!result.ok) {
        show({ tone: 'danger', title: <>Could not mark it</>, body: result.message });
        return;
      }
      /* THE PACK IS NAMED IN THE BODY BECAUSE THE PRESS MOVED IT. A toast that
         says only "done" after a write that changed a balance is a receipt with
         the figure left off — and the no-show's says where to change its mind,
         because one press is only safe if the way back is written down. */
      show({
        tone: 'ok',
        title: kind === 'done' ? <>Marked done</> : <>No-show recorded</>,
        body: kind === 'done'
          ? <>{row.clientName}&rsquo;s session is logged, and one is off their pack.</>
          : <>{row.clientName} &mdash; one session off their pack. Change it on the session&rsquo;s finish screen.</>,
      });
      router.refresh();
    });
  }

  return (
    <>
      <TopBar crumb="Fitness · Workouts" title="Workouts" />

      <main className="main body--flush pg" id="main-content">
        <PageHeader
          className="ph--pglist ph--pgshelf"
          /* THE COUNT BADGE IS GONE. `CountBadge` caps at ninety-nine, so a page
             holding 569 sessions wore the word **99+** beside its title — a
             figure true of every number over ninety-nine, and therefore about
             none of them — directly above a line that states all three counts
             exactly. One of the two had to go, and it was not the exact one. */
          title="Workouts"
          sub={<>
            {counts.completed} completed · {counts.scheduled} booked
            {counts.missed > 0 && ` · ${counts.missed} missed`}
          </>}
          actions={<>
            {/* IT OPENS THE BUILDER NOW. It used to lead to the Templates
                tab, because there was no workout-template model and a builder
                would have had nothing to save. There is one, so the primary is
                the verb again rather than a link to the screen that explained
                its own absence. */}
            <Button variant="primary" onClick={() => setBuilder({})}>
              <PlusIcon />
              New workout template
            </Button>
          </>}
        >
          {/* `.pgtabs` — tabs left, search right, `/programs`' own row. In
              `children` and not `tabs`, because `PageTabs` brings its own
              `.ph__tabs` and that slot would nest one inside another. */}
          <div className="pgtabs">
            <PageTabs
              label="Workouts view"
              current={view}
              tabs={workoutsTabs(view, counts)}
            />
            {/* `SearchField`, where this was a hand-written `<label class=
                "search">` with its own icon and its own `aria-label` — a design
                system component re-drawn at the call-site, three lines short of
                the original. What the component brings that the copy did not is
                the polite live region: the trainer who cannot see the table
                shrink is told *6 of 361 workouts* once the typing stops. */}
            <SearchField
              className="pgtabs__q"
              label={view === 'templates' ? 'Search workout templates' : 'Search your workouts'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              count={search.trim()
                ? { shown, total: searchTotal, noun: view === 'templates' ? 'templates' : 'workouts' }
                : undefined}
            />
          </div>
        </PageHeader>

        {view === 'templates' ? (
          <>
            {openError && (
              <p className="wkb__err" role="alert">
                {openError}
              </p>
            )}
            <TemplateShelf
              /* Keyed on the tab for `WorkoutTable`'s reason — ticks that
                 outlive the list they were made on name rows nobody sees. */
              key={view}
              rows={shelf}
              total={counts.templates}
              busyId={opening}
              filtered={search.trim().length > 0}
              onOpen={openSaved}
              onNew={() => setBuilder({})}
              onClearSearch={() => setSearch('')}
            />
          </>
        ) : (
          <div className="pgt">
            <WorkoutTable
              /* Keyed on the tab AND the page: every key in the list changes at
                 once on a page turn, and a stale day rule is the first thing the
                 eye would land on while React reconciled the difference. */
              key={`${view}:${page}`}
              rows={pageRows}
              total={bucket.length}
              now={data.now}
              page={page}
              view={view}
              query={query}
              emptyText={EMPTY[view]}
              filtered={search.trim().length > 0}
              onClearSearch={() => setSearch('')}
              menuFor={menuFor}
            />
          </div>
        )}
      </main>

      {builder && (
        <WorkoutBuilder
          key={builder.id ?? 'new'}
          templateId={builder.id}
          initial={builder.draft}
          onClose={() => setBuilder(null)}
          /* The shelf is the server's, so a save revalidates the route rather
             than pushing the new row into local state — two copies of one
             list is how a shelf and a table start disagreeing. */
          onSaved={() => setBuilder(null)}
        />
      )}
    </>
  );
}
