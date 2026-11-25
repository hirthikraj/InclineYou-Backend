'use client';

import type { ReactNode } from 'react';
import { Chevron, ChevronLeft } from '@/components/shell/Icons';
import { Button } from './Button';

/**
 * SlotPicker — a week of days, then the open times on the one picked.
 *
 * Two questions in the order a person answers them: *which day* (seven cards,
 * each saying how many times are still open) and *what time* (a grid of the open
 * starts on that day). The arithmetic is the caller's — this draws what it is
 * given, so the library can render it without a diary and the booking panel can
 * feed it working hours minus sessions (`lib/schedule/slots.ts`).
 *
 * A day's count is `null` while it is unknown (its week is still loading), and
 * the card says `…` rather than `0 open`: zero is a claim, unknown is not.
 *
 * The day cards are a radiogroup and so are the times — one of each is chosen.
 * Arrow keys are not wired; both are short rows of real buttons in tab order.
 */

export interface SlotDay {
  at: number;
  /** "Mon" — or "Today". */
  label: string;
  date: number;
  /** Open times on the day; null while unknown. */
  open: number | null;
  disabled?: boolean;
}

export interface SlotTime {
  minute: number;
  label: string;
}

interface SlotPickerProps {
  title: ReactNode;
  hint?: ReactNode;
  days: SlotDay[];
  dayAt: number;
  onDay: (at: number) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  prevDisabled?: boolean;
  /** "Mon 23 Nov · 7 open times" — drawn above the grid. */
  caption: ReactNode;
  times: SlotTime[];
  minute: number | null;
  onTime: (minute: number) => void;
  /** Drawn in place of the grid when `times` is empty. */
  empty?: ReactNode;
}

export function SlotPicker({
  title, hint, days, dayAt, onDay, onPrevWeek, onNextWeek, prevDisabled,
  caption, times, minute, onTime, empty,
}: SlotPickerProps) {
  return (
    <div className="slotp">
      <div className="slotp__hd">
        <div className="slotp__ttl">
          <p className="slotp__t">{title}</p>
          {hint && <p className="slotp__h">{hint}</p>}
        </div>
        <Button variant="secondary" size="sm" iconOnly label="Previous week" icon={<ChevronLeft size={15} />}
          onClick={onPrevWeek} disabled={prevDisabled} />
        <Button variant="secondary" size="sm" iconOnly label="Next week" icon={<Chevron size={15} />}
          onClick={onNextWeek} />
      </div>

      <div className="slotp__days" role="radiogroup" aria-label="Day">
        {days.map((d) => (
          <button
            key={d.at}
            type="button"
            role="radio"
            aria-checked={d.at === dayAt}
            disabled={d.disabled}
            className={d.open === 0 ? 'slotp__day slotp__day--none' : 'slotp__day'}
            onClick={() => onDay(d.at)}
          >
            <span className="slotp__dl">{d.label}</span>
            <b className="slotp__dn">{d.date}</b>
            <span className="slotp__do">{d.open === null ? '…' : `${d.open} open`}</span>
          </button>
        ))}
      </div>

      <p className="slotp__cap">{caption}</p>

      {times.length > 0 ? (
        <div className="slotp__times" role="radiogroup" aria-label="Time">
          {times.map((t) => (
            <button
              key={t.minute}
              type="button"
              role="radio"
              aria-checked={t.minute === minute}
              className="slotp__time"
              onClick={() => onTime(t.minute)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : (
        empty && <p className="slotp__empty">{empty}</p>
      )}
    </div>
  );
}
