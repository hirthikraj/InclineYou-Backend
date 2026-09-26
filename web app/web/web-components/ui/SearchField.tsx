'use client';

import { Search } from '@/components/shell/Icons';

/**
 * Search field — filters the list it sits above, as you type.
 *
 * `type="search"`, which is not cosmetic: it gives the browser's own clear
 * button and, on a phone, a keyboard whose return key says Search.
 *
 * The label is visually hidden rather than absent. A magnifying glass is not a
 * name, and "Search" alone is not one either when three lists on one screen each
 * have a box — `label` has to say what is being searched, and it is required
 * here so that it does.
 *
 * ── THE RESULT COUNT IS PART OF THE CONTROL ─────────────────────────────────
 *
 * Typing filters the list silently: the rows change and a screen reader is told
 * nothing, because nothing it was reading moved. `count` renders a polite live
 * region, so "6 of 22 clients" is announced after the typing stops. Without it
 * the control works for everybody who can see the list shrink, and for nobody
 * else.
 */
export function SearchField({
  label,
  count,
  width,
  className,
  ...input
}: {
  /** What is being searched: "Search clients", "Search the exercise library". */
  label: string;
  /** Live result count, e.g. `{ shown: 6, total: 22, noun: 'clients' }`. */
  count?: { shown: number; total: number; noun: string };
  width?: number | string;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<'input'>, 'type' | 'className' | 'aria-label'>) {
  return (
    <>
      <label className={['search', className].filter(Boolean).join(' ')} style={width ? { maxWidth: width } : undefined}>
        <Search size={15} />
        <input type="search" placeholder={label} aria-label={label} {...input} />
      </label>
      {count ? (
        <span className="vh" role="status" aria-live="polite">
          {count.shown} of {count.total} {count.noun}
        </span>
      ) : null}
    </>
  );
}
