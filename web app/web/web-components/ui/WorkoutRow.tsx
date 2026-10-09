import type { ReactNode } from 'react';
import Link from 'next/link';

import { Avatar } from './Avatar';
import { Tag } from './Tag';

/**
 * Workout row — the sessions list as columns, `ProgramRow`'s sibling.
 *
 * ── WHY IT IS A SECOND COMPONENT AND NOT A `ProgramRow` VARIANT ─────────────
 *
 * Same grammar — a CSS grid that reads as a table above 900px and gives the
 * pretence up below it, nouns clipped onto the row so the head is safe to hide
 * — and a different record: a session has a person, a clock and an outcome
 * where a program has a shape and a roster. Nothing but the shell is shared.
 *
 * ── AND THE WHOLE ROW IS NOT THE LINK ───────────────────────────────────────
 *
 * `ProgramRow` is one anchor because every pixel of it is about one program.
 * This row carries an overflow menu, and an anchor may not wrap one. So the row
 * is a `<div>`, the NAME is the link, and the menu keeps its own tab stop.
 *
 * ── THE DATE COLUMN IS GONE, AND `DayRule` HAS IT ───────────────────────────
 *
 * There were eight tracks and the third was a 108px date. It held the same
 * string for every row of a day — seven copies of `Thu · 17 Sep`, then eight of
 * `Wed · 16 Sep` — so the only information in the column was where one run
 * ended and the next began, which is a heading's job. `c-dayrule` draws it as
 * a band over the run and this row is seven tracks.
 *
 * What the row keeps is the CLOCK. A time with no day is ambiguous in a flat
 * list and unambiguous under a rule that names the day, and it is the figure
 * that actually varies row to row.
 *
 * ── THE WORKOUT CELL IS TWO LINES, AND THE SECOND IS THE PROGRAM ────────────
 *
 * It printed `dayLabel ?? programName` — one line, the program dropped
 * whenever the day had a label of its own. Measured on the seeded book, that
 * made **`Upper A` the answer for 109 of 361 rows** and `Lower A` for 95: a
 * column three-quarters filled with two strings that name a day of SOMEBODY'S
 * program and never say whose. The program was already on the row and was
 * being thrown away.
 *
 * So the day is the line and the program is the line under it, ink-3. Both
 * come from the caller; a row with neither is still a dash.
 *
 * ── THE FOURTH STATUS, AND IT IS A CORRECTION ───────────────────────────────
 *
 * `unmarked` is a past slot nobody has said anything about yet, and it used to
 * be drawn as **`Booked`** — a future-tense word, in the calm blue reserved for
 * a commitment that is still ahead, sitting under a tab called *Missed*.
 * `lib/sessions/api.ts` puts both kinds in that bucket on the stated grounds
 * that *"the status tag on the row is what tells them apart"*, and the tag did
 * not: on the seeded book five of the twenty-seven rows on that tab said
 * `Booked`, which is the one thing they are certainly not.
 *
 * It takes `warn`'s attention rather than `missed`'s, because the two are not
 * the same claim. *Missed* is a fact the trainer has recorded. *Unmarked* is a
 * question they have not answered — and it is the only row on this screen with
 * a verb still owed on it.
 */
export type WorkoutStatus = 'done' | 'scheduled' | 'missed' | 'unmarked';

const STATUS: Record<WorkoutStatus, { label: string; tone: 'ok' | 'info' | 'warn' | 'danger' }> = {
  done: { label: 'Logged', tone: 'ok' },
  scheduled: { label: 'Booked', tone: 'info' },
  missed: { label: 'Missed', tone: 'danger' },
  unmarked: { label: 'Unmarked', tone: 'warn' },
};

export function WorkoutRowHead({ showMode = true, showStatus = true }: { showMode?: boolean; showStatus?: boolean }) {
  return (
    /* `aria-hidden` on the whole row, which is `ProgramRowHead`'s call and is
       legal again now the select-all has gone: there is no control left in
       here, and every figure below carries its own noun as text. It took
       props and a per-span `aria-hidden` only because a checkbox inside a
       hidden subtree is a checkbox nothing can reach. */
    <div className={`wkrow wkrow--hd${showMode ? '' : ' wkrow--nomode'}${showStatus ? '' : ' wkrow--nostatus'}`} aria-hidden="true">
      <span>Client</span>
      <span>Workout</span>
      <span>Time</span>
      <span>Duration</span>
      {showMode && <span>Mode</span>}
      {showStatus && <span>Status</span>}
      <span />
    </div>
  );
}

export function WorkoutRow({
  name,
  clientId,
  href,
  workout,
  program,
  time,
  meridiem,
  duration,
  mode,
  status,
  menu,
  className,
  showMode = true,
  showStatus = true,
}: {
  name: string;
  /** Keys the avatar's colour, exactly as the card this replaces did. */
  clientId: string;
  href: string;
  /** The day of the program — "Upper A". A session with neither this nor a
   *  program is a dash. */
  workout?: string | null;
  /** Which program that day belongs to. Drawn under it, and dropped when it
   *  would only repeat `workout`. */
  program?: string | null;
  /** Already formatted against the server's clock — see above. */
  time: string;
  meridiem: string;
  duration: string;
  mode: 'floor' | 'remote';
  status: WorkoutStatus;
  /** The row's overflow control. A node, so the catalogue holds no router. */
  menu?: ReactNode;
  className?: string;
  /** A column that says the same thing on every row of the page says nothing — the caller turns it off. */
  showMode?: boolean;
  showStatus?: boolean;
}) {
  const state = STATUS[status];
  /* A program whose name IS the day label is not a second line, it is the same
     line twice. `Rebuild A` under `Rebuild A` is the kind of duplicate that
     only shows up on real rows. */
  const sub = program && program !== workout ? program : null;

  return (
    <div className={['wkrow', showMode ? '' : 'wkrow--nomode', showStatus ? '' : 'wkrow--nostatus', className].filter(Boolean).join(' ')}>
      <span className="wkrow__n">
        <Avatar name={name} id={clientId} size="sm" />
        <Link className="wkrow__nm" href={href}>{name}</Link>
      </span>

      <span className="wkrow__meta">
        <span className="wkrow__facts">
          <span className="wkrow__w">
            {workout || sub ? (
              <>
                <b className="wkrow__wd">{workout || sub}</b>
                {workout && sub ? <span className="wkrow__wp">{sub}</span> : null}
              </>
            ) : (
              <span className="wkrow__none">&mdash;</span>
            )}
          </span>

          {/* A clock says what it is; only the span needs its noun.
              `.ptrow__k`'s technique, applied where it earns itself. */}
          <span className="wkrow__f">
            <b>{time}</b> <span className="ink3">{meridiem}</span>
          </span>

          <span className="wkrow__f">
            <b>{duration}</b>
            <span className="wkrow__k"> long</span>
          </span>
        </span>

        {showMode && (
          <span className="wkrow__md">
            <Tag tone={mode === 'remote' ? 'remote' : 'floor'}>
              {mode === 'remote' ? 'Online' : 'In person'}
            </Tag>
          </span>
        )}

        {showStatus && (
          <span className="wkrow__st">
            <Tag tone={state.tone}>{state.label}</Tag>
          </span>
        )}
      </span>

      <span className="wkrow__act">{menu}</span>
    </div>
  );
}
