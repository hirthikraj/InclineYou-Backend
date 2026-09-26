'use client';

import type { ReactNode } from 'react';

import { Field } from './Field';

/**
 * Affixed field — a field with a unit welded to one edge.
 *
 * The affix is `aria-hidden` and the unit is repeated into the label instead.
 * A reader that announces the affix gets "rupee, Price per session, eight
 * hundred" — the unit before the thing it qualifies, in the wrong order and
 * before the field has been named. Putting it in the label reads as one
 * sentence: "Price per session in rupees, eight hundred."
 *
 * Which is why `unit` is a separate prop from `affix`: one is the symbol the eye
 * needs, the other is the word the ear needs, and they are rarely the same
 * string. `₹` and `rupees`. `kg` and `kilograms`.
 */
export function AffixField({
  label,
  unit,
  affix,
  side = 'leading',
  hint,
  error,
  width,
  numeric = true,
  hideLabel,
  className,
  id,
  ...input
}: {
  label: ReactNode;
  /** Spoken form, folded into the label: "rupees", "kilograms", "minutes". */
  unit: string;
  /** Drawn form, shown in the affix: "₹", "kg", "min". */
  affix: ReactNode;
  side?: 'leading' | 'trailing';
  hint?: ReactNode;
  error?: ReactNode;
  width?: number | string;
  numeric?: boolean;
  /**
   * The label is said elsewhere on the screen — the client's check-in sets the
   * measurement's name as the step's own question, 24px above this box. The
   * spoken *in kilograms* rides along inside it either way, which is the whole
   * reason `unit` is a separate prop from `affix`.
   */
  hideLabel?: boolean;
  /** The FIELD's class — its layout, not the input's look. See `Select`. */
  className?: string;
  /**
   * The control's id, when the screen already has a name worth keeping.
   *
   * `Field` has taken one since it was written and `TextField` forwards it;
   * this component did not, which is the kind of gap nothing reports until a
   * caller needs to point at the control — `ModalHost`'s `initialFocus` is a
   * SELECTOR (a ref across that boundary is what `react-hooks/refs` refuses),
   * so a form whose first question is an amount had no way to say *start here*.
   */
  id?: string;
} & Omit<React.ComponentPropsWithoutRef<'input'>, 'className' | 'id'>) {
  return (
    <Field
      label={
        <>
          {label}
          <span className="vh"> in {unit}</span>
        </>
      }
      hint={hint}
      error={error}
      hideLabel={hideLabel}
      className={className}
      id={id}
    >
      {(a) => (
        <span className="affix" style={width ? { width } : undefined}>
          {side === 'leading' ? (
            <span className="affix__p" aria-hidden="true">
              {affix}
            </span>
          ) : null}
          <input className={numeric ? 'ctl ctl--num' : 'ctl'} {...a} {...input} />
          {side === 'trailing' ? (
            <span className="affix__p" aria-hidden="true">
              {affix}
            </span>
          ) : null}
        </span>
      )}
    </Field>
  );
}
