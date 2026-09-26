'use client';

import type { ReactNode } from 'react';

/**
 * Button group — two to four ways of looking at the same data.
 *
 * Not a set of buttons. It is one control with one answer, which is why the
 * options are data rather than children: a group where the caller supplies the
 * buttons is a group where two of them can be pressed at once, and the design
 * file's rule — "selection: single, always one" — has nowhere to live.
 *
 * `aria-pressed` on each option is the reference's own choice and it is kept.
 * The alternative, `role="radiogroup"`, promises arrow-key navigation between
 * options; that is a real behaviour this does not implement, and claiming it
 * would be worse than not claiming it.
 */
export function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange?: (value: T) => void;
  /** What the group switches. Names the group for a reader. */
  label: string;
  className?: string;
}) {
  return (
    <div className={['btngroup', className].filter(Boolean).join(' ')} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="btn"
          aria-pressed={o.value === value}
          onClick={onChange ? () => onChange(o.value) : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
