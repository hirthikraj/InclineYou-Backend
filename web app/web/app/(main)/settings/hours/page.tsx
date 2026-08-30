import { redirect } from 'next/navigation';

/**
 * `/settings/hours` — a redirect since 29 Aug 2026.
 *
 * This was a `NotBuilt` notice for as long as Settings has existed, and then
 * the working-week editor was built somewhere else: `/settings/profile/work`,
 * beside the gym you work at and how you coach, because those are the same
 * question asked three ways and a trainer changing one usually wants the others
 * in front of them.
 *
 * A redirect rather than a second copy of the editor, and rather than deleting
 * the route: `webapp-settings.html` frame 2a is this path, and
 * `app/(main)/schedule/page.tsx` names it in a comment. A URL that has been
 * advertised should keep working.
 *
 * Nothing in Settings points here any more. It used to be the index's third row
 * — a *Soon* that became a link — and the index is gone: Settings is a tab strip
 * now, and the working week is not one of its tabs for the reason
 * `lib/settings/tabs.ts` gives. So the two remaining callers are this comment's
 * two, plus whatever a trainer has bookmarked.
 *
 * It sits OUTSIDE the `(sections)` route group deliberately, so a redirect does
 * not pay for that layout's chrome on its way to throwing — the same reason six
 * other redirects were moved out of `(main)`.
 *
 * **What is still not built is the eight-week bulk pattern** — frame 7a, which
 * paints a repeating shape across the schedule rather than describing one week.
 * That belongs to `/schedule`, not here, and it never was what this route
 * promised.
 */
export default function Page() {
  redirect('/settings/profile/work');
}
