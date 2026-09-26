import { DayRule } from '../../../ui/DayRule';
import { WorkoutRow, WorkoutRowHead } from '../../../ui/WorkoutRow';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Day rule — the band between two days of a long chronological list.
 *
 * It came out of a COLUMN rather than out of a gap somebody spotted, which is
 * the short version of why it exists: `/programs/workouts` measured 361 rows
 * across 52 days on the seeded book, and its 108px Date track printed the same
 * string seven, eight and nine times running.
 */
export function DayRuleEntry() {
  const entry = byId('c-dayrule')!;

  const day1 = [
    { id: 'a', name: 'Deepa Menon', workout: 'Full B', program: 'Hypertrophy Block 2', time: '9:00', meridiem: 'PM', duration: '45 min' },
    { id: 'b', name: 'Arjun Subramanian', workout: 'Lower A', program: 'Off-season strength', time: '8:00', meridiem: 'PM', duration: '1 h' },
  ] as const;

  const day2 = [
    { id: 'c', name: 'Nikhil Kumar', workout: 'Day 1', program: 'Rebuild', time: '8:00', meridiem: 'PM', duration: '45 min' },
  ] as const;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/DayRule.tsx</code> },
        { k: 'Class', v: <code>.dayr</code> },
        { k: 'Parts', v: 'day · relative · rule · count' },
        { k: 'Sticky', v: <>yes, under <code>c-workoutrow</code>&rsquo;s head</> },
        { k: 'Used in', v: '/programs/workouts' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            The day, the way somebody would say it, a hairline taking the slack, and how many rows are
            under the band. The rows are <code>c-workoutrow</code> &mdash; the same import the screen
            renders, so this page cannot drift from it.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'block' }}>
          <div className="pgt">
            <WorkoutRowHead />
            <ul className="pgt__l" role="list">
              <li className="pgt__g">
                <DayRule day="Thu · 17 Sep" relative="Yesterday" count={2} noun="workouts" />
                <ul className="pgt__l" role="list">
                  {day1.map(r => (
                    <li key={r.id}>
                      <WorkoutRow
                        name={r.name}
                        clientId={r.id}
                        href="#c-dayrule"
                        workout={r.workout}
                        program={r.program}
                        time={r.time}
                        meridiem={r.meridiem}
                        duration={r.duration}
                        mode="floor"
                        status="done"
                      />
                    </li>
                  ))}
                </ul>
              </li>
              <li className="pgt__g">
                <DayRule day="Wed · 16 Sep" count={1} noun="workouts" />
                <ul className="pgt__l" role="list">
                  {day2.map(r => (
                    <li key={r.id}>
                      <WorkoutRow
                        name={r.name}
                        clientId={r.id}
                        href="#c-dayrule"
                        workout={r.workout}
                        program={r.program}
                        time={r.time}
                        meridiem={r.meridiem}
                        duration={r.duration}
                        mode="remote"
                        status="done"
                      />
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The relative word is optional, and that is the point"
        lede={
          <>
            <i>Today</i>, <i>Yesterday</i>, <i>Tomorrow</i>, <i>In 3 days</i> &mdash; and then nothing.
            Past six days in either direction the caller passes no word at all, because{' '}
            <i>63 days ago</i> is a subtraction printed fifty times down a page and the date beside it
            already said it better. <code>relativeDay</code> in{' '}
            <code>lib/sessions/group.ts</code> draws the line; <code>relativePast</code> reaches for the
            weekday at the same boundary for the same reason.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'block' }}>
          <Cell label="NEAR TODAY — THE WORD EARNS ITS INK" stretch>
            <DayRule day="Fri · 18 Sep" relative="Today" count={9} noun="workouts" />
          </Cell>
          <Cell label="ELEVEN WEEKS BACK — THE DATE IS THE WHOLE ANSWER" stretch>
            <DayRule day="Wed · 2 Jul" count={4} noun="workouts" />
          </Cell>
          <Cell label="ONE ROW — THE NOUN LOSES ITS S" stretch>
            <DayRule day="Sat · 12 Sep" count={1} noun="workouts" />
          </Cell>
        </Bench>
      </Blk>

      {/* Both halves are the real component: the DON'T is the date printed on
          every row, which is what this replaced and what the product genuinely
          did until 18 Sep 2026. A drawing of a mistake nobody can commit is not
          worth printing. */}
      <DoDont
        yes={{
          figure: (
            <div className="pgt" style={{ width: '100%' }}>
              <DayRule day="Thu · 17 Sep" relative="Yesterday" count={3} noun="workouts" />
              <ul className="pgt__l" role="list">
                {['Deepa Menon', 'Arjun Subramanian', 'Rohan Sharma'].map((n, i) => (
                  <li key={n}>
                    <WorkoutRow
                      name={n}
                      clientId={`y${i}`}
                      href="#c-dayrule"
                      workout="Lower A"
                      time={`${9 - i}:00`}
                      meridiem="PM"
                      duration="1 h"
                      mode="floor"
                      status="done"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ),
          caption: (
            <>
              The day said once, over the run it is true of. The boundary between two days is the only
              information a repeated date column ever held.
            </>
          ),
        }}
        no={{
          figure: (
            <div className="pgt" style={{ width: '100%' }}>
              <ul className="pgt__l" role="list">
                {['Deepa Menon', 'Arjun Subramanian', 'Rohan Sharma'].map((n, i) => (
                  <li key={n}>
                    <WorkoutRow
                      name={n}
                      clientId={`n${i}`}
                      href="#c-dayrule"
                      workout="Lower A"
                      program="Thu · 17 Sep"
                      time={`${9 - i}:00`}
                      meridiem="PM"
                      duration="1 h"
                      mode="floor"
                      status="done"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ),
          caption: (
            <>
              The same string on every row. At three it is redundant; at the 361 rows over 52 days this
              screen actually holds, it is a 108px column whose cells are identical in runs of seven,
              eight and nine.
            </>
          ),
        }}
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Band', value: '28px', note: 'Against a bordered card per day at 68px — `c-agenda`’s own measurement of the same trade' },
            { property: 'Day', value: 'mono 11px 700', token: '--tx-ink', note: 'Uppercase, .06em — it is a measurement, so it is set like one' },
            { property: 'Relative', value: '11px 600', token: '--tx-accent', note: 'The one word on the band that is not a measurement, so the one in the running face' },
            { property: 'Rule', value: '1px', token: '--tx-line', note: 'Takes whatever the labels did not — what makes the band a division rather than a row' },
            { property: 'Count', value: 'mono 10.5px', token: '--tx-ink-3', note: 'Tabular. Not `c-count`, which is a notification badge drawn in the accent' },
            { property: 'Sticky', value: <code>top: var(--wk-hd)</code>, note: 'The column head’s height — head z-index 2, rule 1, so the rule parks under the names' },
            { property: 'Below 900px', value: 'static', note: 'The page is the scroller there, so a sticky rule would stack fifty of them at the top' },
            { property: 'Structure', value: 'nested list', note: 'The rule and its rows are one `<li>` — flat, a reader is told 29 items when there are 25 sessions and 4 days' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
