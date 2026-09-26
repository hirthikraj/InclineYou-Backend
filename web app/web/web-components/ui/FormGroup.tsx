import type { ReactNode } from 'react';

/**
 * Form group — the rules for putting fields together.
 *
 * One column, because a form read down one line is a form nobody loses their
 * place in. Two columns only for values that are genuinely a pair and genuinely
 * short — a start and an end, a count and a unit. Never for two unrelated
 * fields that happen to fit.
 *
 * ── THE FIELDSET IS NOT DECORATION ──────────────────────────────────────────
 *
 * When a group has a heading, it is a `<fieldset>` with a `<legend>`. A screen
 * reader then announces "Payment, Amount in rupees" rather than "Amount in
 * rupees" — the heading is otherwise a visual grouping that exists for sighted
 * users only, which is exactly the class of thing that gets drawn and never
 * wired.
 *
 * `.col` and the `.gapN` steps are §04's, so the spacing stays a design
 * decision rather than a number a call-site picks.
 *
 * ── THE GAP IS A STEP, NOT A NUMBER ─────────────────────────────────────────
 *
 * 12px is right for a column of short fields — a label, a control, and at most
 * a phrase under it. It is too tight for a form whose hints are SENTENCES: on
 * `/settings/profile` every field carries one or two lines of guidance, so at
 * 12px a hint sat closer to the label BELOW it than to the control it was
 * about. Those call-sites were each carrying their own `marginTop` inline —
 * 18px, 18, 18, 22 down one form — which is the same decision made four times
 * and made differently once. The prop takes §04's steps and nothing else, so a
 * fifth spelling is not expressible.
 */
export function FormGroup({
  heading,
  hint,
  columns = 1,
  gap = 3,
  width,
  className,
  children,
}: {
  /**
   * Names the set. Renders as a legend, and is announced before each field.
   *
   * A NODE rather than a string, for the one thing every form in this product
   * puts beside a label: the grey `optional`. A `<legend>` takes phrasing
   * content, so `Goal optional` is one legend with two weights in it rather
   * than a heading with a second span floating beside the fieldset.
   */
  heading?: ReactNode;
  hint?: ReactNode;
  columns?: 1 | 2;
  /** §04's spacing steps: 2 = 8px, 3 = 12px, 4 = 16px, 6 = 24px. */
  gap?: 2 | 3 | 4 | 6;
  width?: number | string;
  className?: string;
  children: ReactNode;
}) {
  const g = `gap${gap}`;

  const inner = (
    <div
      className={columns === 2 ? `grid2 ${g}` : `col ${g}`}
      style={columns === 2 ? { alignItems: 'start' } : undefined}
    >
      {children}
    </div>
  );

  if (!heading) {
    return (
      <div className={['col', g, className].filter(Boolean).join(' ')} style={width ? { width } : undefined}>
        {inner}
      </div>
    );
  }

  return (
    <fieldset
      className={['col', g, className].filter(Boolean).join(' ')}
      style={{ width, border: 0, margin: 0, padding: 0, minInlineSize: 0 }}
    >
      <legend className="fld__l" style={{ padding: 0 }}>
        {heading}
      </legend>
      {hint ? <span className="fld__h">{hint}</span> : null}
      {inner}
    </fieldset>
  );
}
