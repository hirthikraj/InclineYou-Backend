'use client';

import { useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { IconClock } from '@/components/auth/Icons';
import { WeekPicker, weekProblem, type Week } from '@/components/profile/WeekPicker';
import { saveHours, skipStep } from '@/lib/setup/actions';
import type { StoredHour } from '@/lib/setup/api';
import { DEFAULT_DAYS, DEFAULT_WINDOWS, mergeWindows } from '@/lib/setup/hours';
import { StepHead } from './SetupShell';
import { StepFoot } from './StepFoot';
import { useStepAction } from './useStepAction';

/**
 * Frame 5c · `/setup/hours` — step 6, the week the diary reads.
 *
 * Asked at setup because **adding a client depends on it**: a client's days and
 * times are picked FROM these windows, so a trainer who reached "add a client"
 * with no hours on file would be choosing out of a default they never saw.
 *
 * **Skipping is not a hole.** A default week is seeded when the flow finishes,
 * and that seed stands down the moment any window exists — so answering here
 * replaces it rather than fighting it.
 *
 * The control itself is `WeekPicker`, shared with the *Work & hours* tab of
 * `/settings/profile` — the fifth of the flow's controls to be extracted rather
 * than copied, and the argument is the one the other four record. What is left
 * here is what only setup has: the Skip, the seed promise, and the sentences
 * that can offer that Skip as a way out.
 */
export function HoursForm({ stored }: { stored: StoredHour[] }) {
  const { run, pending, message } = useStepAction();

  // A resumed trainer sees the week they saved, not the default over it. The
  // windows come from the earliest saved day, because this screen keeps one set
  // for the whole week and per-day differences belong to the full editor.
  const savedDays = [...new Set(stored.map((h) => h.weekday))].sort((a, b) => a - b);
  const [week, setWeek] = useState<Week>(() => ({
    days: savedDays.length ? savedDays : DEFAULT_DAYS,
    windows:
      savedDays.length === 0
        ? DEFAULT_WINDOWS
        : mergeWindows(stored.filter((h) => h.weekday === savedDays[0])),
  }));
  const [pressed, setPressed] = useState(false);

  const problem = weekProblem(week);

  function submit() {
    setPressed(true);
    if (problem !== 'none') return;
    run(() => saveHours(week.days, week.windows));
  }

  return (
    <>
      <StepHead
        title="When do you work?"
        sub="Clients’ sessions are booked out of these windows, so the diary needs them before you add anybody."
      />

      <WeekPicker value={week} disabled={pending} onChange={setWeek} />

      {/* The two emptiness sentences, together and below the band rather than
          each under the row it is about. They belong to pressing Continue, not
          to the control — `weekProblem` is the shared verdict and this is the
          half of it only setup can write, because only setup has a Skip to
          offer as the other way out. `too-short` is the picker's own, and it
          draws it there. */}
      {pressed && problem === 'no-days' ? (
        <p className="fld__e" style={{ marginTop: 12 }}>
          Pick at least one day, or skip the step.
        </p>
      ) : pressed && problem === 'no-windows' ? (
        <p className="fld__e" style={{ marginTop: 12 }}>
          Add at least one window, or skip the step.
        </p>
      ) : null}

      {/* `.card__hd` + `.card__t`, like the packs panel and the completion
          meter. This used to hand-roll its title as a `<p>` with §17's `.h5`
          values (13px / 700 / ink) copied inline — three cards in one flow, and
          three different ways of putting a heading on one. */}
      <div className="card" style={{ marginTop: 22, maxWidth: 620 }}>
        <div className="card__hd">
          <span className="card__t">If you skip this</span>
        </div>
        <div className="card__b">
          <p className="small">
            A default week is seeded when the flow finishes, so the diary is never empty. The seed
            stands down the moment any window exists — so answering here replaces it rather than
            fighting it, and skipping is not a hole.
          </p>
        </div>
      </div>

      <MessageSlot message={message} />

      <div className="trust" style={{ maxWidth: '66ch' }}>
        <IconClock size={15} />
        <span>
          <b>These constrain what clients can book, never you.</b> One set of windows, applied to
          every day you pick — day-by-day differences are real but rare on day one, and the full
          per-day editor is one click from the diary.
        </span>
      </div>

      <StepFoot
        step="hours"
        pending={pending}
        onContinue={submit}
        onSkip={() => run(() => skipStep('hours'))}
      />
    </>
  );
}
