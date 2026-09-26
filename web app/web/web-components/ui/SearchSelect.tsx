'use client';

import { Fragment, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { ChevronDown } from '@/components/shell/Icons';

import { Field } from './Field';
import { SearchField } from './SearchField';

/**
 * Searchable select — a closed list that is too long, or too rich, to be a
 * `<select>`.
 *
 * ── WHAT THE NATIVE ELEMENT COULD NOT DO ────────────────────────────────────
 *
 * `Select` is still the right control for a short closed list and its own
 * docstring argues the case. Three things were needed at once that it cannot
 * give, and each of them on its own would not have been enough:
 *
 * · **Filter as you type.** The new-program dialog's *Start from* offers the
 *   trainer's whole shelf plus the whole certified catalogue. Five and five
 *   today; a trainer two years in has forty of their own.
 * · **Two lines in a row.** *Upper / Lower · 4 day* is the name; *4 workouts a
 *   week · 8 weeks · used 16 times* is what the choice actually turns on. An
 *   `<option>` is one line of plain text and a browser draws it however it
 *   likes.
 * · **A heading that is not pickable.** `<optgroup>` gets the grouping right
 *   and takes the two above with it.
 *
 * ── THE SEARCH BOX IS IN THE POPUP ──────────────────────────────────────────
 *
 * Not in the trigger. A trigger that becomes a text field on open erases the
 * one thing it was carrying — what is chosen — at the moment the reader most
 * wants to compare a new row against it. It is also the shape of the shelf
 * sheet this control sits beside: a field above a list of programs.
 *
 * ── ESCAPE IS A LADDER AND THIS IS A RUNG ───────────────────────────────────
 *
 * `ModalHost` binds Escape on the window in the CAPTURE phase and stops it, so
 * a dialog holding this control would close itself on the press meant to close
 * the popup — the trainer loses a half-filled form to a key they pressed to
 * shut a list. The repair is the one `PhoneProgram` already makes: the OPEN
 * state is lifted to whoever owns both surfaces, and the outer one stands down
 * while the inner one is up. That is what `onOpenChange` is for, and a
 * call-site inside a modal is expected to wire it to `ModalHost`'s `covered`.
 *
 * ── WHEN NOT TO USE IT ──────────────────────────────────────────────────────
 *
 * · Under about ten short rows with nothing to say about them: `Select`.
 * · Anything that is not a single answer to one question — multi-select, or a
 *   list whose rows are actions: that is a `Panel` or a `Menu`.
 * · A field at the bottom of a long scroller. The popup is `position:absolute`
 *   and is clipped by whatever scroller it is in; there is no portal here yet.
 */

export interface PickOption {
  value: string;
  /** The row's first line, and what the trigger shows when it is chosen. */
  label: string;
  /** The second line. What the choice turns on — counts, dates, a shape. */
  meta?: ReactNode;
  /** Matched by the search alongside the label. Never drawn. */
  keywords?: string;
}

export interface PickGroup {
  label: string;
  options: PickOption[];
}

export function SearchSelect({
  label,
  hint,
  error,
  width,
  className,
  value,
  onChange,
  options = [],
  groups = [],
  placeholder = 'Choose one',
  searchLabel,
  noMatch = 'Nothing matches that.',
  noun = 'options',
  onOpenChange,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  width?: number | string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  /** Ungrouped rows, drawn above the groups. In practice the *none* row. */
  options?: PickOption[];
  groups?: PickGroup[];
  /** The trigger's text when nothing is chosen. */
  placeholder?: string;
  /** What the box searches: "Search your programs and the catalogue". */
  searchLabel: string;
  noMatch?: string;
  /** For the live result count — "6 of 10 programs". */
  noun?: string;
  /** Both edges of the popup's open state, for the Escape ladder above. */
  onOpenChange?: (open: boolean) => void;
}) {
  const base = useId();
  const listId = `${base}-list`;
  const triggerId = `${base}-t`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  /* ONE FLAT LIST OF ROWS, each remembering its group, which is how the
     headings can be drawn between options that are direct children of the
     listbox. `Palette` records what happens otherwise: a `role="listbox"`
     whose children are wrappers loses the option relationship and reads back
     as one item, or none. */
  const rows = [
    ...options.map((o) => ({ option: o, group: null as string | null })),
    ...groups.flatMap((g) => g.options.map((o) => ({ option: o, group: g.label }))),
  ];

  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) =>
        `${r.option.label} ${r.option.keywords ?? ''} ${r.group ?? ''}`
          .toLowerCase()
          .includes(q),
      )
    : rows;

  const chosen = rows.find((r) => r.option.value === value)?.option ?? null;

  function setOpenState(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (next) {
      setQuery('');
      /* The cursor opens on the current answer rather than at the top: the
         first arrow press should step off what is chosen, not off row one. */
      const at = rows.findIndex((r) => r.option.value === value);
      setCursor(at < 0 ? 0 : at);
    }
  }

  function pick(option: PickOption) {
    onChange(option.value);
    setOpenState(false);
    document.getElementById(triggerId)?.focus();
  }

  const at = cursorIn(shown, cursor);
  const active = shown[at];

  /* THE HEADINGS ARE COMPUTED, NOT ACCUMULATED. A `let lastGroup` reassigned
     inside the map is what `react-hooks/immutability` refuses — "cannot
     reassign after render completes" — and the palette carries that error to
     this day. Comparing against the previous row is the same answer, pure. */
  const list = shown.map((row, i) => ({
    ...row,
    header: i === 0 || shown[i - 1].group !== row.group ? row.group : null,
  }));

  useEffect(() => {
    if (!open) return;

    /* CLOSE ON A PRESS OUTSIDE, on `pointerdown` rather than `click`: a click
       fires after the mouse is released, so a drag that starts in the popup
       and ends outside it would close a list the reader was selecting text
       in. The trigger is excluded, or its own press would close and reopen. */
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-pick]')?.getAttribute('data-pick') === base) return;
      setOpenState(false);
    };

    /* Escape, in capture, so it beats anything the popup's contents bind —
       and see the ladder note at the top of this file for the one listener it
       cannot beat. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpenState(false);
      document.getElementById(triggerId)?.focus();
    };

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    /* THE CURSOR HAS TO BE VISIBLE TO BE A CURSOR. Arrowing into the part of
       the list below the fold otherwise moves a highlight nobody can see, and
       `block:'nearest'` is what scrolls the list without moving the page or
       the dialog around it. */
    if (!open || !active) return;
    document.getElementById(`${base}-o-${active.option.value}`)?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, at, query]);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length === 0) return;
      /* It WRAPS. A closed list of ten with the cursor on the last row and no
         wrap is a dead key press, and the reader cannot tell a list that has
         ended from one that has stopped responding. */
      const next = at + (e.key === 'ArrowDown' ? 1 : -1);
      setCursor((next + shown.length) % shown.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[at]) pick(shown[at].option);
      return;
    }
    /* Tab leaves the control, so the popup goes with it — a list left open
       behind a focus ring three fields down is a list nothing will close. */
    if (e.key === 'Tab') setOpenState(false);
  }

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      width={width}
      id={triggerId}
      className={className}
    >
      {(a) => (
        <div className="pick" data-pick={base}>
          <button
            {...a}
            type="button"
            className="ctl pick__t"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onClick={() => setOpenState(!open)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && !open) {
                e.preventDefault();
                setOpenState(true);
              }
            }}
          >
            <span className="pick__tl">{chosen ? chosen.label : placeholder}</span>
            <ChevronDown size={15} />
          </button>

          {open && (
            <div className="pick__pop">
              <div className="pick__s">
                <SearchField
                  label={searchLabel}
                  value={query}
                  autoFocus
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setCursor(0);
                  }}
                  onKeyDown={onSearchKey}
                  count={{ shown: shown.length, total: rows.length, noun }}
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={active ? `${base}-o-${active.option.value}` : undefined}
                />
              </div>

              <div className="pick__list" id={listId} role="listbox" aria-label={searchLabel}>
                {shown.length === 0 ? (
                  <p className="pick__none">{noMatch}</p>
                ) : (
                  list.map((row, i) => (
                    <Fragment key={row.option.value}>
                      {row.header ? (
                        <p className="pick__gk" role="presentation">
                          {row.header}
                        </p>
                      ) : null}
                      <div
                        className="pick__i"
                        id={`${base}-o-${row.option.value}`}
                        role="option"
                        aria-selected={i === at}
                        data-on={row.option.value === value}
                        tabIndex={-1}
                        onMouseMove={() => setCursor(i)}
                        onClick={() => pick(row.option)}
                      >
                        <span className="pick__n">{row.option.label}</span>
                        {row.option.meta ? (
                          <span className="pick__m">{row.option.meta}</span>
                        ) : null}
                      </div>
                    </Fragment>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Field>
  );
}

/** The cursor, kept inside a list that has just been filtered under it. */
function cursorIn(rows: unknown[], cursor: number): number {
  if (rows.length === 0) return 0;
  return Math.min(Math.max(cursor, 0), rows.length - 1);
}
