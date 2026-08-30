'use client';

import { useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { LanguagePicker } from '@/components/profile/LanguagePicker';
import { saveList } from '@/lib/setup/actions';
import type { SetupState } from '@/lib/setup/steps';
import { StepHead } from './SetupShell';
import { StepFoot } from './StepFoot';
import { useStepAction } from './useStepAction';

/**
 * `/setup/languages` — step 5, and the free differentiator.
 *
 * The chips and the escape hatch are `LanguagePicker`, shared with the
 * Languages tab of `/settings/profile`. What is left here is the step.
 *
 * **ZERO of the eight platforms in the teardown ask this.** In a market where a
 * client may specifically want a Tamil- or Marathi-speaking coach, it is one
 * field no competitor can match — which is exactly why **this step has no Skip**
 * while the two around it do, and why the rail's hint for it is "nobody else
 * asks".
 */
export function LanguagesForm({ state }: { state: SetupState }) {
  const { run, pending, message, setMessage } = useStepAction();
  const [chosen, setChosen] = useState<string[]>(state.languages);

  /** Empty is not an answer here either — see `SpecialitiesForm`. */
  function submit() {
    if (chosen.length === 0) {
      setMessage({
        tone: 'err',
        icon: 'warn',
        lead: 'Pick at least one language.',
        rest: 'This is the step with no Skip, because a client searching in Tamil or Marathi finds you on this field and nothing else.',
      });
      return;
    }
    run(() => saveList('languages', chosen));
  }

  return (
    <>
      <StepHead
        title="Which languages do you coach in?"
        sub="Clients filter by this. Pick as many as you actually use on the floor."
      />

      <LanguagePicker
        value={chosen}
        disabled={pending}
        onChange={(next) => {
          setChosen(next);
          if (message) setMessage(null);
        }}
      />

      <MessageSlot message={message} />

      <p className="small" style={{ maxWidth: '64ch' }}>
        No cap — if you genuinely coach in five languages, say so. This is the one step here without a
        Skip, because clients search on it.
      </p>

      <StepFoot step="languages" pending={pending} onContinue={submit} />
    </>
  );
}
