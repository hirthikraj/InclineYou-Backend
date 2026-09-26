import Link from 'next/link';

import { BENEFITS, PARTS } from '@/web-components/library/system/parts';
import { ENTRIES } from '@/web-components/registry';

/**
 * The design system, as ten parts.
 *
 * ── WHAT THIS PAGE REPLACED ─────────────────────────────────────────────────
 *
 * A component catalogue. It was a good catalogue and it was standing in the
 * wrong place: a reader arriving at `/library` met 72 cards and could
 * reasonably conclude that the design system IS its components. Everything the
 * components are made of — the tokens they spend, the scale they are set on,
 * the principles that decided them, the patterns that arrange them — existed
 * only as comments inside the stylesheet, which is to say it existed for
 * whoever already knew where to look.
 *
 * The taxonomy is the UXDT division's published one, kept in its order and with
 * its own headings. Borrowing it rather than inventing a house structure is the
 * point: a reader who has seen any public design system already knows what
 * "tokens" and "interaction patterns" are going to contain, so the index needs
 * no explaining before it can be used.
 *
 * ── AND WHY THE CARDS ARE NOT ALL THE SAME SIZE OF CLAIM ────────────────────
 *
 * Each card carries the part's own Definition and the elements it holds, which
 * is what the reference prints, plus one thing the reference has no way to
 * print: a live figure for the parts that have one. Part 3 says how many
 * components are catalogued, counted from the catalogue rather than typed
 * here. A number on an index page that somebody has to remember to update is a
 * number that will be wrong.
 */
export const metadata = {
  title: 'Design system · InclineYou',
  description: 'The ten parts of the InclineYou design system — principles, style guide, components, patterns, accessibility, iconography, motion, grid, documentation and tokens.',
};

export default function Page() {
  return (
    <>
      <h1>The design system, in ten parts</h1>
      <p className="doc__lede">
        The parts below are the building blocks that decide how this product looks, feels and behaves —
        reusable elements, the rules that govern them, and the values everything else is written in terms of.
        Nine of the ten describe the system; one of them, the component library, <i>is</i> the system, rendered
        from the application&rsquo;s own imports. Change a component there and both halves move on the same
        save.
      </p>

      <div className="doc__meta">
        <span>
          <b>Components catalogued</b> {ENTRIES.length}
        </span>
        <span>
          <b>Parts</b> {PARTS.length}
        </span>
        <span>
          <b>Source</b> <code>design-system/webapp/webapp/assets/webapp.css</code>
        </span>
      </div>

      <section className="cmp" id="parts">
        <div className="cmp__hd">
          <h3 className="cmp__n">Core parts of the design system</h3>
        </div>

        <div className="hub">
          {PARTS.map((p) => (
            <Link className="hub__c" href={`/library/${p.slug}`} key={p.slug}>
              <span className="hub__h">
                <span className="hub__n">{p.n}</span>
                <span className="hub__t">{p.name}</span>
              </span>
              <span className="hub__d">{p.definition}</span>
              <span className="hub__k">
                {p.keys.map((k) => (
                  <span key={k}>{k}</span>
                ))}
              </span>
              <span className="hub__f">{p.count ? p.count() : p.purpose.split('.')[0]}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="cmp" id="benefits">
        <div className="cmp__hd">
          <h3 className="cmp__n">What a defined system buys</h3>
        </div>
        <p className="cmp__def">
          The five the literature names, each one stated as the thing it actually prevents here rather than as
          a virtue.
        </p>
        <div className="sec__tw">
          <table className="st">
            <thead>
              <tr>
                <th>Benefit</th>
                <th>In this product</th>
              </tr>
            </thead>
            <tbody>
              {BENEFITS.map((b) => (
                <tr key={b.k}>
                  <td>{b.k}</td>
                  <td>{b.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cmp" id="reading">
        <div className="cmp__hd">
          <h3 className="cmp__n">Reading order</h3>
        </div>
        <p className="cmp__def">
          The ten are an argument in sequence, not a menu. Principles decide the style guide; the style guide
          is spent by the components; the components are arranged by the patterns; tokens are what all of it
          is written in. Someone new to the product gets the most out of parts 1, 2 and 3 in that order.
          Someone building a screen today wants 3, 4 and 8. Someone changing how the product looks wants 10,
          and will find that they only have to change it once.
        </p>
      </section>
    </>
  );
}
