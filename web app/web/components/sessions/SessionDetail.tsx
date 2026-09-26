'use client';

import { Fragment } from 'react';
import Link from 'next/link';

import type {
  SessionDetailData,
  ExerciseGroup,
  LastTime,
  LoggedSet,
  PlannedRow,
  PlanView,
} from '@/lib/sessions/api';
import type { ClientNoteWire } from '@/lib/clients/client-api';
import { clockParts, dayStamp, dayLong, formatSpan, avatarToken, initials } from '@/lib/today/time';
import { stampAnchor } from '@/lib/schedule/view';
import { TopBar } from '@/components/shell/TopBar';
import { Calendar as CalendarIcon, Glyph } from '@/components/shell/Icons';
import { NudgeButton } from '@/components/nudge/NudgeButton';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { Why } from '@/web-components/ui/Why';

/**
 * ONE SESSION, READ RATHER THAN WRITTEN.
 *
 * `/sessions/:id/log` is where a session is *entered* — a grid, a keyboard model
 * and four verdicts. This is where one is *read*, and the two are different
 * screens because the questions are different. The console asks "what is the
 * next number"; this page asks "what happened here", weeks later, with the
 * client's file open in the next tab.
 *
 * ── THE SAME PAGE ON BOTH SIDES OF NOW ──────────────────────────────────────
 *
 * A session before it happens and a session after it happens are the same
 * object, so they are the same route and the same layout — the prescription, the
 * client, the notes. What changes is which half carries the weight:
 *
 *   · **Upcoming** — the plan IS the screen. Every exercise the program asks
 *     for, with its sets, reps, rest and target load, so a trainer walking in
 *     knows the session before they open the console.
 *   · **Past** — the log is the screen, and the plan sits beside it saying what
 *     was asked for. That is what turns "four exercises" into "four of the five
 *     planned, and the fifth was skipped".
 *
 * ── WHAT THE PLAN IS NOT ────────────────────────────────────────────────────
 *
 * It is not an authority over what happened. A trainer who swapped a movement on
 * the floor did the right thing, and a log that reads *unplanned* against it is
 * describing the swap, not complaining about it.
 */

const DONE = new Set(['done', 'completed']);
const NO_SHOW = new Set(['no_show', 'noshow']);

/* ─────────────────────────────────────────────────────── the status ── */

/**
 * THE STATE, AS A CHIP, BECAUSE IT WAS PROSE.
 *
 * `Upcoming` · `Done` · `No-show` · `Not marked` used to be the tail of the
 * subtitle — 13px of `--tx-ink-3` appended to a date, at the same weight as the
 * date. So the single most important fact on the page was drawn as its least
 * important one, which is Nielsen #1 read backwards.
 *
 * `/clients` already puts state in a chip (*At risk*, *Expiring*) and
 * `/clients/:id` already puts one beside the name (*Active*, *Floor*). This
 * screen was the outlier, and it is the outlier that most needed it: **Not
 * marked** is the one state on this page that costs money — a session that has
 * passed, that nobody closed, and that has therefore not come off anybody's
 * pack — and it was the quietest thing on the screen.
 *
 * The tone tokens are the set's own and carry the meaning rather than
 * decorating it: accent for a thing that is going to happen, `ok` for one that
 * did, `danger` for one that did not, `warn` for one nobody has answered for.
 */
type SessionState = 'upcoming' | 'done' | 'no_show' | 'unmarked';

const STATE_CHIP: Record<SessionState, { label: string; cls: string }> = {
  upcoming: { label: 'Upcoming', cls: 'tag--acc' },
  done: { label: 'Done', cls: 'tag--ok' },
  no_show: { label: 'No-show', cls: 'tag--danger' },
  unmarked: { label: 'Not marked', cls: 'tag--warn' },
};

/**
 * `upcoming` is about the CLOCK, not the status: a `scheduled` booking whose
 * time has passed is a session that happened and was never closed, and calling
 * that upcoming would show the plan screen over the top of a log.
 */
function stateOf(data: SessionDetailData): SessionState {
  const { session } = data;
  if (DONE.has(session.status)) return 'done';
  if (NO_SHOW.has(session.status)) return 'no_show';
  if (!session.hasLog && session.scheduledAt >= data.now) return 'upcoming';
  return 'unmarked';
}

/* ──────────────────────────────────────────────────── the clock, said ── */

/**
 * "in 3 days", "in 2 h", "3 weeks ago".
 *
 * A date alone does not answer the question a trainer asks of an upcoming
 * session, which is *how soon*; and on the `Last time` column below, the
 * distance IS the finding — the same 105 kg is a starting point one week later
 * and a question mark after two months.
 *
 * Rounded down and coarse on purpose. This is a sentence read at a glance, not
 * a countdown, and "in 3 days" that is really 3 days and 20 hours is the right
 * answer to the question actually being asked.
 */
function relativeDays(from: number, to: number): string {
  const ms = to - from;
  const ahead = ms >= 0;
  const abs = Math.abs(ms);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  let unit: string;
  if (hours < 1) unit = 'under an hour';
  else if (hours < 24) unit = `${hours} h`;
  else if (days < 14) unit = `${days} day${days === 1 ? '' : 's'}`;
  else if (days < 60) unit = `${Math.round(days / 7)} weeks`;
  else unit = `${Math.round(days / 30)} months`;

  if (unit === 'under an hour') return ahead ? 'in under an hour' : 'just now';
  return ahead ? `in ${unit}` : `${unit} ago`;
}

/* ─────────────────────────────────────────────────── inline icons ── */

function FloorIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
    </Glyph>
  );
}

function RemoteIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Glyph>
  );
}

function NoteIcon({ size = 13 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M5 4h11l3 3v13H5V4Z" />
      <path d="M8 10h8M8 14h5" />
    </Glyph>
  );
}

function PinIcon({ size = 12 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
      <path d="M12 14v7" />
    </Glyph>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M4.5 12.5l5 5 10-11" />;
}

/* `.sesh__go` and not an inline `marginLeft:'auto'`. AGENTS.md records inline
   layout as the cause of five separate bugs in this codebase, and a previous
   pass deleted two redundant `marginLeft:'auto'` for exactly this reason — an
   inline declaration outranks every selector, media queries included, so the
   phone cannot move it. */
function ChevronIcon({ size = 14 }: { size?: number }) {
  return (
    <span className="ink3 sesh__go">
      <Glyph size={size} d="M9 6l6 6-6 6" />
    </span>
  );
}

function NoShowIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M5.07 18.93A9 9 0 1 1 18.93 5.07M2 2l20 20" />
    </Glyph>
  );
}

function PlanIcon({ size = 15 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </Glyph>
  );
}

/* ────────────────────────────────────────────────────────── the words ── */

/** "3 × 10", "3 sets", "10 reps", or null when the program named neither. */
function prescription(sets: number | null, reps: number | null): string | null {
  if (sets != null && reps != null) return `${sets} × ${reps}`;
  if (sets != null) return `${sets} set${sets === 1 ? '' : 's'}`;
  if (reps != null) return `${reps} rep${reps === 1 ? '' : 's'}`;
  return null;
}

/**
 * "90s", "2 min", "2 min 30s". Rest is read at a glance or not at all.
 *
 * PROSE, and it stays prose HERE: this one is read inside a sentence — *Planned
 * 4 × 5 at 100 kg · 3 min rest* — where "180" would be a worse word than "3
 * min". The COLUMN version is `restClock` below, and the two differ for the
 * reason the two contexts differ.
 */
function restLabel(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 120) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${min} min ${rest}s` : `${min} min`;
}

/**
 * THE SAME NUMBER, IN ONE UNIT, BECAUSE A COLUMN IS COMPARED AND A SENTENCE IS
 * NOT.
 *
 * `restLabel` down a table column produced `3 min` · `2 min` · `90s` · `60s` ·
 * `45s` — five rows in two units, right-ranged in a tabular-numeric face. The
 * face lines the digits up and the unit then makes the alignment a lie: `90s`
 * sits under `2 min` and reads as the larger of the two. Every affordance the
 * column has for being scanned was working against the values in it.
 *
 * `m:ss` is one unit, always three or four characters, and sorts visually the
 * way it sorts numerically: 3:00 · 2:00 · 1:30 · 1:00 · 0:45.
 */
function restClock(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const min = Math.floor(seconds / 60);
  return `${min}:${String(seconds % 60).padStart(2, '0')}`;
}

function kg(value: number): string {
  return value.toLocaleString('en-IN');
}

/* ────────────────────────────────────────── this time against last time ── */

/**
 * THE HEAVIEST SET OF THE DAY, BY THE SAME RULE THE BENCHMARK USES.
 *
 * Heaviest first, then most reps at that weight — which is `lastTimeByExercise`'s
 * own ordering in the api, and it HAS to be the same one. A delta computed
 * between two sets picked by two different rules is not a delta, it is two
 * unrelated numbers subtracted. A client who worked up to 110 and backed off to
 * 90 for volume did their top set at 110; a "last set" rule would call the
 * back-off the day's result and report a 20 kg regression that never happened.
 */
function topSetOf(sets: LoggedSet[]): LoggedSet | null {
  if (sets.length === 0) return null;
  return [...sets].sort(
    (a, b) => (b.loadKg ?? 0) - (a.loadKg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0),
  )[0];
}

/**
 * DID THIS MOVEMENT GO UP, AND BY HOW MUCH.
 *
 * The one question a finished session is opened to answer, and the page could
 * not answer it: the log said *85 × 9* and the plan table 900px below said
 * *82.5 × 9, 7 days ago*, and the trainer did the arithmetic in their head,
 * once per movement, scrolling between two differently-shaped tables to do it.
 *
 * ── WHY LOAD FIRST AND REPS SECOND ──────────────────────────────────────────
 *
 * Load is the axis a trainer programmes on, so it is the axis the headline
 * reports. Reps only speak when the load did not move — which is the real
 * reading of *same weight, two more reps*: progress that a load-only comparison
 * would have drawn as a flat line. Movements with no load on either side
 * (mobility, carries, bodyweight) fall through to reps for the same reason.
 *
 * ── AND WHY A DROP IS `warn` AND NOT `danger` ───────────────────────────────
 *
 * Because a deload is a decision, not a defect. The trainer who took 10 kg off
 * a movement after a bad set did the right thing, and a page that draws that in
 * the same red it draws a no-show is a page arguing with the person reading it.
 * `Same as last` gets no tone at all — it is a finding, not a fault, and it is
 * the one that most often means *change something next week*.
 */
type Trend = { tone: string; label: string; up: boolean | null };

function signed(n: number, unit: string): string {
  return `${n > 0 ? '+' : '−'}${kg(Math.abs(n))} ${unit}`;
}

function trendOf(group: ExerciseGroup): Trend | null {
  const top = topSetOf(group.sets);
  if (!top) return null;

  const last = group.lastTime;
  /* Not a dash. "First time" is an instruction — watch this one, there is
     nothing to compare it against — and a dash is the absence of one. */
  if (!last) return { tone: '', label: 'First time', up: null };

  if (top.loadKg != null && last.loadKg != null && top.loadKg !== last.loadKg) {
    const d = top.loadKg - last.loadKg;
    return { tone: d > 0 ? 'tag--ok' : 'tag--warn', label: signed(d, 'kg'), up: d > 0 };
  }

  if (top.reps != null && last.reps != null && top.reps !== last.reps) {
    const d = top.reps - last.reps;
    return {
      tone: d > 0 ? 'tag--ok' : 'tag--warn',
      label: `${d > 0 ? '+' : '−'}${Math.abs(d)} rep${Math.abs(d) === 1 ? '' : 's'}`,
      up: d > 0,
    };
  }

  return { tone: '', label: 'Same as last', up: null };
}

/** "82.5 kg × 9", "9 reps", "4 sets" — whatever the movement actually records. */
function figureOf(loadKg: number | null, reps: number | null, setCount: number): string {
  const load = loadKg != null ? `${kg(loadKg)} kg` : null;
  if (load && reps != null) return `${load} × ${reps}`;
  if (load) return load;
  if (reps != null) return `${reps} reps`;
  return `${setCount} set${setCount === 1 ? '' : 's'}`;
}

/**
 * The two lines that make the card a comparison rather than a record: what was
 * asked for, and what happened the last time this movement came up. Aligned in
 * one grid so the eye reads DOWN the figures — which is the whole point, and is
 * why this is a grid and not two sentences.
 */
function Spine({
  target,
  last,
  now,
  loggedSets,
}: {
  target: ExerciseGroup['target'];
  last: LastTime | null;
  now: number;
  loggedSets: number | null;
}) {
  const planned = target ? prescription(target.sets, target.reps) : null;
  const rest = target ? restLabel(target.restSeconds) : null;
  const short = target?.sets != null && loggedSets != null && loggedSets !== target.sets;

  if (!planned && !last && target?.load == null) return null;

  return (
    <div className="ex__spine">
      {(planned || target?.load != null) && (
        <>
          <span className="ex__k">Planned</span>
          <span className="ex__v">
            {planned && <b className="tnum">{planned}</b>}
            {target?.load != null && (
              <>
                {planned ? ' at ' : ''}
                <b className="tnum">{kg(target.load)} kg</b>
              </>
            )}
          </span>
          <span className="ex__q">
            {rest ? `${rest} rest` : ''}
            {short && (
              <>
                {rest ? ' · ' : ''}
                <b className="ink">{loggedSets} logged</b>
              </>
            )}
          </span>
        </>
      )}

      {last && (
        <>
          <span className="ex__k">Last time</span>
          <span className="ex__v">
            <b className="tnum">{figureOf(last.loadKg, last.reps, last.setCount)}</b>
          </span>
          <span className="ex__q">{relativeDays(now, last.at)}</span>
        </>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────── the trainer's own notes ── */

/**
 * "Left knee — no deep squats" is worth as much reading a session back as it is
 * standing in front of one, which is why it is on this page at all.
 *
 * Pinned notes come first and keep the pinned strip's own treatment, so the
 * trainer recognises them from the client file. The rest are capped: this is a
 * session page, and a client with forty notes has a notes tab for them.
 */
const LOOSE_NOTES_SHOWN = 4;

function ClientNotes({
  clientId,
  clientName,
  notes,
}: {
  clientId: string;
  clientName: string;
  notes: ClientNoteWire[];
}) {
  if (notes.length === 0) return null;

  const pinned = notes.filter((n) => n.pinned);
  const loose = notes.filter((n) => !n.pinned);
  const shown = loose.slice(0, LOOSE_NOTES_SHOWN);

  return (
    <div className="card">
      <div className="card__hd">
        <NoteIcon size={15} />
        <h2 className="card__t" style={{ marginLeft: 8 }}>On this client</h2>
        <Link className="small" href={`/clients/${clientId}/notes`} style={{ marginLeft: 'auto' }}>
          All notes
        </Link>
      </div>
      <div className="card__b">
        {pinned.length > 0 && (
          <div className="cfpin" style={{ marginBottom: shown.length ? 12 : 0 }}>
            <p className="cfpin__k">
              <PinIcon size={12} />
              Before every session
            </p>
            <div className="cfpin__l">
              {pinned.map((note) => (
                <p key={note.id} className="cfpin__i">
                  <span style={{ flex: 1, minWidth: 0 }}>{note.body}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {shown.map((note) => (
          <p key={note.id} className="small" style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>
            {note.body}
          </p>
        ))}

        {loose.length > shown.length && (
          <p className="small ink3">
            {loose.length - shown.length} more in{' '}
            <Link href={`/clients/${clientId}/notes`}>
              {clientName.split(' ')[0]}&rsquo;s notes
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────── the prescription ── */

/**
 * What the program asked for, one row per movement.
 *
 * `done` turns the same table into the after-the-fact version: a tick against
 * every movement the log covered and a plain marker against the one it did not.
 * Two renderings of one table rather than two tables, because a trainer
 * comparing them across the day should not have to re-read a different layout.
 */
function PlanTable({
  plan,
  clientId,
  clientName,
  now,
  done,
}: {
  plan: PlanView;
  clientId: string;
  clientName: string;
  now: number;
  done: boolean;
}) {
  const skipped = done ? plan.exercises.filter((e) => e.loggedSets === 0).length : 0;

  /* ── A COLUMN THAT IS EMPTY IN EVERY ROW IS NOT A COLUMN ─────────────────
     `Target` is a program field, and almost no program in the set fills it in:
     on the session this pass was measured against it drew a dash six times out
     of six while holding 202px of a table that badly needed the room. It is
     drawn when a single row has a number in it and stood down when none does —
     which is the same call `ExerciseCard` already makes for `Load kg`, `Reps`
     and `RPE` one component up.

     `Last time` takes the space it was wasting. See `LastTime` in the api for
     why that is the column a trainer came to this page for. */
  const hasTarget = plan.exercises.some((e) => e.targetLoad != null);
  const hasHistory = plan.exercises.some((e) => e.lastTime != null);

  return (
    <div className="card">
      <div className="card__hd">
        <PlanIcon size={15} />
        <h2 className="card__t" style={{ marginLeft: 8 }}>
          {plan.dayLabel ?? plan.programName}
        </h2>
        <span className="small ink3" style={{ marginLeft: 'auto' }}>
          {plan.dayLabel ? `${plan.programName}` : 'Program'}
          {plan.week != null ? ` · Week ${plan.week}` : ''}
          {plan.templateDay != null ? ` · Day ${plan.templateDay}` : ''}
        </span>
      </div>
      <div className="card__b">
        {plan.exercises.length === 0 ? (
          <p className="small ink3">
            This program has no exercises against{' '}
            {plan.templateDay != null ? `day ${plan.templateDay}` : 'it'} yet.{' '}
            <Link href={`/clients/${clientId}/program`}>Open the program</Link> to add them.
          </p>
        ) : (
          <>
            <table className="sets sets--plan">
              <caption className="sr-only">
                {plan.dayLabel ?? plan.programName} — the movements prescribed for this session
                {hasHistory ? ', and what was done the last time each one came up' : ''}.
              </caption>
              <thead>
                <tr>
                  <th className="n" scope="col"><span className="sr-only">Order</span></th>
                  <th scope="col">Exercise</th>
                  <th className="num" scope="col">Sets × reps</th>
                  {hasTarget && <th className="num" scope="col">Target</th>}
                  <th className="num" scope="col">Last time</th>
                  <th className="num" scope="col">Rest</th>
                  {done && <th className="num" scope="col">Logged</th>}
                </tr>
              </thead>
              <tbody>
                {plan.exercises.map((row, i) => (
                  <PlanRow
                    key={row.exerciseId}
                    row={row}
                    index={i + 1}
                    now={now}
                    hasTarget={hasTarget}
                    done={done}
                  />
                ))}
              </tbody>
            </table>

            {!done && !hasHistory && (
              <p className="small ink3 sets__foot">
                Nothing here has been logged for {clientName.split(' ')[0]} before, so there is no
                last time to compare against yet.
              </p>
            )}

            {done && skipped > 0 && (
              <p className="small ink3 sets__foot">
                {skipped} of {plan.exercises.length} planned{' '}
                {skipped === 1 ? 'movement was' : 'movements were'} not logged. A skipped exercise
                is a decision the trainer made on the floor, and this page records it rather than
                grading it.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * `105 × 5` over `3 weeks ago`, or the absence of one.
 *
 * Two lines and not one, because they are two different readings: the numbers
 * are compared against the row they sit in, and the age qualifies how much that
 * comparison is worth. Stacked, the numbers stay on the column's own baseline
 * with every other figure in the table and the age reads as their footnote —
 * which is what it is.
 *
 * *First time* rather than a dash for a movement with no history. A dash says
 * "no data"; this says "watch this one", and the two are not the same
 * instruction to somebody about to load a bar.
 */
function LastTimeCell({ last, now }: { last: LastTime | null; now: number }) {
  if (!last) return <span className="ink3 sets__first">First time</span>;

  const load = last.loadKg != null ? `${kg(last.loadKg)} kg` : null;
  const figure =
    load && last.reps != null
      ? `${load} × ${last.reps}`
      : load ?? (last.reps != null ? `${last.reps} reps` : `${last.setCount} sets`);

  /* `(now, last.at)` and not the other way round. The helper reads `to - from`,
     so passing the past date as `from` makes the difference POSITIVE and the
     sentence comes out as *in 9 days* about a session that already happened. */
  return (
    <span className="sets__last">
      <b className="tnum">{figure}</b>
      <i>{relativeDays(now, last.at)}</i>
    </span>
  );
}

function PlanRow({
  row,
  index,
  now,
  hasTarget,
  done,
}: {
  row: PlannedRow;
  index: number;
  now: number;
  hasTarget: boolean;
  done: boolean;
}) {
  const target = prescription(row.targetSets, row.targetReps);
  const rest = restClock(row.restSeconds);
  const missed = done && row.loggedSets === 0;

  /* `data-missed` rather than `opacity:.55` inline. The old rule dimmed the WHOLE
     row including the `not logged` marker that explains why it is dim, so the one
     cell carrying the finding was the hardest cell in the table to read. The
     stylesheet now tones the ink and leaves the marker alone.

     `data-l` on every value cell is `.pk__tbl`'s phone reflow, ported on that
     rule's own argument: below 620px the row stops being a table row and the
     column headings go with it, so each figure carries its own label into the
     block. `4 × 5` beside `3:00` beside `70 kg × 5` is three unlabelled strings
     otherwise, and the middle one is a time that could be either.

     The ordinal and the movement name take no `data-l` — they have classes of
     their own and they LEAD the block rather than sitting in it, which is the
     one place this differs from `.pk__tbl`'s `data-l=""` sentinel. */
  return (
    <tr data-missed={missed ? '' : undefined}>
      <td className="n">{index}</td>
      <th scope="row" className="sets__ex">
        {row.exerciseName}
        {row.muscleGroup && <span className="small ink3">{row.muscleGroup}</span>}
      </th>
      <td className="num" data-l="Sets × reps">
        {target ? <span className="tnum">{target}</span> : <span className="ink3">—</span>}
      </td>
      {hasTarget && (
        <td className="num" data-l="Target">
          {row.targetLoad != null ? (
            <span className="tnum">{kg(row.targetLoad)} kg</span>
          ) : (
            <span className="ink3">—</span>
          )}
        </td>
      )}
      <td className="num" data-l="Last time">
        <LastTimeCell last={row.lastTime} now={now} />
      </td>
      <td className="num" data-l="Rest">
        {rest ? <span className="tnum">{rest}</span> : <span className="ink3">—</span>}
      </td>
      {done && (
        <td className="num" data-l="Logged">
          {row.loggedSets > 0 ? (
            <Tag tone="ok">
              <CheckIcon size={11} /> {row.loggedSets}
            </Tag>
          ) : (
            <span className="ink3">not logged</span>
          )}
        </td>
      )}
    </tr>
  );
}

/* ──────────────────────────────────────────── exercise set table ── */

/**
 * ONE MOVEMENT: WHAT WAS ASKED FOR, WHAT HAPPENED, AND WHAT HAPPENED LAST TIME.
 *
 * All three on one card, which is the whole of this pass. The card used to
 * carry two of them and the third — the only one that answers *is this client
 * getting stronger* — sat in a differently-shaped table at the foot of the
 * page. Two operands of one comparison, ~900px apart, five times per session.
 *
 * The numbered chip is not decoration: with skipped movements now drawn as
 * cards in the same stack, the number is what says this is the third of six
 * things the program asked for, in the order the console wrote them.
 */
function ExerciseCard({ group, index, now }: { group: ExerciseGroup; index: number; now: number }) {
  const hasWeights = group.sets.some((s) => s.loadKg !== null);
  const hasReps = group.sets.some((s) => s.reps !== null);
  const hasRpe = group.sets.some((s) => s.rpe !== null);
  const trend = trendOf(group);
  const top = topSetOf(group.sets);
  const targetReps = group.target?.reps ?? null;

  /* One number of columns, computed once. The note row spans the rest of them,
     and a note row that spans the wrong count is how a table gets a ragged
     edge on exactly the sessions that have the most to say. */
  const dataColumns = (hasWeights ? 1 : 0) + (hasReps ? 1 : 0) + (hasRpe ? 1 : 0) + 1;

  /* No `marginBottom` any more. `.sesh__main` is a flex column with `gap:12px`,
     and the margin this card was carrying stacked on top of it — MEASURED at
     24px between every pair of exercise cards against 12px everywhere else on
     the page. The gap owns the rhythm now; the card owns none of it. */
  return (
    <Card className="ex">
      <Card.Head title={<>{group.exerciseName}</>} className="ex__hd">
        <span className="ex__n">{index}</span>
        
        {group.unplanned && <Tag className="ex__flag">Unplanned</Tag>}
        <span className="small ink3 ex__meta">
          {group.muscleGroup ? `${group.muscleGroup} · ` : ''}
          <span className="tnum">
            {group.volumeKg > 0
              ? `${kg(group.volumeKg)} kg`
              : `${group.sets.length} set${group.sets.length !== 1 ? 's' : ''}`}
          </span>
        </span>
        {/* THE HEADLINE, AND IT IS A DELTA. A trainer scanning six cards for
            the one movement that moved should not have to read six tables to
            find it — the chips answer that in one pass down the right edge. */}
        {trend && <span className={`tag ${trend.tone} ex__trend`}>{trend.label}</span>}
      </Card.Head>
      <Card.Body>
        <Spine
          target={group.target}
          last={group.lastTime}
          now={now}
          loggedSets={group.sets.length}
        />
        {group.unplanned && (
          <p className="small ink3 ex__said">
            Added on the floor — the program did not ask for this one.
          </p>
        )}

        <table className="sets ex__sets" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="n"></th>
              {hasWeights && <th className="num">Load kg</th>}
              {hasReps && <th className="num">Reps</th>}
              {hasRpe && <th className="num">RPE</th>}
              {/* The sink for everything the numeric tracks give back. See
                  `.ex__sets td.ex__pr` in app.css. */}
              <th className="ex__pr"></th>
            </tr>
          </thead>
          <tbody>
            {group.sets.map((set) => (
              <Fragment key={set.id}>
                {/* `data-top` marks the set the header's delta was computed
                    against, so the chip is traceable to a row rather than
                    being a number the card asserts. */}
                <tr data-state="done" data-top={set.id === top?.id ? '' : undefined}>
                  <td className="n">{set.setNumber}</td>
                  {hasWeights && (
                    <td className="num">
                      {set.loadKg !== null ? (
                        <span className="tnum">{set.loadKg}</span>
                      ) : (
                        <span className="ink3">—</span>
                      )}
                    </td>
                  )}
                  {hasReps && (
                    <td className="num">
                      {set.reps !== null ? (
                        <>
                          <span className="tnum">{set.reps}</span>
                          {/* THE TARGET, ONLY WHERE IT WAS MISSED.
                              A set that hit its number needs no annotation, and
                              printing "10 / 10" down every row is how a column
                              of nines stops standing out. Drawn only on the
                              rows that fell short, it is the one place on the
                              card the eye is meant to stop. */}
                          {targetReps != null && set.reps < targetReps && (
                            <span className="ink3 tnum ex__of"> / {targetReps}</span>
                          )}
                        </>
                      ) : (
                        <span className="ink3">—</span>
                      )}
                    </td>
                  )}
                  {hasRpe && (
                    <td className="num">
                      {set.rpe !== null ? (
                        <span className="tnum">{set.rpe}</span>
                      ) : (
                        <span className="ink3">—</span>
                      )}
                    </td>
                  )}
                  <td className="ex__pr">
                    {set.bestEver && (
                      <Tag tone="pr" title="Still their heaviest ever on this movement">
                        Best ever
                      </Tag>
                    )}
                  </td>
                </tr>
                {set.notes && (
                  <tr className="note">
                    <td></td>
                    <td colSpan={dataColumns}>
                      <p>
                        <NoteIcon /> {set.notes}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card.Body>
    </Card>
  );
}

/**
 * A MOVEMENT THE PROGRAM ASKED FOR AND THE LOG NEVER MENTIONS.
 *
 * This used to be a row in the plan table at the foot of the page, findable
 * only by reading a `Logged` column for a zero. It is a card now, sitting in
 * the stack at the position the program gave it, because that is where a
 * trainer scanning the session will actually pass it — and because a gap in a
 * list of six cards is visible in a way that a 0 in a column is not.
 *
 * It keeps the plan and the history, which is what makes it useful rather than
 * merely accusatory: the trainer deciding whether the skip mattered wants to
 * know what was on the sheet and what the client last did on it.
 */
function SkippedCard({ row, index, now }: { row: PlannedRow; index: number; now: number }) {
  return (
    <Card className="ex ex--skip">
      <Card.Head title={<>{row.exerciseName}</>} className="ex__hd">
        <span className="ex__n">{index}</span>
        
        <Tag className="ex__flag">Not logged</Tag>
        {row.muscleGroup && <span className="small ink3 ex__meta">{row.muscleGroup}</span>}
      </Card.Head>
      <Card.Body>
        <Spine
          target={{
            sets: row.targetSets,
            reps: row.targetReps,
            load: row.targetLoad,
            restSeconds: row.restSeconds,
          }}
          last={row.lastTime}
          now={now}
          loggedSets={null}
        />
        {/* The sentence the plan table's footer used to carry, moved to the
            thing it is about. A skipped movement is a decision the trainer made
            on the floor, and this page records it rather than grading it. */}
        <p className="small ink3 ex__said">
          Nothing was logged against this one — a swap or a call made on the floor.
        </p>
      </Card.Body>
    </Card>
  );
}

/**
 * THE SESSION IN THE ORDER IT WAS WRITTEN, GAPS INCLUDED.
 *
 * The program's own order first, with each row resolved to whichever it turned
 * out to be — a logged movement or a hole — then anything the trainer added on
 * the floor, which by definition has no place in the program's order and goes
 * where the console put it: last.
 *
 * Interleaved rather than "the done ones, then the skipped ones", because the
 * order IS information. A movement skipped in the middle of a session reads
 * differently from one skipped at the end, and grouping the skips together
 * destroys the only evidence of which happened.
 */
type CardItem =
  | { kind: 'logged'; group: ExerciseGroup }
  | { kind: 'skipped'; row: PlannedRow };

function orderedCards(plan: PlanView | null, groups: ExerciseGroup[]): CardItem[] {
  const byId = new Map(groups.map((g) => [g.exerciseId, g]));
  const out: CardItem[] = [];
  const placed = new Set<string>();

  for (const row of plan?.exercises ?? []) {
    const group = byId.get(row.exerciseId);
    if (group) {
      out.push({ kind: 'logged', group });
      placed.add(row.exerciseId);
    } else {
      out.push({ kind: 'skipped', row });
    }
  }
  for (const group of groups) {
    if (!placed.has(group.exerciseId)) out.push({ kind: 'logged', group });
  }
  return out;
}

/* ───────────────────────────────────────────────────── shared blocks ── */

function DetailsCard({ data }: { data: SessionDetailData }) {
  const { session } = data;
  const { time, meridiem } = clockParts(session.scheduledAt);
  const token = avatarToken(session.clientId);
  const booked = session.bookingId !== null;

  /* ── WHAT THIS CARD STOPPED SAYING ──────────────────────────────────────
     It used to list Date, Time, Duration, Type and Program — and the header
     above it already prints the date and the time, the strip already prints the
     duration and the type, and the plan card's own header already prints the
     program and its week. Five rows, five restatements, 258px, at the BOTTOM of
     the page: the last thing a trainer reached was the thing they had already
     read three times.

     What survives is what nothing else on the page says: who the client is, and
     the two facts about the booking that are only true of THIS session. `Date`
     stays because the card is the only place the long form appears and a
     session read months later wants the year; everything the strip covers is
     gone from here. */
  return (
    <div className="card">
      <div className="card__hd">
        <span className="av av--sm" style={{ background: token }}>
          {initials(session.clientName)}
        </span>
        <Link className="card__t" href={`/clients/${session.clientId}`} style={{ marginLeft: 10 }}>
          {session.clientName}
        </Link>
        <ChevronIcon size={14} />
      </div>
      <div className="card__b">
        <KeyValueRow k="Date">
          {dayLong(session.scheduledAt)}
          {booked ? `, ${time} ${meridiem}` : ''}
        </KeyValueRow>
        {!booked && (
          <KeyValueRow k="Booking" valueClassName="ink3">None — logged without one</KeyValueRow>
        )}
        {data.plan && (
          <KeyValueRow k="Program">
            {data.plan.programName}
            {data.plan.week != null ? ` · Week ${data.plan.week}` : ''}
          </KeyValueRow>
        )}
      </div>
    </div>
  );
}

function NotesCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <div className="card__hd">
        <NoteIcon size={15} />
        <h2 className="card__t" style={{ marginLeft: 8 }}>{title}</h2>
      </div>
      <div className="card__b">
        <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{body}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────── the next moves ── */

/**
 * THE THINGS A TRAINER DOES ABOUT A SESSION THAT HASN'T HAPPENED YET.
 *
 * The page had exactly one verb — *Log this session* — which is the verb for the
 * moment you are standing in the gym. Every other reason to open an upcoming
 * session had no answer here: confirming the slot the night before, moving it
 * when the client texts, checking what the program actually says. A trainer who
 * has to navigate somewhere else to do the obvious thing does not do it, which
 * is the argument `NudgeButton` already makes for itself.
 *
 * ── WHAT IS NOT HERE, AND WHY ────────────────────────────────────────────────
 *
 * **No-show and Mark done are deliberately absent.** Both exist, both are one
 * import away (`lib/schedule/actions`), and both are wrong on this surface: they
 * settle what happened, and nothing has happened yet — this card only renders
 * ahead of the session. Worse, `markNoShow` takes a session off the client's
 * pack on a single press, with no undo on this page and no confirm. The diary
 * can afford that because it is the fast surface for a session in the past; a
 * plan screen for a session three weeks out cannot. A session that HAS passed
 * gets the `Not marked` callout in the log view instead, which routes to the
 * finish screen where the considered version of both verbs lives.
 *
 * **Reschedule is a link, not a button.** Moving a session is select-then-place
 * on the schedule grid — `Schedule.tsx` carries the argument for why it is a
 * gesture and not a form — so there is nothing to press here. The link opens
 * that grid on this session's own day, which is the one thing this page knows
 * that the grid otherwise has to be told.
 */
function QuickActions({ data }: { data: SessionDetailData }) {
  const { session } = data;
  const first = session.clientName.split(' ')[0];

  /* `.sesh__act` is what the phone hoists. It is a class on THIS card and not a
     rule on the side column, because the column holds four cards on this view
     and one of them is the only one a thumb came for — see `.sesh__side` on a
     phone in app.css. */
  return (
    <Card
      title="Before this session"
      className="sesh__act"
    >
      <div className="sesh__qa">
        {/* `session_reminder` and not `check_in`: the template's own verb is
            *Confirm*, which is the question being asked — is this slot still
            good — and not a general how-is-the-week. */}
        <NudgeButton
          clientId={session.clientId}
          clientName={session.clientName}
          template="session_reminder"
          className="btn btn--secondary"
        />
        <Button
          href={`/schedule?view=day&d=${stampAnchor(session.scheduledAt)}`}
          variant="secondary"
        >
          <CalendarIcon size={15} />
          Reschedule
        </Button>
        <Button href={`/clients/${session.clientId}/program`} variant="secondary">
          <PlanIcon size={15} />
          Open the program
        </Button>
      </div>
      {/* `.small.ink3` and NOT `.fld__h`, which is what this was: webapp.css
          defines that as a 12px hint, app.css:4988 redefines it as a bold
          12.5px FIELD LABEL, and app.css wins — so the quiet sentence under
          three buttons came out heavier than the buttons. */}
      <p className="small ink3 mt2">
        Confirming opens WhatsApp with the message drafted; nothing is sent until you press
        send. Rescheduling opens {first}&rsquo;s day on the diary, where the move is made.
      </p>
    </Card>
  );
}

/* ────────────────────────────────────────── upcoming session view ── */

function UpcomingView({ data }: { data: SessionDetailData }) {
  const { session, plan } = data;

  return (
    <div className="body">
      {plan && (
        <div className="strip sesh__strip">
          <div>
            <b>{plan.exercises.length}</b>
            <i>exercise{plan.exercises.length !== 1 ? 's' : ''}</i>
          </div>
          <div>
            <b>{plan.totalSets || '—'}</b>
            <i>sets planned</i>
          </div>
          <div>
            <b>{formatSpan(session.minutes)}</b>
            <i>booked</i>
          </div>
          <div>
            <b style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {session.mode === 'remote' ? <RemoteIcon size={16} /> : <FloorIcon size={16} />}
              {session.mode === 'remote' ? 'Online' : 'In Person'}
            </b>
            <i>where</i>
          </div>
        </div>
      )}

      {/* ── TWO COLUMNS, AND THE SECOND ONE IS WHY ───────────────────────────
          MEASURED at 1512×982, before: the plan card ran the full 1225px and
          everything under it was capped at 640 and 540 and left-ranged, so the
          bottom two-thirds of the page left 585px and then 685px of canvas
          empty — three different right edges stacked on each other, which reads
          as an accident rather than as a layout. The page scrolled 855px inside
          a 506px port to show 1,225px-wide content that was mostly air.

          `/clients/:id` had this exact defect and fixed it with `.cfgrid--ov`;
          the ratio here is that rule's, re-measured for this page's content —
          the main column holds a table and wants more of the width than a list
          of key-values does. See `.sesh` in app.css. */}
      <div className="sesh">
        <div className="sesh__main">
          {plan ? (
            <PlanTable
              plan={plan}
              clientId={session.clientId}
              clientName={session.clientName}
              now={data.now}
              done={false}
            />
          ) : (
            <Card>
              <p className="small">
                No program is attached to this session, so there is nothing prescribed to show.
                The console will still log it — an unplanned session is a session.{' '}
                <Link href={`/clients/${session.clientId}/programs`}>
                  {session.clientName.split(' ')[0]}&rsquo;s programs
                </Link>
                .
              </p>
            </Card>
          )}
        </div>

        <div className="sesh__side">
          <QuickActions data={data} />

          <ClientNotes
            clientId={session.clientId}
            clientName={session.clientName}
            notes={data.notes}
          />

          {session.notes && <NotesCard title="Session notes" body={session.notes} />}

          <DetailsCard data={data} />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── workout log view ── */

function WorkoutLogView({ data }: { data: SessionDetailData }) {
  const { session, workout, plan } = data;
  const isDone = DONE.has(session.status);
  const isNoShow = NO_SHOW.has(session.status);
  /* A booking whose time has passed and which nobody closed. The log may be
     full; the money side is not settled until somebody says so. */
  const unmarked = session.bookingId !== null && !isDone && !isNoShow;

  const cards = orderedCards(plan, workout?.exercises ?? []);

  /* ── THE THIRD TILE HAD TO EARN ITS PLACE ───────────────────────────────
     It used to print the exercise COUNT, which the trainer can see by looking
     at the page, and which is repeated three lines down by "of 14 planned"
     anyway. A headline figure that restates something already on screen is
     four tiles' worth of furniture doing three tiles' work.

     What goes there instead is the one session-level fact nothing else says:
     how many movements went UP. It is counted only over the movements that
     have a previous outing to be up on — a first-timer is not a failure to
     progress — and when nothing has any history at all the tile falls back to
     the old count rather than drawing "0 of 0". */
  const compared = workout
    ? workout.exercises.map((g) => trendOf(g)).filter((t): t is Trend => t?.up != null)
    : [];
  const gained = compared.filter((t) => t.up).length;

  return (
    <div className="body">
      {workout && (
        <div className="strip sesh__strip">
          <div>
            <b>{workout.totalSets}</b>
            <i>{plan?.totalSets ? `of ${plan.totalSets} planned` : 'sets'}</i>
          </div>
          {workout.totalVolumeKg > 0 && (
            <div>
              <b>{kg(workout.totalVolumeKg)}</b>
              <i>kg moved</i>
            </div>
          )}
          {compared.length > 0 ? (
            /* ── THE ONE TILE THAT HAS A VERDICT IN IT, DRAWN AS ONE ───────
               `0 of 6 up on last time` is the session, and it was set in the
               same ink as `2,065 kg moved` — a fact with no opinion beside a
               figure with none. On `wo_0340` every movement came down 2.5 or
               5 kg and the page's only account of that was six amber chips
               scattered down the right edge of six cards; the tile that adds
               them up whispered.

               `warn` and not `danger`, for the reason `trendOf` gives at
               length: a deload is a decision. The tile reports it; it does not
               grade it. `ok` is the other half and is new to the strip — see
               `.strip .ok b` in the design system. The middle is left neutral
               on purpose: a session where three of six went up is a session
               with no verdict in it, and colouring it would invent one. */
            <div
              className={
                gained === 0 ? 'warn' : gained === compared.length ? 'ok' : undefined
              }
            >
              <b>
                {gained} <span className="strip__of">of {compared.length}</span>
              </b>
              <i>up on last time</i>
            </div>
          ) : (
            <div>
              <b>{workout.exercises.length}</b>
              <i>exercise{workout.exercises.length !== 1 ? 's' : ''}</i>
            </div>
          )}
          {/* `.sesh__outcome` stands this tile down below 620px. It draws the
              same three words the status chip beside the `h1` draws — and on an
              unmarked session the alarm above says them a third time — so on a
              phone it is the tile that can go, and going is what lets the other
              three hold their labels on one line. See `.sesh__strip` on a phone
              in app.css. */}
          <div className="sesh__outcome">
            <b style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {isDone ? (
                <><CheckIcon size={16} /> Done</>
              ) : isNoShow ? (
                <><NoShowIcon size={16} /> No-show</>
              ) : (
                'Not marked'
              )}
            </b>
            <i>outcome</i>
          </div>
        </div>
      )}

      {/* ── THE SESSION IS LOGGED AND THE MONEY IS NOT SETTLED ──────────────
          The one state this page exists to make impossible to miss. A log full
          of sets says nothing about whether the session came off the client's
          pack, and a trainer scanning history has no other way to tell.

          Full width, ABOVE the two columns, and that is deliberate: this is the
          one thing on the page that is wrong and needs a person, and a callout
          inside a column is a callout somebody scrolls past. */}
      {unmarked && (
        <Why heading="Not marked" tone="warn" className="sesh__alarm">
          <p>
            This session has passed and nobody said what happened, so it has not touched{' '}
            {session.clientName.split(' ')[0]}&rsquo;s pack. A pack moves on <i>done</i> or{' '}
            <i>no-show</i>, never on <i>booked</i> — and a log full of sets is not either of them.{' '}
            {/* Frame 5b is built on the log: `getFinish` goes through `getConsole`
                and there is nothing to finish without one. A session nobody
                logged goes to the console instead, which offers to start one. */}
            <Link href={`/sessions/${data.routeId}/${workout ? 'finish' : 'log'}`}>
              <b>{workout ? 'Close it out' : 'Open the console'}</b>
            </Link>
            .
          </p>
        </Why>
      )}

      {/* ── THE NO-SHOW, AND THE ONE THING WORTH DOING ABOUT IT ────────────
          This card used to state the fact and stop: *marked as a no-show, no
          workout was logged.* True, and a dead end — a trainer reading it has
          exactly one useful next move, which is to ask the client what happened,
          and until now that meant leaving the page to find their number.

          `missed_session`, not `check_in`: the difference is the whole reason
          there are two templates. `check_in` asks how the week is going, which
          is a question; this one names what happened and offers to move things
          around, without a reproach in it — because the commonest reason
          somebody misses a session is that their week went wrong, and a message
          that reads as a telling-off is how a recoverable client becomes a lost
          one. */}
      {/* The same two columns the upcoming view takes, and the log is what the
          main one carries. The side column is unchanged between the two states
          on purpose: a trainer moving between a session they are about to run
          and one they ran last week should find the client's notes in the same
          place both times. */}
      <div className="sesh sesh--log">
        <div className="sesh__main">
          {isNoShow && !workout && (
            <Card>
              <p className="small">
                This session was marked as a no-show. No workout was logged.
              </p>
              <div style={{ marginTop: 10 }}>
                <NudgeButton
                  clientId={session.clientId}
                  clientName={session.clientName}
                  template="missed_session"
                  className="btn btn--sm btn--secondary"
                />
              </div>
            </Card>
          )}

          {isDone && !workout && (
            <Card>
              <p className="small">Session marked done — no workout log was created.</p>
            </Card>
          )}

          {/* ── ONE STACK, AND THE PLAN TABLE IS GONE FROM THIS VIEW ────────
              A logged session used to draw its movements TWICE: once as cards
              at the top, and again as a table at the foot whose columns were
              the same prescription plus the `Last time` figure the cards could
              not see. Everything that table uniquely said now lives on the card
              for the movement it says it about — the prescription in the spine,
              the history beside it, the skips as cards of their own — so what
              remained at the foot of the page was a second, differently-shaped
              rendering of the screen above it. That is the duplication that
              made this page unreadable: not too little information, the same
              information twice in two shapes.

              `PlanTable` is untouched and still carries the UPCOMING view,
              where it is the whole point of the screen — there are no logged
              sets to hang the prescription off, so the table IS the plan. */}
          {/* `.sesh__ex` and not the cards loose in `.sesh__main`: the stack
              runs two abreast on a wide window and the column also holds
              full-width things (the no-show card above), so the grid has to
              be a box around the cards rather than a rule on the column. See
              `.sesh__ex` in app.css for the measurements. */}
          <div className="sesh__ex">
            {cards.map((item, i) =>
              item.kind === 'logged' ? (
                <ExerciseCard
                  key={item.group.exerciseId}
                  group={item.group}
                  index={i + 1}
                  now={data.now}
                />
              ) : (
                <SkippedCard key={item.row.exerciseId} row={item.row} index={i + 1} now={data.now} />
              ),
            )}
          </div>
        </div>

        <div className="sesh__side">
          {workout?.notes && <NotesCard title="Trainer notes" body={workout.notes} />}

          <ClientNotes
            clientId={session.clientId}
            clientName={session.clientName}
            notes={data.notes}
          />

          {session.notes && <NotesCard title="Session notes" body={session.notes} />}

          <DetailsCard data={data} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── main component ── */

export function SessionDetail({ data }: { data: SessionDetailData }) {
  const { session } = data;
  const { time, meridiem } = clockParts(session.scheduledAt);
  const stamp = dayStamp(session.scheduledAt);
  const state = stateOf(data);
  const chip = STATE_CHIP[state];
  const isUpcoming = state === 'upcoming';

  const crumbLabel = `${session.clientName} · ${stamp}`;
  const head = data.plan?.dayLabel ?? data.plan?.programName ?? null;

  return (
    <>
      <TopBar crumb="Sessions" />
      <main className="main">
        {/* `.ph--sesh` is the phone's header shape — the crumb and the two verbs
            on one row above the name, rather than three rows. See `.ph--sesh` in
            app.css; a class per screen is what stops one screen's answer becoming
            every screen's. */}
        <div className="ph ph--sesh">
          <div className="ph__row">
            <div className="sesh__id">
              <nav className="crumbs" aria-label="Breadcrumb">
                <Link href="/programs/workouts">Workouts</Link>
                <i aria-hidden="true">/</i>
                <b>{crumbLabel}</b>
              </nav>

              {/* The chip sits WITH the name and not under it. It is the answer
                  to the first question anybody opening this page has, and the
                  title is where the eye already is.

                  BESIDE the `h1` and not inside it. The first version nested the
                  chip in the heading, and the accessible name came out as
                  "Vikram Rao · Lower ADone" — the visual gap between a heading
                  and a chip is a margin, and a margin is not a word boundary.
                  The status is not part of what this page is called, so it is
                  not part of the heading; the flex row holds them together. */}
              <div className="sesh__title">
                <h1 className="ph__t">
                  {session.clientName}
                  {head && (
                    <span className="ink3" style={{ fontWeight: 600 }}>
                      {' '}&middot; {head}
                    </span>
                  )}
                </h1>
                <span className={`tag ${chip.cls}`}>{chip.label}</span>
              </div>

              {/* The clock, and how far away it is. A date alone does not answer
                  *how soon*, which is the question an upcoming session is opened
                  with — and on one already past, the distance is what tells a
                  trainer whether they are reading last week or last quarter. */}
              <p className="ph__sub">
                {stamp}
                {session.bookingId ? ` · ${time} ${meridiem}` : ''}
                {session.bookingId && (
                  <span className="ink3"> · {relativeDays(data.now, session.scheduledAt)}</span>
                )}
              </p>
            </div>

            <div className="ph__acts">
              {/* *All sessions* used to stand here, one row under a breadcrumb
                  whose first link goes to the same place — two controls, one
                  destination, eight pixels apart. The breadcrumb is the one that
                  survives: it is where a back-out is looked for, and it costs no
                  space in the action row that the primary verb wanted. */}
              <Button
                href={`/clients/${session.clientId}`}
                variant="secondary"
                size="sm"
              >
                Client file
              </Button>
              {/* This page READS a session; the console WRITES one. Two screens
                  and not one, because the read is a record of what happened and
                  the write is a grid with a keyboard model — and the same id
                  addresses both, which is why `/sessions/:id/log` keys off the
                  booking wherever there is one. */}
              <Button href={`/sessions/${data.routeId}/log`} variant="primary" size="sm">
                {session.hasLog ? 'Open the log' : 'Log this session'}
              </Button>
            </div>
          </div>
        </div>

        {isUpcoming ? <UpcomingView data={data} /> : <WorkoutLogView data={data} />}
      </main>
    </>
  );
}
