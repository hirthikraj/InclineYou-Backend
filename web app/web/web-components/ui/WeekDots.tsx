import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * WeekDots — one person's week, as seven cells. Catalogue entry `c-weekdots`,
 * `.wkd`.
 *
 * ── IT IS A COUNT, AND IT IS DELIBERATELY NOT A STREAK ───────────────────────
 *
 * §1 of the client spec: "Prefer a weekly count over a streak. Streaks punish
 * one bad week by erasing months of effort, and a broken streak is a common quit
 * trigger." So the figure this component prints is *3 of 4* — a number that
 * resets every Monday and cannot be lost — and there is no multiplier, no flame
 * and no total-days-in-a-row anywhere in it.
 *
 * ── AND A MISSED DAY IS THE QUIETEST CELL IN THE ROW ─────────────────────────
 *
 * "Never shame. No red 'you missed 3 workouts.' Missed sessions get warm,
 * forward-looking framing." A `miss` cell is therefore identical in weight to a
 * `rest` cell and differs only in its label: hollow, on the canvas, reading as
 * *nothing happened here*, which is true. The stylesheet's block says the same
 * thing, and neither uses `--tx-danger`.
 *
 * ── WHY IT IS NOT `.wkp`, WHICH ALREADY DRAWS SEVEN COLUMNS ──────────────────
 *
 * `.wkp` in `app/styles/app.css` is the trainer's week peek: seven columns of
 * *other people's* sessions, with names in the pips, sized for a desk. This is
 * one client's own seven days with four states and a letter each, sized for a
 * phone. Same number of columns and a different component — the shared thing is
 * "a week is seven", which is not a component.
 *
 * -- AND A THIRD ONE WAS NOT ADDED, 23 SEP 2026 ------------------------------
 *
 * Plan's *Your week* -- §4's *"how it usually runs"* -- is seven days of one
 * client at phone size with two states, and on a phone it was a seven-ROW
 * `.tbl`: 308px of card of which **220px was the word "Rest", five times**,
 * with the only way into a workout a 35 x 16px `InlineLink` inside a cell.
 *
 * That is this component's shape exactly, and the case for a `.wkpl` beside it
 * did not survive being written down: same person, same size, same seven
 * columns, and `plan`/`rest` are two of the four states already here. The two
 * things it genuinely could not do were a caption that is not a count, and a
 * cell you can open -- so those are props, and the family stays one.
 *
 * The count-not-streak argument above is untouched by them. `caption` REPLACES
 * the figure rather than competing with it, and it exists because a TEMPLATE
 * week has no numerator: *0 of 2 this week* about a Monday that recurs forever
 * would be this component grading a plan instead of a week.
 */
export type WeekDay = {
  /** The single letter under the cell. `M T W T F S S`. */
  letter: string;
  /** The full weekday, for the reader. "Monday". */
  name: string;
  /**
   * done — trained, and the only lime cell.
   * plan — scheduled, still to come.
   * rest — the plan asked for nothing.
   * miss — was scheduled and did not happen. See above: not red.
   */
  state: 'done' | 'plan' | 'rest' | 'miss';
  today?: boolean;
  /**
   * Where this day opens, where it opens anywhere.
   *
   * The whole column -- cell plus letter, 42 x ~60px -- becomes the target,
   * which is the point: the call-site this was added for had its only way into
   * a workout inside a table cell at **35 x 16px**, and no
   * `@media (pointer:coarse)` rule in the product reaches an inline link.
   *
   * Omitted and the cell is the `<div role="img">` it has always been. A day
   * with nothing behind it is drawn as a statement rather than as a control
   * that does nothing -- `ListRow`'s dead-control rule, same reasoning.
   */
  href?: string;
};

/** What each state is called when a reader walks the row. */
const SPOKEN: Record<WeekDay['state'], string> = {
  done: 'trained',
  plan: 'planned',
  rest: 'rest day',
  miss: 'no session',
};

export function WeekDots({
  days,
  done,
  planned,
  caption,
  className,
}: {
  /** Seven, always. A shorter week is a bug in the caller's date maths. */
  days: WeekDay[];
  /** Sessions trained so far this week. The numerator. Omitted under `caption`. */
  done?: number;
  /**
   * Sessions the week was meant to hold. The denominator, and it is the PLAN's
   * number rather than `days.filter(done|plan|miss).length` — a client whose
   * trainer cancelled Wednesday should still read *3 of 4*, because four is what
   * they signed up for and the count is about the week, not about the diary.
   */
  planned?: number;
  /**
   * A line over the row INSTEAD of the count, for a week that has no numerator.
   *
   * A template week recurs, so *0 of 2 this week* about it is a figure counting
   * something nothing has yet asked to happen. The caller says what the row is
   * -- *Two sessions a week* -- and the count-not-streak rule is untouched,
   * because nothing here is counting.
   *
   * `null` draws NO line, which is a third state and not a tidier `''`: an
   * empty `<p>` still takes its line box and its 12px column gap, which is 32px
   * of card for nothing. It is for a strip inside a card whose head has already
   * named it -- Plan's *Your week / how it usually runs* -- where a caption
   * would be the heading said twice, 40px apart, which is the defect the whole
   * portal pass is about.
   */
  caption?: ReactNode | null;
  className?: string;
}) {
  return (
    <div className={['col', 'gap3', className].filter(Boolean).join(' ')}>
      {caption === undefined ? (
        <p className="wkd__n">
          {done}
          <span> of {planned} this week</span>
        </p>
      ) : caption === null ? null : (
        <p className="wkd__n wkd__n--cap">{caption}</p>
      )}
      <div className="wkd">
        {days.map((d, i) => {
          const spoken = `${d.name}${d.today ? ', today' : ''}: ${SPOKEN[d.state]}`;
          /* The cell and its letter, drawn once. `href` changes only what wraps
             them -- an anchor over BOTH, so the column is the target rather
             than a 42px square with a dead label under it. */
          const inner = (
            <>
            <div
              className={`wkd__c wkd__c--${d.state}`}
              /* Under an anchor the cell is decoration: a `role="img"` with its
                 own label in there would give the link two accessible names. */
              role={d.href ? undefined : 'img'}
              aria-hidden={d.href ? true : undefined}
              aria-label={d.href ? undefined : spoken}
            >
              {d.state === 'done' && (
                /* A tick inside the lime cell. `currentColor` is
                   `--tx-accent-ink` from `.wkd__c--done`, so it is dark ink on a
                   fill — never the other way round. */
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4.5 12.5l5 5 10-11" />
                </svg>
              )}
            </div>
            {/* `aria-hidden`, because the cell above already said "Monday" in
                full. A reader that got "M" and then "Monday: trained" for all
                seven days would hear the row twice. */}
            <span className="wkd__l" aria-hidden="true">{d.letter}</span>
            </>
          );
          const cls = `wkd__d${d.today ? ' wkd__d--now' : ''}`;
          return d.href ? (
            <Link key={i} className={`${cls} wkd__d--go`} href={d.href} aria-label={spoken}>
              {inner}
            </Link>
          ) : (
            <div key={i} className={cls}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
