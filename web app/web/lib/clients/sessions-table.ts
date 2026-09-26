import {
  formatMinute,
  formatMinuteRange,
  formatSpan,
  minuteOfDay,
  MONTHS_LONG,
  startOfDay,
} from '@/lib/today/time';
import { relativeDay } from '@/lib/sessions/group';
import { classifySession, type SessionFilter } from '@/components/clients/file/shared';

import type { ClientProgramWire, ClientSessionWire, ClientWorkoutWire } from './client-api';

/**
 * THE SESSIONS TABLE — which rows, in which section, and what each cell says.
 *
 * Asked for on 14 Sep 2026 beside the Calendar. Kept out of the component for
 * the reason `calendar.ts` is: the join between a booked session and the
 * workout logged against it, and the decision about which columns a section
 * earns, are product decisions with one right answer each. Here they can be
 * read without a browser and changed in one place.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 19 SEP 2026 · WHAT MEASURING THE LIVE PAGE SAID, AND WHAT CHANGED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Measured on `cli_008` at 1536x695 — 26 rows, five columns, 1,407px of table:
 *
 * | column    | width   | distinct values across 26 rows                      |
 * | --------- | ------- | --------------------------------------------------- |
 * | Date      | 190     | 26                                                  |
 * | Name      | 233     | **2** — `Full A`, `Full B`                          |
 * | Program   | **714** | **1** — `Fat Loss · 3 day full body`                |
 * | Status    | 120     | 4                                                   |
 * | Edited on | 150     | 22, and **15 a copy of the Date in the same row**   |
 *
 * So **947 of 1,407 pixels** went to the three columns carrying almost nothing,
 * and the widest of them held one string twenty-six times. This file's own
 * docstring deleted the `pack -1` column for exactly that — "a column whose
 * value is the same word two hundred times" — and then drew a column six times
 * wider doing the same thing.
 *
 * ── 1 · THE SESSION CELL IS TWO REGISTERS, NOT TWO TRACKS ────────────────
 *
 * A fact that is identical on every row is a fact about the TABLE. Where the
 * whole file sits on one plan — the ordinary case, and `cli_008`'s —
 * `onePlanFor` returns it, the section head says it once, and the rows are one
 * line shorter for it. Where a client has moved between plans it returns null
 * and the column earns a second line under the day label, which is
 * `c-workoutrow`'s answer to the same question and for its reason: a
 * day-label names a day of somebody's program and never says whose, so the two
 * belong in one cell rather than in two tracks. A row with neither is a dash.
 *
 * ── 2 · *EDITED ON* IS GONE, AND THE SESSION'S OWN FIGURES TOOK ITS PLACE ───
 *
 * When the server last wrote the row is provenance. It answered a question
 * nobody on this screen was asking, in a column adjacent to the one date that
 * matters, printing the same string as its neighbour on most rows. Meanwhile
 * *how long it ran* and *how much was in it* — the two facts a trainer is
 * actually asked about — were reachable only by changing a dropdown.
 *
 * ── 3 · THE FUTURE AND THE PAST ARE TWO SECTIONS, AND THE FILTER NO LONGER
 *        RESHAPES THE TABLE ─────────────────────────────────────────────────
 *
 * Eight of the twenty-six rows are bookings ahead, and they sorted first — so
 * the tab opened on **15 Oct 2026**, four weeks out, with the last session
 * actually trained below the fold and nothing but a row border marking where
 * the record stopped and the plan began.
 *
 * The old answer to *a booked session has no duration* was to change the column
 * set when the dropdown changed, which trades one problem for a table that
 * moves under the reader. The columns now follow the SECTION, which is a
 * property of the rows rather than of a control:
 *
 *   Upcoming   soonest first, because the next session is the most useful row
 *              on the page and it should be the first one. Date, the clock it
 *              is booked for, what it is, and how far off — every column a
 *              fact that exists before a session happens.
 *   History    newest first. Date, the clock it actually ran on, what it was,
 *              how long it took, how much was in it, and how it ended.
 *
 * Within a section the shape never changes, so picking a filter removes rows
 * and nothing else. `Status` is drawn in Upcoming only when the rows disagree
 * about it — under a section called *Upcoming*, on a list that is all bookings,
 * it is one word repeated eight times.
 *
 * ── 4 · A MONTH IS A HEADING, NOT A PREFIX ON TWENTY-SIX DATES ──────────────
 *
 * The history runs three months. Nothing said where one ended: the reader had
 * to notice `1 Sep` sitting above `27 Aug`. `c-dayrule` draws that boundary for
 * free and `Table`'s `GroupRow` carries it into a `<tbody>`; the month comes out
 * of the row, and what stays is the day and the weekday — which is how a
 * trainer says a slot ("Tuesdays and Thursdays at 10").
 *
 * ── A COMPLETED SESSION IS STILL TWO ROWS JOINED ────────────────────────────
 *
 * The diary row says what was MEANT to happen: a slot at 07:00 for an hour. The
 * workout logged against it says what did: started 07:04, ended 08:09, eleven
 * exercises. The history draws the second wherever it exists, because *1 h 5*
 * is the figure a trainer is asked about and *60 min* is the figure they typed
 * into a booking form weeks ago.
 *
 * Where no log exists — the client who trained but nobody wrote it down — the
 * planned figures stand in for the clock and the exercise count is a dash. A
 * zero there would say the trainer logged a session with nothing in it.
 */

/* ─────────────────────────────────────────────────────────── the filter ── */

/**
 * The options the filter row offers, and there are more of them than before.
 *
 * `cancelled` had no option of its own and appeared only under *All*, which
 * this file used to defend as "a state a trainer resolves from the row rather
 * than browses a page of". That was an argument about a `<select>`, where an
 * option costs a line of a menu nobody has opened. On a row of pills an option
 * costs its own width and pays for it with a COUNT, and *how many did they
 * cancel* is a question about a client, not about a row.
 *
 * `unmarked` is the sixth and it is conditional — see `visibleOptions`.
 */
export type SessionStatusFilter = 'all' | 'done' | 'booked' | 'missed' | 'cancelled' | 'unmarked';

export const STATUS_OPTIONS: { value: SessionStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'done', label: 'Completed' },
  { value: 'booked', label: 'Booked' },
  { value: 'missed', label: 'Missed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'unmarked', label: 'Unmarked' },
];

/** Which classification each filter keeps. */
const KEEPS: Record<Exclude<SessionStatusFilter, 'all'>, SessionFilter> = {
  done: 'done',
  booked: 'booked',
  missed: 'no_show',
  cancelled: 'cancelled',
  unmarked: 'not_marked',
};

/* ────────────────────────────────────────────────────────── the columns ── */

export type SessionColumn =
  | 'date'
  | 'clock'
  | 'time'
  | 'session'
  | 'duration'
  | 'exercises'
  | 'when'
  | 'status'
  | 'go';

export type SessionSection = 'upcoming' | 'history';

/**
 * The column set a section draws, in order.
 *
 * `go` is the trailing track. It holds a chevron, and it is there for two
 * reasons at once:
 *
 * 1 · Every row is a `role="link"` and nothing said so. A pointer cursor is not
 *     an affordance a reader can see before they move the mouse, and a keyboard
 *     user gets no hint at all.
 * 2 · A capped column model has to put its surplus somewhere, and a gap that
 *     opens in the MIDDLE of a row strands the eye — the defect `.wkrow` was
 *     rebuilt for on 18 Sep, where a name sat at x=128 and its time at x=1,100.
 *     A gap in FRONT of an edge control is the one gap nobody reads as a void,
 *     because an edge control is expected to sit at the edge. So every other
 *     track is capped at the widest ink it draws and this one takes the rest.
 *
 * ── AND THE NOTE IS NOT A COLUMN, WHICH TOOK A MEASUREMENT TO SETTLE ──────
 *
 * `workout.notes` is the sentence the trainer wrote at the end of a session —
 * *Shoulder felt fine throughout. Keep the load here next week.* — and the
 * client file drew it nowhere. It was given the surplus as a *Note* column,
 * which read well on the rows that had one.
 *
 * MEASURED on `cli_008`: **2 of 22**. A heading over 347px of nothing on twenty
 * rows is the same defect as the 714px Program column this pass removed, in a
 * better word — an empty track is not an improvement on a repetitive one. So
 * the note is the session cell's SECOND LINE, which costs 12px on the rows that
 * have one and nothing at all on the rows that do not: §11's 44px cell height
 * is a minimum by spec, not a ceiling (trap 7).
 *
 * It clips at the column rather than wrapping. What the line is for is telling
 * a trainer WHICH row to open, and the first forty characters do that; the
 * sentence itself is on the session.
 */
export function columnsFor(section: SessionSection, withStatus: boolean): SessionColumn[] {
  const base: SessionColumn[] =
    section === 'upcoming'
      ? ['date', 'time', 'session', 'when']
      : ['date', 'clock', 'session', 'duration', 'exercises'];
  return [
    ...base,
    ...(section === 'history' || withStatus ? (['status'] as SessionColumn[]) : []),
    'go',
  ];
}

/* ───────────────────────────────────────────────────────────── the rows ── */

export interface SessionTableRow {
  id: string;
  /** The instant it was scheduled for. What the table sorts on. */
  at: number;
  cls: SessionFilter;
  /** Ahead of today's midnight and not yet an outcome. Decides the section. */
  upcoming: boolean;
  /** `Tue`. The way a standing slot is spoken about. */
  weekday: string;
  /** `22 Sep 2026`. The year is drawn because a history crosses one. */
  date: string;
  /** `10:00 AM` — the slot it is booked for. Upcoming only; see `clock`. */
  time: string;
  /**
   * `7:04-8:09 AM`, on completed rows only.
   *
   * Null everywhere else, and null rather than the planned slot on purpose: a
   * booked session's time belongs in `time`, under a heading that says the
   * session has not happened. Printing a range against something that has not
   * happened reads as a record of it.
   */
  clock: string | null;
  /** `1 h 5` — the logged clock where there is one, the planned length where not. */
  duration: string | null;
  /** `Full A` — the day of the plan. The session cell's own line. */
  name: string | null;
  /** `Fat Loss · 3 day full body` — the plan. */
  program: string | null;
  exercises: number | null;
  /**
   * What somebody wrote about this session, log note first.
   *
   * The two are different authors at different moments — the log note is
   * written at the end of a session that happened, the session note is written
   * when a slot is booked or moved — and the log's wins wherever both exist,
   * because it is the later of the two and the one about what actually
   * occurred. A booked row can only ever have the second.
   *
   * It used to be `name`'s fallback (`dayLabel ?? notes`), which put *Gym floor
   * busy — used the studio.* in the column headed with the day of a program,
   * in the weight the plan's own day is set in.
   */
  note: string | null;
  /** `Tomorrow`, `In 3 days` — null past six days out, where it is a subtraction. */
  relative: string | null;
  /** Midnight on the first of its month. The history's grouping key. */
  month: number;
  /** `September 2026`. */
  monthLabel: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Every session on the file with its logged half joined on, newest first.
 *
 * The order is the HISTORY's order; `splitSessionRows` reverses the upcoming
 * half, which is the one place the two sections disagree and the reason it is a
 * decision taken there rather than here.
 */
export function buildSessionRows(
  sessions: ClientSessionWire[],
  workouts: ClientWorkoutWire[],
  programs: ClientProgramWire[],
  now: number,
): SessionTableRow[] {
  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const today = startOfDay(now);

  /* Keyed by the session, so the join is one pass rather than a scan per row.
     A session with two logs against it keeps the FIRST — the case is a double
     log nobody meant, and picking the earlier of them at least matches the
     clock the session started on. */
  const logOf = new Map<string, ClientWorkoutWire>();
  for (const w of workouts) {
    const key = w.scheduledSessionId;
    if (key && !logOf.has(key)) logOf.set(key, w);
  }

  return sessions
    .map((s): SessionTableRow => {
      const cls = classifySession(s, now);
      const log = logOf.get(s.id);
      const done = cls === 'done';
      /* Only a log that ENDED gives a clock. One still open is a session in
         progress, and `now - started` would be a stopwatch rather than a
         record. */
      const logged = log && log.endedAt !== null ? { from: log.createdAt, to: log.endedAt } : null;
      const planned = { from: s.scheduledAt, to: s.scheduledAt + (s.durationMinutes ?? 60) * 60_000 };
      const clock = logged ?? planned;
      const d = new Date(s.scheduledAt);

      return {
        id: s.id,
        at: s.scheduledAt,
        cls,
        /* TODAY IS UPCOMING, and it is a boundary worth stating. A session at
           six this evening is not history at nine this morning, and the row for
           it belongs where a trainer looks for what is still to come. It leaves
           the moment it is marked, because `cls` is what moves it — and a slot
           yesterday that nobody marked is `not_marked`, so it falls to the
           history where the verb it is owed can be seen against the record. */
        upcoming: startOfDay(s.scheduledAt) >= today && (cls === 'booked' || cls === 'cancelled'),
        weekday: WEEKDAYS[d.getDay()],
        date: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`,
        time: formatMinute(minuteOfDay(s.scheduledAt)),
        clock: done ? formatMinuteRange(minuteOfDay(clock.from), minuteOfDay(clock.to)) : null,
        duration: done
          ? formatSpan(Math.max(1, Math.round((clock.to - clock.from) / 60_000)))
          : null,
        name: s.dayLabel ?? null,
        program: (s.programId ? programName.get(s.programId) : null) ?? null,
        exercises: done ? (log?.exerciseCount ?? null) : null,
        note: log?.notes ?? s.notes ?? null,
        relative: relativeDay(startOfDay(s.scheduledAt), now),
        month: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
        monthLabel: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`,
      };
    })
    .sort((a, b) => b.at - a.at);
}

/* ──────────────────────────────────────────────────── slicing the rows ── */

/** The rows one filter keeps. */
export function filterSessionRows(
  rows: SessionTableRow[],
  filter: SessionStatusFilter,
): SessionTableRow[] {
  if (filter === 'all') return rows;
  return rows.filter((r) => r.cls === KEEPS[filter]);
}

/**
 * The two sections, each in its own order.
 *
 * Upcoming runs FORWARD. The old table ran everything backwards on the stated
 * grounds that a reader should not have to work out which end they are at when
 * the dropdown changes — which was right about a single list and is the wrong
 * conclusion here, because there are now two lists with a named boundary
 * between them. Under a heading that says *Upcoming*, the top row is the next
 * one; under a month, the top row is the latest. Neither is ambiguous, and the
 * alternative puts the single most useful row on the page — the next session —
 * at the bottom of its own section.
 */
export function splitSessionRows(rows: SessionTableRow[]): {
  upcoming: SessionTableRow[];
  history: SessionTableRow[];
} {
  return {
    upcoming: rows.filter((r) => r.upcoming).sort((a, b) => a.at - b.at),
    history: rows.filter((r) => !r.upcoming),
  };
}

export interface MonthGroup {
  at: number;
  label: string;
  rows: SessionTableRow[];
}

/**
 * Cut an already-sorted run at its month boundaries.
 *
 * Sorted is the caller's promise and is not re-established here, which is
 * `groupByDay`'s rule in `lib/sessions/group.ts` and the same reason: the two
 * sections come out of `splitSessionRows` in the order each is meant to be
 * read, and a sort in this function would silently undo one of them.
 */
export function groupByMonth(rows: SessionTableRow[]): MonthGroup[] {
  const out: MonthGroup[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.at === row.month) {
      last.rows.push(row);
      continue;
    }
    out.push({ at: row.month, label: row.monthLabel, rows: [row] });
  }
  return out;
}

/* ─────────────────────────────────────────────────────────── the counts ── */

/**
 * The one plan every session on this file was logged under, or null.
 *
 * MEASURED on `cli_008`: `Fat Loss · 3 day full body` on all twenty-six rows,
 * in a 714px column — 51% of the table restating one string twenty-six times.
 * A fact that is true of every row is a fact about the TABLE, so where there is
 * exactly one it is said once in the section's head and the rows are one line
 * shorter; where a client has moved between plans the column earns its second
 * line and this returns null.
 *
 * Read off the WHOLE file rather than the filtered view, so the heading does
 * not change when a pill is pressed.
 */
export interface MonthRecord {
  /** Every session the month holds, before any filter. */
  total: number;
  /** Done plus no-show — the sessions that SPENT something. */
  spent: number;
  /** Done. */
  kept: number;
}

/**
 * What each month's record actually was, keyed by the month's own midnight.
 *
 * Built from the UNFILTERED history and never from the rows on the screen,
 * which is the whole reason it is a separate pass. A band computing *kept of
 * spent* from what is drawn reads **0 of 2 kept** over August under the *Missed*
 * pill — true of the two rows below it and false about August, which kept four
 * of six. A heading over a filtered list is still a heading about the month.
 *
 * A CANCELLED SESSION IS IN NEITHER HALF, which is `adherenceOver`'s rule on
 * the Overview and the same one: kept and missed are the two outcomes that
 * spent a session, and a cancellation gave the slot back.
 */
export function monthRecords(rows: SessionTableRow[]): Map<number, MonthRecord> {
  const out = new Map<number, MonthRecord>();
  for (const r of rows) {
    const rec = out.get(r.month) ?? { total: 0, spent: 0, kept: 0 };
    rec.total += 1;
    if (r.cls === 'done' || r.cls === 'no_show') rec.spent += 1;
    if (r.cls === 'done') rec.kept += 1;
    out.set(r.month, rec);
  }
  return out;
}

export function onePlanFor(rows: SessionTableRow[]): string | null {
  const named = rows.map((r) => r.program).filter((p): p is string => Boolean(p));
  if (named.length !== rows.length || named.length === 0) return null;
  const first = named[0];
  return named.every((p) => p === first) ? first : null;
}

export interface SessionCounts {
  all: number;
  done: number;
  booked: number;
  missed: number;
  cancelled: number;
  unmarked: number;
}

export function countsOf(rows: SessionTableRow[]): SessionCounts {
  const n = (cls: SessionFilter) => rows.filter((r) => r.cls === cls).length;
  return {
    all: rows.length,
    done: n('done'),
    booked: n('booked'),
    missed: n('no_show'),
    cancelled: n('cancelled'),
    unmarked: n('not_marked'),
  };
}

const FILTER_COUNT: Record<Exclude<SessionStatusFilter, 'all'>, keyof SessionCounts> = {
  done: 'done',
  booked: 'booked',
  missed: 'missed',
  cancelled: 'cancelled',
  unmarked: 'unmarked',
};

export interface SessionFilterOption {
  value: SessionStatusFilter;
  label: string;
  count: number;
}

/**
 * Which pills the filter row draws.
 *
 * *All* is always there and always first. *Unmarked* appears only when there is
 * something unmarked, because it is the only option that names WORK rather than
 * an outcome — a pill permanently reading `0` on a well-kept file is a standing
 * reminder of nothing. Every other option keeps its place at zero: the set of
 * outcomes a session can have does not change with the data, and a filter row
 * whose options come and go is a row nobody can learn.
 */
export function visibleOptions(counts: SessionCounts): SessionFilterOption[] {
  return STATUS_OPTIONS.filter((o) => o.value !== 'unmarked' || counts.unmarked > 0).map((o) => ({
    value: o.value,
    label: o.label,
    count: o.value === 'all' ? counts.all : counts[FILTER_COUNT[o.value]],
  }));
}
