'use client';

import { formatMinute } from '@/lib/today/time';
import type { ScheduleGrid } from '@/lib/schedule/grid';

/** 0 = Monday … 6 = Sunday — matches `working_hours.weekday` convention. */
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * How many pips a column shows before the rest collapse into a +N chip.
 * Six keeps columns at a scan-able height on a 390px screen without hiding
 * workload a trainer might need to see at a glance.
 */
const MAX_PIPS = 6;

interface WeekPipsProps {
  grid: ScheduleGrid;
  onOpenDay: (at: number) => void;
}

/**
 * THE MOBILE WEEK — SEVEN COLUMNS OF PIPS, NOT A TIME GRID.
 *
 * On a phone column width the time grid becomes an exercise in horizontal
 * scrolling across seven columns that are each too narrow to place a time
 * accurately: a 6:00 session and a 6:30 session land on the same pixel. The
 * pip design is the honest answer — shape and load, not exact position. Exact
 * times are what the day view is for, and every pip is one tap away from it.
 *
 * Rendered at all widths. CSS (`app.css`) hides it above 900px where the
 * time grid takes over; the time grid is hidden at ≤900px in week view.
 */
export function WeekPips({ grid, onOpenDay }: WeekPipsProps) {
  const { days, totals } = grid;

  const done = days.reduce(
    (n, d) => n + d.placed.filter((p) => p.session.done).length,
    0,
  );
  const freeHours = Math.round(totals.gapMinutes / 60);

  return (
    <div className="wkp">
      {/* Tally bar: booked · done · free */}
      <div className="wkp__tally" aria-label="Week summary">
        <span>
          <b>{totals.sessions}</b>booked
        </span>
        <hr aria-hidden="true" />
        <span data-tone="ok">
          <b>{done}</b>done
        </span>
        <hr aria-hidden="true" />
        <span data-tone={freeHours > 0 ? 'warn' : undefined}>
          <b>{freeHours}h</b>free
        </span>
      </div>

      {/* Seven-column pip grid */}
      <div className="wkp__grid" role="group" aria-label="Sessions this week by day">
        {days.map((day) => {
          const visible =
            day.placed.length > MAX_PIPS
              ? day.placed.slice(0, MAX_PIPS - 1)
              : day.placed;
          const overflow =
            day.placed.length > MAX_PIPS ? day.placed.length - (MAX_PIPS - 1) : 0;

          return (
            <div
              key={day.at}
              className="wkp__col"
              data-today={day.isToday || undefined}
            >
              {/* Day header: abbreviated weekday + date number */}
              <div className="wkp__h">
                <span>{DAY_SHORT[day.weekday]}</span>
                <b>{day.dayOfMonth}</b>
              </div>

              {day.placed.length === 0 ? (
                <button
                  type="button"
                  className="wkp__pip wkp__pip--off"
                  onClick={() => onOpenDay(day.at)}
                  aria-label={`${DAY_SHORT[day.weekday]} ${day.dayOfMonth}, no sessions`}
                >
                  off
                </button>
              ) : (
                <>
                  {visible.map((p) => (
                    <button
                      key={p.session.id}
                      type="button"
                      className={
                        p.session.mode === 'remote'
                          ? 'wkp__pip wkp__pip--remote'
                          : 'wkp__pip'
                      }
                      onClick={() => onOpenDay(day.at)}
                      aria-label={`${formatMinute(p.startMinute)}, ${p.session.clientName}`}
                    >
                      <b>{formatMinute(p.startMinute)}</b>
                      <span>{p.session.clientName}</span>
                    </button>
                  ))}
                  {overflow > 0 && (
                    <button
                      type="button"
                      className="wkp__more"
                      onClick={() => onOpenDay(day.at)}
                      aria-label={`${overflow} more ${overflow === 1 ? 'session' : 'sessions'}, open day view`}
                    >
                      +{overflow}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="wkp__leg" aria-hidden="true">
        <span>
          <s style={{ background: 'var(--tx-accent)' }} />
          Floor
        </span>
        <span>
          <s style={{ background: 'var(--tx-remote)' }} />
          Remote
        </span>
      </div>
    </div>
  );
}
