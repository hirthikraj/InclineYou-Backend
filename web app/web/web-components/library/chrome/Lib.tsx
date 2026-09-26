'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { GROUPS } from '../../registry';
import { PARTS } from '../system/parts';

/**
 * The library's sidebar.
 *
 * ── IT LIVES IN THE LAYOUT, AND THAT IS THE WHOLE FIX ───────────────────────
 *
 * `.lib__nav` is its own scroll container — sticky, with `overflow-y:auto` and
 * forty-seven rows in it. Rendered inside the page, every navigation between
 * components unmounted and remounted it, so its `scrollTop` went back to zero
 * and the list jumped to the top on every click. Switching between two
 * components thirty rows apart meant scrolling the sidebar down again each time.
 *
 * In the layout it is never remounted: the App Router swaps only the changing
 * child segment, so this element and its scroll position survive. That is also
 * why `current` is read from `usePathname` rather than passed in — a layout has
 * no access to its child segment's params, and deriving it here means the nav
 * never has to be told where the reader is.
 *
 * ── AND WHY aria-current, NOT data-here ─────────────────────────────────────
 *
 * §23 defines both. `a[data-here]` changes the ink and nothing else; it exists
 * for the static HTML files, where every link on a component page points at the
 * page you are already on and a loud highlight on all four would be noise.
 * `a[aria-current="page"]` is the real treatment — tinted ground, accent text,
 * 600 weight, accent border.
 *
 * Here there is exactly ONE current page, so the strong state is the correct
 * one, and `aria-current` is what a screen reader reads to answer the same
 * question the highlight answers for the eye.
 */
export function LibNav() {
  const pathname = usePathname();
  const current = pathname.startsWith('/library/') ? pathname.slice('/library/'.length) : null;

  const nav = useRef<HTMLElement>(null);

  /*
   * Reveal the current row if it is out of view — arriving by URL, by the back
   * button, or from the index, where the nav has never been scrolled.
   *
   * `block: 'nearest'` is doing real work: it scrolls only when the row is
   * actually outside the box, so clicking a link that was already visible moves
   * nothing. Without it every navigation would re-centre the list, which is the
   * same jump this component was rewritten to stop.
   */
  useEffect(() => {
    const here = nav.current?.querySelector('[aria-current="page"]');
    here?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const total = GROUPS.reduce((n, g) => n + g.entries.length, 0);

  return (
    <nav className="lib__nav" aria-label="Design system" ref={nav}>
      <p className="lib__gk">DESIGN SYSTEM</p>
      <Link href="/library" aria-current={current === null ? 'page' : undefined}>
        <i>The ten parts</i>
      </Link>
      {/*
       * All ten, numbered, above the component groups rather than beside them.
       *
       * The groups below are the CONTENTS of part 3, and the indentation is the
       * only thing that says so. Listing the seven groups as peers of the ten
       * parts — which is what the sidebar did when the catalogue was the whole
       * library — puts "Actions" and "Tokens" at the same level, and a reader
       * scanning the rail cannot tell that one is a drawer inside the other.
       */}
      {PARTS.map((p) => (
        <Link
          key={p.slug}
          href={`/library/${p.slug}`}
          aria-current={current === p.slug ? 'page' : undefined}
        >
          <i>
            <span className="lib__pn">{p.n}</span> {p.name}
          </i>
          {p.slug === 'components' ? <b>{total}</b> : null}
        </Link>
      ))}

      {GROUPS.map(({ group, entries }, i) => (
        <div key={group}>
          <p className="lib__gk">{i === 0 ? `PART 3 · ${group}` : group}</p>
          {entries.map((e) => (
            <Link
              className="lib__sub"
              key={e.id}
              href={`/library/${e.id}`}
              aria-current={current === e.id ? 'page' : undefined}
            >
              <i>{e.name}</i>
              {e.badge ? <b>{e.badge}</b> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
