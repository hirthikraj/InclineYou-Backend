import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

/**
 * List row — the left pane of a split. For finding, not comparing.
 *
 * ── aria-selected NEEDS A LIST TO BE SELECTED IN ────────────────────────────
 *
 * The reference draws `<div class="lrow" aria-selected="true">`. `aria-selected`
 * is only meaningful on an element inside a container with a matching role — on
 * a bare div it is ignored, so the one state the pane exists to express is
 * announced to nobody.
 *
 * `ListRows` supplies the `role="listbox"` the attribute needs. Since the rows
 * are also links that change the URL, the row keeps `<Link>` for its behaviour
 * and the wrapper gives it the semantics: middle-click still opens a tab, and a
 * reader is still told which of twenty-two clients is open.
 */
export function ListRows({
  label,
  width,
  children,
}: {
  /** What the list is of: "Clients". */
  label: string;
  width?: number | string;
  children: ReactNode;
}) {
  return (
    <div role="listbox" aria-label={label} className="col" style={{ gap: 0, width }}>
      {children}
    </div>
  );
}

/**
 * ── THE ROW IS NOT ALWAYS A LINK, AND THE ROLE DOES NOT FOLLOW IT ───────────
 *
 * This rendered a `<Link>` and only a `<Link>`. Four of the product's thirteen
 * rows are one; **six are `<button>`** — the exercise picker, the swap sheet,
 * the log's *repeat this* — and three are plain `<div>`s that state a fact and
 * go nowhere. So the element is chosen the way `Chip` chooses one: `href`
 * navigates, `onClick` acts, neither is a statement.
 *
 * `role="option"` and `aria-selected` are emitted for the LINK form only, and
 * that is the part worth reading twice. The roles are not decoration that can
 * ride along: an `option` is only valid inside a `listbox`, and a picker made
 * of buttons is not a listbox — labelling it one tells a screen-reader user
 * they can arrow through a selection that does not exist. A list of buttons is
 * a list of buttons, and saying so is the honest markup.
 */
export function ListRow({
  href,
  onClick,
  selected,
  avatar,
  title,
  sub,
  right,
  rightInline,
  className,
  style,
}: {
  /** Navigates. Renders a `next/link`, and the only form that is an `option`. */
  href?: string;
  /** Acts. Renders a `<button type="button">`, with no listbox semantics. */
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  avatar?: ReactNode;
  title: ReactNode;
  /** The second line — where and what, never a repeat of the title. */
  sub?: ReactNode;
  right?: ReactNode;
  /**
   * LAY THE RIGHT GROUP OUT AS A LINE RATHER THAN A COLUMN.
   *
   * `.lrow__r` is a right-ranged COLUMN, which is correct for its original
   * callers — a balance over a count, a figure over a tag — where the two are
   * one reading stacked. It is wrong the moment one of the items is a BUTTON:
   * the verb is 28px tall against a 16px figure, so the group grows to two
   * lines, the row grows with it, and the figure ends up nearer the divider
   * above than the name it belongs to. MEASURED on the Overview's *Needs you*:
   * rows at 56px with `₹6,400` sitting 9px above its own client's name and
   * reading as the previous row's.
   *
   * Inline, the figure and the verb are one line, vertically centred with the
   * name — and a `NudgeButton`'s *Messaged 4 days ago* note goes beside the
   * button instead of under it, which is the arrangement `.owd__acts .ndg` and
   * `.rst .act .ndg` already use for the same button in the same situation.
   */
  rightInline?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const cls = ['lrow', className].filter(Boolean).join(' ');
  const body = (
    <>
      {avatar}
      <span className="lrow__m">
        <span className="lrow__t">{title}</span>
        {sub ? <span className="lrow__s">{sub}</span> : null}
      </span>
      {right ? (
        <span className={rightInline ? 'lrow__r lrow__r--inline' : 'lrow__r'}>{right}</span>
      ) : null}
    </>
  );

  if (href !== undefined) {
    return (
      <Link href={href} role="option" aria-selected={selected ?? false} className={cls} style={style}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={selected} style={style}>
        {body}
      </button>
    );
  }

  return (
    <div className={cls} aria-selected={selected} style={style}>
      {body}
    </div>
  );
}

/** The figure on the right of a row — a balance, a count. Tabular. */
export function ListRowNumber({ children }: { children: ReactNode }) {
  return <span className="lrow__n">{children}</span>;
}
