import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Inline link — goes somewhere. A real `<a>`.
 *
 * It carries no class: §02 styles the bare element
 * (`a{color:var(--tx-accent-text)}`), which is the right place for it — a link
 * in prose written by anybody is styled without anybody remembering to.
 *
 * What this component is for is the part §02 cannot do from CSS: choosing
 * `next/link` for an in-app path and a plain `<a>` for an off-site one, and
 * attaching `rel="noopener noreferrer"` to every `target="_blank"`. That pair
 * was being typed by hand at every call-site, and it is the one that has a
 * security answer rather than a taste answer.
 */
export function InlineLink({
  href,
  newTab,
  className,
  children,
}: {
  href: string;
  newTab?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const external = /^(?:[a-z]+:)?\/\//i.test(href) || /^(?:mailto|tel):/i.test(href);

  /*
    `.ilink` ALWAYS, and a caller's `className` on top of it rather than instead.

    MEASURED, 23 Sep 2026: this component used to pass `className` straight
    through, so every call-site that gave it nothing — which is all of them —
    rendered a bare `<a>` wearing only the reset. On the portal's trainer card
    that made *Directions* accent-coloured, undecorated, and **1.01:1 against the
    sentence it sits in**: the same luminance as the prose, separated by hue
    alone. WCAG 1.4.1 is Level A and asks for 3:1 before colour may carry a
    distinction on its own, so a reader in greyscale had no link there at all.
    It was also 15px tall, which is the line box and nothing more.

    §11's `.ilink` answers both — an underline, and an inset pseudo-element that
    takes the target to 35px. It is applied HERE rather than at the call-sites
    because the defect was that call-sites had to remember, and three of them on
    one destination did not.
  */
  const cls = ['ilink', className].filter(Boolean).join(' ');

  if (external || newTab) {
    return (
      <a
        href={href}
        className={cls}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
        {newTab ? <span className="vh"> (opens in a new tab)</span> : null}
      </a>
    );
  }

  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
