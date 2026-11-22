'use client';

import { useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { IconClock } from '@/components/auth/Icons';
import { WeekPicker, weekProblem, type Week } from '@/components/profile/WeekPicker';
import { saveHours, skipStep } from '@/lib/setup/actions';
import type { StoredHour } from '@/lib/setup/api';
import { DEFAULT_DAYS, DEFAULT_WINDOWS, mergeWindows } from '@/lib/setup/hours';
import type { SetupState } from '@/lib/setup/steps';
import { StepHead } from './SetupShell';
import { StepFoot, skipHomeAction } from './StepFoot';
import { useStepAction } from './useStepAction';

/**
 * Frame 5c · `/setup/hours` — step 6, the week the diary reads.
 *
 * Asked at setup because **adding a client depends on it**: a client's days and
 * times are picked FROM these windows, so a trainer who reached "add a client"
 * with no hours on file would be choosing out of a default they never saw.
 *
 * **Skipping is not a hole.** A default week (`DEFAULT_DAYS` × `DEFAULT_WINDOWS`)
 * is written by `seedDefaultWorkingHours` in `finishSetup` when the flow ends with
 * no hours on file, and it stands down the moment any window exists — so
 * answering here replaces it rather than fighting it. (Promised since the first
 * draft; built 22 Nov 2026.)
 *
 * The control itself is `WeekPicker`, shared with the *Work & hours* tab of
 * `/settings/profile` — the fifth of the flow's controls to be extracted rather
 * than copied, and the argument is the one the other four record. What is left
 * here is what only setup has: the Skip, the seed promise, and the sentences
 * that can offer that Skip as a way out.
 */
export function HoursForm({ stored, state }: { stored: StoredHour[]; state: SetupState }) {
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
        sub="Clients book their sessions inside these hours, so set them before you add anyone."
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

      {/* ONE LINE, NOT TWO BOXES (22 Nov 2026). *If you skip this* and the trust box said overlapping things in our own
          words ("the seed stands down", "skipping is not a hole", "the diary") and the second was half under the footer.
          What a trainer needs: what these hours do, that they are not a cage, and what Skip leaves them with — which is
          now true, because `finishSetup` writes the default week when no hours exist. */}
      <div className="trust stp__hrsnote">
        <IconClock size={15} />
        <span>
          <b>Clients can only book inside these hours — you can still book any time.</b> Skip this step and we’ll use
          Mon–Sat, 6–11 AM and 5–9 PM. Change it any time in Settings.
        </span>
      </div>

      <MessageSlot message={message} />

      <StepFoot
        step="hours"
        pending={pending}
        onContinue={submit}
        onSkip={() => run(() => skipStep('hours'))}
        onSkipHome={skipHomeAction(state, run)}
      />
    </>
  );
}
