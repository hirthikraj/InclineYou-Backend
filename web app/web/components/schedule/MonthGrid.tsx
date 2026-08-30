'use client';

import { dayLong } from '@/lib/today/time';
import type { MonthModel, MonthWeek } from '@/lib/schedule/month';
import { WarnTriangle } from './Icons';

/**
 * THE MONTH — DENSITY, NOT GEOMETRY.
 *
 * The week is one minute to one pixel. A month at that scale is about 28,000px,
 * so this is the one view that must NOT be that grid: it answers a different
 * question — *which weeks are thin* — and therefore needs a different encoding.
 * `lib/schedule/month.ts` carries the three channels and why each does exactly
 * one job; this file draws them.
 *
 * ── WHAT IS NOT BUILT HERE, AND WHY IT IS NOT A GAP ──────────────────────────
 *
 * The design's frame 3a is *"the month — density, and the dated hole"*, and the
 * dated hole is a `time_blocks` row: a fortnight away, drawn as one spanning bar
 * across the days it covers. webapp.css ships `.mo__blk` for it.
 *
 * It is not drawn, because `time_blocks` **has no REST endpoint**. It reaches the
 * wire only inside the WatermelonDB sync envelope, exactly as `working_hours` did
 * before `GET /v1/working-hours` was added for Today. Drawing it would mean
 * either `/v1/sync/pull` — which `lib/today/api.ts` forbids on a built screen, at
 * length, and a month view is precisely the screen that would abuse it — or
 * inventing the endpoint, which is a backend change and belongs in a commit that
 * also updates `backend/API.md`.
 *
 * So it is recorded rather than faked. A trainer's time off shows on this screen
 * as days with no sessions and no bar, which is true but says nothing about why.
 * `.mo__blk` stays in the stylesheet, unused, waiting for `GET /v1/time-blocks`.
 */

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface MonthGridProps {
  month: MonthModel;
  /** Opens that day in the day view. A month cell is a way in, not a surface. */
  onOpenDay: (at: number) => void;
  onOpenWeek: (at: number) => void;
}

export function MonthGrid({ month, onOpenDay, onOpenWeek }: MonthGridProps) {
  return (
    <div className="cw__scroll cw__scroll--mo">
      <div className="mo" role="group" aria-label="The month, by how full each day is">
        <div className="mo__r">
          {DAY_SHORT.map((d) => (
            <div className="mo__hd" key={d}>
              {d}
            </div>
          ))}
          <div className="mo__hd mo__hd--rail">Week</div>
        </div>

        {month.weeks.map((week) => (
          <div className="mo__r" key={week.index}>
            {week.cells.map((cell) => {
              const { day } = cell;
              const classes = ['mo__c'];
              if (day.isToday) classes.push('mo__c--today');
              if (!cell.inMonth) classes.push('mo__c--out');

              /*
               * The whole cell is the control, and its accessible name is the
               * sentence — a date number alone tells a screen reader nothing
               * about the thing the bar beside it encodes.
               */
              const label = [
                dayLong(day.at),
                `${day.count} ${day.count === 1 ? 'session' : 'sessions'}`,
                cell.utilisation !== null
                  ? `${cell.utilisation}% of your hours${cell.over ? ', overbooked' : ''}`
                  : 'no working hours set',
                day.hasClash ? 'one clash' : null,
              ]
                .filter(Boolean)
                .join(', ');

              return (
                <button
                  type="button"
                  key={day.at}
                  className={classes.join(' ')}
                  aria-label={label}
                  aria-current={day.isToday ? 'date' : undefined}
                  onClick={() => onOpenDay(day.at)}
                >
                  <span className="mo__top">
                    <span className="mo__d">{day.dayOfMonth}</span>
                    {/* THE MARKER SITS WITH THE DATE, NOT WITH THE COUNT.

                        Same defect the week's day head had, found the same way:
                        `<triangle/>{count}` inside one span rendered as "⚠ 26",
                        which reads as twenty-six warnings and not as *26
                        sessions, one of which overlaps*. A clash is a fact about
                        the DAY, so it is drawn beside the day's number; the
                        session count keeps the right-hand slot and its own tone
                        in every state. */}
                    {day.hasClash && (
                      <span className="mo__cl" title="Two or more sessions overlap on this day">
                        <WarnTriangle size={11} />
                      </span>
                    )}
                    {/* `full` and `clash` mark the FIGURE, never the bar: a count
                        is a count fact and the bar is a time fact, and letting a
                        tone cross between them is how an axis starts meaning two
                        things. */}
                    <span
                      className={cell.full ? 'mo__n mo__n--full' : 'mo__n'}
                      aria-hidden="true"
                    >
                      {day.count || ''}
                    </span>
                  </span>

                  {/* Length is utilisation, fill is floor against remote. The
                      track is drawn even at zero, because an empty track at a
                      day's foot says "nothing booked" where no track at all says
                      "nothing here" — and on a Sunday those differ.

                      WHICH IS EXACTLY WHY A DAY WITH NO HOURS ANSWERED GETS NO
                      TRACK. Those two states were both drawing the same empty
                      track, so a Wednesday this trainer does not work looked
                      identical to a Friday they work and sold nothing on — and
                      only one of those is a day with something to fix. */}
                  {cell.utilisation !== null && (
                    <span
                      className={cell.over ? 'mo__bar mo__bar--over' : 'mo__bar'}
                      aria-hidden="true"
                    >
                      <i style={{ width: `${cell.floorPct}%` }} />
                      <s style={{ width: `${cell.remotePct}%` }} />
                    </span>
                  )}
                  {/* A day with no hours answered prints NOTHING rather than a
                      bare middot. The middot was meant to read as "no answer" and
                      rendered as a speck of dust — and on a month where the
                      trainer does not work Wednesdays it appeared five times in a
                      column, which looks like five rendering faults. The absence
                      is already carried by the empty track above it, and the
                      cell's accessible name says it in words. */}
                  <span
                    className={cell.over ? 'mo__u mo__u--over' : 'mo__u'}
                    aria-hidden="true"
                  >
                    {cell.utilisation ? `${cell.utilisation}%` : ''}
                  </span>
                </button>
              );
            })}

            <WeekRail week={week} onOpen={onOpenWeek} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The eighth column: the week, totalled.
 *
 * *Every calendar bounds a series in time. This one bounds it in money* — the
 * design's own subheading, and the rail is where that happens: a week is the unit
 * a trainer sells in, so a month grid whose rows do not total is a month grid
 * that says less than the week view it sits beside.
 *
 * Under 760px this column is dropped entirely rather than squeezed; see
 * *THE MONTH ON A PHONE* in app.css for what replaces it and why.
 */
function WeekRail({ week, onOpen }: { week: MonthWeek; onOpen: (at: number) => void }) {
  const first = week.cells[0]?.day.at;
  const classes = ['mo__wk'];
  if (week.thin) classes.push('mo__wk--thin');

  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={() => first && onOpen(first)}
      aria-label={
        `Week of ${first ? dayLong(first) : ''}: ${week.sessions} `
        + `${week.sessions === 1 ? 'session' : 'sessions'}`
        + (week.utilisation !== null ? `, ${week.utilisation}% of your hours` : '')
        + (week.thin ? '. The thinnest week of the month.' : '')
      }
    >
      <b>
        {week.sessions} {week.sessions === 1 ? 'session' : 'sessions'}
      </b>
      {/* A week with nothing in it says so once, in the line above. Printing
          "0%" beside "0 sessions" is the same fact twice, and a month opened on
          a future date is five of those stacked down the rail. */}
      {week.sessions > 0 && (
        <span className={week.over ? 'mo__wku--over' : undefined}>
          {week.utilisation !== null ? `${week.utilisation}%` : 'no hours set'}
        </span>
      )}
    </button>
  );
}
