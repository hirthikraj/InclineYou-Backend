'use client';

import type { ReactNode } from 'react';

import { RowMenu, type RowMenuItem } from './RowMenu';

/**
 * Facet — a filter that says what it is set to. `.facet`, catalogue entry
 * `c-facet`.
 *
 * Three parts: the NAME of the axis, the VALUE currently on it, and a way to
 * clear it. `Status ⌄` unset; `✓ Status · Done ✕ ⌄` set.
 *
 * ── WHY NOT A `Chip`, WHICH IS ALREADY A FILTER ─────────────────────────────
 *
 * A chip is a filter that is on or off and says so by being filled. That is
 * right for a short fixed list a screen can draw all of — the roster's six
 * segments — and it stops working the moment the axis has a name. A row reading
 * *Done · Missed · Unread · Read* cannot say which two belong to *Status* and
 * which to *Read status*, and it cannot draw an axis nobody has set, so a
 * filter bar with nothing on it is an empty strip rather than a list of what
 * can be narrowed.
 *
 * So the axis is always drawn and only the value changes. The cost is a wider
 * control; what it buys is a bar that teaches the filters it holds.
 *
 * ── THE POPUP IS `RowMenu`'s, NOT A SECOND ONE ──────────────────────────────
 *
 * Measure the trigger, flip when the room is above, close on Escape, on an
 * outside press, on scroll and on resize, rove with the arrows, restore focus.
 * `RowMenu`'s own header records that this ladder had been written twice before
 * it existed and that the two copies already disagreed. So it grew a trigger
 * SLOT and checkable items instead, and this component is the pill plus the
 * items — about forty lines, none of them a popup.
 *
 * The slot takes the trigger's CONTENTS rather than rendering the button,
 * because `react-hooks/refs` refuses a ref handed across a function boundary
 * (trap 22). `RowMenu`'s header carries the whole of that; what it means here
 * is that `.facet__t` is styling a button this file does not write.
 *
 * ── MULTI-SELECT IS THE DEFAULT SHAPE AND SINGLE IS A PROP ──────────────────
 *
 * *What is outstanding* is two statuses, not one, and a trainer asking it
 * should not read the list twice. So a `checked` item leaves the menu open.
 * `single` closes it, for an axis where a second value is meaningless — one
 * client, one read state. That last sentence was a claim rather than a
 * behaviour until 20 Sep 2026: every row this component builds carries
 * `checked`, so `RowMenu` read all of them as states and none of them closed.
 * It is `closeOnPick` now, which is that prop's whole job.
 *
 * ── AND AN AXIS WITH A HUNDRED VALUES GETS A FIND FIELD ─────────────────────
 *
 * `search` puts one at the head of the list. The *Client* axis is the case it
 * was written for: a roster is not a vocabulary of four statuses, it is every
 * person the trainer coaches, and a menu that can only be scrolled asks them to
 * READ a list to find somebody whose name they already know. An option may
 * carry `find` — a phone, an email — so the field matches more than the label.
 *
 * The field, the cap on the list and the *nothing matched* line are all
 * `RowMenu`'s; this component decides WHICH axes have one, which is a question
 * about the data and therefore a question for the call-site.
 */
export interface FacetOption {
  value: string;
  label: string;
  /** A figure after the label. Drawn even at zero — see `Facet`'s own note. */
  count?: number;
  disabled?: boolean;
  /**
   * Text the find field matches beyond the label — a phone number, an email.
   * Never drawn: a roster row is a name, and the number is how somebody who has
   * it in their hand reaches that name.
   */
  find?: string;
}

export function Facet({
  label,
  options,
  selected,
  onChange,
  single = false,
  defaultValue,
  search,
  summary,
  width = 232,
  className,
}: {
  /** The axis. *Status*, *Client*, *Read status* — always drawn. */
  label: string;
  options: FacetOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** One value at most, and the menu closes on a pick. */
  single?: boolean;
  /** Single-select only: the value that reads as chosen while nothing is selected (*All*). */
  defaultValue?: string;
  /**
   * A find field at the head of the list, for an axis nobody can scan — the
   * roster. `noun` is what the live count counts (*3 of 142 clients*); leave it
   * out and the count is not announced.
   */
  search?: { placeholder: string; empty: string; noun?: string };
  /**
   * What to print in place of the values. Given two selections the default is
   * *Done +1* — a count, because two full labels in a pill is a control wider
   * than the search field beside it, and the menu one press away says which
   * two. A call-site with a better sentence passes one.
   */
  summary?: ReactNode;
  width?: number;
  className?: string;
}) {
  const on = selected.length > 0;
  const chosen = options.filter((o) => selected.includes(o.value));

  const items: RowMenuItem[] = options.map((o) => ({
    key: o.value,
    label: o.count === undefined ? o.label : `${o.label}  ·  ${o.count}`,
    find: o.find,
    checked: selected.includes(o.value) || (single && selected.length === 0 && o.value === defaultValue),
    radio: single,
    disabled: o.disabled,
    onSelect: () => {
      if (single) {
        onChange(selected.includes(o.value) ? [] : [o.value]);
        return;
      }
      onChange(
        selected.includes(o.value)
          ? selected.filter((v) => v !== o.value)
          : [...selected, o.value],
      );
    },
  }));

  /* *Clear* is inside the menu as well as on the pill, and that is not a
     duplicate: the × is 26px of pointer target and this is the row a keyboard
     lands on without leaving the list it just changed. Only drawn when there is
     something to clear, so the menu never holds an inert row. */
  if (on) {
    items.push({ separator: true, key: 'sep' });
    items.push({ key: 'clear', label: `Clear ${label.toLowerCase()}`, onSelect: () => onChange([]) });
  }

  const value =
    summary ??
    (chosen.length === 0
      ? null
      : chosen.length === 1
        ? chosen[0].label
        : `${chosen[0].label} +${chosen.length - 1}`);

  return (
    <span className={['facet', on ? 'facet--on' : null, className].filter(Boolean).join(' ')}>
      <RowMenu
        label={label}
        menuLabel={label}
        items={items}
        width={width}
        search={search}
        closeOnPick={single}
        /* The list hangs to the RIGHT of the pill, never to the left of it. A
           facet bar starts at the left edge of the content and its pills are a
           third the width of their panels, so the row menu's default — right
           edges flush — puts a 288px list over the rail. */
        align="start"
        triggerClass="facet__t"
        triggerContent={
          <>
            {on && <TickIcon />}
            <span className="facet__k">{label}</span>
            {value !== null && <span className="facet__v">{value}</span>}
            <CaretIcon />
          </>
        }
      />
      {on && (
        <button
          type="button"
          className="facet__x"
          /* The axis is IN the name. Twenty-two buttons called *Clear* are
             twenty-two identical controls in a screen reader's list, which is
             `CheckboxCell`'s rule and `RowMenu`'s. */
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange([])}
        >
          <ExIcon />
        </button>
      )}
    </span>
  );
}

function TickIcon() {
  return (
    <svg className="facet__on" width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="m4 12 5.5 6L20 6" />
    </svg>
  );
}

function CaretIcon() {
  return (
    <svg className="facet__c" width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ExIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
