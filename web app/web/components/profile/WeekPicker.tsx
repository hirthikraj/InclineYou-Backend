'use client';

import { IconPlus, IconTrash } from '@/components/auth/Icons';
import { Chip, ChipRow } from '@/components/setup/Chips';
import { DayRibbon } from '@/components/setup/DayRibbon';
import { GroupLabel } from '@/components/setup/SetupShell';
import { TimeField } from '@/components/shell/TimeField';
import {
  MIN_WINDOW_MINUTES,
  WEEKDAY_SHORT,
  WINDOW_PRESETS,
  formatDuration,
  formatWindow,
  mergeWindows,
  minutesPerDay,
  moveEdge,
  nextWindowAfter,
  type HourWindow,
} from '@/lib/setup/hours';
import { Button } from '@/web-components/ui/Button';

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
  fitRibbon = false,
}: {
  value: Week;
  onChange: (next: Week) => void;
  /** A write is in flight. See `Chips.tsx` on why this is `disabled` and not `dimmed`. */
  disabled?: boolean;
  /** Scale the day ribbon to the width it has (Settings) instead of the fixed band setup uses. */
  fitRibbon?: boolean;
}) {
  const { days, windows } = value;
  const merged = mergeWindows(windows);
  const tooShort = weekProblem(value) === 'too-short';
  const perDay = minutesPerDay(windows);
  const custom = windows.filter(
    (w) => !WINDOW_PRESETS.some((p) => p.window.startMinute === w.startMinute && p.window.endMinute === w.endMinute),
  );

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
      {/* No `top={22}`. The step's three group labels were 22, 24 and 24 — one
          rhythm written three times and got wrong once. `GroupLabel`'s own
          default is 24 and it is the only value any of them wanted. */}
      <GroupLabel>THE DAYS YOU WORK</GroupLabel>
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
            /* Formatted here rather than carried on the preset, so the chip
               and the window rows below it are the same string from the same
               function — the labels used to be literals and would have gone on
               saying `17:00 – 21:00` under a 12-hour clock. */
            label={formatWindow(preset.window)}
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

      {/* A window that is none of the presets is not lit by any of them, and the row said nothing — so a day of 5–10pm read as
          *no evening set*. Say so, once, where the trainer is looking. */}
      {custom.length > 0 ? (
        <p className="small" style={{ marginTop: 8 }}>
          {custom.length === 1 ? 'One window is' : `${custom.length} windows are`} custom, set below, so no preset above is lit for{' '}
          {custom.length === 1 ? 'it' : 'them'}.
        </p>
      ) : null}

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
        <Button
          variant="ghost"
          disabled={disabled}
          style={{ flex: '0 0 auto' }}
          onClick={() => setWindows([...windows, nextWindowAfter(windows)])}
        >
          <IconPlus size={14} />
          {windows.length === 0 ? 'Add hours' : 'Another window'}
        </Button>
      </div>

      <GroupLabel>{fitRibbon ? 'YOUR DAY AT A GLANCE' : 'EVERY DAY YOU PICKED, AT ONE PIXEL PER MINUTE'}</GroupLabel>
      <DayRibbon days={days} windows={windows} fit={fitRibbon} />

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
