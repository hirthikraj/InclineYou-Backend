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
import { Button } from '@/web-components/ui/Button';
import { Select } from '@/web-components/ui/Select';

/* ── TIMES ARE PICKED, NOT TYPED (22 Nov 2026) ──────────────────────────────────────────────────────────────────────
   The rows used `TimeField`, a typed field whose hour and minute were 20×23px targets — fiddly with a thumb, which is
   how most trainers set up. A `Select` in 15-minute steps opens the phone's own wheel and is one tap on a desk (with
   type-ahead). A stored time off the grid (6:10) is kept as an option, so editing never silently rounds it. */
const STEP = 15;
function timeOptions(from: number, to: number, current: number): { value: string; label: string }[] {
  const set = new Set<number>();
  for (let m = from; m <= to; m += STEP) set.add(m);
  set.add(current);
  return [...set]
    .sort((a, b) => a - b)
    .map((m) => ({ value: String(m), label: m >= 1440 ? 'Midnight' : formatMinute(m) }));
}

/* A row is named by when it is, not by its index: "First window" beside "Window 2" was two spellings of one idea
   and "window" is our word, not a trainer's. Two mornings read "Morning" and "Morning 2". */
function rowNames(windows: HourWindow[]): string[] {
  /* Four bands by start (22 Nov 2026): with three, an 11 AM–3 PM block was "Morning 2". */
  const band = (m: number) => (m < 11 * 60 ? 'Morning' : m < 14 * 60 ? 'Midday' : m < 17 * 60 ? 'Afternoon' : 'Evening');
  const base = windows.map((w) => band(w.startMinute));
  const seen: Record<string, number> = {};
  return base.map((b) => {
    seen[b] = (seen[b] ?? 0) + 1;
    const total = base.filter((x) => x === b).length;
    return total > 1 ? `${b} ${seen[b]}` : b;
  });
}

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
  /* Fitted by default since 22 Nov 2026: the one-pixel-a-minute band scrolled sideways in its own scrollbar, so a
     preview meant to be read at a glance showed only the morning. The literal scale is still there for a caller who
     asks for it. */
  fitRibbon = true,
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
  const names = rowNames(windows);
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
      {/* The chips are quick picks for the rows below — pick-several, which a row of pills does not say by itself. */}
      <p className="small wkp__hint">Tap the hours you work — pick as many as you like, or set your own below.</p>
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
          {custom.length === 1 ? 'One of your hours is' : `${custom.length} of your hours are`} your own times, set below — a quick
          pick only lights up for an exact match.
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
      <div className="wkp__rows">
        {windows.map((window, i) => {
          const name = names[i];
          return (
            <div key={i} className="wkp__row" role="group" aria-label={`${name}, ${formatWindow(window)}`}>
              <span className="wkp__name">{name}</span>
              <Select
                label={`${name} starts`}
                hideLabel
                className="wkp__time"
                value={String(window.startMinute)}
                disabled={disabled}
                options={timeOptions(0, 24 * 60 - MIN_WINDOW_MINUTES, window.startMinute)}
                onChange={(e) => setWindows(windows.map((w, j) => (j === i ? moveEdge(w, 'start', Number(e.target.value)) : w)))}
              />
              <span className="wkp__to">to</span>
              <Select
                label={`${name} ends`}
                hideLabel
                className="wkp__time"
                value={String(window.endMinute)}
                disabled={disabled}
                options={timeOptions(MIN_WINDOW_MINUTES, 24 * 60, window.endMinute)}
                onChange={(e) => setWindows(windows.map((w, j) => (j === i ? moveEdge(w, 'end', Number(e.target.value)) : w)))}
              />
              <button
                className="btn btn--ghost btn--icon wkp__del"
                type="button"
                disabled={disabled}
                aria-label={`Remove ${name.toLowerCase()}, ${formatWindow(window)}`}
                onClick={() => setWindows(windows.filter((_, j) => j !== i))}
              >
                <IconTrash size={16} />
              </button>
            </div>
          );
        })}
        <Button
          variant="ghost"
          disabled={disabled}
          className="wkp__add"
          onClick={() => setWindows([...windows, nextWindowAfter(windows)])}
        >
          <IconPlus size={14} />
          Add hours
        </Button>
      </div>

      <GroupLabel>{fitRibbon ? 'YOUR DAY AT A GLANCE' : 'EVERY DAY YOU PICKED, AT ONE PIXEL PER MINUTE'}</GroupLabel>
      <DayRibbon days={days} windows={windows} fit={fitRibbon} />

      {/* One plain sentence (22 Nov 2026). The third span explained a design decision to the trainer ("because a single
          range would claim you are free for lunch"); what they need is the totals, and to know overlaps count once. */}
      <p className="small wkp__sum">
        <b>{days.length} {days.length === 1 ? 'day' : 'days'}</b> · <b>{formatDuration(perDay)}</b> a day ·{' '}
        <b>{formatDuration(perDay * days.length)}</b> a week
        {merged.length < windows.length ? <span className="ink3"> · overlapping hours are counted once</span> : null}
      </p>

      {tooShort ? (
        <p className="fld__e" style={{ marginTop: 12 }}>
          A window has to be at least {MIN_WINDOW_MINUTES} minutes long.
        </p>
      ) : null}
    </>
  );
}
