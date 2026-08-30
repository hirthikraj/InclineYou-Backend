'use client';

import { useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { ExperiencePicker } from '@/components/profile/ExperiencePicker';
import { saveExperience } from '@/lib/setup/actions';
import type { SetupState } from '@/lib/setup/steps';
import { StepHead } from './SetupShell';
import { StepFoot } from './StepFoot';
import { useStepAction } from './useStepAction';

/**
 * `/setup/experience` — step 2. Not drawn as its own frame: §10 says five of the
 * eight steps are the same question a desk asks slightly better, and this is one
 * of them. Its rail hint is "one tap", which is the whole spec.
 *
 * The five chips and the reasoning for a band rather than a number now live in
 * `ExperiencePicker`, shared with the Experience tab of `/settings/profile`.
 * What is left here is what is genuinely the STEP rather than the field: the
 * heading, the empty-answer message, and the foot.
 *
 * **The click selects. Continue advances.** This used to write and navigate on
 * the click itself, which contradicted the reason given for not porting the
 * phone's 200ms auto-advance in the first place — *"a trainer who mis-clicked
 * has no way to see they did before the page has gone"* is equally true at 0ms,
 * and truer, because there is not even a pause to notice it in.
 *
 * Two more reasons it changed. It made step 2 the ONE chip step in the flow that
 * behaves differently: 3, 4 and 5 are also chips and all three wait for
 * Continue, so a trainer's model of this flow broke exactly once, on the step
 * where they had just learnt it. And the dock is sticky now — Continue is on
 * screen at every scroll position, so the click it costs is the cheapest thing
 * on the page, where before it could be a screen away.
 */
export function ExperienceForm({ state }: { state: SetupState }) {
  const { run, pending, message, setMessage } = useStepAction();
  const [picked, setPicked] = useState<string | null>(state.experience);

  function submit() {
    if (picked === null) {
      setMessage({
        tone: 'err',
        icon: 'warn',
        lead: 'Pick a band first.',
        rest: 'Any of the five — it is stored as a band, not a number, so nothing here needs to be exact.',
      });
      return;
    }
    run(() => saveExperience(picked));
  }

  return (
    <>
      <StepHead
        title="How long have you been training clients?"
        sub="Pick one. Nothing here has to be exact."
      />

      <ExperiencePicker
        value={picked}
        disabled={pending}
        onChange={(id) => {
          setPicked(id);
          if (message) setMessage(null);
        }}
      />

      <MessageSlot message={message} />

      <p className="small" style={{ marginTop: 4, maxWidth: '64ch' }}>
        Stored as a band, not a number — so it stays true next year without you editing it.
      </p>

      <StepFoot step="experience" pending={pending} onContinue={submit} />
    </>
  );
}
