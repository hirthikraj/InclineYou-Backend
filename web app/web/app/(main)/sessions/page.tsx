import { permanentRedirect } from 'next/navigation';

/**
 * `/sessions` → `/programs/workouts`.
 *
 * The list moved into Fitness on 13 Sep 2026 and `Workouts.tsx` says why. The
 * redirect exists because this path is linked from six places — the console, the
 * finish screen, the bests panel, the picker, and Today's hero — and a
 * breadcrumb that 404s is a worse outcome than a hop. Those six now point at the
 * new route directly; this catches the bookmarks and anything the next pass
 * misses.
 *
 * ── IT IS INSIDE `(main)`, WHICH BREAKS THE HOUSE RULE ON PURPOSE ────────────
 *
 * `AGENTS.md` puts the five folded-in redirects — `/money/*`, `/packages`,
 * `/reports`, `/exercises`, `/nudges` — OUTSIDE the group so that a redirect does
 * not pay for the layout's `getTrainerName()` round trip on its way to throwing.
 * That move needs the whole `/sessions` subtree to come out with it, and
 * `/sessions/:id`, `/sessions/:id/log`, `/sessions/:id/finish`,
 * `/sessions/:id/bests` and `/sessions/new` are all live shell screens that have
 * to stay in. Splitting a segment's children across two route groups to save one
 * round trip on a path nothing links to any more is a trade this file declines.
 */
export default function Page() {
  permanentRedirect('/programs/workouts');
}
