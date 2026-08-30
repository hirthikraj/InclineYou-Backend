import { permanentRedirect } from 'next/navigation';

/**
 * `/nudges` was a destination and should never have been one.
 *
 * The rule the feature is built on: **a nudge belongs next to the thing that
 * triggered it.** Making a trainer navigate somewhere else to follow up is
 * exactly the friction that stops the follow-up happening — so the buttons are on
 * the rows of the people they are about (Today's day list, the attention queue,
 * the roster, the dues list, the packs that are ending, the sessions nobody
 * turned up to, the client's own file) and there is no Nudges screen at all.
 *
 * What is left when the sending moves onto the rows is the TEMPLATE LIBRARY,
 * which is a setting: written once, edited rarely, read by every button above.
 * It lives at `/settings/nudges`, and it is built.
 *
 * Outside the `(main)` group, like the other five redirects, so a redirect does
 * not pay for the layout's `getTrainerName()` round trip on its way to throwing.
 */
export default function Page() {
  permanentRedirect('/settings/nudges');
}
