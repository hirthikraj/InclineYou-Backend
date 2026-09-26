import type { CSSProperties, ReactNode } from 'react';

/**
 * Empty state — a list with nothing in it, saying why.
 *
 * Three kinds, and conflating them is the mistake this component exists to
 * prevent. They look identical and mean completely different things:
 *
 *   `first-run`  nothing has ever been here. Offer the way to start.
 *   `filtered`   there is data; this filter excludes it. Offer the way back.
 *   `done`       there was something and it has been dealt with. Say so warmly.
 *
 * A filtered list that says "No clients yet" tells a trainer with twenty-two
 * clients that their book is empty. It is the same six words and a completely
 * different lie.
 *
 * The icon is `aria-hidden` and the title is a real heading, so the empty state
 * is a landmark in the outline rather than three floating paragraphs.
 */
export type EmptyKind = 'first-run' | 'filtered' | 'done';

export function EmptyState({
  kind = 'first-run',
  icon,
  title,
  body,
  action,
  inCard,
  className,
  style,
}: {
  kind?: EmptyKind;
  icon?: ReactNode;
  title: ReactNode;
  /** Why it is empty and what to do. Two sentences at most. */
  body?: ReactNode;
  action?: ReactNode;
  /** Tighter, for an empty state inside a card rather than a whole pane. */
  inCard?: boolean;
  className?: string;
  /**
   * The pane's own placement. Ten of the seventeen in the product set one —
   * usually a `marginTop` positioning the empty state inside a scroller that
   * §04's 64px padding does not account for.
   */
  style?: CSSProperties;
}) {
  return (
    <div
      className={['empty', inCard ? 'empty--card' : null, className].filter(Boolean).join(' ')}
      style={style}
      /* Only the FILTERED kind is announced. It appears in response to typing —
         the rows silently vanish, and a reader is left in a region that has
         become blank. The other two are present when the screen loads, so they
         are ordinary content: a live region would re-read them on every
         unrelated update. */
      role={kind === 'filtered' ? 'status' : undefined}
      aria-live={kind === 'filtered' ? 'polite' : undefined}
    >
      {icon ? (
        <span className="empty__ic" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="empty__t">{title}</p>
      {body ? <p className="empty__b">{body}</p> : null}
      {action}
    </div>
  );
}
