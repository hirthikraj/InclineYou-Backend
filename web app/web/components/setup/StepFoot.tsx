'use client';

import Link from 'next/link';

import { stepBefore, stepHref, type SetupStep } from '@/lib/setup/steps';

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
 */
export function StepFoot({
  step,
  onContinue,
  onSkip,
  continueLabel = 'Continue',
  continueDisabled = false,
  pending = false,
  extra,
}: {
  step: SetupStep;
  onContinue: () => void;
  /** Present only on the four steps the rail marks optional. */
  onSkip?: () => void;
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
        <Link className="btn btn--ghost" href={stepHref(back)}>
          Back
        </Link>
      ) : null}
      {extra}
      <span className="sp" />
      {onSkip ? (
        <button className="btn btn--ghost" type="button" disabled={pending} onClick={onSkip}>
          Skip for now
        </button>
      ) : null}
      <button
        className="btn btn--primary btn--lg"
        type="button"
        disabled={pending || continueDisabled}
        onClick={onContinue}
      >
        {pending ? 'Saving…' : continueLabel}
      </button>
    </div>
  );
}
