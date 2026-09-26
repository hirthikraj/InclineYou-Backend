'use client';

import { formatMinute } from '@/lib/today/time';
import type { ScheduleGrid } from '@/lib/schedule/grid';

/** 0 = Monday … 6 = Sunday — matches `working_hours.weekday` convention. */
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * How many pips a column shows before the rest collapse into a +N chip.
 *
 * Was six, and six was the number that fitted UNDER two bands of duplicated
 * counts. Those are one 44px strip now, so the column has ~100px more to work
 * with on an 844px phone — reclaimed height that would otherwise have become
 * whitespace under the legend, since `.wkp__grid` is `flex:0 0 auto` and a pip
 * is a fixed 44px. Space given back to a screen has to land on something or it
 * was not given back.
 *
 * Seven at 47px a row (44 plus the 3px column gap) is what an 844px phone clears
 * with the top bar, toolbar, strip and tab bar in place, and it is chosen to fit
 * rather than to fill: eight was measured at 16px over, and a grid that scrolls
 * by 16px reads as broken in a way that one fewer pip does not. A shorter phone
 * scrolls `.wkp`, which is what it already did at six.
 */
const MAX_PIPS = 7;

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
  const { days } = grid;

  return (
    <div className="wkp">
      {/*
        THE TALLY PILL THAT WAS HERE IS NOW `ScheduleStats`, ONE LEVEL UP.
        It said *42 booked · 22 done · 25h free* and it was drawn only on the
        week, below a header subtitle that was already saying *42 sessions* and
        *23 sellable hours free* — the same numbers, twice, in 119px. The strip
        that replaced it is 44px, sits on all three views, and carries each fact
        once. Nothing was lost from this component except the duplication: `done`
        moved with it, and the free hours went to the `Show gaps · N` chip that
        was always the better place for them.
      */}

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
          In Person
        </span>
        <span>
          <s style={{ background: 'var(--tx-remote)' }} />
          Online
        </span>
      </div>
    </div>
  );
}
