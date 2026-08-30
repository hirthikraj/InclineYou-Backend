'use client';

import Link from 'next/link';
import { Chevron } from '@/components/shell/Icons';
import { ChevronLeft } from './Icons';
import { STEP_LABELS, VIEWS, VIEW_LABELS, type ScheduleView } from '@/lib/schedule/view';

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
 * The design draws it as one row: view group, then `< label >`, then `Today`,
 * then the chips. That is right at 1440px and it is the wrong first row at 390px,
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
  label: string;
  /** Whether the visible range contains today — `Today` is dead if it does. */
  onToday: boolean;
  counts: { floor: number; remote: number };
  modes: { floor: boolean; remote: boolean };
  gaps: boolean;
  /** How many sellable hours the range holds, for the gap chip's own count. */
  gapSlots: number;
  hoursHref: string;
  onView: (view: ScheduleView) => void;
  onStep: (delta: 1 | -1) => void;
  onJumpToday: () => void;
  onMode: (mode: 'floor' | 'remote') => void;
  onGaps: () => void;
}

export function Toolbar({
  view, label, onToday, counts, modes, gaps, gapSlots, hoursHref,
  onView, onStep, onJumpToday, onMode, onGaps,
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
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      <div className="sch__nav">
        <button
          className="btn btn--icon btn--secondary"
          type="button"
          aria-label={STEP_LABELS[view].prev}
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
        <span className="h5 sch__label" aria-live="polite">
          {label}
        </span>

        <button
          className="btn btn--icon btn--secondary"
          type="button"
          aria-label={STEP_LABELS[view].next}
          onClick={() => onStep(1)}
        >
          <Chevron size={18} />
        </button>

        {/*
          Disabled when today is already on screen, rather than hidden.
          A control that vanishes when it would do nothing makes the toolbar
          reflow every time a trainer steps a week — and on a phone that moves
          every other control under their thumb.
        */}
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          onClick={onJumpToday}
          disabled={onToday}
          aria-label={onToday ? 'Today is already on screen' : 'Jump to today'}
        >
          Today
        </button>
      </div>

      <div className="sch__filters">
        {/*
          The chips carry COUNTS, which the design's do not.
          `Floor 19` / `Remote 4` says what un-ticking would remove before it is
          un-ticked — recognition rather than recall, and it is also the only
          place on the screen the delivery split is stated as a number.
        */}
        <button
          className="chip"
          type="button"
          aria-pressed={modes.floor}
          onClick={() => onMode('floor')}
        >
          Floor {counts.floor}
        </button>
        <button
          className="chip"
          type="button"
          aria-pressed={modes.remote}
          onClick={() => onMode('remote')}
        >
          Remote {counts.remote}
        </button>
        {view !== 'month' && (
          <button className="chip" type="button" aria-pressed={gaps} onClick={onGaps}>
            {gapSlots > 0 ? `Show gaps · ${gapSlots}` : 'Show gaps'}
          </button>
        )}
        {/* Visible only on mobile (≤900px) — the header link is hidden there. */}
        <Link className="chip sch__hours--mobile" href={hoursHref}>
          Working hours
        </Link>
      </div>
    </div>
  );
}
