'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { PortalWorkoutWire } from '@/lib/portal/api';
import { finishWorkout, saveSet, swapExercise } from '@/lib/portal/actions';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';
import { Meter } from '@/web-components/ui/Meter';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Row, Table } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';

import { Done } from './Done';
import { ExerciseCard, type Draft } from './ExerciseCard';

/**
 * §2 · the workout flow. **"Used standing up, one-handed, possibly sweaty."**
 *
 * ── THREE STAGES, AND TWO OF THEM ARE DERIVED FROM THE SERVER ───────────────
 *
 * | stage | when | §2 |
 * | --- | --- | --- |
 * | `pre` | nothing logged and *Begin* not pressed | *"overview of what's coming"* |
 * | `run` | anything logged, or *Begin* pressed | the per-exercise cards |
 * | `done` | `endedAt !== null` | the celebration, the summary, the question |
 *
 * Only the middle boundary is local state, and it has to be: whether somebody
 * has READ the overview is a fact about a moment, not about the workout, and
 * putting it in the URL would make *Begin* a navigation that a back button
 * un-presses. The other two are the server's — a log with sets in it is a log
 * in progress whichever device is looking at it, and a log with `endedAt` is
 * finished for good.
 *
 * That is what makes the flow survivable: a client who locks their phone
 * between sets, or opens it on a laptop, lands back in `run` on the same
 * workout with the same sets in it, because the stage is a fact about the data.
 *
 * ── ONE MOVEMENT AT A TIME, WHICH THE TRAINER'S CONSOLE DOES NOT DO ─────────
 *
 * The console draws every exercise in a column with a list rail beside it,
 * because a trainer is running somebody else's session and reading ahead. A
 * client is DOING it: §2's user "hired a trainer *because* they don't know what
 * they're doing", and a screen showing six movements at once asks them to
 * decide which one is next — a decision the program already made.
 *
 * So it is one card, with a progress meter above it and *Next* below. Reading
 * ahead is still possible, and it is `pre`'s job.
 *
 * ── THE SETS ARE SAVED ONE AT A TIME, ON THE TICK ───────────────────────────
 *
 * Not on a Next and not on a Finish. A workout is the one screen in this
 * product that somebody puts down mid-use, and a batch that flushed at the end
 * would lose a session to a locked screen — the whole reason `SetRows` grew a
 * per-row commit rather than a footer Save.
 *
 * The drafts are local until the tick, so typing is instant. §2's *"last time's
 * numbers, pre-filled — they confirm or adjust; most sets need no typing"* is
 * what `seedDrafts` does, and it is why the common gesture is one tap.
 */
type Stage = 'pre' | 'run' | 'done';

/**
 * §2's pre-fill. Last time's numbers, per set slot.
 *
 * The LAST SESSION's, never the best ever — `lastTimeFor` in `mock/portal.ts`
 * carries the argument: a client who hit 70kg once in June and has been working
 * at 62.5 since would open every set pre-filled with a weight they cannot lift,
 * and the first thing the flow asked them to do would be to correct it.
 *
 * Where last time is short a slot — three sets last week, four this — the slot
 * falls back to the LAST set they did rather than to empty. It is the honest
 * guess: whatever they finished on is what they are starting a fourth from.
 */
function seedDrafts(row: PortalWorkoutWire['exercises'][number]): Record<number, Draft> {
  const out: Record<number, Draft> = {};
  const target = row.targetSets ?? 3;
  const last = row.lastTime?.sets ?? [];
  const tail = last[last.length - 1] ?? null;

  for (let n = 1; n <= Math.max(target, row.sets.length); n += 1) {
    const done = row.sets.find((s) => s.setNumber === n);
    if (done) {
      /* Already logged. The draft mirrors the SERVER's value, so a client who
         re-opens a finished set sees what is stored rather than what they were
         about to type before they closed the tab. */
      out[n] = {
        load: done.loadKg !== null ? String(done.loadKg) : '',
        reps: done.reps !== null ? String(done.reps) : '',
      };
      continue;
    }
    const mine = last.find((s) => s.setNumber === n) ?? tail;
    out[n] = {
      load: mine?.loadKg != null ? String(mine.loadKg) : row.targetLoad != null ? String(row.targetLoad) : '',
      reps: mine?.reps != null ? String(mine.reps) : row.targetReps != null ? String(row.targetReps) : '',
    };
  }
  return out;
}

export function Flow({
  workout,
  trainerFirstName,
}: {
  workout: PortalWorkoutWire;
  trainerFirstName: string;
}) {
  const router = useRouter();

  const anyLogged = workout.exercises.some((e) => e.sets.length > 0);
  const [begun, setBegun] = useState(anyLogged);
  const [at, setAt] = useState(() => {
    /* Open on the first movement with an unfinished set, not on the first
       movement. A client resuming after a break should land where they stopped,
       and index 0 is where they stopped only on the first set of the day. */
    const i = workout.exercises.findIndex(
      (e) => e.sets.length < (e.targetSets ?? 3),
    );
    return i === -1 ? 0 : i;
  });

  const [drafts, setDrafts] = useState<Record<string, Record<number, Draft>>>(() => {
    const out: Record<string, Record<number, Draft>> = {};
    for (const row of workout.exercises) {
      if (row.exercise) out[row.exercise.id] = seedDrafts(row);
    }
    return out;
  });

  const [committing, setCommitting] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [rest, setRest] = useState<{
    exerciseId: string;
    endsAt: number;
    seconds: number;
    nextLabel: string | null;
  } | null>(null);
  const [swapping, startSwap] = useTransition();
  const [finishing, startFinish] = useTransition();
  const [confirmFinish, setConfirmFinish] = useState(false);

  const stage: Stage = workout.endedAt !== null ? 'done' : begun ? 'run' : 'pre';

  const totalTarget = useMemo(
    () => workout.exercises.reduce((n, e) => n + (e.targetSets ?? 3), 0),
    [workout.exercises],
  );
  const totalDone = useMemo(
    () => workout.exercises.reduce((n, e) => n + e.sets.length, 0),
    [workout.exercises],
  );

  const row = workout.exercises[at] ?? null;
  const exId = row?.exercise?.id ?? '';

  const onDraft = useCallback(
    (setNumber: number, field: 'load' | 'reps', value: string) => {
      setDrafts((d) => ({
        ...d,
        [exId]: {
          ...d[exId],
          [setNumber]: { ...(d[exId]?.[setNumber] ?? { load: '', reps: '' }), [field]: value },
        },
      }));
    },
    [exId],
  );

  const onCommit = useCallback(
    (setNumber: number) => {
      if (!row?.exercise) return;
      const draft = drafts[exId]?.[setNumber] ?? { load: '', reps: '' };
      const load = draft.load.trim() === '' ? null : Number(draft.load.replace(',', '.'));
      const reps = draft.reps.trim() === '' ? null : Number(draft.reps.replace(',', '.'));

      setCommitting(setNumber);
      setFailure(null);
      void (async () => {
        const res = await saveSet(workout.id, row.exercise!.id, setNumber, load, reps);
        setCommitting(null);
        if (!res.ok) {
          setFailure(res.message);
          return;
        }

        /* §2's *"rest timer, auto-starting on set completion"*, and it starts
           only when there IS a rest to spend. `startRest` on the trainer's
           console returns on a falsy `restSeconds` and says why: the trainer
           has not said how long, and a defaulted 60 seconds is a guess the
           product would then have to defend. The card's strip goes on saying
           nothing rather than counting an invented number. */
        const seconds = row.restSeconds;
        if (seconds && seconds > 0) {
          const target = row.targetSets ?? 3;
          const next = setNumber + 1;
          setRest({
            exerciseId: row.exercise!.id,
            endsAt: Date.now() + seconds * 1000,
            seconds,
            nextLabel:
              next <= target ? `Set ${next} of ${row.exercise!.name.toLowerCase()}` : null,
          });
        }
        /* The server is the source of what is logged, so the card redraws from
           a refetch rather than from an optimistic splice — a set is the one
           thing on this screen that must not appear to have saved when it has
           not. `saveSet` revalidates this route; this is what applies it. */
        router.refresh();
      })();
    },
    [drafts, exId, row, router, workout.id],
  );

  const onSwap = useCallback(
    (toExerciseId: string) => {
      if (!row?.exercise) return;
      const from = row.exercise.id;
      startSwap(async () => {
        setFailure(null);
        const res = await swapExercise(workout.id, from, toExerciseId);
        if (!res.ok) {
          setFailure(res.message);
          return;
        }
        /* The drafts for the OLD movement are dropped and the new one is seeded
           on the next render from its own `lastTime`. Carrying them across would
           pre-fill a dumbbell press with a barbell's load — which is the one
           number a client is most likely to accept without reading. */
        router.refresh();
      });
    },
    [row, router, workout.id],
  );

  /* ── pre-workout · §2's overview ────────────────────────────────────────── */
  if (stage === 'pre') {
    return (
      <div className="portal col gap4">
        <Card level={2}>
          <CardHead title={workout.dayLabel ?? 'Today’s workout'}>
            {workout.programName && <span className="small ink3">{workout.programName}</span>}
          </CardHead>
          <CardBody>
            <p className="h4" style={{ fontSize: 17 }}>
              {workout.exercises.length} exercises · {totalTarget} sets
            </p>
            <p className="small mt2">
              {/* §2: *"Reduces the 'what am I in for' hesitation that stops
                  people starting."* So the estimate is stated, and it is
                  stated as an estimate — a client who is told 45 minutes and
                  takes 70 has been misled by a number nobody needed. */}
              Roughly {Math.max(20, Math.round(totalTarget * 3))} minutes, depending on
              how long you rest.
            </p>
          </CardBody>
          <CardBody flush divided>
            {/* A real `Table`: four columns somebody reads ACROSS to decide
                whether to start — the movement, what is planned, and what they
                managed last time. `Table`'s own boundary applies the other way
                from the Plan screen's day list, where the same movements are a
                list to be found in rather than a grid to be compared. */}
            <Table
              caption={`${workout.dayLabel ?? 'Today'}, ${workout.exercises.length} exercises`}
              columns={[
                /* There was a fifth column here holding a 96px `ClipThumb` per
                   row. **The product does not support video**, so it drew a
                   poster with no file behind it — see `HowTo` — and its removal
                   gives the movement's own name the width instead. */
                { key: 'exercise', label: 'Exercise' },
                { key: 'planned', label: 'Planned', numeric: true },
                { key: 'last', label: 'Last time', numeric: true },
              ]}
            >
              {/* Keyed by the movement, falling back to the INDEX and never to
                  a random — which the purity rule refuses and which would also
                  remount the row on every render. An exercise the library could
                  not resolve is a real case and the index is stable for it. */}
              {workout.exercises.map((e, i) => (
                <Row
                  key={e.exercise?.id ?? `row-${i}`}
                  cells={[
                    {
                      key: 'exercise',
                      content: <span className="strong">{e.exercise?.name ?? 'Exercise'}</span>,
                    },
                    {
                      key: 'planned',
                      numeric: true,
                      content: `${e.targetSets ?? '—'} × ${e.targetReps ?? '—'}`,
                    },
                    {
                      key: 'last',
                      numeric: true,
                      className: 'ink3',
                      content: e.lastTime ? `${e.lastTime.bestLoadKg || '—'} kg` : 'first time',
                    },
                  ]}
                />
              ))}
            </Table>
          </CardBody>
          <CardBody divided>
            <Button variant="primary" wide onClick={() => setBegun(true)}>
              Begin
            </Button>
          </CardBody>
        </Card>

        {workout.exercises.length === 0 && (
          <Card>
            <CardBody>
              {/* A workout with no movements. `mock/portal.ts` produces this
                  deliberately rather than guessing five exercises: a client's
                  flow is never a free choice from the library, so a log with no
                  program behind it is empty and says so. */}
              <Message tone="warn">
                Your trainer has not set a plan for today. Have a word with them —
                there is nothing for this screen to show you yet.
              </Message>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }

  /* ── done · §2's celebration, summary and one question ─────────────────── */
  if (stage === 'done') {
    return <Done workout={workout} />;
  }

  /* ── running ──────────────────────────────────────────────────────────── */
  const allSetsIn = totalDone >= totalTarget;

  return (
    <div className="portal col gap4">
      {/* §2's *"progress bar through the session — completion is genuinely
          motivating."* `Meter`, with an explicit total so the unspent sets are
          a real gap rather than a short bar. */}
      <div className="col gap2">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <p className="h5">
            {totalDone} of {totalTarget} sets
          </p>
          <p className="small ink3">{workout.dayLabel ?? 'Today'}</p>
        </div>
        <Meter
          size="lg"
          label="Sets logged in this workout"
          total={totalTarget}
          segments={[{ tone: 'ok', value: totalDone, label: 'logged' }]}
        />
      </div>

      {row && (
        <ExerciseCard
          row={row}
          trainerFirstName={trainerFirstName}
          index={at}
          total={workout.exercises.length}
          drafts={drafts[exId] ?? {}}
          onDraft={onDraft}
          onCommit={onCommit}
          committing={committing}
          failure={failure}
          rest={rest && rest.exerciseId === exId ? rest : null}
          onExtendRest={() =>
            setRest((r) =>
              /* +15 from NOW, not from an end already receding into the past —
                 the trainer console's own rule for the same control. */
              r ? { ...r, endsAt: Math.max(r.endsAt, Date.now()) + 15_000 } : r,
            )
          }
          onDismissRest={() => setRest(null)}
          onSwap={onSwap}
          swapping={swapping}
        />
      )}

      {/* ── moving between movements ───────────────────────────────────────

          Two buttons and a count, and *Next* is the primary until the last
          movement — where *Finish* takes over. A screen with *Next* and
          *Finish* both live invites the client to end the session one movement
          early, which is the mis-tap that costs them a set and the trainer a
          record. */}
      <div className="row gap3" style={{ flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          disabled={at === 0}
          onClick={() => {
            setAt((i) => Math.max(0, i - 1));
            setFailure(null);
          }}
        >
          Back
        </Button>
        {at < workout.exercises.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => {
              setAt((i) => i + 1);
              setFailure(null);
              /* The clock does not travel with the client. A rest after a bench
                 set is not a rest before a row, and a strip counting down on a
                 movement they have not started is a number about nothing. */
              setRest(null);
            }}
          >
            Next exercise
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setConfirmFinish(true)}>
            Finish
          </Button>
        )}
        <span className="sp" />
        {at < workout.exercises.length - 1 && (
          <Button variant="ghost" onClick={() => setConfirmFinish(true)}>
            Finish early
          </Button>
        )}
      </div>

      {confirmFinish && (
        <ModalHost onClose={() => setConfirmFinish(false)}>
          <Modal
            title={allSetsIn ? 'Finish this workout?' : 'Finish with sets still to go?'}
            width={460}
            cancel={{ label: 'Keep going', onClick: () => setConfirmFinish(false) }}
            confirm={{
              label: 'Finish',
              onClick: () =>
                startFinish(async () => {
                  setConfirmFinish(false);
                  /* No effort answer HERE. §2 asks the question after the
                     summary, not instead of it — the client has to see what
                     they did before they can say how it felt. `Done` asks. */
                  const res = await finishWorkout(workout.id);
                  if (!res.ok) setFailure(res.message);
                  else router.refresh();
                }),
            }}
          >
            {allSetsIn ? (
              <p className="small">
                {totalDone} sets logged. This closes the workout and tells{' '}
                {workout.programName ? 'your trainer' : 'your trainer'} you trained.
              </p>
            ) : (
              <>
                <p className="small">
                  You have logged {totalDone} of {totalTarget} sets. Anything not
                  ticked is not saved.
                </p>
                {/* NOT a warning tone, and not a reproach. §1's rule is the
                    whole product's: a short session is still a session, and a
                    screen that scolds somebody for leaving early is a screen
                    they do not come back to. */}
                <p className="small mt3 ink3">
                  A short session counts. You can finish whenever you like.
                </p>
              </>
            )}
          </Modal>
        </ModalHost>
      )}

      {finishing && (
        <Message tone="ok">
          <Tag tone="acc">Saving</Tag> Closing your workout…
        </Message>
      )}
    </div>
  );
}
