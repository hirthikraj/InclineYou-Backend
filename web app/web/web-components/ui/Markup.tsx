import { Fragment } from 'react';

import { parseMarkup, type Mark, type Span } from '@/lib/text/markup';

/**
 * Markup — trainer-written text, drawn with the little formatting it carries.
 * Catalogue entry `c-markup`, `.mkp`.
 *
 * The other half of `MarkupField`: that component writes the markers, this one
 * is the only thing in the product that reads them. **A field that is edited
 * with `MarkupField` MUST be displayed with this**, everywhere it is displayed
 * — the failure mode is not a missing style, it is a client reading
 * `**pause at the bottom**` with the asterisks in it.
 *
 * ── ELEMENTS, NOT AN HTML STRING ────────────────────────────────────────────
 *
 * `lib/text/markup.ts` returns nodes and this builds `<strong>`, `<em>` and
 * `<u>` from them, so no HTML is ever produced and `dangerouslySetInnerHTML`
 * appears nowhere on the path. The one instance of it in this codebase is the
 * theme's no-flash script, and that is where it should stay: everything here is
 * written by one user and read by another.
 *
 * ── ALL SPANS, NO BLOCK ELEMENTS ────────────────────────────────────────────
 *
 * The first call-site draws a cue INSIDE A BUTTON — the note under a set line,
 * which opens its own editor when clicked — and a `<div>` or a `<p>` inside a
 * `<button>` is invalid content that browsers repair by closing the button
 * early. So every part is a `<span>` and the line breaks are CSS
 * (`.mkp__l{display:block}`). It costs nothing and it means this component can
 * be dropped into any container without a second version for the ones that
 * cannot take flow content.
 *
 * ── THE HEADING IS A HEADING'S WEIGHT, NOT AN `<h*>` ────────────────────────
 *
 * `# ` marks the line a trainer wants to stand out — *Warm-up*, *Top set* —
 * inside a note that is itself a caption under a row. There is no document
 * outline for it to join, and emitting an `<h3>` inside a set line would put a
 * rung in the screen reader's heading list for every cue on the canvas. The
 * weight and the letter-spacing are the whole intent; the element stays inline.
 */
export function Markup({
  value,
  /** Passed through, so a call-site keeps its own block's geometry. */
  className,
}: {
  value: string;
  className?: string;
}) {
  const blocks = parseMarkup(value);

  return (
    <span className={['mkp', className].filter(Boolean).join(' ')}>
      {blocks.map((block, i) => (
        <span className={block.heading ? 'mkp__l mkp__h' : 'mkp__l'} key={i}>
          {block.spans.map((span, j) => (
            <Fragment key={j}>{wrap(span)}</Fragment>
          ))}
        </span>
      ))}
    </span>
  );
}

/** Innermost first, so `**a *b* **` nests the way it was written. */
function wrap(span: Span) {
  return span.marks.reduceRight<React.ReactNode>((node, mark) => ELEMENT[mark](node), span.text);
}

const ELEMENT: Record<Mark, (node: React.ReactNode) => React.ReactNode> = {
  bold: node => <strong>{node}</strong>,
  italic: node => <em>{node}</em>,
  /* `<u>` and not a class on a span: it is the element whose whole meaning is
     "this run is marked, without saying why", which is exactly the case here —
     and the one HTML5 kept for precisely this after deprecating it for style.
     A styled span would say nothing at all to a reader that does not paint. */
  underline: node => <u>{node}</u>,
};
