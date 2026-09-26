/* A CLIENT ENTRY, like every other specimen with a control in it. The two
   arrows are real `c-button`s taking real handlers, and a server component may
   not hand a function across the boundary — the bench's are no-ops, but a no-op
   is still a function. */
'use client';

import {
  SessionCalendar,
  CALENDAR_STATE_LABEL,
  type CalendarDay,
  type CalendarSession,
  type CalendarState,
} from '../../../ui/SessionCalendar';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/* A fixed September 2026, so the specimen does not change under the reader.
   Built from plain numbers rather than `lib/clients/calendar.ts` — the point of
   keeping the arithmetic out of the component is that the library can render it
   without one. */
const START = new Date(2026, 7, 31).getTime(); /* Monday 31 August */
const DAY = 86_400_000;

const pill = (
  id: string,
  time: string,
  state: CalendarState,
  label?: string,
): CalendarSession => ({
  id,
  time,
  label,
  state,
  href: '#',
  spoken: `${time}, ${CALENDAR_STATE_LABEL[state].toLowerCase()}`,
});

/** day-of-month → what happened on it. Everything else is an empty day. */
const SEPTEMBER: Record<number, CalendarSession[]> = {
  1: [pill('a', '6:00 AM', 'done', 'Push')],
  3: [pill('b', '6:00 AM', 'done', 'Pull')],
  5: [pill('c', '7:30 AM', 'missed', 'Legs')],
  8: [pill('d', '6:00 AM', 'done', 'Push')],
  10: [pill('e', '6:00 AM', 'cancelled', 'Pull')],
  12: [pill('f', '7:30 AM', 'done', 'Legs')],
  15: [pill('g', '6:00 AM', 'unmarked', 'Push')],
  17: [pill('h', '6:00 AM', 'booked', 'Pull')],
  19: [pill('i', '7:30 AM', 'booked', 'Legs'), pill('j', '5:00 PM', 'booked', 'Conditioning')],
  22: [pill('k', '6:00 AM', 'booked', 'Push')],
  24: [pill('l', '6:00 AM', 'booked', 'Pull')],
};

const weeks: CalendarDay[][] = Array.from({ length: 6 }, (_, w) =>
  Array.from({ length: 7 }, (_, i) => {
    const at = START + (w * 7 + i) * DAY;
    const d = new Date(at);
    const inMonth = d.getMonth() === 8;
    const sessions = (inMonth && SEPTEMBER[d.getDate()]) || [];
    return {
      at,
      dayOfMonth: d.getDate(),
      inMonth,
      isToday: inMonth && d.getDate() === 15,
      sessions,
      /* The same rule `buildClientMonth` applies: a day whose sessions agree is
         washed in that tone, and one whose sessions disagree is not. The 19th
         in this fixture holds two, and they agree. */
      wash: sessions.length && sessions.every((x) => x.state === sessions[0].state)
        ? sessions[0].state
        : null,
    };
  }),
);

const legend = (['done', 'booked', 'missed', 'unmarked', 'cancelled'] as CalendarState[]).map(
  (state) => ({
    state,
    count: weeks
      .flat()
      .filter((d) => d.inMonth)
      .reduce((n, d) => n + d.sessions.filter((s) => s.state === state).length, 0),
  }),
);

export function SessionCalendarEntry() {
  const entry = byId('c-sessioncalendar')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/SessionCalendar.tsx</code> },
        { k: 'Class', v: <code>.scal</code> },
        { k: 'Model', v: <code>lib/clients/calendar.ts</code> },
        { k: 'Rows', v: '6, always' },
        { k: 'States', v: '5' },
        { k: 'Used in', v: 'the client file’s Calendar tab' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            One client&rsquo;s September. A pill per session, toned by what happened to it, and a key
            that names the tones. The month, the two arrows and the figure sit on one bar.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="SEPTEMBER 2026 · FOUR DONE, FIVE BOOKED, ONE MISSED" stretch>
            <SessionCalendar
              monthLabel="September 2026"
              weeks={weeks}
              legend={legend}
              total="12 sessions"
              onPrev={() => {}}
              onNext={() => {}}
              footnote="The last three months and everything booked ahead."
            />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Why it is not the schedule’s month"
        lede={
          <>
            <code>components/schedule/MonthGrid.tsx</code> already draws a month, and it answers{' '}
            <em>which of my weeks are thin</em>: a bar per cell measuring booked minutes against
            that day&rsquo;s own working minutes, and an eighth column totalling the week. Every
            channel in it is about the <b>trainer&rsquo;s capacity</b>, and none of them survives
            being pointed at one person.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div className="scal" style={{ width: 240 }}>
                <div className="scal__r">
                  {weeks[2].slice(0, 3).map((d) => (
                    <div className="scal__c" key={d.at}>
                      <span className="scal__d">{d.dayOfMonth}</span>
                      <div className="scal__ss">
                        {d.sessions.map((s) => (
                          <span className={`scal__s scal__s--${s.state}`} key={s.id}>
                            <i aria-hidden="true" />
                            <b>{s.time}</b>
                            <span>{s.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ),
            caption: (
              <>
                The cell carries the <b>sessions</b>. A trainer reads the days they come and the one
                they did not, without counting anything.
              </>
            ),
          }}
          no={{
            figure: (
              <div className="scal" style={{ width: 240 }}>
                <div className="scal__r">
                  {[14, 15, 16].map((n) => (
                    <div className="scal__c" key={n}>
                      <span className="scal__d">{n}</span>
                      <span className="mo__n" style={{ marginLeft: 0 }}>
                        1
                      </span>
                      <span className="mo__bar" aria-hidden="true">
                        <i style={{ width: '11%' }} />
                      </span>
                      <span className="mo__u">11%</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            caption: (
              <>
                The schedule&rsquo;s encoding, pointed at one person: a count of <b>1</b> that the
                pill already said, and <b>11% of your hours</b> — a percentage of a diary this
                client does not own.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="Five states, and they are the client file’s five"
        lede={
          <>
            <code>shared.tsx</code>&rsquo;s <code>classifySession</code> decides what a session row
            is, and <code>SessionsTab</code> gives each of its five outcomes a <code>c-tag</code>{' '}
            tone. This component takes the same five and uses the same tones — the two views are one
            tab apart on one client&rsquo;s file, and a calendar where green meant something other
            than what the table beside it means by green would be worse than having only one of
            them. <code>no_show</code> is re-spelt <b>Missed</b>, because a 48px cell has no room
            for a hyphenated compound.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="ALL FIVE · DONE · BOOKED · MISSED · NOT MARKED · CANCELLED" stretch>
            <div className="scal__ss" style={{ width: 190 }}>
              {(['done', 'booked', 'missed', 'unmarked', 'cancelled'] as CalendarState[]).map(
                (s) => (
                  <span className={`scal__s scal__s--${s}`} key={s}>
                    <i aria-hidden="true" />
                    <b>6:00 AM</b>
                    <span>{CALENDAR_STATE_LABEL[s]}</span>
                  </span>
                ),
              )}
            </div>
          </Cell>
          <Cell label="THE KEY, AT PILL SCALE" stretch>
            <ul className="scal__key">
              {legend.map((l) => (
                <li className={`scal__k scal__k--${l.state}`} key={l.state}>
                  <i aria-hidden="true" />
                  {CALENDAR_STATE_LABEL[l.state]}
                  <b>{l.count}</b>
                </li>
              ))}
            </ul>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The cell is washed, and today became a ring"
        lede={
          <>
            A client trains once a day, so on almost every cell that holds anything the pill{' '}
            <em>is</em> the cell — and a bordered box inside a bordered box to say so is chrome
            about chrome. Washed, the month answers <em>which days do they come</em> by colour
            across 42 cells instead of by finding eleven small boxes in them. Three things keep it
            honest: the tint is the pill&rsquo;s own <code>-soft</code> token unchanged, so the date
            number keeps its contrast; a <b>3px edge at full strength</b> gives the wash a second
            channel, because colour alone fails for the ~8% of men who cannot separate the green
            from the red; and the pill keeps its tone on the clock time.
            <br />
            <br />
            The cost was paid by <b>today</b>, which used to be a full-cell accent fill. A cell
            cannot carry <em>when it is</em> and <em>what happened</em> in one background, so the
            two split by channel — the fill is the outcome, the ring is the date — exactly as{' '}
            <code>c-weekdots</code> splits <code>--now</code> from its four states. They compose on
            all five.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="ALL FIVE, WASHED · AND THE LAST ONE IS ALSO TODAY" stretch>
            <div className="scal" style={{ width: 380 }}>
              <div className="scal__r" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }}>
                {(['done', 'booked', 'missed', 'unmarked', 'cancelled'] as CalendarState[]).map(
                  (st, i) => (
                    <div
                      className={`scal__c scal__c--wash scal__c--w-${st}${
                        i === 4 ? ' scal__c--today' : ''
                      }`}
                      key={st}
                    >
                      <span className="scal__d">{i + 1}</span>
                      <div className="scal__ss">
                        <span className={`scal__s scal__s--${st}`}>
                          <i aria-hidden="true" />
                          <b>6:00 AM</b>
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </Cell>
          <Cell label="TWO SESSIONS THAT DISAGREE · NOT WASHED, AND THE PILLS SAY IT" stretch>
            <div className="scal" style={{ width: 160 }}>
              <div className="scal__r" style={{ gridTemplateColumns: '1fr' }}>
                <div className="scal__c">
                  <span className="scal__d">19</span>
                  <div className="scal__ss">
                    <span className="scal__s scal__s--done">
                      <i aria-hidden="true" />
                      <b>7:30 AM</b>
                      <span>Legs</span>
                    </span>
                    <span className="scal__s scal__s--missed">
                      <i aria-hidden="true" />
                      <b>5:00 PM</b>
                      <span>Cond.</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Six rows, always"
        lede={
          <>
            A month needs four, five or six rows depending on the weekday it opens on. Sized to the
            month, the box changes height as a trainer pages through the year — and on a tab whose
            content sits in an inner scroller, a 96px jump between September and October moves
            everything below it. Six is the maximum any month can need, so the box is still and the
            padding days are drawn dimmed rather than blank: a session on 30 August is still this
            client&rsquo;s session.
          </>
        }
      />

      <Blk title="Specifications" tag="tokens">
        <SpecTable
          rows={[
            { property: 'Columns', value: '7', note: 'Rows of seven, never one wrapping run — 100/7 rounds up and the seventh cell drops out.' },
            { property: 'Rows', value: '6', note: 'Always. See above.' },
            { property: 'Cell', value: 'min-height 96px', token: '--scal-cell', note: '58px under 760px.' },
            { property: 'done', value: 'ok tint + 1px ok border', token: '--tx-ok' },
            { property: 'booked', value: 'info tint + 1px info border', token: '--tx-info' },
            { property: 'missed', value: 'danger tint + 1px danger border', token: '--tx-danger' },
            { property: 'unmarked', value: 'warn tint + 1px warn border', token: '--tx-warn' },
            { property: 'cancelled', value: 'surface-2 + struck time', token: '--tx-line-strong', note: 'The slot went back to the pack.' },
            { property: 'today', value: 'accent-soft fill, 1px inset ring', token: '--tx-accent-line' },
            { property: 'Key swatch', value: '10px, full strength', note: 'The pill is the same hue at 13% behind a border of it.' },
          ]}
        />
      </Blk>

      <Blk
        title="What a reader hears, and what a phone keeps"
        lede={
          <>
            Each pill names its own full date, time and outcome —{' '}
            <em>&ldquo;Tuesday 15 September, 6:00 AM, Push, no outcome recorded yet&rdquo;</em> — and
            the date number in the corner is <code>aria-hidden</code>, or a reader walking a month
            hears <em>&ldquo;15&rdquo;</em> followed by a time with no day attached to it. Below
            760px the pill collapses to its dot: a 48px cell holds neither a clock time nor a label,
            the grid still answers <em>which days</em> and the tone still answers{' '}
            <em>what happened</em>, and the time was already in the accessible name.
          </>
        }
      />
    </Cmp>
  );
}
