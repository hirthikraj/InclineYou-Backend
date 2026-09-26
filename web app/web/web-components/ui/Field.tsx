'use client';

import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Field — one labelled control, with its hint and its error wired to it.
 *
 * ── THE WIRING IS THE COMPONENT ─────────────────────────────────────────────
 *
 * `.fld`, `.fld__l` and `.fld__h` are three classes any call-site can type, and
 * typing them produces a field that LOOKS right and is not: a `<label>` with no
 * `htmlFor` does not move focus when clicked, and a hint that is not named by
 * `aria-describedby` is invisible to a screen reader. "This is how they log in.
 * Ten digits, no country code." is not decoration — it is the answer to the
 * question the field is about to be got wrong over.
 *
 * So the ids are generated here and attached here, and there is no way to
 * assemble the parts without them.
 *
 * ── AND THE ERROR REPLACES THE HINT ─────────────────────────────────────────
 *
 * Not stacks under it. Two lines of small grey-and-red text under one input is
 * the trainer reading both to find out which one is currently true. When a
 * field is in error, the error IS the hint.
 */
export function Field({
  label,
  hint,
  error,
  /** A field whose label is carried by something else on the row. Rare. */
  hideLabel,
  width,
  className,
  style,
  id: fixedId,
  children,
}: {
  /**
   * The control's id, when the screen already has one worth keeping.
   *
   * `useId()` is the default and the right one for new fields. It is not right
   * for the fifty-three controls that already carry a name a human chose —
   * `nc-phone`, `pp-amount`, `ac-name` — because swapping those for `:r7:-ctl`
   * changes the rendered DOM of a screen that was only meant to be refactored.
   *
   * The hint's id follows as `${id}-h`, which is not invented here: it is the
   * convention all ten hand-wired fields in the product already use, checked
   * before this prop existed.
   */
  id?: string;
  /* A node, not a string: an affixed field appends a visually-hidden unit so the
     label READS "Price per session" and is ANNOUNCED "Price per session in
     rupees". A string could not carry the distinction. */
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  width?: number | string;
  className?: string;
  /**
   * The field block's own layout. MERGED with `width`, not replacing it:
   * seventeen `.fld` divs already carry a `style` — mostly a `marginTop` — and
   * dropping those silently would reflow the forms they sit in.
   */
  style?: CSSProperties;
  /** Given the ids to attach. The control decides its own element. */
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }) => ReactNode;
}) {
  const base = useId();
  const id = fixedId ?? `${base}-ctl`;
  const noteId = fixedId ? `${fixedId}-h` : `${base}-note`;
  const note = error ?? hint;

  return (
    <div
      className={['fld', error ? 'fld--err' : null, className].filter(Boolean).join(' ')}
      style={width || style ? { ...(width ? { width } : null), ...style } : undefined}
    >
      <label className={hideLabel ? 'vh' : 'fld__l'} htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        'aria-describedby': note ? noteId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {/*
        ── THE ERROR HAS ITS OWN CLASS, AND IT WAS NOT BEING USED ──────────────

        This rendered BOTH the hint and the error as `.fld__h`, and `.fld--err`
        restyles only the control's border — nothing in §04 makes a `.fld__h`
        look like an error. So a field in error announced itself correctly and
        LOOKED like a field with a hint: grey, 12px, normal weight. The one
        visual signal that says something went wrong was missing.

        §04 has `.fld__e` for exactly this — `color: var(--tx-danger)`, weight
        600, `display: flex` with a gap for an icon — and thirteen call-sites
        already use it. The error is a `<p>` for the same reason they are.

        (There is a third spelling in the product, `.form-err`, defined only in
        `app/styles/app.css` and used ten times. Two error styles for one idea
        is worth resolving, but which one wins is a design decision.)
      */}
      {error ? (
        <p className="fld__e" id={noteId} role="alert">
          {error}
        </p>
      ) : hint ? (
        /* A hint was there all along; interrupting to read it is noise, so it
           carries no role. */
        <span className="fld__h" id={noteId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** The plain single-line case, which is most of them. */
export function TextField({
  label,
  hint,
  error,
  hideLabel,
  width,
  numeric,
  id,
  className,
  style,
  ...input
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /**
   * PASSED THROUGH, because the alternative at the call-site is a raw `<input
   * className="ctl">`.
   *
   * `Field` has taken this since it was written and this wrapper did not offer
   * it, so a field whose label is carried by something else on the row — an
   * ordinal in an `OrderRow`, a unit in an affix — had to drop to `Field`'s
   * render-prop form and hand-write the control. That is the exact drift
   * `check-components.mjs` counts, and the fix is one prop rather than a rule
   * about when it is acceptable to write `.ctl` by hand.
   *
   * The label is still REQUIRED and still rendered; `.vh` clips it. Trap 5:
   * `display:none` would remove the accessible name outright.
   */
  hideLabel?: boolean;
  width?: number | string;
  /** `.ctl--num` — tabular figures, so a column of amounts lines up. */
  numeric?: boolean;
  /** Passed to `Field`; see the note there on why it can be fixed. */
  id?: string;
  /** Goes on the FIELD, not the input — it is the block's layout, not the control's. */
  className?: string;
  /** Also the FIELD's, for the same reason. */
  style?: CSSProperties;
} & Omit<React.ComponentPropsWithRef<'input'>, 'className' | 'id' | 'style'>) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} width={width} id={id} className={className} style={style}>
      {(a) => <input className={numeric ? 'ctl ctl--num' : 'ctl'} {...a} {...input} />}
    </Field>
  );
}
