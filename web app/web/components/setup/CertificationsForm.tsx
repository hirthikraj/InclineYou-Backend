'use client';

import { useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { CertificationPicker } from '@/components/profile/CertificationPicker';
import { saveList, skipStep } from '@/lib/setup/actions';
import type { SetupState } from '@/lib/setup/steps';
import { StepHead } from './SetupShell';
import { StepFoot } from './StepFoot';
import { useStepAction } from './useStepAction';

/**
 * `/setup/certifications` — step 4, and the one step where the category is
 * quietly dishonest.
 *
 * The catalogue, the search, the escape hatch and the callout that keeps the
 * whole thing honest now live in `CertificationPicker`, because
 * `/settings/profile` asks for exactly the same object and a trainer editing
 * their certifications later must not meet a second, subtly different version
 * of the screen that collected them. What is left here is what is genuinely the
 * STEP rather than the field: the heading, the empty-answer message, and a foot
 * with a Skip on it.
 */
export function CertificationsForm({ state }: { state: SetupState }) {
  const { run, pending, message, setMessage } = useStepAction();
  const [chosen, setChosen] = useState<string[]>(state.certifications);

  /**
   * Empty is not an answer — see `SpecialitiesForm.submit` for the bug. This
   * step is different in one way that matters: it HAS a Skip, and it has a real
   * "none" answer, so the message names both rather than insisting on a pick.
   * *Not certified yet* is the option trainers miss most on this screen; being
   * told about it here is the one place it gets a second chance.
   */
  function submit() {
    if (chosen.length === 0) {
      setMessage({
        // Amber, not red: this step HAS a Skip, so nothing is being refused —
        // the trainer is being told what their three options are. Red is
        // reserved for the four steps that cannot be left unanswered (name,
        // experience, specialities, languages), which is the whole rule.
        tone: 'warn',
        icon: 'warn',
        lead: 'Nothing picked yet.',
        rest: 'Choose one, tap “Not certified yet” — plenty of excellent trainers do — or press Skip for now.',
      });
      return;
    }
    run(() => saveList('certifications', chosen));
  }

  return (
    <>
      <StepHead
        title="Any certifications?"
        sub="Optional. Plenty of excellent trainers in India don’t have one."
      />

      <CertificationPicker
        value={chosen}
        onChange={(next) => {
          if (message) setMessage(null);
          setChosen(next);
        }}
      >
        <MessageSlot message={message} />
      </CertificationPicker>

      <StepFoot
        step="certifications"
        pending={pending}
        onContinue={submit}
        onSkip={() => run(() => skipStep('certifications'))}
      />
    </>
  );
}
