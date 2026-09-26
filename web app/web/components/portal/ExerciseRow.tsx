'use client';

import { useState } from 'react';

import type { PortalExerciseWire } from '@/lib/portal/api';
import { exerciseHref } from '@/lib/portal/progress-tabs';
import { Button } from '@/web-components/ui/Button';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { Message } from '@/web-components/ui/Message';

import { HowTo } from './HowTo';

/**
 * One movement on a plan day, read before the session rather than during it.
 *
 * ── IT REPLACES `ClipRow`, AND THE HOLE IT FILLS IS THE ONE THAT LEFT ───────
 *
 * `ClipRow` was a `ListRow` whose leading element was a `ClipThumb`, and its own
 * comment said the row deliberately **did not navigate** — the clip was the
 * affordance. The product does not support video, so removing the clip left ~25
 * rows a client could look at and not act on, and it took away the only reason
 * any of them existed as a control.
 *
 * What it also left behind is the more interesting half. That comment recorded a
 * second decision: *"the cue is NOT here, which is a decision — `.lrow__s`
 * ellipsises, so the cue would arrive truncated, and a truncated instruction is
 * worse than none."* Correct about the component and wrong about the answer: the
 * cue is what §"Make the trainer present" calls the differentiator (*"Notes,
 * cues, personal messages — these are what separate you from a free workout
 * app"*), and it was therefore unreachable from the Plan screen entirely.
 *
 * So this is not a `ListRow`. It is a block that can hold a sentence, on a route
 * that exists to hold it — see `planDayHref` for why a day is a place.
 *
 * ── THE TWO KINDS OF INSTRUCTION STAY LABELLED APART ────────────────────────
 *
 * `cue` is the trainer's own line for this client and is attributed by name;
 * `formCues` is the library's, identical for everyone, and is never presented as
 * anybody's words. `HowTo` carries the cost of blurring them.
 *
 * ── AND THE ROW LEADS SOMEWHERE ─────────────────────────────────────────────
 *
 * Two doors, and neither is a video. *How it's done* opens the written steps —
 * the same panel the workout flow opens, so the two cannot drift. The name links
 * to `/me/progress/exercises/[id]`, which answers *what have I actually lifted
 * on this*: a client reading Thursday's plan wants last month's numbers, and
 * that screen already draws them.
 */
export function ExerciseRow({
  index,
  exercise,
  sets,
  reps,
  targetLoad,
  restSeconds,
  trainerFirstName,
}: {
  /** 1-based, so the day reads as an order rather than as a set. */
  index: number;
  exercise: PortalExerciseWire | null;
  sets: number | null;
  reps: number | null;
  targetLoad: number | null;
  restSeconds: number | null;
  trainerFirstName: string;
}) {
  const [open, setOpen] = useState(false);

  /* A program row whose movement the library could not resolve. Rare and real —
     the row still says what was prescribed, because the prescription is the
     trainer's and does not stop being true because a name is missing. */
  if (!exercise) {
    return (
      <div className="plnex">
        <span className="plnex__n">{index}</span>
        <div className="col gap1">
          <p className="strong">Exercise</p>
          <p className="small ink3">
            {sets ?? '—'} × {reps ?? '—'}
          </p>
        </div>
      </div>
    );
  }

  const hasHowTo = Boolean(exercise.steps) || exercise.formCues.length > 0 || Boolean(exercise.cue);

  return (
    <div className="plnex">
      {/* The ordinal, because a day is a sequence and a client works down it.
          Tabular, so seven of them line up. */}
      <span className="plnex__n">{index}</span>

      <div className="col gap2" style={{ minWidth: 0 }}>
        <div className="plnex__hd">
          <p className="strong">
            <InlineLink href={exerciseHref(exercise.id)}>{exercise.name}</InlineLink>
          </p>
          {/* The prescription, as one figure rather than three columns. A table
              was tried on the old screen and `AGENTS.md` records what it cost:
              §11 gives every cell `nowrap`, so a cue in one made the name column
              909px and the table 1113 inside a 920px portal. */}
          <p className="plnex__rx">
            {sets ?? '—'} × {reps ?? '—'}
            {targetLoad ? <span className="ink3"> @ {targetLoad} kg</span> : null}
          </p>
        </div>

        <p className="small ink3">
          {[
            exercise.muscleGroup,
            exercise.equipment,
            restSeconds ? `${restSeconds}s rest` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {/* ── the trainer's own line, in full ──────────────────────────────

            The reason this screen has a day route at all. Not truncated, not
            behind a tap, and attributed — a client who reads it should know who
            wrote it. */}
        {exercise.cue && (
          <Message tone="ok">
            <b>{exercise.cue}</b>
            <span className="small ink3"> — {trainerFirstName}</span>
          </Message>
        )}

        {/* Withheld where there is nothing behind it, so it can never open an
            empty panel. Ghost and small: it is the third thing on the row, and
            the prescription and the cue are the first two. */}
        {hasHowTo && (
          <div className="row">
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              How it’s done
            </Button>
          </div>
        )}
      </div>

      {open && (
        <HowTo
          exercise={exercise}
          trainerFirstName={trainerFirstName}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
