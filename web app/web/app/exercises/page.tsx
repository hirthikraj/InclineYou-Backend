import { permanentRedirect } from 'next/navigation';

/**
 * `/exercises` was a destination. It is a tab inside Programs now.
 *
 * Kept as a redirect rather than deleted: the route was in the rail for the whole
 * of this half's life, so it is in browser histories, in bookmarks and in at least
 * one screenshot in the design set. `permanentRedirect` because the move is
 * permanent — the library is not coming back to the top level, and a 308 lets a
 * browser stop asking.
 */
export default function Page() {
  permanentRedirect('/programs/exercises');
}
