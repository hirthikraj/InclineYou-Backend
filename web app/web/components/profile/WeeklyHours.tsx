'use client';

import { useEffect, useRef, useState } from 'react';

import { IconCopy, IconPlus, IconTrash } from '@/components/auth/Icons';
import {
  DEFAULT_DAYS,
  DEFAULT_WINDOWS,
  MIN_WINDOW_MINUTES,
  WEEKDAY_SHORT,
  formatDuration,
  formatMinute,
  mergeWindows,
  minutesPerDay,
  moveEdge,
  nextWindowAfter,
  type HourWindow,
} from '@/lib/setup/hours';
import { Button } from '@/web-components/ui/Button';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { useEscapeGuard } from '@/web-components/ui/Modal';
import { Select } from '@/web-components/ui/Select';

/**
 * WEEKLY HOURS — the working week, DAY BY DAY (23 Nov 2026).
 *
 * Settings' editor until now was `WeekPicker`: one set of windows applied to
 * every day picked. That model is right for setup (nothing to lose yet) and
 * wrong for a trainer whose Saturday is a half day — the old tab could only
 * warn that saving would flatten it. Here each weekday owns its own windows:
 * a row per day, `+` adds a window to that day, the copy button copies that
 * day's windows to any other days, and a day with none is a rest day.
 *
 * Both callers draw it: setup step 6 (`HoursForm`) and the *Work & hours* tab
 * of `/settings/profile`. `WeekPicker` (one set for every day) has no caller
 * left and is kept, per the catalogue rule, with its docstring.
 */

/** `perDay[0]` is Monday … `perDay[6]` Sunday. Empty = a rest day. */
export type DayHours = HourWindow[][];

export type DayProblem = 'too-short' | 'overlap' | null;

export function dayProblem(windows: HourWindow[]): DayProblem {
  if (windows.some((w) => w.endMinute - w.startMinute < MIN_WINDOW_MINUTES)) return 'too-short';
  const sorted = [...windows].sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].startMinute < sorted[i - 1].endMinute) return 'overlap';
  }
  return null;
}

export type WeekHoursProblem = 'none' | 'empty' | 'day';

export function weekHoursProblem(perDay: DayHours): WeekHoursProblem {
  if (perDay.some((d) => dayProblem(d) !== null)) return 'day';
  if (perDay.every((d) => d.length === 0)) return 'empty';
  return 'none';
}

/**
 * Stored rows (weekday 0 = Monday) as seven days. No rows at all becomes the
 * suggestion setup starts from — Mon–Sat, `DEFAULT_WINDOWS` — drawn in the form
 * only and never stored until somebody saves.
 */
export function daysFrom(rows: (HourWindow & { weekday: number })[]): DayHours {
  if (rows.length === 0) {
    return Array.from({ length: 7 }, (_, d) =>
      DEFAULT_DAYS.includes(d) ? DEFAULT_WINDOWS.map((w) => ({ ...w })) : [],
    );
  }
  return Array.from({ length: 7 }, (_, d) => mergeWindows(rows.filter((h) => h.weekday === d)));
}

const STEP = 15;
function timeOptions(from: number, to: number, current: number): { value: string; label: string }[] {
  const set = new Set<number>();
  for (let m = from; m <= to; m += STEP) set.add(m);
  set.add(current);
  return [...set]
    .sort((a, b) => a - b)
    .map((m) => ({ value: String(m), label: m >= 1440 ? 'Midnight' : formatMinute(m) }));
}

const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function WeeklyHours({
  value,
  onChange,
  disabled = false,
}: {
  value: DayHours;
  onChange: (next: DayHours) => void;
  disabled?: boolean;
}) {
  const [copyFrom, setCopyFrom] = useState<number | null>(null);

  const setDay = (day: number, windows: HourWindow[]) =>
    onChange(value.map((w, d) => (d === day ? windows : w)));

  const workDays = value.filter((d) => d.length > 0).length;
  const weekMinutes = value.reduce((sum, d) => sum + minutesPerDay(d), 0);

  return (
    <>
      <div className="wkh">
        {value.map((windows, day) => {
          const problem = dayProblem(windows);
          const name = DAY_LONG[day];
          return (
            <div key={day} className="wkh__day" role="group" aria-label={name}>
              <span className="wkh__name">{WEEKDAY_SHORT[day]}</span>

              <div className="wkh__wins">
                {windows.length === 0 ? (
                  <span className="wkh__off">Unavailable</span>
                ) : (
                  windows.map((w, i) => (
                    <div key={i} className="wkh__win">
                      <Select
                        label={`${name}, window ${i + 1} starts`}
                        hideLabel
                        className="wkp__time"
                        value={String(w.startMinute)}
                        disabled={disabled}
                        options={timeOptions(0, 24 * 60 - MIN_WINDOW_MINUTES, w.startMinute)}
                        onChange={(e) =>
                          setDay(
                            day,
                            windows.map((x, j) => (j === i ? moveEdge(x, 'start', Number(e.target.value)) : x)),
                          )
                        }
                      />
                      <span className="wkp__to">to</span>
                      <Select
                        label={`${name}, window ${i + 1} ends`}
                        hideLabel
                        className="wkp__time"
                        value={String(w.endMinute)}
                        disabled={disabled}
                        options={timeOptions(MIN_WINDOW_MINUTES, 24 * 60, w.endMinute)}
                        onChange={(e) =>
                          setDay(
                            day,
                            windows.map((x, j) => (j === i ? moveEdge(x, 'end', Number(e.target.value)) : x)),
                          )
                        }
                      />
                      <button
                        className="btn btn--ghost btn--icon wkp__del"
                        type="button"
                        disabled={disabled}
                        aria-label={`Remove ${name} window ${i + 1}`}
                        onClick={() => setDay(day, windows.filter((_, j) => j !== i))}
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  ))
                )}
                {problem === 'too-short' ? (
                  <p className="fld__e wkh__e">A window has to be at least {MIN_WINDOW_MINUTES} minutes long.</p>
                ) : problem === 'overlap' ? (
                  <p className="fld__e wkh__e">These hours overlap — change one so they do not.</p>
                ) : null}
              </div>

              <div className="wkh__acts">
                <button
                  className="btn btn--ghost btn--icon"
                  type="button"
                  disabled={disabled}
                  aria-label={`Add hours on ${name}`}
                  title="Add hours"
                  onClick={() => setDay(day, [...windows, nextWindowAfter(windows)])}
                >
                  <IconPlus size={16} />
                </button>
                <span className="wkh__copyat">
                  <button
                    className="btn btn--ghost btn--icon"
                    type="button"
                    disabled={disabled || windows.length === 0}
                    aria-label={`Copy ${name}’s hours to other days`}
                    aria-expanded={copyFrom === day}
                    title="Copy to other days"
                    onClick={() => setCopyFrom(copyFrom === day ? null : day)}
                  >
                    <IconCopy size={16} />
                  </button>
                  {copyFrom === day ? (
                    <CopyMenu
                      from={day}
                      onClose={() => setCopyFrom(null)}
                      onApply={(targets) => {
                        onChange(value.map((w, d) => (targets.includes(d) ? windows.map((x) => ({ ...x })) : w)));
                        setCopyFrom(null);
                      }}
                    />
                  ) : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="small wkp__sum">
        <b>
          {workDays} {workDays === 1 ? 'day' : 'days'}
        </b>{' '}
        · <b>{formatDuration(weekMinutes)}</b> a week
      </p>
    </>
  );
}

/** "Copy times to…" — pick the days, then Apply. */
function CopyMenu({
  from,
  onApply,
  onClose,
}: {
  from: number;
  onApply: (targets: number[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEscapeGuard(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      const box = ref.current;
      if (box && !box.parentElement?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    ref.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const others = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== from);
  const all = others.every((d) => picked.includes(d));

  return (
    <div ref={ref} className="wkh__copy" role="dialog" aria-label={`Copy ${DAY_LONG[from]}’s hours to`}>
      <p className="wkh__copyt">Copy times to…</p>
      <Checkbox
        label="Every day"
        checked={all}
        indeterminate={!all && picked.length > 0}
        onChange={() => setPicked(all ? [] : others)}
      />
      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
        <Checkbox
          key={d}
          label={DAY_LONG[d]}
          disabled={d === from}
          checked={d === from || picked.includes(d)}
          onChange={() =>
            setPicked(picked.includes(d) ? picked.filter((x) => x !== d) : [...picked, d])
          }
        />
      ))}
      <Button variant="primary" disabled={picked.length === 0} onClick={() => onApply(picked)}>
        Apply
      </Button>
    </div>
  );
}
