'use client';

import type { PortalExerciseWire } from '@/lib/portal/api';
import { Message } from '@/web-components/ui/Message';
import { Modal, ModalHost } from '@/web-components/ui/Modal';

/**
 * How a movement is done — the panel a *How it's done* button opens.
 *
 * ── ONE COPY, TWO CALLERS, AND THAT IS WHY IT IS ITS OWN FILE ───────────────
 *
 * `ExerciseCard` in the workout flow and `ExerciseRow` on Plan's day screens
 * both open this. Two copies would be two places the trainer's line, the steps
 * and the generic pointers are ranked and labelled, and the labelling is the one
 * thing on this panel that must not drift — see below.
 *
 * ── IT USED TO OPEN A VIDEO, AND THE PRODUCT DOES NOT SUPPORT ONE ───────────
 *
 * The panel was reached by a play disc on a `ClipThumb`, drew that poster again
 * at full size, and then carried a `Message tone="warn"` reading *"The clip
 * itself is not wired up in this prototype — the poster and its length are real,
 * the file is not."* A surface whose lead content is a placeholder plus an
 * apology for it is worse than one that never offered it: the disc is a promise
 * the product cannot keep, which is the dead-affordance defect this codebase
 * keeps deleting (`.omni` on fifteen screens, the bell on twenty, `DayColumn`'s
 * inert grip).
 *
 * So the poster and the apology are both gone, and **what is left is what was
 * always the useful half of a demo**: the trainer's own cue, the steps in order,
 * and what to watch for. The trigger is a plain text button on the row rather
 * than an image, which is also the honest shape — a thumbnail promises footage.
 *
 * ── THE TWO KINDS OF INSTRUCTION ARE LABELLED APART, AND THAT IS LOAD-BEARING ─
 *
 * `cue` is `program_exercise.notes` — the line THIS trainer typed for THIS
 * client. `formCues` is the library's generic imperative, identical for everyone
 * who has ever been prescribed the movement. `AGENTS.md` states the cost of
 * blurring them: *"a client who reads 'keep your chest up' and believes their
 * trainer wrote it for them has been misled about the one thing this product
 * sells."* So the cue is attributed and leads; the generic pointers are last and
 * are never presented as anybody's words.
 */
export function HowTo({
  exercise,
  trainerFirstName,
  onClose,
}: {
  exercise: PortalExerciseWire;
  /** Whose line the cue is, so the attribution is a person and not "your trainer". */
  trainerFirstName: string;
  onClose: () => void;
}) {
  return (
    <ModalHost onClose={onClose}>
      <Modal
        title={`${exercise.name} — how it's done`}
        width={640}
        cancel={{ label: 'Close', onClick: onClose }}
      >
        <div className="col gap4">
          {/* The trainer's own line first, where there is one, because it is the
              one thing on this panel written for THIS person. `ExerciseRow` and
              `ExerciseCard` both draw it in place too; here it is repeated
              because the panel covers the row it came from. */}
          {exercise.cue && (
            <Message tone="ok">
              <b>{exercise.cue}</b>
              <span className="small ink3"> — {trainerFirstName}</span>
            </Message>
          )}

          {exercise.steps && (
            <div className="col gap3">
              <p className="micro">STEP BY STEP</p>
              {exercise.steps.split('\n\n').map((step, i) => (
                <p key={i} className="small">
                  <b className="ink">{i + 1}.</b> {step}
                </p>
              ))}
            </div>
          )}

          {exercise.formCues.length > 0 && (
            <div className="col gap2">
              {/* Not *{trainer} says* — these are the library's, and the panel
                  above is where a personal line goes. */}
              <p className="micro">WATCH FOR</p>
              <ul className="small" style={{ paddingLeft: 18, listStyle: 'disc' }}>
                {exercise.formCues.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Everything above is conditional, and a movement the trainer has
              neither cued nor described would otherwise open an empty panel.
              `ExerciseRow` and `ExerciseCard` both withhold the trigger in that
              case, so this is a backstop rather than a state a client meets —
              but a modal that can render nothing is one that eventually does. */}
          {!exercise.cue && !exercise.steps && exercise.formCues.length === 0 && (
            <p className="small">
              There is nothing written down for this one yet. Ask {trainerFirstName} to
              walk you through it.
            </p>
          )}
        </div>
      </Modal>
    </ModalHost>
  );
}
