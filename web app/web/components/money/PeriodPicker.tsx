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
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <Button
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        style={{ gap: 6, minWidth: 132 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{periodChip(period)}</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>

      {/* Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Pick a period"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 60,
            width: 240,
            /* --w-surface does not exist. An undefined custom property resolves
               to nothing, so this popup had NO background and the payments table behind
               it read straight through the month grid. The `--w-*` family is
               layout and state (hover, selected, rail, row); a surface is `--tx-`. */
            background: 'var(--tx-surface)',
            border: '1px solid var(--tx-line)',
            borderRadius: 'var(--tx-r3)',
            boxShadow: '0 8px 24px rgba(0,0,0,.18)',
            overflow: 'hidden',
          }}
        >
          {/* The spans — first, because they are the coarser question. */}
          <div style={{ padding: 6, borderBottom: '1px solid var(--tx-line)' }}>
            {([3, 6] as const).map((months) => {
              const p: Period = { kind: 'recent', months };
              const isSelected = samePeriod(period, p);
              return (
                <button
                  key={months}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => pick(p)}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8,
                    width: '100%',
                    padding: '8px 8px',
                    borderRadius: 'var(--tx-r2)',
                    border: '1px solid transparent',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontWeight: isSelected ? 700 : 400,
                    background: isSelected ? 'var(--tx-accent)' : 'transparent',
                    color: isSelected ? '#000' : 'var(--tx-ink)',
                    transition: 'background .1s, color .1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--w-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <span>Last {months} months</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      opacity: isSelected ? 0.7 : 1,
                      color: isSelected ? '#000' : 'var(--tx-ink-3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {periodSpanLabel({ kind: 'recent', months }, nowMs)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Year navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid var(--tx-line)',
            }}
          >
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
            <span style={{ fontFamily: 'var(--tx-brand)', fontWeight: 800, fontSize: 15 }}>
              {pickerYear}
            </span>
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 4,
              padding: 10,
            }}
          >
            {MONTHS.map((label, i) => {
              const m = i + 1;
              const isSelected =
                period.kind === 'month' && pickerYear === period.year && m === period.month;
              const disabled = isFuture(pickerYear, m);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  onClick={() => pick({ kind: 'month', year: pickerYear, month: m })}
                  style={{
                    padding: '7px 4px',
                    borderRadius: 'var(--tx-r2)',
                    border: '1px solid transparent',
                    fontSize: 13,
                    fontFamily: 'var(--tx-mono)',
                    fontWeight: isSelected ? 700 : 400,
                    cursor: disabled ? 'default' : 'pointer',
                    opacity: disabled ? 0.32 : 1,
                    background: isSelected ? 'var(--tx-accent)' : 'transparent',
                    color: isSelected ? '#000' : disabled ? 'var(--tx-ink-3)' : 'var(--tx-ink)',
                    transition: 'background .1s, color .1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!disabled && !isSelected)
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--w-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!disabled && !isSelected)
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* What a span actually resolved to, spelled out once at the bottom so
              the trainer never has to count months to know what they are reading. */}
          {span && (
            <div
              style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--tx-line)',
                fontSize: 11,
                color: 'var(--tx-ink-3)',
              }}
            >
              Showing {span}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
