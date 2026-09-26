'use client';


import { skipToHome, type StepResult } from '@/lib/setup/actions';
import { isAnswered, stepBefore, stepHref, type SetupState, type SetupStep } from '@/lib/setup/steps';
import { Button } from '@/web-components/ui/Button';

/**
 * The `onSkipHome` every step but `name` passes, computed once.
 *
 * Seven call-sites, one rule — *the door out opens only after step 1* — and a
 * rule spelled out seven times is a rule six of them can drift from. The eighth
 * step, `name`, deliberately does not use this: there the answer is on the
 * screen rather than on the account, so it has its own handler and its own
 * action. See `NameForm`.
 *
 * Returning `undefined` rather than a disabled button is the same call the rest
 * of this flow makes about dead primaries: a greyed-out *Skip to home* with
 * nothing beside it saying why would be a fourth button in the dock explaining
 * nothing. Until the name is on file the door is simply not drawn, and the rail
 * says which step is still owed.
 */
export function skipHomeAction(
  state: SetupState,
  run: (action: () => Promise<StepResult>) => void,
): (() => void) | undefined {
  if (!isAnswered('name', state)) return undefined;
  return () => run(() => skipToHome());
}

/**
 * The foot dock — `.stp__ft`, on all eight steps.
 *
 * Back · spacer · Skip · Continue, and the order is the argument. **Skip sits to
 * the LEFT of the primary action and is a ghost**, because the thumb — or on a
 * desk, the return key and the eye — travel to the primary button, and a Skip
 * collected next to it is indistinguishable from intent. On the phone the same
 * reasoning puts Skip in the app bar entirely; a 1440px foot has room to keep it
 * in the dock and still keep it away from Continue.
 *
 * `Back` is a link, not a history pop. Every step is addressable, so the
 * previous step has a URL — and a `router.back()` from a step reached by
 * clicking a rail row would go somewhere else entirely.
 *
 * ## It is a dock, not a footer
 *
 * §10 gives `.stp__ft` `margin-top:auto`, which puts Continue at the bottom of
 * the CONTENT. On hours and packs that is one screen below the fold on a laptop
 * and two on a phone, so the primary action of a flow that promises "about a
 * minute" is the one thing you have to go looking for. `app.css` makes it
 * `position:sticky` — with `margin-top:auto` still in force a step that fits
 * sits exactly as drawn, and only a step that overflows pins it.
 *
 * On a phone it stacks, and the stacking order is §10's own argument in the
 * other axis: the thumb travels to the primary button, so Continue takes the
 * whole bottom row and Back and Skip share the row above it at opposite ends —
 * out of the arc rather than merely to the left of it.
 *
 * `continueDisabled` is for a step that cannot be completed yet at all — hours
 * with no day picked, packs with an unnamed gym. It is deliberately NOT used by
 * name or payment: on those two the answer is one field and a greyed-out primary
 * with nothing beside it explaining why is the dead button this codebase has
 * already named twice. There the click fires, the message says what is missing,
 * and focus moves to the field.
 *
 * ## Two skips, and they are on opposite sides of the dock
 *
 * `onSkip` passes on THIS question and stays on the left of Continue, where
 * §10's argument put it. `onSkipHome` leaves the FLOW — it stamps the profile
 * complete and opens the app — and it sits in the left-hand group beside Back,
 * because that is where the other action of exactly this shape already lives:
 * 4b's *Finish the rest later* is the same write in the same place, and two
 * buttons that end the same flow should not be in two different halves of the
 * same dock depending on which screen you are standing on.
 *
 * It is also the reason the two are separate props rather than one `onLeave`
 * with a flag. They are different promises — *ask me later* against *stop
 * asking* — and the second is the one a trainer cannot undo from inside the
 * flow, because `completeSetup` is never un-stamped.
 */
export function StepFoot({
  step,
  onContinue,
  onSkip,
  onSkipHome,
  continueLabel = 'Continue',
  continueDisabled = false,
  pending = false,
  extra,
}: {
  step: SetupStep;
  onContinue: () => void;
  /** Passes on this step. Present on the seven the rail does not mark required. */
  onSkip?: () => void;
  /**
   * Leaves the flow for `/today`, stamping it complete.
   *
   * Passed only once step 1 is answered — every caller reads `isAnswered` for
   * that rather than assuming, because a rail row is a link and step 5 is
   * reachable with no name on the account. `skipToHome` re-checks it server-side
   * anyway; this is what keeps a button that would be refused off the screen.
   */
  onSkipHome?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  pending?: boolean;
  /** An extra ghost action on the left, next to Back. Only 4b uses one. */
  extra?: React.ReactNode;
}) {
  const back = stepBefore(step);

  return (
    <div className="stp__ft">
      {back ? (
        <Button href={stepHref(back)} variant="ghost">
          Back
        </Button>
      ) : null}
      {onSkipHome ? (
        <Button variant="ghost" disabled={pending} onClick={onSkipHome}>
          Skip to home
        </Button>
      ) : null}
      {extra}
      <span className="sp" />
      {onSkip ? (
        <Button variant="ghost" disabled={pending} onClick={onSkip}>
          Skip for now
        </Button>
      ) : null}
      <Button
        variant="primary"
        size="lg"
        disabled={pending || continueDisabled}
        onClick={onContinue}
      >
        {pending ? 'Saving…' : continueLabel}
      </Button>
    </div>
  );
}
