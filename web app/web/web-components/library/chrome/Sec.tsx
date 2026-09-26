import Link from 'next/link';
import type { ReactNode } from 'react';

import { PARTS, type Part } from '../system/parts';

/**
 * One part of the design system, framed.
 *
 * `Cmp` does this job for a component and is deliberately not reused: its
 * header is a component's name, status chip and one-line definition, and a part
 * of the system has none of those three. What a part has is a NUMBER — it is
 * 4 of 10, and the reader's first question is which of the ten they are in —
 * plus the reference's own two headings, Definition and Purpose, which are the
 * frame every part answers in.
 *
 * The pager at the foot is not decoration either. The ten parts are an argument
 * in order: principles decide the style guide, the style guide is spent by the
 * components, the components are arranged by patterns. A reader who lands on
 * one from a search should be able to keep walking without going back to the
 * index to find out what comes next.
 */
export function Sec({ part, children }: { part: Part; children: ReactNode }) {
  const i = PARTS.findIndex((p) => p.slug === part.slug);
  const prev = PARTS[i - 1];
  const next = PARTS[i + 1];

  return (
    <section className="cmp" id={part.slug}>
      <div className="cmp__hd">
        <h3 className="cmp__n">
          <span className="sec__n">{part.n}</span> {part.name}
        </h3>
        <span className="cmp__st cmp__st--stable">Part {part.n} of {PARTS.length}</span>
      </div>
      <p className="cmp__def">{part.definition}</p>
      <div className="cmp__meta">
        <span>
          <b>Purpose</b> {part.purpose}
        </span>
      </div>

      {children}

      <nav className="sec__pg" aria-label="Design system parts">
        {prev ? (
          <Link href={`/library/${prev.slug}`}>
            <i>‹ {prev.n}</i> {prev.name}
          </Link>
        ) : (
          <Link href="/library">
            <i>‹</i> The design system
          </Link>
        )}
        {next ? (
          <Link href={`/library/${next.slug}`}>
            {next.name} <i>{next.n} ›</i>
          </Link>
        ) : (
          <Link href="/library">
            The design system <i>›</i>
          </Link>
        )}
      </nav>
    </section>
  );
}

/**
 * A plain two-column table for a page that is mostly values.
 *
 * `SpecTable` has four fixed columns — Property, Value, Token, Note — which is
 * right for a component's measurements and wrong for a part's content, where
 * the columns differ per table (name and value; do and don't; step and use).
 * Same `.st` class, so the two look like one table family; only the header row
 * is the caller's.
 */
export function Tbl({
  cols,
  rows,
}: {
  cols: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <div className="sec__tw">
      <table className="st">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((c, n) => (
                <td key={cols[n]} className={n > 0 ? 'v' : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A token's name, set as the code it is. */
export function Tk({ children }: { children: ReactNode }) {
  return <code className="sec__tk">{children}</code>;
}
