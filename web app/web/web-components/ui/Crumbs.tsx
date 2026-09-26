import Link from 'next/link';

/**
 * Breadcrumb — where this screen sits, at most three levels deep.
 *
 * `<nav aria-label="Breadcrumb">` around an `<ol>`, with `aria-current="page"`
 * on the last item. The reference has the nav and its label right and puts the
 * current page in a bare `<b>`; that renders correctly and tells a reader
 * nothing about which of the three is the one they are on.
 *
 * ── THE SEPARATORS ARE IN THE MARKUP, AND THEY HAD TO BE ───────────────
 *
 * This docstring used to say they were "drawn by CSS rather than typed into the
 * markup". **Nothing drew them.** There is no `::before` on `.crumbs` in either
 * stylesheet — only `.crumbs i`, which styles a separator the EIGHT screens
 * that draw a breadcrumb inside `.ph` all type by hand. So this component
 * rendered `Clients Meera Krishnan Bench press` with a 7px gap and no rule
 * between the levels, which is a list of three words rather than a path.
 *
 * Verified off the rendered specimen on `/library/c-crumbs`, not read: the
 * markup came back `<a>Clients</a><a>Meera Krishnan</a><b>Bench press</b>`.
 * That is almost certainly WHY all eight of those screens hand-wrote a `<nav
 * className="crumbs">` instead of importing this — the component could not draw
 * the one thing a breadcrumb is.
 *
 * `<i aria-hidden="true">` is the form those eight already use, so `.crumbs i`
 * covers both and converting them is byte-identical. And the accessibility
 * argument the old note made for CSS survives intact: `aria-hidden` means a
 * reader still gets "Clients, Meera Krishnan" and not "Clients slash Meera
 * Krishnan".
 */
export function Crumbs({
  items,
  className,
}: {
  /** Deepest last. The last one is the current page and is never a link. */
  items: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <nav className={['crumbs', className].filter(Boolean).join(' ')} aria-label="Breadcrumb">
      <ol style={{ display: 'contents', listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} style={{ display: 'contents' }}>
              {/* INSIDE the `li`, and before its own label rather than after
                  the previous one's. A separator appended to level 1 would sit
                  in level 1's list item, so a reader walking the list by item
                  would find it inside the thing it separates FROM. Leading,
                  skipped on the first, it belongs to the boundary it draws. */}
              {i > 0 && <i aria-hidden="true">/</i>}
              {last || !it.href ? (
                <b aria-current={last ? 'page' : undefined}>{it.label}</b>
              ) : (
                <Link href={it.href}>{it.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
