'use client';

import { useState } from 'react';

import type { PortalWorkoutExerciseWire } from '@/lib/portal/api';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { SetRows, type SetLine } from '@/web-components/ui/SetRow';
import { Tag } from '@/web-components/ui/Tag';

import { HowTo } from '../HowTo';
import { RestTimer } from './RestTimer';

export type Draft = { load: string; reps: string };

/**
 * One movement, mid-workout. §2's per-exercise list, in order:
 *
 * | §2 asks for | here |
 * | --- | --- |
 * | Exercise name, large | the card's `<h2>` at 19px |
 * | Demo video thumbnail — tap to play | **not built** — no video support |
 * | Target: sets, reps, weight | the head's right-hand line |
 * | Last time's numbers, pre-filled | the drafts, seeded by the caller |
 * | The trainer's cue for this exercise | `.msg`, leading the card |
 * | Rest timer, auto-starting | `RestTimer`, started by the tick |
 * | Swap exercise | one secondary, and only when one is approved |
 *
 * ── THE CUE IS THE HIGHEST-VALUE THING ON THIS CARD ─────────────────────────
 *
 * §2: *"The trainer's cue for this exercise — 'keep your chest up, don't rush
 * the way down.' This is where trainer presence lives."* So it is drawn as a
 * `Message` rather than as small print: a bordered strip with a glyph, above
 * the numbers, in the register of somebody talking to you.
 *
 * The FALLBACK is the distinction worth keeping. `exercise.cue` is
 * `program_exercise.notes` — the line the trainer typed for THIS person — and
 * `formCues` is the library's generic imperative, true of every client who ever
 * did the movement. They are labelled apart, because a client who reads *"keep
 * your chest up"* and believes their trainer wrote it for them has been misled
 * about the one thing this product is selling.
 */
export function ExerciseCard({
  row,
  trainerFirstName,
  index,
  total,
  drafts,
  onDraft,
  onCommit,
  committing,
  failure,
  rest,
  onExtendRest,
  onDismissRest,
  onSwap,
  swapping,
}: {
  row: PortalWorkoutExerciseWire;
  /** Whose line the cue is. `HowTo` carries why it is attributed by name. */
  trainerFirstName: string;
  index: number;
  total: number;
  /** One per set slot, keyed by set number. Seeded from `lastTime`. */
  drafts: Record<number, Draft>;
  onDraft: (setNumber: number, field: 'load' | 'reps', value: string) => void;
  onCommit: (setNumber: number) => void;
  committing: number | null;
  failure: string | null;
  /** The clock, when this movement's rest is the one running. */
  rest: { endsAt: number; seconds: number; nextLabel: string | null } | null;
  onExtendRest: () => void;
  onDismissRest: () => void;
  onSwap: (toExerciseId: string) => void;
  swapping: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [asking, setAsking] = useState(false);
  const ex = row.exercise;

  if (!ex) return null;

  const target = row.targetSets ?? row.sets.length ?? 3;
  const logged = row.sets.length;

  /* The slots. One per prescribed set, plus any extra already logged — a client
     who did a fourth set of three keeps it, because it happened. */
  const slots = Array.from({ length: Math.max(target, logged) }, (_, i) => i + 1);

  const lines: SetLine[] = slots.map((n) => {
    const done = row.sets.find((s) => s.setNumber === n);
    const draft = drafts[n];
    const lastSet = row.lastTime?.sets.find((s) => s.setNumber === n) ?? null;
    return {
      n,
      load: draft?.load ?? (done?.loadKg !== undefined && done?.loadKg !== null ? String(done.loadKg) : ''),
      reps: draft?.reps ?? (done?.reps !== undefined && done?.reps !== null ? String(done.reps) : ''),
      last: lastSet
        ? `${lastSet.loadKg ?? '—'} × ${lastSet.reps ?? '—'}`
        : undefined,
      state: done ? 'done' : 'pending',
    };
  });

  return (
    <Card>
      <CardHead title={ex.name} level={2}>
        <span className="small ink3">
          {index + 1} of {total}
        </span>
        {row.swappedFromExerciseId && <Tag>Swapped</Tag>}
      </CardHead>

      <CardBody>
        {/* ── WHERE §2's DEMO VIDEO USED TO BE ───────────────────────────────

            A 260px `ClipThumb` led this card, with a play disc on it wherever
            `Db.clips` held a length. **The product does not support video** and
            the map had no files behind it, so the disc opened a panel that
            apologised for itself — the dead affordance this codebase keeps
            deleting. Both are gone.

            What replaces it is not a smaller picture. §2 also asks for *"the
            trainer's cue for this exercise — this is where trainer presence
            lives"*, and with the poster gone that cue is the first thing on the
            card and takes the full width instead of sharing it with an image.
            The written steps are one tap behind *How it's done*. */}
        <div className="col gap3">
          <p className="h4" style={{ fontSize: 15 }}>
            {target} sets of {row.targetReps ?? '—'}
            {row.targetLoad ? (
              <span className="ink3" style={{ fontWeight: 500 }}> @ {row.targetLoad} kg</span>
            ) : null}
          </p>
          {ex.muscleGroup && <p className="small ink3">{ex.muscleGroup}</p>}

          {/* ── the cue ──────────────────────────────────────────────────

              Attributed by name where it is the trainer's own. The fallback is
              the library's generic pointers and is labelled as such — `HowTo`
              carries the cost of letting a client mistake one for the other. */}
          {ex.cue ? (
            <Message tone="ok">
              <b>{ex.cue}</b>
              <span className="small ink3"> — {trainerFirstName}</span>
            </Message>
          ) : ex.formCues.length > 0 ? (
            <div className="col gap2">
              <p className="micro">WATCH FOR</p>
              <ul className="small" style={{ paddingLeft: 18, listStyle: 'disc' }}>
                {ex.formCues.slice(0, 3).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* The written half of what the clip used to be. A ghost button and
              not a thumbnail: a thumbnail promises footage, and there is none.
              Withheld entirely where there is nothing behind it, so it can
              never open an empty panel. */}
          {(ex.steps || ex.formCues.length > 0 || ex.cue) && (
            <div className="row">
              <Button variant="ghost" size="sm" onClick={() => setPlaying(true)}>
                How it’s done
              </Button>
            </div>
          )}
        </div>
      </CardBody>

      {/* ── the sets ─────────────────────────────────────────────────────── */}
      <CardBody flush divided>
        <div className="tblwrap">
          <SetRows
            sets={lines}
            exercise={ex.name}
            /* §2's audience does not judge RPE — `webapp.css`'s own note is
               that the figure is "judged and typed once, not nudged", and a
               client asked for one would be guessing at a number their trainer
               uses to program. Four columns and a tick fit a 360px screen; five
               and a tick do not. */
            showRpe={false}
            onChange={(n, field, value) => {
              if (field === 'rpe') return;
              onDraft(n, field, value);
            }}
            onCommit={onCommit}
            committing={committing}
          />
        </div>
      </CardBody>

      {failure && (
        <CardBody divided>
          <Message tone="err" alert>
            {failure}
          </Message>
        </CardBody>
      )}

      {rest && (
        <CardBody divided>
          <RestTimer
            endsAt={rest.endsAt}
            seconds={rest.seconds}
            nextLabel={rest.nextLabel}
            onExtend={onExtendRest}
            onDismiss={onDismissRest}
          />
        </CardBody>
      )}

      {/* ── swap · §2's busy rack ─────────────────────────────────────────

          Drawn only when the trainer named a substitute. §2: *"Offer
          trainer-approved alternatives rather than letting them skip."* Where
          they named none, there is no control — the handler would refuse it
          (422 `NOT_APPROVED`), and a button that exists to be refused is worse
          than a sentence saying who to ask.

          And it goes once a set is logged, because the handler refuses that too
          — with a 409 this component would otherwise only discover by asking.
          `mock/portal.ts` carries the argument: a swap mid-movement either
          corrupts the history or orphans it. */}
      {row.alternative && logged === 0 && (
        <CardBody divided>
          <div className="row gap3" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setAsking(true)} disabled={swapping}>
              Machine taken?
            </Button>
            <p className="small" style={{ flex: 1, minWidth: '20ch' }}>
              Your trainer has set <b className="ink">{row.alternative.name}</b> as
              the swap for this one.
            </p>
          </div>
        </CardBody>
      )}
      {!row.alternative && logged === 0 && (
        <CardBody divided>
          <p className="small ink3">
            No swap set for this one. If you cannot get to it, message your trainer
            rather than skipping it.
          </p>
        </CardBody>
      )}

      {/* `HowTo` is shared with Plan's day screens — its own header carries why
          it was extracted, and it is the same panel from both doors so the two
          cannot drift about which instruction is whose. */}
      {playing && (
        <HowTo
          exercise={ex}
          trainerFirstName={trainerFirstName}
          onClose={() => setPlaying(false)}
        />
      )}

      {/* ── the swap confirm ───────────────────────────────────────────────

          A modal and not an inline toggle, because the answer changes what the
          client is about to lift and the two movements have to be readable side
          by side while it is asked. */}
      {asking && row.alternative && (
        <ModalHost onClose={() => setAsking(false)}>
        <Modal
          title="Swap this exercise?"
          width={480}
          /* `Modal`'s own pair rather than a hand-written foot: its docstring
             requires the heading to be a question and the confirm to name the
             verb, so the two read as one sentence — *Swap this exercise?* →
             *Swap to Dumbbell Bench Press*. And the cancel says what it KEEPS,
             which is `Modal`'s rule and is the more useful half here: the thing
             being kept is the movement the client is standing in front of. */
          cancel={{ label: `Keep ${ex.name}`, onClick: () => setAsking(false) }}
          confirm={{
            label: `Swap to ${row.alternative.name}`,
            onClick: () => {
              onSwap(row.alternative!.id);
              setAsking(false);
            },
          }}
        >
          <p className="small">
            {row.alternative.name} works the same thing and your trainer has
            approved it for this slot. Your targets stay the same.
          </p>
          <p className="small mt3 ink3">
            You can only swap before your first set — after that, finish the
            movement you started.
          </p>
        </Modal>
        </ModalHost>
      )}
    </Card>
  );
}
