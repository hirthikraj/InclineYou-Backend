'use client';

import { useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { SpecialityPicker } from '@/components/profile/SpecialityPicker';
import { saveList } from '@/lib/setup/actions';
import { SPECIALITY_CAP } from '@/lib/setup/options';
import type { SetupState } from '@/lib/setup/steps';
import { StepHead } from './SetupShell';
import { StepFoot } from './StepFoot';
import { useStepAction } from './useStepAction';

/**
 * Frame 5b · `/setup/specialities` — step 3, and the cap.
 *
 * The chips, the live counter and the refusal at the cap are
 * `SpecialityPicker`, shared with the Specialities tab of `/settings/profile`.
 * What is left here is the step: the heading, the empty-answer message, and the
 * foot.
 *
 * **MEASURED BUG, FIXED — and it is the same bug on four steps.**
 *
 * `saveList` writes an empty array happily and deliberately, but it only calls
 * `answered(step)` when the list is non-empty. So Continue with nothing picked
 * used to WRITE, navigate, and leave the step neither answered nor skipped —
 * which means `nextStep` sends the trainer straight back to it on the next
 * sign-in. The flow's own promise is that nothing in this product asks twice.
 *
 * This step and languages have no Skip, and that is the reason: they are the
 * two answers a client reads. If there is no Skip then an empty list is not a
 * quiet way of skipping, so Continue says so rather than pretending to save.
 *
 * (The cost, stated: a resumed trainer cannot CLEAR every speciality from
 * inside setup. Clearing an answer you already gave is Settings' job — and as
 * of the profile tabs, Settings is now where it can actually be done.)
 */
export function SpecialitiesForm({ state }: { state: SetupState }) {
  const { run, pending, message, setMessage } = useStepAction();
  const [chosen, setChosen] = useState<string[]>(state.specialities);

  function submit() {
    if (chosen.length === 0) {
      setMessage({
        tone: 'err',
        icon: 'warn',
        lead: 'Pick at least one.',
        rest: 'This step has no Skip because it is the first thing a client reads about you — and up to five is the whole ask.',
      });
      return;
    }
    run(() => saveList('specialities', chosen));
  }

  return (
    <>
      <StepHead
        title="What do you coach best?"
        sub={`Pick up to ${SPECIALITY_CAP} — these show on your profile.`}
      />

      <SpecialityPicker
        value={chosen}
        disabled={pending}
        onChange={(next) => {
          setChosen(next);
          if (message) setMessage(null);
        }}
      />

      <MessageSlot message={message} />

      <p className="small" style={{ maxWidth: '64ch' }}>
        The cap is the point: a trainer who “does everything” tells a client nothing.
      </p>

      <StepFoot step="specialities" pending={pending} onContinue={submit} />
    </>
  );
}
