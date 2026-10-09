'use client';

import { useEffect, useRef, useState } from 'react';

import { periodChip, periodSpanLabel, samePeriod, type Period } from '@/lib/money/period';
import { Button } from '@/web-components/ui/Button';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * THE PERIOD PICKER — this is `MonthPicker` with two rows added above the grid,
 * and the two rows are the point.
 *
 * `MonthPicker` could express exactly one thought: *this calendar month*. Every
 * question that spans — is collection getting worse, did the gym's cut move, is
 * this a bad month or a bad quarter — cost the trainer three visits and three
 * numbers held in their head. The spans go FIRST, above the grid and above the
 * year stepper, because a span is the coarser question and reading down from
 * coarse to fine is how the trainer already narrows: the practice, then the
 * quarter, then the month it went wrong in.
 *
 * They are anchored to today, not to the year the grid happens to be showing —
 * "last 3 months" is a moving window and pretending otherwise (last 3 months
 * *from March*, in a picker parked on 2024) would be a different feature wearing
 * the same words. Stepping the year therefore does not touch them, and picking a
 * month clears the span.
 *
 * The future is still disabled in the grid. It was disabled before, and a book
 * cannot have entries in a month that has not happened.
 */
interface PeriodPickerProps {
  period: Period;
  /** Earliest year to allow navigating to. Defaults to 2020. */
  minYear?: number;
  /** Upper bound — months after this are disabled. The server's `now`, so the
   *  bound does not shift under a client whose clock disagrees. */
  nowMs: number;
  onChange: (period: Period) => void;
}

export function PeriodPicker({ period, minYear = 2020, nowMs, onChange }: PeriodPickerProps) {
  const capDate = new Date(nowMs);
  const maxYear = capDate.getFullYear();
  const maxMonth = capDate.getMonth() + 1; // 1-based

  // Which year the GRID should show. Seeded from the selection when that is a
  // month, and from today when it is a span — a span has no year of its own.
  const anchorYear = period.kind === 'month' ? period.year : maxYear;

  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(anchorYear);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* Re-anchoring happens on OPEN, not in an effect watching `anchorYear`.
     `MonthPicker` did the latter and it was the one `react-hooks` error in this
     directory: a setState in an effect body is a second render pass to say
     something the open handler already knows. The behaviour is also better —
     stepping to 2024 and picking March leaves the grid on 2024 while it closes,
     rather than snapping under the cursor. */
  function toggle() {
    if (!open) setPickerYear(anchorYear);
    setOpen((v) => !v);
  }

  // Close on click-outside or Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  function isFuture(y: number, m: number) {
    return y > maxYear || (y === maxYear && m > maxMonth);
  }

  function pick(next: Period) {
    setOpen(false);
    onChange(next);
  }

  const span = periodSpanLabel(period, nowMs);

  return (
    <div ref={wrapRef} className="pp">
      {/* Trigger */}
      <Button
        variant="secondary"
        className="pp__tr"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        style={{ gap: 6, minWidth: 132 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{periodChip(period)}</span>
        <svg className="pp__chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>

      {/* Dropdown */}
      {open && (
        <div className="pp__pop" role="dialog" aria-label="Pick a period">
          {/* The spans — first, because they are the coarser question. */}
          <div className="pp__spans">
            {([3, 6] as const).map((months) => {
              const p: Period = { kind: 'recent', months };
              return (
                <button
                  key={months}
                  type="button"
                  className="pp__o pp__o--span"
                  aria-pressed={samePeriod(period, p)}
                  onClick={() => pick(p)}
                >
                  <span>Last {months} months</span>
                  <small>{periodSpanLabel(p, nowMs)}</small>
                </button>
              );
            })}
          </div>

          {/* Year navigation */}
          <div className="pp__yr">
            <button
              className="btn btn--icon btn--ghost"
              type="button"
              aria-label="Previous year"
              disabled={pickerYear <= minYear}
              onClick={() => setPickerYear((y) => y - 1)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <b>{pickerYear}</b>
            <button
              className="btn btn--icon btn--ghost"
              type="button"
              aria-label="Next year"
              disabled={pickerYear >= maxYear}
              onClick={() => setPickerYear((y) => y + 1)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Month grid — 4 rows × 3 cols */}
          <div className="pp__grid">
            {MONTHS.map((label, i) => {
              const m = i + 1;
              return (
                <button
                  key={label}
                  type="button"
                  className="pp__o pp__o--month"
                  disabled={isFuture(pickerYear, m)}
                  aria-pressed={
                    period.kind === 'month' && pickerYear === period.year && m === period.month
                  }
                  onClick={() => pick({ kind: 'month', year: pickerYear, month: m })}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* What a span actually resolved to, spelled out once at the bottom so
              the trainer never has to count months to know what they are reading. */}
          {span && <div className="pp__foot">Showing {span}</div>}
        </div>
      )}
    </div>
  );
}
