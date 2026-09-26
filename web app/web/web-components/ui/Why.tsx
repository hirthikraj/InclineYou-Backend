import type { CSSProperties, ReactNode } from 'react';

/**
 * Reason callout — the paragraph that answers "why are you asking me this?".
 *
 * The most distinctive component in the set, and the one most likely to be
 * misused as a generic tinted box. It is not an alert and not a tip: it exists
 * to explain a decision the product has already made — why the gym's share is
 * asked at step 3, why archiving keeps the history.
 *
 * `heading` is required for that reason. A `.why` with no heading is a coloured
 * paragraph, and a coloured paragraph is what an alert looks like. The heading
 * is what makes it a reason: "Why this is step 3 and not step 6".
 *
 * It carries no live region and no role. Nothing here is news — the callout was
 * on the screen before the trainer arrived, and announcing it as an alert would
 * make an explanation sound like a problem.
 */
export function Why({
  heading,
  tone,
  className,
  style,
  children,
}: {
  /** A reason, usually starting "Why…" or "One thing to know". */
  heading: ReactNode;
  tone?: 'warn' | 'danger';
  className?: string;
  /**
   * The callout's own placement. Seven of the twenty-one in the product carry
   * one — a `marginTop` that overrides §04's 18px, or a `maxWidth` on a screen
   * whose column is wider than the measure.
   */
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={['why', tone ? `why--${tone}` : null, className].filter(Boolean).join(' ')}
      style={style}
    >
      <p className="why__k">{heading}</p>
      {/*
        The children go in bare — there used to be a `<div>` around them, and it
        was doing nothing. `.why` is a plain block (border-left, background,
        padding) with no flex and no gap, and every rule that reaches inside is
        a DESCENDANT selector — `.why p`, `.why b`, `.why code`, `.why .small` —
        so a wrapper changed no styling. What it did change was the DOM: every
        call-site in the product writes `<p>` straight inside `.why`, and the
        wrapper was the one thing making a converted callout differ from the
        markup it replaced.
      */}
      {children}
    </div>
  );
}
