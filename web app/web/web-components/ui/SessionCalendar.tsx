import Link from 'next/link';

import { ChevronLeft, Chevron } from '@/components/shell/Icons';

import { Button } from './Button';

/**
 * SessionCalendar — one person's month, as outcomes. Catalogue entry
 * `c-sessioncalendar`, `.scal`.
 *
 * ── WHY IT IS NOT `components/schedule/MonthGrid.tsx` ───────────────────────
 *
 * That one is the SCHEDULE's month and it answers *which of my weeks are thin*:
 * a utilisation bar per cell — booked minutes over that day's own working
 * minutes — and an eighth column totalling the week. Every channel in it is
 * about the trainer's capacity, and none of them survives a change of subject.
 * One client's Tuesday holds one session; a bar reading *11% of your hours* for
 * it is arithmetic about somebody else's diary, and a week rail printing
 * *2 sessions · 14%* is a percentage of a week this client does not own.
 *
 * This grid answers a different question — *when did they train, when are they
 * coming, and what did they miss* — so its cell carries the sessions
 * themselves, one pill each, toned by what happened to it. The stylesheet's
 * `.scal` block carries the full argument.
 *
 * ── THE FIVE STATES ARE THE FILE'S FIVE, NOT A NEW SET ──────────────────────
 *
 * `shared.tsx`'s `classifySession` returns exactly five things and `SessionsTab`
 * gives each of them a `c-tag` tone. This component takes the same five and
 * uses the same tones, because the two are one tab apart on one client's file:
 * a calendar where green meant something other than what the table beside it
 * means by green would be worse than having only one of the two views.
 *
 * ── THE CELL IS WASHED, AND THE PILL IS NOT A BOX INSIDE A BOX ──────────────
 *
 * A client on this product trains once a day, so on almost every cell that
 * holds anything the pill IS the cell — and a bordered box inside a bordered
 * box to say so is chrome about chrome. `day.wash` washes the whole cell in
 * that outcome's tint, puts a 3px edge of it at the left, and the pill inside
 * gives up its own box and keeps the tone on the clock time. The month then
 * answers *which days do they come* by colour across 42 cells rather than by
 * finding eleven small boxes in them.
 *
 * Two things had to move for it. **Today became a ring rather than a fill** —
 * a cell cannot carry *when it is* and *what happened* in one background, so
 * the two split by channel and compose on all five states. And a day whose
 * sessions DISAGREE is not washed at all: the caller passes null, the pills
 * keep their boxes, and nothing has to invent which of two outcomes a single
 * background means.
 *
 * ── THE COMPONENT IS PRESENTATIONAL AND THE MONTH ARITHMETIC IS NOT HERE ────
 *
 * It takes weeks of cells and draws them. Which six rows a month is, where the
 * week starts, and what a session's state is are decisions with one right
 * answer per product and they live in `lib/clients/calendar.ts` — so the
 * library can render this component against a fixture without pulling a date
 * library in behind it.
 */

/** The five outcomes, in the order the legend names them. */
export type CalendarState = 'done' | 'booked' | 'missed' | 'unmarked' | 'cancelled';

/** What each state is called, on the legend and in an accessible name. */
export const CALENDAR_STATE_LABEL: Record<CalendarState, string> = {
  done: 'Completed',
  booked: 'Booked',
  missed: 'Missed',
  unmarked: 'Not marked',
  cancelled: 'Cancelled',
};

export interface CalendarSession {
  id: string;
  /** The clock time, already formatted by the caller. `6:00 AM`. */
  time: string;
  /** What the session was, if it has a name. Drawn beside the time on a desk. */
  label?: string | null;
  state: CalendarState;
  /** Where the pill goes. Omitted, it is drawn as text rather than a link. */
  href?: string;
  /**
   * The whole sentence a reader hears — the date, the time and the outcome.
   * Built by the caller, because only the caller knows the date the cell is.
   */
  spoken: string;
}

export interface CalendarDay {
  /** Midnight of this day, and the React key. */
  at: number;
  dayOfMonth: number;
  /** False for the leading and trailing days that complete the first and last weeks. */
  inMonth: boolean;
  isToday: boolean;
  sessions: CalendarSession[];
  /**
   * The one outcome this whole day is, when every session on it agrees — the
   * cell is then washed in that tone and the pills inside give up their boxes.
   * Null washes nothing, which is what a day holding two disagreeing sessions
   * gets: a background is one value and cannot carry two answers. The caller
   * decides it; `lib/clients/calendar.ts` carries the argument.
   */
  wash?: CalendarState | null;
}

export interface CalendarLegendItem {
  state: CalendarState;
  /** How many of this state are in the month on screen. */
  count: number;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function SessionCalendar({
  /** `September 2026`. */
  monthLabel,
  /** Rows of seven. See `.scal__r` for why this is not one flat run of 42. */
  weeks,
  legend,
  /** The right-hand figure. `14 sessions this month`. */
  total,
  onPrev,
  onNext,
  /**
   * The read behind this screen is windowed, so there is a first and a last
   * month that hold anything. Paging past them would draw six empty rows and
   * say nothing about why, so the arrow is disabled instead and `footnote`
   * states the window in words.
   */
  prevDisabled,
  nextDisabled,
  footnote,
  className,
}: {
  monthLabel: string;
  weeks: CalendarDay[][];
  legend: CalendarLegendItem[];
  total: string;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  footnote?: React.ReactNode;
  className?: string;
}) {
  const empty = weeks.every((w) => w.every((d) => d.sessions.length === 0));

  return (
    <div className={['scal', className].filter(Boolean).join(' ')}>
      <div className="scal__bar">
        <div className="scal__mon">
          <Button
            iconOnly
            label="The month before"
            size="sm"
            variant="ghost"
            icon={<ChevronLeft size={16} />}
            onClick={onPrev}
            disabled={prevDisabled}
          />
          {/* `aria-live`, because the two arrows either side of it are the only
              thing that changes it and a reader who presses one otherwise hears
              nothing happen. */}
          <div className="scal__t" aria-live="polite">
            {monthLabel}
          </div>
          <Button
            iconOnly
            label="The month after"
            size="sm"
            variant="ghost"
            icon={<Chevron size={16} />}
            onClick={onNext}
            disabled={nextDisabled}
          />
        </div>

        {/* THE KEY IS A LIST, not a row of divs: five coloured squares with
            words beside them ARE a list of five things, and a reader that gets
            them as one run of text hears "Completed 12 Booked 6 Missed 1". */}
        <ul className="scal__key">
          {legend.map((l) => (
            <li className={`scal__k scal__k--${l.state}`} key={l.state}>
              <i aria-hidden="true">
                <StateGlyph state={l.state} />
              </i>
              {CALENDAR_STATE_LABEL[l.state]}
              <b>{l.count}</b>
            </li>
          ))}
        </ul>

        <div className="scal__tot">{total}</div>
      </div>

      {empty ? (
        <p className="scal__none">Nothing on this client&rsquo;s calendar this month.</p>
      ) : null}

      <div className="scal__r" role="presentation">
        {DAY_SHORT.map((d) => (
          <div className="scal__hd" key={d}>
            {d}
          </div>
        ))}
      </div>

      {weeks.map((week) => (
        <div className="scal__r" key={week[0]?.at}>
          {week.map((day) => {
            const classes = ['scal__c'];
            if (!day.inMonth) classes.push('scal__c--out');
            /* Two classes, not one: `--wash` carries the structure (the edge,
               and the pill giving up its box) and `--w-{state}` carries only
               the colour, so the shape cannot be reached by a state the
               stylesheet has not been told about. */
            if (day.wash) classes.push('scal__c--wash', `scal__c--w-${day.wash}`);
            /* Last, so a ring is drawn over a wash and never instead of it. */
            if (day.isToday) classes.push('scal__c--today');

            return (
              <div
                className={classes.join(' ')}
                key={day.at}
                aria-current={day.isToday ? 'date' : undefined}
              >
                {/* The date number is `aria-hidden` and every pill below it
                    names its own full date. A reader walking a month otherwise
                    hears "14" and then a time with no day attached to it.
                    Today is the exception, because an empty today has no pill
                    to say so: it is read, with its word. */}
                {day.isToday ? (
                  <span className="scal__d">
                    <span className="vh">Today, </span>
                    {day.dayOfMonth}
                  </span>
                ) : (
                  <span className="scal__d" aria-hidden="true">
                    {day.dayOfMonth}
                  </span>
                )}
                {day.sessions.length > 0 && (
                  <div className="scal__ss">
                    {day.sessions.map((s) => (
                      <SessionPill key={s.id} session={s} only={day.sessions.length === 1} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {footnote ? <p className="scal__foot">{footnote}</p> : null}
    </div>
  );
}

/**
 * One session. A link when it has somewhere to go, and a `<span>` when it does
 * not — never an anchor with no `href`, which is a tab stop that does nothing.
 *
 * The `<i>` is the phone's whole rendering of this pill and is drawn at every
 * width: below 760px the time and the label are `display:none` and the dot is
 * all that is left, so a cell 48px wide still answers *which days* and *what
 * happened*. `aria-label` carries the sentence either way, which is why losing
 * the clock time to a media query costs a reader nothing.
 */
function SessionPill({ session, only }: { session: CalendarSession; only: boolean }) {
  const inner = (
    <>
      <i aria-hidden="true">
        <StateGlyph state={session.state} />
      </i>
      <b>{session.time}</b>
      {session.label ? <span>{session.label}</span> : null}
    </>
  );
  const className = `scal__s scal__s--${session.state}${only ? ' scal__s--only' : ''}`;

  if (!session.href) {
    return (
      <span className={className} role="img" aria-label={session.spoken}>
        {inner}
      </span>
    );
  }

  return (
    <Link className={className} href={session.href} aria-label={session.spoken}>
      {inner}
    </Link>
  );
}

/**
 * A SHAPE PER STATE, so the outcome is never carried by hue alone. The four
 * tones have near-identical luminance, which makes them one colour to a reader
 * who cannot separate red from green; check, ring, cross, half-moon and dash can
 * be told apart in grayscale. Drawn in `currentColor`, so the pill, the legend
 * and the phone's dot take the tone from their own rule and cannot drift.
 */
export function StateGlyph({ state }: { state: CalendarState }) {
  const common = {
    viewBox: '0 0 12 12',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    focusable: false,
  };
  switch (state) {
    case 'done':
      return (
        <svg {...common}>
          <path d="M2.2 6.4 4.9 9 9.8 3.2" />
        </svg>
      );
    case 'booked':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="3.8" />
        </svg>
      );
    case 'missed':
      return (
        <svg {...common}>
          <path d="M3 3 9 9M9 3 3 9" />
        </svg>
      );
    case 'unmarked':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="3.8" />
          <path d="M6 2.2a3.8 3.8 0 0 0 0 7.6Z" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M2.8 6h6.4" />
        </svg>
      );
  }
}
