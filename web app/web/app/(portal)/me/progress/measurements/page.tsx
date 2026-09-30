import { permanentRedirect } from 'next/navigation';

/**
 * §3 · Progress → Measurements, which is now half of **Assessments**.
 *
 * ── A REDIRECT RATHER THAN A DELETE, AND THAT IS `/sessions`' OWN RULE ──────
 *
 * The tab existed, was linked from the Summary's weight card, and is exactly
 * the sort of screen somebody bookmarks — *is my waist moving* is a question a
 * client comes back to every few weeks. `app/(main)/clients/[clientId]/notes
 * /page.tsx` makes the identical call, for the identical reason, when THAT
 * tab was renamed to `/information` on 30 Sep 2026: **a rename is not worth a
 * 404 to somebody who kept the link.**
 *
 * `permanentRedirect` and not `redirect`, because this mapping is settled: the
 * tape is on Assessments and there is no pass that would put it back on a route
 * of its own. The temporary form is for a mapping a later pass could reasonably
 * change — `/business?tab=owed` → `?filter=`, which is a chip and might not stay
 * one.
 *
 * ── AND IT IS OUTSIDE NOTHING, WHICH COSTS A LAYOUT ─────────────────────────
 *
 * `/money/*` and friends sit outside the `(main)` group so a redirect does not
 * pay for the layout's round trip. This one cannot: taking it out of
 * `(portal)/me/progress` means taking it out of the tab layout, and the layout
 * is what draws the bar, the header and the strip. A redirect that fires before
 * a render costs the layout's `requirePortal()` — one `cache()`d `getMe` — which
 * is the same read the destination is about to make anyway.
 */
export default function Page(): never {
  permanentRedirect('/me/progress/assessments');
}
