import type { ScheduleGrid } from '@/lib/schedule/grid';
import type { ScheduleView } from '@/lib/schedule/view';

interface ScheduleStatsProps {
  grid: ScheduleGrid;
  view: ScheduleView;
}

/**
 * THE RANGE'S NUMBERS, ONCE — AND THE TWO BANDS IT REPLACES.
 *
 * A phone was spending 119px above the week grid to say five numbers, in two
 * separate bands that each said some of them:
 *
 *   · `.sch__ph`'s subtitle — *42 sessions · 62% of your hours · 2 days with a
 *     clash · 23 sellable hours free* — two lines of 12.5px prose, 75px with its
 *     padding.
 *   · `WeekPips`' own tally pill — *42 booked · 22 done · 25h free* — 44px, and
 *     only ever drawn on the week.
 *
 * Between them, *42* was written twice and the free hours three times, because
 * `Show gaps · 23` in the filter strip six pixels above states that number AND
 * acts on it. The chrome came to 383px of an 844px screen and the grid got 327 —
 * the calendar was the minority of its own page.
 *
 * So: one strip, 44px, on all three views, carrying each fact once.
 *
 * ── WHAT IT DROPS, AND WHY THAT IS THE FREE HOURS ────────────────────────────
 *
 * The gap count is the most duplicated fact on the screen and the only one with
 * a control of its own. `Show gaps · N` is a chip a thumb can reach: it says the
 * number and turns the hatching on. A read-only cell restating it is the second
 * copy of a thing the first copy could already do — so the chip keeps it, and
 * this strip does not carry it on any view.
 *
 * ── AND WHAT IT KEEPS THAT NEITHER BAND HAD IN THE RIGHT PLACE ───────────────
 *
 * `utilisation` and `clashDays` lived ONLY in the prose, which is why the prose
 * could not simply be deleted the way `/today`'s was. They are the two facts a
 * trainer cannot recover by looking at the grid: the percentage is the money
 * question, and a clash is a thing already wrong. Both move here.
 *
 * `clash` is conditional — a zero-clash week gets three cells, not a fourth
 * reading *0 clashes*. A stat that is only ever interesting when non-zero should
 * not spend a column saying it is zero, and at 390px the fourth cell is the one
 * that would push the row to wrap.
 *
 * ── MOBILE ONLY ──────────────────────────────────────────────────────────────
 *
 * Rendered at every width; `.schs` is hidden above 900px, where `.sch__ph` still
 * draws its subtitle and has the width to say it in words. Same mount-at-all-
 * widths, let-CSS-choose contract as `.wkp` and `.dag` two components over.
 */
export function ScheduleStats({ grid, view }: ScheduleStatsProps) {
  const { days, totals } = grid;

  const done = days.reduce(
    (n, d) => n + d.placed.filter((p) => p.session.done).length,
    0,
  );

  /*
   * Over 100% is overbooked, and it is a fault rather than an achievement — the
   * trainer has sold hours they have not got. `Schedule.tsx` makes the same call
   * for the desktop subtitle in one word; here it is the tone on the number,
   * which is the only room a 44px strip has to say it.
   */
  const over = totals.utilisation !== null && totals.utilisation > 100;

  return (
    <div className="schs" aria-label={`${VIEW_NOUN[view]} summary`}>
      <span>
        <b>{totals.sessions}</b>booked
      </span>
      <hr aria-hidden="true" />
      <span data-tone={done > 0 ? 'ok' : undefined}>
        <b>{done}</b>done
      </span>
      {totals.utilisation !== null && (
        <>
          <hr aria-hidden="true" />
          <span data-tone={over ? 'crit' : undefined}>
            <b>{totals.utilisation}%</b>
            {over ? 'over' : 'of hours'}
          </span>
        </>
      )}
      {totals.clashDays > 0 && (
        <>
          <hr aria-hidden="true" />
          <span data-tone="warn">
            <b>{totals.clashDays}</b>
            {totals.clashDays === 1 ? 'clash day' : 'clash days'}
          </span>
        </>
      )}
    </div>
  );
}

/** What the range is, for the strip's accessible name. */
const VIEW_NOUN: Record<ScheduleView, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};
