import { permanentRedirect } from 'next/navigation';

/**
 * §3 · Progress → Check-ins, which is now the other half of **Assessments**.
 *
 * This one matters more than its sibling redirect, because the link is not only
 * a bookmark: `Flow.tsx` sends a client here the moment they finish a check-in,
 * `/me/checkin/:id` names it in its crumb, and Home links to it. All three have
 * been repointed — but a client who sent a check-in yesterday may still have the
 * old URL in their history, and a 404 at the end of the one flow this portal
 * asks somebody to complete is the worst place in the product to put one.
 *
 * See the Measurements redirect beside this for why `permanentRedirect`, and why
 * it is inside the tab layout rather than outside it.
 */
export default function Page(): never {
  permanentRedirect('/me/progress/assessments');
}
