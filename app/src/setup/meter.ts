/**
 * Profile completion, as the deck shows it.
 *
 * `agent/design system/screens/trainxtrainersetup.html` § 06 · 6b.
 *
 * Two rules the weights encode:
 *
 *   · it never opens at zero. Anyone reaching the deck has finished the flow,
 *     so the name/experience/specialities block is already banked — the meter
 *     starts at the work done, not at the work owed. Identical real effort,
 *     but a visible head start roughly doubles completion (34% vs 19% in the
 *     original endowed-progress study);
 *   · items are weighted by business value, not counted. A UPI ID is worth
 *     twice a certification because it is the difference between getting paid
 *     through the app and not.
 *
 * `why` is the sentence that stops this reading as data collection for its own
 * sake: clients see certifications and languages before accepting an invite.
 */

import type { MeterItem } from '../design';
import { isAnswered, type SetupDraft } from './draft';

export interface ProfileMeterActions {
  onAddCertification?: () => void;
  onAddUpi?: () => void;
}

export const METER_WHY =
  'Clients see certifications and languages before they accept an invite.';

export function profileMeterItems(
  draft: SetupDraft,
  actions: ProfileMeterActions = {},
): MeterItem[] {
  return [
    {
      key: 'core',
      label: 'Name, experience, specialities',
      // Grouped into one row on purpose: three ticks for one sitting's work
      // makes the meter feel like it is counting keystrokes.
      done: isAnswered('name', draft),
      weight: 50,
    },
    {
      key: 'languages',
      label: 'Languages',
      done: isAnswered('languages', draft),
      weight: 20,
    },
    {
      key: 'certifications',
      label: 'Add a certification',
      done: isAnswered('certifications', draft),
      weight: 10,
      onPress: actions.onAddCertification,
    },
    {
      key: 'upi',
      label: 'Add your UPI ID',
      done: isAnswered('payment', draft),
      weight: 20,
      onPress: actions.onAddUpi,
    },
  ];
}
