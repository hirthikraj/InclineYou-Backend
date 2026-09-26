'use client';

import { entriesFor, partsToText, prescribe, type Entry } from '@/lib/programs/blueprint';
import type { ExerciseNameWire } from '@/lib/programs/api';

/**
 * THE COMPARISON, SCOPED TO ONE DAY — the open day's second tab.
 *
 * Reading a progression means putting week 1's Tuesday beside week 4's Tuesday,
 * and the design set had this open as a finding: judging progressive overload
 * without it is a recall task where a recognition one is available.
 *
 * ── ONE DAY, NOT THE WHOLE BLOCK ───────────────────────────────────────────
 *
 * Every week of every day at once is a spreadsheet, and nobody reads a
 * spreadsheet to answer *is the bench going up*. The day is already open; this
 * is that day, across the weeks that have anything of their own.
 *
 * ── AND ONLY AUTHORED WEEKS GET A COLUMN ───────────────────────────────────
 *
 * Law 3: a week with nothing of its own repeats week 1. Giving those a column
 * would draw six identical ones and make a block that progresses look flat.
 */
export function AcrossWeeks({
  day,
  week,
  entries,
  authored,
  names,
  readOnly = false,
}: {
  day: number;
  week: number;
  entries: Entry[];
  authored: number[];
  names: Record<string, ExerciseNameWire | undefined>;
  /** The certified preview. Only the EMPTY state differs — the table itself is
   *  a comparison and reads the same whoever wrote the program. */
  readOnly?: boolean;
}) {
  if (authored.length < 2) {
    return (
      <p className="wsd__none" style={{ textAlign: 'left', padding: '10px 2px' }}>
        Only week {authored[0] ?? 1} has anything of its own, so there is nothing to compare it
        against yet — every other week repeats it.{' '}
        {/* THE LAST CLAUSE IS AN INSTRUCTION, and an instruction is the one
            thing a read-only screen must not print: *Give a week its own
            content* asks the trainer to do something this page has no control
            for. The fact before it is worth keeping either way, and read-only
            it is worth MORE — *every week of this program is the same week* is
            exactly the kind of thing somebody deciding whether to copy an
            eight-week block wants to find out before they copy it. */}
        {readOnly
          ? 'Every week of this program is week 1 repeated.'
          : 'Give a week its own content and it gains a column here.'}
      </p>
    );
  }

  /* The rows of the FIRST authored week are the spine, because that is the week
     every other one was copied from. A week that has since gained or lost a row
     shows an em dash in that cell rather than shifting the whole column up. */
  const spine = entriesFor(entries, authored[0], day);

  if (spine.length === 0) {
    return (
      <p className="wsd__none" style={{ textAlign: 'left', padding: '10px 2px' }}>
        Nothing on this day in week {authored[0]}, so there is no spine to compare against.
      </p>
    );
  }

  return (
    <table className="wsp">
      <thead>
        <tr>
          <th scope="col">Exercise</th>
          {authored.map(w => (
            <th scope="col" key={w} className={w === week ? 'wsp__now' : undefined}>
              Wk {w}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {spine.map((row, i) => (
          <tr key={row.uid}>
            <th scope="row">{names[row.exerciseId]?.name ?? 'Exercise not in your library'}</th>
            {authored.map(w => {
              const rows = entriesFor(entries, w, day);
              const there = rows[i];
              /* Matched by POSITION, and it says so when the position holds a
                 different movement — a week whose third slot became a row a
                 trainer swapped in is not the same exercise, and printing its
                 numbers under this row's name would be a false comparison. */
              const same = there && there.exerciseId === row.exerciseId;
              return (
                <td key={w} className={w === week ? 'wsp__now' : undefined}>
                  {!there ? (
                    '—'
                  ) : same ? (
                    partsToText(prescribe(there))
                  ) : (
                    <em title={names[there.exerciseId]?.name ?? 'another exercise'}>
                      {names[there.exerciseId]?.name ?? 'another exercise'}
                    </em>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
