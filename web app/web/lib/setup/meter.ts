/**
 * Profile completion — frame 6a, and the deck's meter after it.
 *
 * The web's copy of `app/src/setup/meter.ts`, weights included, because the two
 * halves show the same trainer the same percentage and a meter that reads 70%
 * on a laptop and 60% on a phone is a bug in whichever one you saw second.
 *
 * Two rules the weights encode:
 *
 *   · it never opens at zero. Anyone reaching this screen has answered step 1,
 *     which is the one the flow refuses to skip, so that block is already
 *     banked — the meter starts at the work done, not at the work owed.
 *     Identical real effort, and the original endowed-progress study measured a
 *     visible head start roughly doubling completion: 34% against 19%;
 *   · items are weighted by business value, not counted. A UPI ID is worth
 *     TWICE a certification, because it is the difference between getting paid
 *     through the app and not.
 */

import { isAnswered, type SetupState } from './steps';

/**
 * A row on the meter. Deliberately without a link.
 *
 * Frame 6a draws these as plain rows carrying what they are worth, and the note
 * under it is the reason: *what was skipped is not nagged for — it is picked up
 * here, once, and then by the same meter on the deck. Nothing in this product
 * asks twice.* A row that were a button back into the flow would make this
 * screen a second ask on the same sitting, and the trainer has by this point
 * already declined each of these once.
 *
 * The place to add a skipped answer later is Settings — `/settings/profile`
 * covers the identity half of it now; the rest of the flow's answers still have
 * no editor.
 */
export interface MeterItem {
  key: string;
  label: string;
  done: boolean;
  weight: number;
}

/**
 * The sentence that stops the whole thing reading as data collection for its
 * own sake.
 */
export const METER_WHY =
  'Clients see certifications and languages before they accept an invite.';

export function meterItems(state: SetupState): MeterItem[] {
  return [
    {
      key: 'core',
      /*
       * ── IT NAMED THREE ANSWERS AND CHECKED ONE, AND THAT ONLY BECAME A LIE
       *    WHEN THE FLOW CHANGED ────────────────────────────────────────────
       *
       * The label was *Name, experience, specialities* against
       * `isAnswered('name')`, and it was true by construction: those two steps
       * were mandatory, so nobody could reach this screen without them. Both
       * are skippable now — and *Skip to home* lands a trainer in the app with
       * step 1 and nothing else — so the row would have ticked "experience,
       * specialities" for a profile that has neither, on the one screen whose
       * whole job is saying what is still missing.
       *
       * The label moved rather than the predicate, and the weights did not
       * move at all. `app/src/setup/meter.ts` on the phone carries the same
       * four weights and this file's header is explicit that 70% here and 60%
       * there is a bug in whichever you saw second; re-cutting 50 into three
       * rows would have been exactly that divergence. **The phone's copy of
       * this LABEL needs the same edit** — it is the same stale sentence about
       * the same row, and the ids and weights it shares with this file are
       * untouched by the fix.
       *
       * Still ONE row, and still the one that stops the meter opening at zero:
       * step 1 is two answers in one sitting, and two ticks for it would make
       * the meter feel like it is counting keystrokes.
       */
      label: 'Your name and gender',
      done: isAnswered('name', state),
      weight: 50,
    },
    {
      key: 'languages',
      label: 'Languages',
      done: isAnswered('languages', state),
      weight: 20,
    },
    {
      key: 'certifications',
      label: 'Add a certification',
      done: isAnswered('certifications', state),
      weight: 10,
    },
    {
      key: 'upi',
      label: 'Add your UPI ID',
      done: isAnswered('payment', state),
      weight: 20,
    },
  ];
}

/** The percentage, 0–100. The weights sum to 100, so this is a plain total. */
export function meterPercent(items: MeterItem[]): number {
  return items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
}
