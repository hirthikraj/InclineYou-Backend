import Link from 'next/link';
import type { ReactNode } from 'react';

import { Chevron } from '@/components/shell/Icons';

/**
 * A SECTION: a heading that is a heading, an optional count, and the body.
 *
 * It began as a hairline above a block instead of a box (the ranked blocks of
 * `/today` should not read as four equal things), and the light theme then
 * gave Today's slabs a white card. **The revamp of 26 Nov 2026 keeps the card
 * and adds the two things the reference does better than the slab did:**
 *
 *   · `lead` — one sentence under the title saying why the section matters
 *     (*Pack balances only change once a session is marked*). The old card put
 *     that sentence in the body as a `<p>` each caller styled itself.
 *   · `button` — the section's own verb, ranged right on the title row
 *     (*Mark all 4 done*). `action` stays for the quieter *Full schedule ›*
 *     link; a section takes one or the other.
 *
 * On Today the body runs edge to edge (`flush`), so rows draw their hairlines
 * across the whole card and the header owns the padding.
 *
 * `count` is a neutral figure beside the title, never a coloured badge — the
 * urgency is carried by the rows. `tone: 'warn'` exists for the one count that
 * IS the urgency (*4 to log*): a figure the trainer must bring to zero.
 */
export function Slab({
  title,
  count,
  countLabel,
  countTone,
  lead,
  action,
  button,
  /** Drops the top rule and margin — the first section on a page has nothing
      to be separated from. */
  first = false,
  /** Rendered between the heading and the body — the agenda's filters. */
  controls,
  /** The body runs to the card's edges, so list hairlines span the card. */
  flush = false,
  children,
  id,
}: {
  title: string;
  count?: number;
  /** Text after the count (*to log*). Read with it; the count alone is hidden
      from a reader because the list below already says it. */
  countLabel?: string;
  countTone?: 'warn';
  lead?: ReactNode;
  action?: { label: string; href: string };
  button?: ReactNode;
  first?: boolean;
  controls?: ReactNode;
  flush?: boolean;
  children: ReactNode;
  id?: string;
}) {
  const cls = ['slab', first ? 'slab--first' : null, flush ? 'slab--flush' : null]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={cls} id={id}>
      <div className="slab__top">
        <div className="slab__id">
          <div className="slab__hd">
            <h2 className="slab__t">{title}</h2>
            {count !== undefined && (
              <span
                className={`slab__n${countTone ? ` slab__n--${countTone}` : ''}`}
                aria-hidden="true"
              >
                {count}
                {countLabel && <> {countLabel}</>}
              </span>
            )}
          </div>
          {lead && <p className="slab__lead">{lead}</p>}
        </div>
        {(action || button) && (
          <span className="slab__a">
            {button}
            {action && (
              /* `.slab__link`, not `.atn__more`: the queue's foot control carries
                 margins that made the header band 39.8px for a 20.8px title. */
              <Link className="slab__link" href={action.href}>
                {action.label}
                <Chevron size={13} />
              </Link>
            )}
          </span>
        )}
      </div>
      {controls && <div className="slab__ctl">{controls}</div>}
      {children}
    </section>
  );
}
