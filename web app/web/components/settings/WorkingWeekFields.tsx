'use client';

import { WeekPicker, weekProblem, type Week } from '@/components/profile/WeekPicker';
import type { StoredHour } from '@/lib/profile/api';
import {
  DEFAULT_DAYS,
  DEFAULT_WINDOWS,
  mergeWindows,
  sameWindows,
} from '@/lib/setup/hours';

/**
 * YOUR WORKING WEEK — the second half of the profile's *Work & hours* tab, and
 * the first time this half has been able to edit the working week outside setup.
 *
 * `/settings/hours` was a *Soon* row for as long as Settings has existed, and
 * the week was editable exactly once, in a flow that redirects a trainer who has
 * finished it. So a trainer who took a Sunday off, or moved their evening shift
 * an hour later, had no way to say so on a laptop at all.
 *
 * **Controlled, like the section above it, and for the same reason**: the tab
 * has one Save, and that button has to know what changed on both halves to
 * decide which endpoints to call. This one is not even a table `WorkPanel`
 * writes the same way — it is rows in `working_hours` over
 * `PATCH /v1/working-hours`, where everything above is columns on `trainer` over
 * `PATCH /v1/trainers/me`.
 *
 * ── AN EMPTY WEEK IS A SUGGESTION, NOT A DEFAULT ────────────────────────────
 *
 * `GET /v1/working-hours` returns `[]` for a trainer who skipped the hours step
 * and refuses to invent a week, on purpose: a window on the server is a claim
 * that somebody works then, and a gap inside one is sellable time. So the empty
 * case is filled in HERE, in the form only, with the same Monday-to-Saturday
 * pair setup starts from — visible, editable, and not stored until Save. The
 * heading says which of the two it is showing.
 */
export function WorkingWeekFields({
  value,
  stored,
  unanswered,
  showProblem,
  onChange,
  disabled = false,
}: {
  value: Week;
  /** The rows as they came off the server — read only for `daysVary`. */
  stored: StoredHour[];
  /** Nothing on the server yet, so what is on screen is a proposal. */
  unanswered: boolean;
  /** Save has been pressed; the emptiness sentences may speak. */
  showProblem: boolean;
  onChange: (next: Week) => void;
  disabled?: boolean;
}) {
  /**
   * TRUE WHEN THE SERVER HOLDS A WEEK THIS CONTROL CANNOT SPELL.
   *
   * One set of windows for every day is the model, and it is lossy in the
   * READING: a trainer whose Saturday is a half day gets Monday's hours drawn
   * for it. Setup has always been lossy in the same way and it did not matter
   * there, because setup runs before there is anything to lose.
   *
   * Here it would. So it is said out loud — and `WorkPanel` only calls the
   * working-hours write when this half is actually dirty, so a Save pressed to
   * change the gym name cannot flatten a differing Saturday on the way past.
   */
  const varies = daysVary(stored);
  const problem = weekProblem(value);

  return (
    <>
      <h2 className="card__t" style={{ marginTop: 30 }}>
        Your working week
      </h2>
      <p className="small" style={{ marginTop: 3, maxWidth: 620 }}>
        {unanswered
          ? 'You have not set a week yet, so this is a suggestion — nothing below is stored until you press Save.'
          : 'Clients’ sessions are booked out of these windows. One set of hours, applied to every day you pick; day-by-day differences live in the diary.'}
      </p>

      <WeekPicker value={value} disabled={disabled} onChange={onChange} fitRibbon />

      {varies ? (
        <p className="fld__e" style={{ marginTop: 12, maxWidth: 620 }}>
          Your days are not all the same, and this editor keeps <b>one</b> set of hours for the
          whole week — it is showing {formatDayName(sortedDays(stored)[0])}’s. Saving applies these
          hours to every day above; the per-day editor in the diary is where different days belong.
        </p>
      ) : null}

      {/* Setup can answer an empty week with "or skip the step". This cannot —
          there is no Skip in Settings — so the sentence has to say what the
          empty answer would actually do instead. */}
      {showProblem && problem === 'no-days' ? (
        <p className="fld__e" style={{ marginTop: 12 }}>
          Pick at least one day. A week with none would leave add-client with no slots to offer.
        </p>
      ) : showProblem && problem === 'no-windows' ? (
        <p className="fld__e" style={{ marginTop: 12 }}>
          Add at least one window — the days you picked need hours in them.
        </p>
      ) : null}
    </>
  );
}

function sortedDays(stored: StoredHour[]): number[] {
  return [...new Set(stored.map((h) => h.weekday))].sort((a, b) => a - b);
}

/** Do two weekdays hold different windows? See `varies`. */
function daysVary(stored: StoredHour[]): boolean {
  const days = sortedDays(stored);
  if (days.length < 2) return false;
  const first = mergeWindows(stored.filter((h) => h.weekday === days[0]));
  return days
    .slice(1)
    .some((d) => !sameWindows(first, mergeWindows(stored.filter((h) => h.weekday === d))));
}

/** `Monday`. Long, because it names one day in a sentence rather than a chip. */
function formatDayName(weekday: number): string {
  return (
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday] ??
    'the first'
  );
}

/**
 * The stored rows, as the one week this control edits.
 *
 * The days are every weekday that has a row; the windows come from the EARLIEST
 * such day — lossy, per `daysVary` above, and guarded rather than hidden.
 */
export function weekFrom(stored: StoredHour[]): Week {
  const days = sortedDays(stored);
  if (days.length === 0) {
    return { days: [...DEFAULT_DAYS], windows: DEFAULT_WINDOWS.map((w) => ({ ...w })) };
  }
  return { days, windows: mergeWindows(stored.filter((h) => h.weekday === days[0])) };
}
