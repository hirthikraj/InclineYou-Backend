import type { ReactNode } from 'react';

import type { Entry } from '../../registry';

/**
 * A component's own section.
 *
 * Split out of `Lib.tsx` when the sidebar became a client component: `Cmp`
 * wraps every entry, and leaving it in a `'use client'` module would have
 * dragged all forty-seven of them across the boundary for no reason. It renders
 * on the server, which is where a page of prose and specimens belongs.
 *
 * `id` is the design file's anchor, so a link written against
 * `webapp-c-actions.html#c-button` still lands in the right place here.
 */
export function Cmp({
  entry,
  status = 'stable',
  meta,
  children,
}: {
  entry: Entry;
  status?: 'stable' | 'beta' | 'todo';
  /** The `Class · Variants · Sizes · States · Used in` strip. */
  meta?: { k: string; v: ReactNode }[];
  children: ReactNode;
}) {
  const label = status === 'stable' ? 'Stable' : status === 'beta' ? 'Beta' : 'To do';

  return (
    <section className="cmp" id={entry.id}>
      <div className="cmp__hd">
        <h3 className="cmp__n">{entry.name}</h3>
        <span className={`cmp__st cmp__st--${status}`}>{label}</span>
      </div>
      <p className="cmp__def">{entry.desc}</p>
      {meta?.length ? (
        <div className="cmp__meta">
          {meta.map((m) => (
            <span key={m.k}>
              <b>{m.k}</b> {m.v}
            </span>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}
