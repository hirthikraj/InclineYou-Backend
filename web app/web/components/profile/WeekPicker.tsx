'use client';

import { IconPlus, IconTrash } from '@/components/auth/Icons';
import { Chip, ChipRow } from '@/components/setup/Chips';
import { DayRibbon } from '@/components/setup/DayRibbon';
import { GroupLabel } from '@/components/setup/SetupShell';
import {
  MIN_WINDOW_MINUTES,
  WEEKDAY_SHORT,
  WINDOW_PRESETS,
  formatDuration,
  formatMinute,
  formatWindow,
  mergeWindows,
  minutesPerDay,
  moveEdge,
  nextWindowAfter,
  type HourWindow,
} from '@/lib/setup/hours';

/**
 * THE WORKING-WEEK PICKER — days, windows, and the band that shows the shape.
 *
 * One component, two callers: setup step 6 (`HoursForm`) and the *Work & hours*
 * tab of `/settings/profile`. The fifth control extracted rather than copied,
 * for the reason the other four record — two versions of one answer is how one
 * week ends up with two editors that disagree about what a split shift is.
 *
 * **The model is one set of windows applied to every day picked, not seven
 * independent days**, and that is the whole reason this is a small component
 * instead of a grid. Per-day differences are real but rare, and seven tracks
 * would promise a per-day model neither caller has — the full per-day editor
 * lives in the diary on the phone.
 *
 * **Two windows, not one range.** A single 06:00–20:30 claims the trainer is
 * free for lunch, and every capacity figure downstream inherits the lie. The
 * band draws the hole between them and names it, which is what a 1440px canvas
 * can do that a phone cannot.
 *
 * What is NOT in here: the empty-answer sentences. Setup can say *"or skip the
 * step"* and Settings cannot, because Settings has no Skip — so `weekProblem`
 * hands both callers the same verdict and each writes its own sentence. The
 * too-short error IS in here: it is a property of the control's own state
 * rather than of pressing anything, and both callers would write it identically.
 */

export interface Week {
  /** 0 = Monday … 6 = Sunday. ISO order, matching the column and the day strip. */
  days: number[];
  windows: HourWindow[];
}

export type WeekProblem = 'none' | 'no-days' | 'no-windows' | 'too-short';

/** The one verdict both callers branch on, so they cannot disagree about validity. */
export function weekProblem(week: Week): WeekProblem {
  if (week.windows.some((w) => w.endMinute - w.startMinute < MIN_WINDOW_MINUTES)) {
    return 'too-short';
  }
  if (week.days.length === 0) return 'no-days';
  if (mergeWindows(week.windows).length === 0) return 'no-windows';
  return 'none';
}

export function WeekPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Week;
  onChange: (next: Week) => void;
  /** A write is in flight. See `Chips.tsx` on why this is `disabled` and not `dimmed`. */
  disabled?: boolean;
}) {
  const { days, windows } = value;
  const merged = mergeWindows(windows);
  const tooShort = weekProblem(value) === 'too-short';
  const perDay = minutesPerDay(windows);

  const setDays = (next: number[]) => onChange({ days: next, windows });
  const setWindows = (next: HourWindow[]) => onChange({ days, windows: next });

  function toggleDay(day: number) {
    setDays(
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b),
    );
  }

  function togglePreset(window: HourWindow) {
    const has = windows.some(
      (w) => w.startMinute === window.startMinute && w.endMinute === window.endMinute,
    );
    setWindows(
      has
        ? windows.filter(
            (w) => !(w.startMinute === window.startMinute && w.endMinute === window.endMinute),
          )
        : [...windows, window].sort((a, b) => a.startMinute - b.startMinute),
    );
  }

  return (
    <>
      <GroupLabel top={22}>THE DAYS YOU WORK</GroupLabel>
      <ChipRow top={0} className="chiprow--days">
        {WEEKDAY_SHORT.map((label, i) => (
          <Chip
            key={label}
            label={label}
            pressed={days.includes(i)}
            disabled={disabled}
            onClick={() => toggleDay(i)}
          />
        ))}
      </ChipRow>

      <GroupLabel>YOUR HOURS ON THOSE DAYS</GroupLabel>
      <ChipRow top={0}>
        {WINDOW_PRESETS.map((preset) => (
          <Chip
            key={preset.key}
            label={preset.label}
            pressed={windows.some(
              (w) =>
                w.startMinute === preset.window.startMinute &&
                w.endMinute === preset.window.endMinute,
            )}
            disabled={disabled}
            onClick={() => togglePreset(preset.window)}
          />
        ))}
      </ChipRow>

      {/* MEASURED BUG, FIXED — and kept here because this is now the only copy.
          Each window used to be a `.fld` at a fixed `width:190`, holding two
          84px time inputs, the word "to" and a 32px icon button — 232px of
          content in a 190px box. Flex does not overflow a fixed-width parent,
          it shrinks the children, so both time fields were squeezed to about
          60px and `HH:MM` was clipped AT 1440px, before any phone was involved.
          `.fldrow` in app.css gives the row a real wrap and lets each window
          size itself; under 560px each one takes a line. */}
      <div className="fldrow" style={{ marginTop: 18, alignItems: 'flex-end' }}>
        {windows.map((window, i) => (
          // Keyed by position: an unsaved window has no identity yet, and giving
          // it one from its own time would re-key the field being edited.
          <div key={i} className="fld">
            {/* A span, not a label. The two time inputs carry their own
                `aria-label` because one visible label cannot name two controls,
                which left this `<label>` pointing at nothing — a label with no
                control is a promise to a screen reader that is not kept. */}
            <span className="fld__l">{i === 0 ? 'First window' : `Window ${i + 1}`}</span>
            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <TimeField
                label={`Window ${i + 1} starts`}
                value={window.startMinute}
                disabled={disabled}
                onChange={(v) =>
                  setWindows(windows.map((w, j) => (j === i ? moveEdge(w, 'start', v) : w)))
                }
              />
              <span className="small" style={{ flex: '0 0 auto' }}>
                to
              </span>
              <TimeField
                label={`Window ${i + 1} ends`}
                value={window.endMinute}
                disabled={disabled}
                onChange={(v) =>
                  setWindows(windows.map((w, j) => (j === i ? moveEdge(w, 'end', v) : w)))
                }
              />
              <button
                className="btn btn--ghost btn--icon"
                type="button"
                disabled={disabled}
                style={{ flex: '0 0 auto' }}
                aria-label={`Remove ${formatWindow(window)}`}
                onClick={() => setWindows(windows.filter((_, j) => j !== i))}
              >
                <IconTrash size={16} />
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn btn--ghost"
          type="button"
          disabled={disabled}
          style={{ flex: '0 0 auto' }}
          onClick={() => setWindows([...windows, nextWindowAfter(windows)])}
        >
          <IconPlus size={14} />
          {windows.length === 0 ? 'Add hours' : 'Another window'}
        </button>
      </div>

      <GroupLabel>EVERY DAY YOU PICKED, AT ONE PIXEL PER MINUTE</GroupLabel>
      <DayRibbon days={days} windows={windows} />

      <div className="row" style={{ gap: 20, marginTop: 18, flexWrap: 'wrap' }}>
        <span className="small">
          <b>{formatDuration(perDay)}</b> a day
        </span>
        <span className="small">
          <b>{formatDuration(perDay * days.length)}</b> a week
        </span>
        <span className="small">
          {days.length} {days.length === 1 ? 'day' : 'days'}
          {merged.length > 1
            ? ' · two windows, because a single range would claim you are free for lunch'
            : null}
        </span>
      </div>

      {tooShort ? (
        <p className="fld__e" style={{ marginTop: 12 }}>
          A window has to be at least {MIN_WINDOW_MINUTES} minutes long.
        </p>
      ) : null}
    </>
  );
}

/**
 * `HH:MM`, as a native time input.
 *
 * The phone builds a wheel because a phone has to. A browser already has a time
 * control that speaks the platform's own locale, handles the keyboard, and
 * cannot produce `25:70` — reimplementing it would be a worse version of
 * something every trainer already knows how to use. It is styled as `.ctl mono`
 * so it sits in the row with the design's fields rather than beside them.
 */
function TimeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (minute: number) => void;
}) {
  return (
    <input
      className="ctl mono"
      type="time"
      aria-label={label}
      disabled={disabled}
      /* Not a fixed width. `.ctl` is 13.5px on a desk and 16px on a phone
         (app.css, for iOS's focus zoom), and a `type="time"` control's
         intrinsic width tracks its font — 84px clipped the colon at 16px. The
         UA sizes it, bounded, and `flex:0 0 auto` stops the row shrinking it
         back to the same clip. */
      style={{ textAlign: 'center', width: 'auto', minWidth: 92, maxWidth: 132, flex: '0 0 auto' }}
      value={formatMinute(value)}
      // Clearing the field gives an empty string, which must not read as
      // midnight — a half-typed value is not an answer, so it is ignored until
      // the control has both halves.
      onChange={(e) => {
        const [h, m] = e.target.value.split(':').map(Number);
        if (Number.isFinite(h) && Number.isFinite(m)) onChange(h * 60 + m);
      }}
    />
  );
}
