import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * THREE NUMBERS, ON ONE LINE, WITH NO BOXES.
 *
 * What it replaces: `.srail` drew them as three equal cards in a row, which is
 * the single most-generated dashboard layout there is and the one
 * `design-taste-frontend` names outright in §9.C. It is also more container
 * than the content asks for. The block's own docstring in `Today.tsx` says the
 * point in one line: "three numbers, no more." Three numbers do not need three
 * boxes, a border each, and a shadow.
 *
 * So they are three numbers separated by a hairline, sitting on the canvas,
 * under the same rule every other section gets. The block keeps its place at
 * the FOOT of the page, which is the original argument and a good one: these
 * are what a trainer checks once the list is clear, not what greets them.
 *
 * ── THE ZERO ────────────────────────────────────────────────────────────────
 *
 * `Glance` rendered no-clients-at-risk as an em-dash. That is a character the
 * brief bans outright, and it is also the wrong answer: a dash reads as "not
 * measured" when the true value is zero and zero is the good news. `Figure`
 * takes the value as given and the caller now passes `0`.
 */
export function Figures({ children }: { children: ReactNode }) {
  return <div className="figs">{children}</div>;
}

/**
 * The same four words `Stat` and `SubscriptionBar` use, and deliberately not a
 * fifth vocabulary. A figure carries a tone when the NUMBER is the state —
 * money that is late, a balance that has run out — and never merely because
 * the row it sits in is about money. `neutral` is the default and writes no
 * class, so every figure drawn before this prop existed renders byte-identical.
 */
export type FigureTone = 'neutral' | 'acc' | 'warn' | 'danger';

export function Figure({
  label,
  value,
  tone = 'neutral',
  /** The denominator in "7/9". Context, not a second number, so it is set in
      the text face at name size rather than as another Archivo figure. */
  of,
  href,
}: {
  label: string;
  value: ReactNode;
  tone?: FigureTone;
  of?: ReactNode;
  href?: string;
}) {
  const cls = ['figs__i', tone === 'neutral' ? null : `figs__i--${tone}`]
    .filter(Boolean)
    .join(' ');
  const body = (
    <>
      <span className="figs__k">{label}</span>
      <span className="figs__v">
        {value}
        {of !== undefined && <em>/{of}</em>}
      </span>
    </>
  );

  if (!href) return <div className={cls}>{body}</div>;
  return (
    <Link className={cls} href={href}>
      {body}
    </Link>
  );
}
