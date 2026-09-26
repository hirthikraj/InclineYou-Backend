'use client';

import type { CSSProperties, DragEvent, ReactNode } from 'react';

/**
 * OrderRow — a row in a list somebody arranged. `.orow`, catalogue entry
 * `c-orderrow`.
 *
 * Four tracks: a grip, a position, the row, and its verbs. Written for the
 * assessment editor's questions (⠿ · ① · the question · ⌫) and its
 * multiple-choice options (⠿ · A · a text field · ⋯), which are the same shape
 * twice.
 *
 * ── THE POSITION IS A LABEL, NEVER A CONTROL ────────────────────────────────
 *
 * `1` and `A` are where the row IS, and they move when it moves. Mono, because
 * a column of proportional digits is a ragged left edge on the one column whose
 * whole job is to be read down. `.wke__o` on the week builder made the same
 * call; this is that call written where more than one list can reach it.
 *
 * ── A GRIP IS NOT ENOUGH, AND THE COMPONENT SAYS SO IN ITS TYPES ────────────
 *
 * A drag handle is a pointer gesture, and SC 2.5.7 wants the same operation
 * without one — which on this product is *Move up* / *Move down* in the row's
 * own menu, the answer `DayCard` settled on and the reason the week sheet's row
 * drag was deleted rather than kept beside it. So `onDragStart` and `actions`
 * are both here, and a call-site drawing a grip with no keyboard path has
 * shipped a list only a mouse can arrange. Nothing can enforce that in a type;
 * what the component does is make the second one as easy as the first.
 *
 * `grip={false}` OMITS the element and `.orow--nogrip` drops its track — the
 * two have to agree, and for one pass they did not: the class kept a zero-width
 * first track on `.wkl__w--nog`'s *reserve it rather than remove it* argument,
 * which does not apply here (nothing in this product mixes gripped and
 * ungripped rows, and a 0px track plus a gap is an indent rather than a
 * reservation). Three children went into four tracks and every one of them
 * auto-placed a track to the left. See the CSS for the measurement.
 *
 * ── HTML5 DRAG, ARMED ON THE GRIP ───────────────────────────────────────────
 *
 * `draggable` is set only while the grip is held — `DayColumn`'s rule, twice
 * recorded: a row that stays draggable after the pointer has gone is the next
 * accidental drag, and it takes text selection with it. The call-site owns the
 * arming flag because it also owns the list, and because two rows may not both
 * believe they are the one being carried.
 */
export function OrderRow({
  ordinal,
  children,
  actions,
  grip = true,
  armed = false,
  lifted = false,
  onto = false,
  field = false,
  gripLabel,
  onGripDown,
  onGripUp,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  className,
  style,
}: {
  /** `1`, `A` — already formatted. `optionLetter` in the caller's vocabulary. */
  ordinal: ReactNode;
  children: ReactNode;
  /** The row's verbs, including the keyboard path for moving it. */
  actions?: ReactNode;
  grip?: boolean;
  /** True while this row is the one the grip has armed. Sets `draggable`. */
  armed?: boolean;
  /** This row is the one being carried. */
  lifted?: boolean;
  /** The pointer is over this row and a drop would land here. */
  onto?: boolean;
  /** The content is a form field, which owns its own height. */
  field?: boolean;
  /** WHICH row, spelled into the grip's name. *Reorder question 3*. */
  gripLabel?: string;
  onGripDown?: () => void;
  onGripUp?: () => void;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const cls = [
    'orow',
    grip ? null : 'orow--nogrip',
    field ? 'orow--field' : null,
    lifted ? 'orow--lifted' : null,
    onto ? 'orow--onto' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      style={style}
      draggable={armed || undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {grip && (
        <button
          type="button"
          className="orow__g"
          aria-label={gripLabel ?? 'Reorder'}
          /* `mousedown` arms and `mouseup` disarms, so `draggable` is true for
             exactly as long as the grip is held. `onClick` is deliberately
             absent: the grip does nothing on a click, and the keyboard path is
             the menu in `actions`. */
          onMouseDown={onGripDown}
          onMouseUp={onGripUp}
          onBlur={onGripUp}
        >
          <GripIcon />
        </button>
      )}
      <span className="orow__l" aria-hidden="true">{ordinal}</span>
      <div className="orow__c">{children}</div>
      {actions && <div className="orow__a">{actions}</div>}
    </div>
  );
}

/** The list. A wrapper, so a call-site never has to remember the 8px gap. */
export function OrderRows({
  label,
  children,
  className,
}: {
  /** What the list is a list OF. Read before the first row. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={['orows', className].filter(Boolean).join(' ')} role="list" aria-label={label}>
      {children}
    </div>
  );
}

/** Six dots — the one grip glyph this product draws. */
function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="5" r="1.6" />
      <circle cx="15" cy="5" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="19" r="1.6" />
      <circle cx="15" cy="19" r="1.6" />
    </svg>
  );
}
