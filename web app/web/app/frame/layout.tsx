import './../styles/library-chrome.css';

/**
 * The inside of a `<Viewport>` frame.
 *
 * ── WHY THIS ROUTE EXISTS AT ALL ────────────────────────────────────────────
 *
 * A screen needs no frame route: `<Viewport src="/today">` frames the real
 * thing, which is the point. A COMPONENT does — an entry is a documentation
 * page, and framing `/library/c-button` at 390 would put the library's sidebar,
 * top bar and pager inside the box and leave about two hundred pixels for the
 * specimen the reader came to see.
 *
 * So this is the same entry view with the library's chrome taken off. Not a
 * copy of the specimen: `ENTRY_VIEWS` is the one the component page renders,
 * imported here unchanged. A second source for specimens is the exact failure
 * the library was built to end.
 *
 * ── WHY IT IS NOT UNDER /library ────────────────────────────────────────────
 *
 * Because a route group cannot escape a parent layout. Anything under
 * `app/library/` inherits `app/library/layout.tsx`, chrome and all, which is
 * precisely what has to come off. A sibling segment is the only way to reuse
 * the CSS without the frame around it.
 *
 * ── WHY IT STILL IMPORTS library-chrome.css ─────────────────────────────────
 *
 * Because the specimens are drawn with `.cmp`, `.blk`, `.bench` and `.cell`,
 * and those live in that stylesheet. `library/layout.tsx` explains why it is
 * imported in a nested layout rather than at the root — `.page`, `.cell` and
 * `.st` are generic enough for a product component to match one by accident,
 * and `sync-design` strips them out of the application stylesheet for that
 * reason. That argument is about PRODUCT routes, and this is not one. Two
 * non-product segments load it; no screen a trainer can reach does.
 */
export const metadata = {
  /* `noindex` and no title worth reading: this route is the inside of a box on
     another page, never a destination. */
  robots: { index: false, follow: false },
};

export default function FrameLayout({ children }: { children: React.ReactNode }) {
  /* `.doc` carries the library's type stack and ink; `.frame` drops the page
     furniture `.page` would add — there is no 1580px measure to centre inside a
     390px viewport, and no 120px footer gutter under a specimen. */
  return <div className="doc frame">{children}</div>;
}
