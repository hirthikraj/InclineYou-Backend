'use client';

import type { ReactNode } from 'react';

import { Field } from './Field';

/**
 * Select — a short closed list. Native, on purpose.
 *
 * The native element is kept because of what it already does that a custom
 * listbox would have to re-earn: it opens as the platform's own picker on a
 * phone, it types-to-select, it is reachable by every assistive technology
 * without a role being declared, and it does not need to be told the window has
 * scrolled.
 *
 * The only thing it needed was styling, and `select.ctl::picker(select)` — §04's
 * Dropdown entry — now claims the popup too, so nothing is left to gain by
 * replacing it.
 *
 * `placeholder` is a disabled first option rather than an empty one, so a
 * required select cannot be submitted still saying "Choose a length".
 *
 * ── GROUPS ARE `<optgroup>`, AND THAT IS THE WHOLE REASON THEY ARE HERE ─────
 *
 * The new-program dialog's *Start from* offers two lists that are not the same
 * kind of thing — the trainer's own programs, which duplicate, and the
 * InclineYou catalogue, which copies. Flattened into one list they read as one
 * list, and the difference between them is the difference between two
 * endpoints. `<optgroup>` is the native element for exactly this and is
 * announced as "group, Your programs" by a screen reader; a call-site that
 * hand-rolled it would be a `<select>` outside this component, which is how
 * the styling and the `Field` wiring drift.
 *
 * `options` still takes the ungrouped case, which is most of them, and the two
 * can be used together — a first loose option above the groups is how *An
 * empty program* sits above both.
 */
export function Select({
  label,
  hint,
  error,
  hideLabel,
  width,
  options,
  groups,
  placeholder,
  className,
  ...select
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /**
   * PASSED THROUGH, for `TextField`'s reason and the same gap.
   *
   * `Field` has taken this since it was written and neither wrapper offered it,
   * so a select whose label is carried by something else on the row — the
   * answer type beside a question's own prompt — had to drop to `Field`'s
   * render-prop form and hand-write the control, which is the exact drift
   * `check-components.mjs` counts.
   *
   * The label is still REQUIRED and still rendered; `.vh` clips it. Trap 5:
   * `display:none` would remove the accessible name outright, and on a control
   * with no visible text of its own that is the whole name.
   */
  hideLabel?: boolean;
  width?: number | string;
  /**
   * The FIELD's class, not the control's — the block's layout rather than the
   * select's look, which is the same boundary `TextField` already draws and the
   * same one `Field` documents for `style`.
   *
   * It was missing here, so a form that wanted a `mt3` between two fields had
   * to wrap this component in a `<div>` — a wrapper that then sits between
   * `.fld` and whatever grid the form is, and quietly breaks any rule written
   * against `.fld + .fld`.
   */
  className?: string;
  options?: { value: string; label: string }[];
  /** Drawn after `options`, each as an `<optgroup>` with its own label. */
  groups?: { label: string; options: { value: string; label: string }[] }[];
  placeholder?: string;
} & Omit<React.ComponentPropsWithoutRef<'select'>, 'className' | 'id' | 'children'>) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} width={width} className={className}>
      {(a) => (
        <select className="ctl" {...a} {...select}>
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {(groups ?? [])
            .filter((g) => g.options.length > 0)
            .map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      )}
    </Field>
  );
}
