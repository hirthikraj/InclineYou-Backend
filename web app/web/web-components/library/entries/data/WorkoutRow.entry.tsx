import { WorkoutRow, WorkoutRowHead } from '../../../ui/WorkoutRow';
import { DayRule } from '../../../ui/DayRule';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Workout row — `c-programrow`'s sibling.
 *
 * The rows below are `ui/WorkoutRow.tsx`, the same import `/programs/workouts`
 * renders, so this page cannot drift from the screen.
 *
 * IT HAD A SELECTION COLUMN AND IT DOES NOT ANY MORE — the component's own
 * header carries the argument. In one line: the tick boxes had no verb behind
 * them, and a session is a record of what happened rather than a row a trainer
 * clears in bulk. `c-templaterow` is where a select column belongs on that
 * screen, because a workout template is a blueprint nobody has done yet.
 */
export function WorkoutRowEntry() {
  const entry = byId('c-workoutrow')!;

  const rows = [
    { id: 'a', name: 'Meera Kulkarni', workout: 'Upper A', program: 'Hypertrophy Block 2', time: '6:30', meridiem: 'am', duration: '45m', mode: 'floor', status: 'done' },
    { id: 'b', name: 'Rohit Shetty', workout: 'Push · Week 3', program: 'Off-season strength', time: '7:45', meridiem: 'am', duration: '1h', mode: 'remote', status: 'scheduled' },
    { id: 'd', name: 'Ananya Balaji', workout: 'Lower A', program: 'Rebuild', time: '8:00', meridiem: 'am', duration: '45m', mode: 'floor', status: 'unmarked' },
    { id: 'c', name: 'Divya Krishnan', workout: null, program: null, time: '6:00', meridiem: 'pm', duration: '30m', mode: 'floor', status: 'missed' },
  ] as const;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/WorkoutRow.tsx</code> },
        { k: 'Class', v: <code>.wkrow</code> },
        { k: 'Element', v: <code>&lt;div&gt;</code> },
        { k: 'Columns', v: '7' },
        { k: 'Reflows at', v: '900px' },
        { k: 'Used in', v: '/programs/workouts' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            The NAME is the link, not the row. A row carrying an overflow menu cannot be one anchor &mdash;
            which is the single thing that separates this from <code>c-programrow</code>, whose whole row is
            the target.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'block' }}>
          <div className="pgt">
            <WorkoutRowHead />
            <DayRule day="Thu · 17 Sep" relative="Yesterday" count={4} noun="workouts" />
            <ul className="pgt__l" role="list">
              {rows.map(r => (
                <li key={r.id}>
                  <WorkoutRow
                    name={r.name}
                    clientId={r.id}
                    href="#c-workoutrow"
                    workout={r.workout}
                    program={r.program}
                    time={r.time}
                    meridiem={r.meridiem}
                    duration={r.duration}
                    mode={r.mode}
                    status={r.status}
                  />
                </li>
              ))}
            </ul>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="It formats nothing"
        lede={
          <>
            The stamp, the clock and the span arrive as strings. A component that held its own{' '}
            <code>Date.now()</code> would compute the relative date twice &mdash; once in the HTML, once on
            hydration &mdash; and the two can fall either side of a day boundary. Same rule as{' '}
            <code>c-programrow</code>&rsquo;s <code>edited</code>.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Columns', value: '7', note: 'Client · workout · time · duration · mode · status · actions' },
            { property: 'Date', value: <code>c-dayrule</code>, note: 'Not a column — 361 rows across 52 days printed it in runs of seven, eight and nine' },
            { property: 'Workout', value: 'two lines', note: 'The day label, and the program under it when the two differ' },
            { property: 'Reflow', value: '900px', note: 'Two declared lines, the menu beside them' },
            { property: 'Target', value: 'the name', note: 'Not the row — a menu cannot live inside an anchor' },
            { property: 'Header', value: 'sticky', note: '`aria-hidden` — no control in it, and every row carries its own nouns' },
            { property: 'Selection', value: 'none', note: 'A session is a record, not a row to clear in bulk — see `c-templaterow`' },
            { property: 'Column heads', value: 'mono 9.5px', token: '--tx-ink-3' },
            { property: 'Figures', value: 'mono 12.5px', token: '--tx-ink-2', note: 'Tabular, so the column reads down' },
            { property: 'Nouns', value: 'clipped', note: 'Un-clipped by the reflow, not invented by it' },
            { property: 'Mode / status', value: <code>c-tag</code>, note: 'floor / remote, and ok / info / warn / danger' },
            { property: 'Statuses', value: '4', note: 'Logged · Booked · Unmarked · Missed — Unmarked is a PAST slot nobody has answered for, and was drawn as Booked' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
