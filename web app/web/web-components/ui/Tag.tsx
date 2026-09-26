import Link from 'next/link';
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';

/**
 * Tag — a read-only label. Never a control.
 *
 * The whole value of this component is the thing it refuses to do. `.tag` and
 * `.chip` look similar and mean opposite things: a chip is PRESSED, a tag is
 * READ. Rendering a `<span>` with no handler and no role is what keeps that
 * boundary from eroding one call-site at a time — a tag that needs to be
 * *pressed* is a `Chip`, and the fix is to change the component, not to add an
 * `onClick` here. There is still no `onClick`, and there will not be one.
 *
 * ── THE ONE EXCEPTION, AND WHY IT IS NOT AN EROSION ──────────────────────────
 *
 * `href` is not an `onClick` in disguise. A link NAVIGATES; it does not toggle,
 * submit or mutate, so it cannot become the pressed thing a chip is. Today's
 * hero draws *Has a note* and it goes to the file where the note is — a chip
 * that reports a note exists and cannot open it has told the trainer about a
 * thing and then asked them to go and find it.
 *
 * It was found the other way round: the product had been shipping
 * `<Link className="tag tag--link">` by hand for as long as the hero has
 * existed, with the variant's CSS parked in the app's own `app.css` rather than
 * in §04 — so the design set did not contain a component the product ships, and
 * this file, which is supposed to BE that component, said the case did not
 * exist. Both halves now agree.
 *
 * `next/link` for an in-app path, a plain `<a>` for an off-site one, matching
 * `Button` exactly — prefetching `wa.me` on scroll is not wanted.
 */
export type TagTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'acc' | 'floor' | 'remote' | 'pr';

/**
 * The class list, exported so the library's specimen prints the exact string a
 * call-site produces rather than a plausible-looking one.
 */
export function tagClass({
  tone = 'neutral',
  link,
  className,
}: {
  tone?: TagTone;
  link?: boolean;
  className?: string;
}): string {
  return ['tag', tone === 'neutral' ? null : `tag--${tone}`, link ? 'tag--link' : null, className]
    .filter(Boolean)
    .join(' ');
}

type Common = {
  tone?: TagTone;
  /** Extra classes for the call-site's own layout. Never for restyling the tag. */
  className?: string;
  /**
   * The call-site's own LAYOUT, and nothing else.
   *
   * Every use of it in the product is a margin — five `marginLeft: 'auto'`
   * pushing a tag to the end of a row, two nudges of 6 and 8px. Colour, size
   * and radius stay in §04 where a designer can reach them; a `style` here that
   * sets one of those is the tag being restyled at a call-site, which is the
   * thing the design system exists to stop.
   */
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * The span form takes `title` and `style` and NOTHING ELSE off the DOM.
 *
 * Spreading `ComponentPropsWithoutRef<'span'>` here would have been shorter and
 * it would have handed back `onClick` — the one prop this component's whole
 * doc-comment above says it must never have. A tag that needs pressing is a
 * `Chip`. So the two props the product actually needs are named, and the door
 * stays shut on the rest.
 */
type AsSpan = Common & { href?: never; title?: string };
type AsLink = Common & {
  /** Renders a `next/link` for an in-app path, a plain `<a>` for an off-site one. */
  href: string;
} & Omit<ComponentPropsWithoutRef<'a'>, 'className' | 'children' | 'href'>;

export function Tag(props: AsSpan | AsLink) {
  const { tone = 'neutral', className, style, children } = props;

  if (props.href !== undefined) {
    /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to keep
       the component's own props off the element `rest` spreads onto. */
    const { href, tone: _t, className: _c, style: _s, children: _ch, ...rest } = props;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    const cls = tagClass({ tone, link: true, className });
    const offSite = /^[a-z]+:|^\/\//i.test(href);
    if (offSite) {
      return (
        <a className={cls} href={href} style={style} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link className={cls} href={href} style={style} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <span className={tagClass({ tone, className })} style={style} title={props.title}>
      {children}
    </span>
  );
}
