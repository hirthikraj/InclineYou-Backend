import type { ReactNode } from 'react';

import { CheckboxCell } from './Checkbox';

/**
 * Workout-template row — `WorkoutRow`'s sibling for a blueprint.
 *
 * ── WHY THE SHELF BECAME A TABLE ────────────────────────────────────────────
 *
 * The templates tab drew `ListRow`s: a name, and a 12px sentence under it
 * reading "~37 min · 5 movements · 16 sets · the heavy press first". That is a
 * fine shape for three rows and the wrong one for thirty — and it sat behind
 * the same tab strip as *Completed*, *Scheduled* and *Missed*, which are
 * columns with a select box. Two lists one keystroke apart, drawn two ways, is
 * two lists a trainer has to learn. So this is the `.wkrow` grammar applied to
 * the record a template actually is.
 *
 * ── AND NOT A `WorkoutRow` VARIANT ──────────────────────────────────────────
 *
 * Same grammar, different record, exactly as `WorkoutRow` is to `ProgramRow`: a
 * template has no person, no clock and no outcome — nothing to fill six of that
 * row's eight cells with — and it carries two stamps that row has no column
 * for. Nothing but the shell is shared, so a shared file would be one component
 * branching on which of two things it is holding.
 *
 * ── IT OPENS ON THE NAME, NOT ON THE ROW ────────────────────────────────────
 *
 * `ListRow`'s acting form was a `<button>` wrapping the whole row, which is why
 * it could never carry a tick box — a checkbox inside a button is markup no
 * browser agrees about. The name is the control here and the select box keeps
 * its own tab stop, which is the same trade `WorkoutRow` makes and for the same
 * reason. The name is a `<button>` rather than a link because opening a saved
 * template is a fetch-then-dialog, not a navigation.
 *
 * It formats nothing. Both stamps and the duration arrive as strings — a
 * component with no `now` cannot disagree with itself across hydration.
 */

export function TemplateRowHead({
  allSelected,
  someSelected,
  onSelectAll,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (next: boolean) => void;
}) {
  return (
    /* Not `aria-hidden` — the select-all lives in it. The column names are,
       exactly as in `WorkoutRowHead`; every row carries its own. */
    <div className="wtrow wtrow--hd">
      <span className="wtrow__sel">
        <CheckboxCell
          label="Select every workout template"
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onChange={e => onSelectAll(e.target.checked)}
        />
      </span>
      <span aria-hidden="true">Workout</span>
      <span aria-hidden="true">Notes</span>
      <span aria-hidden="true">Duration</span>
      <span aria-hidden="true">Movements</span>
      <span aria-hidden="true">Sets</span>
      <span aria-hidden="true">Created on</span>
      <span aria-hidden="true">Updated on</span>
    </div>
  );
}

export function TemplateRow({
  name,
  notes,
  duration,
  movements,
  sets,
  created,
  updated,
  selected,
  onSelect,
  onOpen,
  busy,
  className,
}: {
  name: string;
  /** The trainer's own line about the workout. Most have none. */
  notes?: ReactNode;
  /** Already worded — "~37 min". The estimate is the builder's, not this row's. */
  duration: string;
  movements: number;
  sets: number;
  /** Already formatted against the server's clock — see above. */
  created: string;
  updated: string;
  selected: boolean;
  onSelect: (next: boolean) => void;
  onOpen: () => void;
  /** The open is in flight. A click with no answer is a click made twice. */
  busy?: boolean;
  className?: string;
}) {
  return (
    <div className={['wtrow', busy ? 'wtrow--busy' : '', className].filter(Boolean).join(' ')}>
      <span className="wtrow__sel">
        <CheckboxCell
          label={`Select ${name}`}
          checked={selected}
          onChange={e => onSelect(e.target.checked)}
        />
      </span>

      <span className="wtrow__n">
        <button type="button" className="wtrow__nm" onClick={onOpen} aria-busy={busy || undefined}>
          {name}
        </button>
      </span>

      {/* `display:contents` up here and a real box below 900px — without it the
          reflowed row is six stacked lines instead of two. `.wkrow__meta`'s
          trick, and it is load-bearing for the same reason. */}
      <span className="wtrow__meta">
        <span className="wtrow__note">
          {notes || <span className="wtrow__none">&mdash;</span>}
        </span>

        {/* The nouns are clipped onto the row rather than left in the head, so
            the head is safe to hide and the reflow un-clips what is already in
            the markup — `.wkrow__k`'s technique, same reason. */}
        <span className="wtrow__f"><b>{duration}</b></span>

        <span className="wtrow__f">
          <b>{movements}</b>
          <span className="wtrow__k"> {movements === 1 ? 'movement' : 'movements'}</span>
        </span>

        <span className="wtrow__f">
          <b>{sets}</b>
          <span className="wtrow__k"> sets</span>
        </span>

        <span className="wtrow__f">
          <span className="wtrow__k">created </span>
          <b>{created}</b>
        </span>

        <span className="wtrow__f">
          <span className="wtrow__k">updated </span>
          <b>{updated}</b>
        </span>
      </span>
    </div>
  );
}
