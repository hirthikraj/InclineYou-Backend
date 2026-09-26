'use client';

import type { ReactNode } from 'react';

/**
 * Checkbox — an independent yes/no, and the engine of bulk selection.
 *
 * A real `<input type="checkbox">`, which is what the product already uses. The
 * design file draws `<span class="check" role="checkbox" aria-checked>`; that
 * is a drawing, and copying it would produce a control the keyboard cannot
 * reach. Wrapping the input in its own `<label>` is the other half — it makes
 * the words a hit target, which on a 32px row is most of the target there is.
 *
 * `indeterminate` is not an attribute, only a DOM property, so it cannot be set
 * in JSX at all. A header checkbox over a partly-selected list is exactly where
 * it is needed and exactly where it is silently dropped; the ref callback here
 * is the only way to set it.
 */
export function Checkbox({
  label,
  indeterminate,
  className,
  align = 'center',
  ...input
}: {
  label: ReactNode;
  /** Some but not all of the rows below are selected. */
  indeterminate?: boolean;
  className?: string;
  /**
   * Where the box sits against a label that WRAPS.
   *
   * `center` is right for one line and wrong for three: a centred box floats to
   * the middle of the paragraph instead of sitting on the sentence it answers.
   * Both of the product's explaining checkboxes — *The money has not arrived
   * yet* and *Take a session off their pack* — run to three lines, and both had
   * built their own `alignItems:'flex-start'` row rather than reach for this,
   * because it did not exist.
   */
  align?: 'center' | 'start';
} & Omit<React.ComponentPropsWithoutRef<'input'>, 'type' | 'className'>) {
  return (
    <label
      /* `align-items` comes from `.row` / `.row--top`, NOT from an inline style.
         It was inline here, which meant it outranked every selector — so a
         caller adding `row--top` in `className` would have been silently
         ignored, which is the class of bug this file has already been bitten by
         three times. Only `cursor` stays inline; there is no utility for it. */
      className={['row', 'gap2', align === 'start' ? 'row--top' : '', className]
        .filter(Boolean)
        .join(' ')}
      style={{ cursor: 'pointer' }}
    >
      <input
        type="checkbox"
        className="check"
        ref={(el) => {
          if (el) el.indeterminate = indeterminate ?? false;
        }}
        {...input}
      />
      <span className="small">{label}</span>
    </label>
  );
}

/**
 * The bare box, for a table's selection column.
 *
 * No visible label, so `label` becomes the accessible name and must say WHICH
 * row: "Select Meera K", never "Select". Twenty-two rows of "Select" is
 * twenty-two identical names in a screen reader's list of controls.
 */
export function CheckboxCell({
  label,
  indeterminate,
  ...input
}: {
  label: string;
  indeterminate?: boolean;
} & Omit<React.ComponentPropsWithoutRef<'input'>, 'type' | 'className'>) {
  /* A `checked` with no `onChange` is a React console error on every render —
     "you provided a checked prop to a form field without an onChange handler".
     It fires wherever a checkbox is shown rather than operated, which is most of
     a component library. Saying `readOnly` is the honest description of that
     cell, and it is the fix rather than a suppression. */
  const readOnly = input.checked !== undefined && !input.onChange;

  return (
    <input
      type="checkbox"
      className="check"
      aria-label={label}
      readOnly={readOnly || undefined}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate ?? false;
      }}
      {...input}
    />
  );
}
