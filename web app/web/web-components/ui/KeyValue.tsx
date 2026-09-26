import type { CSSProperties, ReactNode } from 'react';

/**
 * Key-value row — a label and a value, stacked into a short block.
 *
 * A `<dl>` rather than a stack of divs, and that is the whole component. The
 * pairing between "Default session fee" and "₹800" is visual only in the
 * reference: two spans side by side, with nothing saying they belong together.
 * A screen reader gets a run of alternating fragments and the trainer has to
 * hold the pairing in their head.
 *
 * `<dl>`/`<dt>`/`<dd>` says it in the markup, costs nothing, and `.kv` styles
 * it identically because the classes never depended on the tags.
 */
export function KeyValueList({
  rows,
  width,
  className,
}: {
  rows: { k: ReactNode; v: ReactNode }[];
  width?: number | string;
  className?: string;
}) {
  return (
    <dl className={['col', className].filter(Boolean).join(' ')} style={{ gap: 0, width, margin: 0 }}>
      {rows.map((r, i) => (
        <div className="kv" key={i}>
          <dt className="kv__k">{r.k}</dt>
          <dd className="kv__v" style={{ margin: 0 }}>
            {r.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One row on its own — for a setting whose value is a control rather than text.
 *
 * Kept as a `<div>` pair rather than a `<dl>` of one: a description list with a
 * single item is a list a reader announces the length of, and "list, 1 item"
 * before every switch on the settings screen is noise.
 */
export function KeyValueRow({
  k,
  valueClassName,
  style,
  children,
}: {
  k: ReactNode;
  /**
   * §04 utility classes for the value: `mono` for a machine-readable figure,
   * `acc` / `warn` / `ink3` for its tone. Twenty-nine rows carry one.
   *
   * A class and not a style, and the distinction is the whole point: these are
   * defined in `webapp.css` where a designer can change what `warn` looks like
   * across the product. There is no `valueStyle` to go with it — four rows do
   * colour their value inline, and they stay hand-written rather than have this
   * component grow a hole that puts colour back at the call-site.
   */
  valueClassName?: string;
  /**
   * The row's own layout, and only that — five rows carry one: `border: 0` on a
   * run that must not draw its rule, a `marginTop`, an `alignItems` for a value
   * that wraps to two lines.
   */
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className="kv" style={style}>
      <span className="kv__k">{k}</span>
      <span className={valueClassName ? `kv__v ${valueClassName}` : 'kv__v'}>{children}</span>
    </div>
  );
}
