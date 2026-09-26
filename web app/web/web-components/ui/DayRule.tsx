import type { ReactNode } from 'react';

/**
 * DAY RULE — the day a run of rows belongs to, ruled across a long list.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 *
 * A chronological list has one fact that repeats and one that does not. On
 * `/programs/workouts` the Completed tab held **361 rows across 52 days** — so
 * `Thu · 17 Sep` was printed seven times, `Wed · 16 Sep` eight, `Mon · 14 Sep`
 * nine, all of it in a 108px column the eye has to read down to find the
 * boundary between one day and the next. That is a column doing a heading's
 * job badly: the value is identical within a run, and the only information in
 * it is WHERE THE RUNS CHANGE, which is exactly what a rule draws for free.
 *
 * So the day comes out of the row and becomes the thing the rows sit under.
 * The column goes with it, and the row is one track shorter.
 *
 * ── AND IT IS NOT A CARD ────────────────────────────────────────────────────
 *
 * This list WAS date-grouped cards once and `Shelf.tsx` argued them back into
 * columns, correctly: *which of these ran long*, *who has missed two* are
 * questions answered by running the eye down one edge, and a card mashes the
 * figures into a 12px sentence. A rule keeps every one of the columns and adds
 * only the boundary — it is the grouping the cards were for, at the cost of a
 * 28px band instead of a border, a radius and a gap per group.
 *
 * ── IT STICKS, AND IT STICKS BELOW THE HEAD ─────────────────────────────────
 *
 * `position:sticky` at the column head's own height, so scrolling into the
 * middle of a 40-row day still says which day is on the screen — the question
 * a grouped list creates and then has to answer. Two sticky bands, and the
 * order is fixed in CSS rather than by source order: the head is `z-index:2`
 * and the rule `1`, so a rule arriving from below slides under the column
 * names rather than over them.
 *
 * ── THE COUNT IS PART OF THE HEADING, NOT A BADGE ───────────────────────────
 *
 * *4 workouts* set quietly at the far end of the rule. It is what makes the
 * band worth its 28px on a day a trainer is scanning for volume, and it is the
 * figure that would otherwise need counting by hand. `CountBadge` is the wrong
 * instrument: that is a NOTIFICATION count, drawn in the accent, and a rule per
 * day would put fifty of them down the page in the colour reserved for verbs.
 *
 * It formats nothing — `day`, `relative` and `count` all arrive made, for
 * `WorkoutRow`'s reason: a component holding its own `Date.now()` computes a
 * relative day twice and the two can fall either side of midnight.
 */
export function DayRule({
  day,
  relative,
  count,
  noun,
  trailing,
  className,
}: {
  /** The day itself: "Thu · 17 Sep". Already formatted. */
  day: ReactNode;
  /**
   * The same day said the way a person would — "Today", "Yesterday",
   * "Tomorrow", "In 3 days". Optional, and deliberately so: it earns its ink
   * near `now` and is noise on a day eleven weeks back, so the caller decides
   * rather than this drawing "63 days ago" fifty times.
   */
  relative?: ReactNode;
  /** How many rows are under this rule. */
  count?: number;
  /** What they are, plural: "workouts". Singular is derived by dropping the s. */
  noun?: string;
  /** Anything the caller wants at the far end instead of the count. */
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    /* `role="presentation"` is NOT used and the band is not `aria-hidden`: the
       day IS content here, not decoration, and hiding it would give a screen
       reader a list of 361 times with no days in it. The rows stay in one
       `<ul>` for the same reason the visual rule is a band rather than a
       nested list — a day is a heading over a sequence, not a different list. */
    <div className={['dayr', className].filter(Boolean).join(' ')}>
      <span className="dayr__d">{day}</span>
      {relative ? <span className="dayr__r">{relative}</span> : null}
      <span className="dayr__ln" aria-hidden="true" />
      {trailing ?? (count !== undefined && noun ? (
        <span className="dayr__n">
          {count} {count === 1 && noun.endsWith('s') ? noun.slice(0, -1) : noun}
        </span>
      ) : null)}
    </div>
  );
}
