import Link from 'next/link';
import type { ReactNode } from 'react';

import { Chevron } from '@/components/shell/Icons';

/**
 * A SECTION, GROUPED BY A RULE INSTEAD OF A BOX.
 *
 * Replaces the `.card` + `.sh` + `.sh__l` trio the first drawing of `/today`
 * used, and the reason is the one thing a designer can check by counting: the
 * shipped screen stacked four `.card` containers down the page, which says
 * "four equal things", while the screen's own argument — written at the top of
 * `components/today/Today.tsx` — is that the blocks are ranked by what it costs
 * to ignore them. A box cannot say "third most important". Type and space can.
 *
 * So the only container a section gets here is a hairline above it, and the
 * heading is a HEADING: 17px at 650, on the scale in §25. It was a 10.5px mono
 * uppercase label tracked out to 1.155px, which is a texture rather than a
 * hierarchy — with one above every block, every section shouts at the same
 * volume and none of them rank. Three of those labels were on the screen at
 * once; the `design-taste-frontend` budget for four sections is two.
 *
 * `count` is set as a figure beside the title rather than a coloured badge. The
 * queue's count was a red pill, which spent a second alert colour on a number
 * whose urgency is already carried by the rows underneath it.
 */
export function Slab({
  title,
  count,
  action,
  /** Drops the top rule and margin. The first section on a page has nothing to
      be separated from, and a rule against the page header reads as a seam. */
  first = false,
  /** Rendered between the heading and the body — the agenda's filters use it,
      so the controls that shape a list sit with the list's own title. */
  controls,
  children,
  id,
}: {
  title: string;
  count?: number;
  action?: { label: string; href: string };
  first?: boolean;
  controls?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className={`slab${first ? ' slab--first' : ''}`} id={id}>
      <div className="slab__hd">
        <h2 className="slab__t">{title}</h2>
        {count !== undefined && (
          <span className="slab__n" aria-hidden="true">
            {count}
          </span>
        )}
        {action && (
          <span className="slab__a">
            {/* `.slab__link`, NOT `.atn__more`. The queue's disclosure is a
                foot control and carries a 10px top margin and 6px of vertical
                padding to stand itself off the last row; in a baseline-aligned
                header those made the band 39.8px tall for a 20.8px title and
                dragged the heading 12px down with them. §25 has the numbers. */}
            <Link className="slab__link" href={action.href}>
              {action.label}
              <Chevron size={13} />
            </Link>
          </span>
        )}
      </div>
      {/* The controls slot owns the gap to the body, so a control dropped in
          here never has to remember to space itself off the first row. */}
      {controls && <div className="slab__ctl">{controls}</div>}
      {children}
    </section>
  );
}
