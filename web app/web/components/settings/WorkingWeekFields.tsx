'use client';

import { WeeklyHours, weekHoursProblem, type DayHours } from '@/components/profile/WeeklyHours';

/**
 * YOUR WORKING WEEK — the second half of the profile's *Work & hours* tab.
 *
 * **Day by day since 23 Nov 2026.** It used to be `WeekPicker` (one set of
 * windows for every day picked), which could only warn that saving would
 * flatten a Saturday that differed. Each weekday now holds its own windows
 * (`WeeklyHours`), so the stored week is read without loss and the save
 * (`saveWorkingDays`) writes only the days whose answer changed.
 *
 * Controlled, because the tab has one Save that must know what changed on both
 * halves (`WorkPanel`).
 *
 * ── AN EMPTY WEEK IS A SUGGESTION, NOT A DEFAULT ────────────────────────────
 *
 * `GET /v1/working-hours` returns `[]` for a trainer who skipped the hours step.
 * The empty case is filled in HERE, in the form only, with the Monday-to-Saturday
 * pair setup starts from — visible, editable, and not stored until Save.
 */
export function WorkingWeekFields({
  value,
  unanswered,
  showProblem,
  onChange,
  disabled = false,
}: {
  value: DayHours;
  /** Nothing on the server yet, so what is on screen is a proposal. */
  unanswered: boolean;
  /** Save has been pressed; the emptiness sentence may speak. */
  showProblem: boolean;
  onChange: (next: DayHours) => void;
  disabled?: boolean;
}) {
  const problem = weekHoursProblem(value);

  return (
    <>
      <h2 className="card__t" style={{ marginTop: 30 }}>
        Weekly hours
      </h2>
      <p className="small" style={{ marginTop: 3, maxWidth: 620 }}>
        {unanswered
          ? 'You have not set a week yet, so this is a suggestion — nothing below is stored until you press Save.'
          : 'Clients’ sessions are booked out of these hours. Set each day on its own; a day with no hours is a rest day.'}
      </p>

      <WeeklyHours value={value} disabled={disabled} onChange={onChange} />

      {showProblem && problem === 'empty' ? (
        <p className="fld__e" style={{ marginTop: 12 }}>
          Give at least one day some hours. A week with none would leave add-client with no slots to offer.
        </p>
      ) : null}
    </>
  );
}

export { daysFrom } from '@/components/profile/WeeklyHours';
