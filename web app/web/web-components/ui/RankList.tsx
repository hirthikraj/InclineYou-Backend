import Link from 'next/link';
import type { ReactNode } from 'react';

import { Avatar } from './Avatar';

/**
 * A RANKING, ONE LINE PER ROW — `c-ranklist`.
 *
 * Name · bar · figure on one line. It replaces a key-value row with a full-width
 * meter under it, which spent two lines on every person and stretched five bars
 * across 1,700px, so the list was taller than everything else on the page and
 * the bar ran under the name it was meant to sit beside.
 *
 * The bar is scaled to the LARGEST row, not to the total: against the total
 * every bar was 10–13% wide and the first and fifth could not be told apart.
 * The first row is the one lime bar and the rest are neutral — the One-Lime-Bar
 * Rule in DESIGN.md. The bar is decorative (`aria-hidden`); the figure is the
 * fact, and `share` goes into the row's accessible text when given.
 */
export type RankItem = {
  id: string;
  name: string;
  /** Avatar seed. Omit for a row that is not a person. */
  avatarId?: string;
  value: number;
  /** The printed figure, already formatted. */
  display: ReactNode;
  href?: string;
  /** e.g. `13%` — read to a screen reader after the figure. */
  share?: string;
};

export function RankList({ items, label }: { items: RankItem[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className="rank" aria-label={label}>
      {items.map((it, n) => {
        const who = (
          <>
            {it.avatarId && <Avatar name={it.name} id={it.avatarId} size="sm" />}
            <span className="rank__n">{it.name}</span>
          </>
        );
        return (
          <li key={it.id} className="rank__r">
            {it.href ? <Link className="rank__who" href={it.href}>{who}</Link> : <span className="rank__who">{who}</span>}
            <span className="rank__bar" aria-hidden="true">
              <i
                className={n === 0 ? 'rank__f rank__f--top' : 'rank__f'}
                style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
              />
            </span>
            <span className="rank__v">
              {it.display}
              {it.share && <span className="sr-only">, {it.share} of the total</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
