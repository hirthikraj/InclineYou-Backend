/**
 * Profile completion — frame 6a, and the deck's meter after it.
 *
 * The web's copy of `app/src/setup/meter.ts`, weights included, because the two
 * halves show the same trainer the same percentage and a meter that reads 70%
 * on a laptop and 60% on a phone is a bug in whichever one you saw second.
 *
 * Two rules the weights encode:
 *
 *   · it never opens at zero. Anyone reaching this screen has finished the
 *     flow, so the name / experience / specialities block is already banked —
 *     the meter starts at the work done, not at the work owed. Identical real
 *     effort, and the original endowed-progress study measured a visible head
 *     start roughly doubling completion: 34% against 19%;
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
      label: 'Name, experience, specialities',
      // ONE row, not three. Three ticks for one sitting's work makes the meter
      // feel like it is counting keystrokes.
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
