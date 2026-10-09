'use client';

import { Chevron } from '@/components/shell/Icons';
import { ChevronLeft, ClientsView, HoursView } from './Icons';
import { ScheduleKey } from './ScheduleKey';
import { STEP_LABELS, VIEWS, VIEW_LABELS, type ScheduleView } from '@/lib/schedule/view';
import type { WeekLayout } from '@/lib/schedule/pivot';
import { Chip } from '@/web-components/ui/Chip';

/** *Hours* rather than *Grid*, and *Clients* rather than *Roster*: both name the
 *  thing the ROWS are, which is what a trainer is choosing between. The glyph is
 *  drawn beside the word at every width and the word is CLIPPED below 1120 —
 *  see `.sch__layout` in app.css for the seven pixels that made that necessary,
 *  and `.omni` for why a hidden label is clipped and never dropped. */
const LAYOUTS: { key: WeekLayout; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { key: 'hours', label: 'Hours', Icon: HoursView },
  { key: 'clients', label: 'Clients', Icon: ClientsView },
];

/**
 * THE TOOLBAR, AND THE ONE CONTROL IT DOES NOT DRAW ON THE MONTH.
 *
 * View, date navigation, and two filters. `Show gaps` is dropped on the month
 * because a gap is a free interval INSIDE a day and the month has no minute axis
 * to draw one on — a control that does nothing is §01's whole subject, and the
 * design set makes the same call in its own `tools()`.
 *
 * ── THE ORDER IS NOT THE DESIGN'S, AND THE REASON IS A PHONE ─────────────────
 *
 * The design draws it as one row: view group, then `< label >`, then the chips.
 * That is right at 1440px and it is the wrong first row at 390px,
 * where the row wraps and whichever control wraps last ends up alone on a line.
 *
 * So the toolbar is three named groups rather than one flex run — `.sch__nav`,
 * `.sch__views`, `.sch__filters` — and app.css re-stacks them at two widths.
 * Which one leads changes with the width and the reason is a rank: **the date is
 * the thing this screen is looking at**, so it leads on a phone, where only one
 * row is above the fold. On a desk the view group leads, because at that width
 * everything is on one line and the group is the leftmost thing a trainer's eye
 * already expects from a calendar.
 *
 * The label is a live region. Stepping a week with `[` or `]` changes the grid
 * under a keyboard user with nothing announced otherwise — the arrows are icon
 * buttons, and their names say *what they do*, not *where you now are*.
 */

interface ToolbarProps {
  view: ScheduleView;
  /** How the week is arranged. Read on the week and ignored on the other two. */
  layout: WeekLayout;
  label: string;
  counts: { floor: number; remote: number };
  modes: { floor: boolean; remote: boolean };
  gaps: boolean;
  /** How many sellable hours the range holds, for the gap chip's own count. */
  gapSlots: number;
  /**
   * The week is drawn by CLIENT, so there is no minute axis on the screen.
   *
   * `Show gaps` hatches free intervals inside a day and the pivot draws none —
   * MEASURED, pressing it under that table changed nothing at all, which is the
   * same dead control the month drops it for one line up. The key follows,
   * because *Free gap* would be naming a dashed outline the table has nowhere
   * to put. One condition, two consequences, and it is the arrangement that is
   * asked about rather than each of them being given its own rule.
   */
  pivoting: boolean;
  hoursHref: string;
  onView: (view: ScheduleView) => void;
  onLayout: (layout: WeekLayout) => void;
  onStep: (delta: 1 | -1) => void;
  onMode: (mode: 'floor' | 'remote') => void;
  onGaps: () => void;
}

export function Toolbar({
  view, layout, label, counts, modes, gaps, gapSlots, pivoting, hoursHref,
  onView, onLayout, onStep, onMode, onGaps,
}: ToolbarProps) {
  return (
    <div className="tools sch__tools">
      <div className="btngroup sch__views" role="group" aria-label="Calendar view">
        {VIEWS.map((v) => (
          <button
            key={v}
            className="btn"
            type="button"
            aria-pressed={v === view}
            onClick={() => onView(v)}
            title={`${VIEW_LABELS[v]} · ${v[0].toUpperCase()}`}
            aria-keyshortcuts={v[0]}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {/*
        A SECOND GROUP, AND NOT A FOURTH BUTTON IN THE FIRST ONE.

        `Day · Week · Month` is a RANGE — it decides what is fetched, it lives in
        the URL, and stepping it with the arrows means something different in
        each. `Hours · Clients` is an ARRANGEMENT of one of those ranges, drawn
        from rows the browser already holds. Putting a fourth button beside
        Month would make one control out of two questions, and pressing it would
        have to silently answer the first one as well.

        Week only, for the reason `Show gaps` is dropped on the month: the pivot
        needs seven columns of days to be seven columns of days. And ≤900px it
        stands down with the grid it toggles — the phone draws `WeekPips`, and a
        control for a surface that is not on the screen is §01's whole subject.
      */}
      {view === 'week' && (
        <div className="btngroup sch__layout" role="group" aria-label="Week layout">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              className="btn"
              type="button"
              aria-pressed={l.key === layout}
              onClick={() => onLayout(l.key)}
              /* The word is the accessible name at every width and is only ever
                 clipped, so this is a hint for a pointer and never the name. */
              title={`Week by ${l.label.toLowerCase()}`}
            >
              <l.Icon size={15} />
              <span className="sch__layout__l">{l.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sch__nav">
        <button
          className="btn btn--icon btn--secondary"
          type="button"
          aria-label={STEP_LABELS[view].prev}
          title={`${STEP_LABELS[view].prev} · [`}
          aria-keyshortcuts="["
          onClick={() => onStep(-1)}
        >
          <ChevronLeft size={18} />
        </button>

        {/*
          `aria-live="polite"` and not an `<h1>`: the page header already carries
          the heading for this range, and two headings naming the same thing is
          the duplication the Today pass fixed in the other direction. What this
          needs to do is ANNOUNCE, because it changes without the focus moving.
        */}
        <span className="h5 sch__label" aria-live="polite" title="Press T to jump to today">
          {label}
        </span>

        <button
          className="btn btn--icon btn--secondary"
          type="button"
          aria-label={STEP_LABELS[view].next}
          title={`${STEP_LABELS[view].next} · ]`}
          aria-keyshortcuts="]"
          onClick={() => onStep(1)}
        >
          <Chevron size={18} />
        </button>

        {/*
          NO `Today` BUTTON, AND THE 67px IT COST WENT TO THE KEY.

          MEASURED on `?d=2026-09-06` at a 1288px toolbar: `.sch__key` is the one
          item in this row with `flex:1 1 0`, so it draws whatever the controls
          leave — 170px, which buys *In person* and *Online* and wraps *Same
          time* onto a second line the key clips. The button was 59px plus the
          nav's 8px gap, and it was DISABLED for the whole of the range it was
          drawn beside: today is on screen, so it did nothing.

          A dead control that is also the reason a live legend cannot be read is
          §01 twice over. `t` still jumps to today — see `Schedule.tsx` — and the
          arrows and the date label are how a trainer gets back by pointer.
        */}
      </div>

      {/*
        THE KEY SITS BETWEEN THE DATE AND THE FILTERS, IN SPACE THAT WAS EMPTY.
        MEASURED at 1536px: the view group ends at 269, `.sch__nav` at 631, and
        `.sch__filters` is pushed to 1207 by its own `margin-left:auto` — 570px
        of a 1472px bar drawing nothing. So the legend is free at this width, and
        `.sch__key` stands down entirely at ≤900px where the grid it describes is
        replaced by `WeekPips` and `DayAgenda`.

        It is READ-ONLY, and that is the one thing separating it from the chips
        eight lines below. `In Person 19` is a control: it says a number and
        un-ticking it removes those blocks. A key that also filtered would give
        the trainer two In-Person affordances in one bar with different
        behaviours — so this one is a `<dl>`, has no press state, and takes no
        pointer events.
      */}
      <ScheduleKey view={view} gaps={gaps} pivoting={pivoting} />

      <div className="sch__filters">
        {/*
          The chips carry COUNTS, which the design's do not.
          `In Person 19` / `Online 4` says what un-ticking would remove before it is
          un-ticked — recognition rather than recall, and it is also the only
          place on the screen the delivery split is stated as a number.
        */}
        {/*
          `chip--zero` rides `className` rather than becoming a `Chip` prop, for
          the reason `ui/Chip.tsx` gives about `chip--sm` and
          `chip--active-status`: the class is defined only in `app/styles/app.css`
          and a prop in the catalogue's API for a class a designer cannot reach
          in the design file would be a lie about where that class lives.

          It is on the COUNT and not on `pressed`, because they are different
          facts. The chip is still pressed — un-ticking it is still a thing that
          does something — it just has nothing to remove, and a pill that is
          shouting about zero sessions is spending the accent that `New session`
          eighteen pixels above needs. See §26.6 in app.css.
        */}
        <Chip
          pressed={modes.floor}
          className={counts.floor === 0 ? 'chip--zero' : undefined}
          onClick={() => onMode('floor')}
        >
          In Person {counts.floor}
        </Chip>
        <Chip
          pressed={modes.remote}
          className={counts.remote === 0 ? 'chip--zero' : undefined}
          onClick={() => onMode('remote')}
        >
          Online {counts.remote}
        </Chip>
        {view !== 'month' && !pivoting && (
          <Chip
            pressed={gaps}
            className={gapSlots === 0 ? 'sch__gaps chip--zero' : 'sch__gaps'}
            onClick={onGaps}
          >
            {gapSlots > 0 ? `Show gaps · ${gapSlots}` : 'Show gaps'}
          </Chip>
        )}
        {/* Visible only on mobile (≤900px) — the header link is hidden there. */}
        <Chip href={hoursHref} className="sch__hours--mobile">
          Working hours
        </Chip>
      </div>
    </div>
  );
}
