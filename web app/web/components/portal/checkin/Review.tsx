'use client';

import type { CheckInDetailWire, Step } from '@/lib/portal/checkin';

/**
 * EVERY ASK AND WHAT WAS SAID — the last screen before it goes, and the record
 * afterwards.
 *
 * One component for both, and that is deliberate rather than economical: the
 * thing a client checks before sending and the thing they read back after
 * sending are the same list, and two renderings of it would eventually
 * disagree about a skipped tape. The only difference is `onEdit` — absent once
 * the check-in has come back, because at that point nothing on it can change.
 *
 * ── AN UNANSWERED ASK IS DRAWN, AND SAYS SO IN A WORD ───────────────────────
 *
 * The obvious alternative is to list only what was answered, and it is wrong in
 * the one direction that matters: the whole purpose of this screen is to let
 * somebody notice the four they meant to come back to. *Not given*, in ink-off
 * italics, with no tone on it — a skipped tape is not an error and colouring it
 * would make the review a list of failures.
 */
export function Review({
  data,
  steps,
  onEdit,
}: {
  data: CheckInDetailWire;
  steps: Step[];
  /** Jump back to this step. Absent on a check-in that has been sent. */
  onEdit?: (index: number) => void;
}) {
  return (
    <div>
      {steps.map((step, i) => {
        const said = saidFor(step, data);
        const row = (
          <>
            <span className="pchk__rq">
              {step.kind === 'measurement' ? step.measurement.label : step.question.text}
            </span>
            <span className={said === null ? 'pchk__ra pchk__ra--off' : 'pchk__ra'}>
              {said ?? 'Not given'}
            </span>
          </>
        );

        /* A row is a BUTTON only where it does something. The same rule
           `ListRow` applies to its three forms: an element that answers a press
           with nothing is the false affordance, and on a sent check-in every
           row is exactly that. */
        return onEdit ? (
          <button key={step.id} type="button" className="pchk__r" onClick={() => onEdit(i)}>
            {row}
          </button>
        ) : (
          <div key={step.id} className="pchk__r">
            {row}
          </div>
        );
      })}
    </div>
  );
}

/**
 * What this ask holds, as one line — or null where nothing was given.
 *
 * The option IDS are resolved against the question the check-in was cut from,
 * never against the bank: an id drawn on a screen is not an answer, and the
 * template is what was actually asked on the day. `assessmentDetail` makes the
 * same join on the trainer's side and says the same thing about it.
 */
function saidFor(step: Step, data: CheckInDetailWire): string | null {
  if (step.kind === 'measurement') {
    const r = data.readings.find((x) => x.key === step.id);
    if (!r) return null;
    const unit = step.measurement.unit;
    /* A space before every unit but the percent sign, which is set against its
       figure everywhere else in this product. `Change`'s own note records what
       the alternative costs: the disagreement lives in the STRING, so no
       stylesheet can catch two spellings of one number. */
    return unit === '%' ? `${r.value}%` : unit === '' ? String(r.value) : `${r.value} ${unit}`;
  }

  const a = data.answers.find((x) => x.questionId === step.id);
  if (!a) return null;
  const q = step.question;

  if (q.kind === 'yesno') return a.yes === null ? null : a.yes ? 'Yes' : 'No';
  if (q.kind === 'rating') return a.rating === null ? null : `${a.rating} out of ${q.scale ?? 10}`;
  if (q.kind === 'text') return a.text;

  const chosen = q.options.filter((o) => a.optionIds.includes(o.id)).map((o) => o.text);
  if (a.text) chosen.push(a.text);
  return chosen.length === 0 ? null : chosen.join(', ');
}
