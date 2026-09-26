import { signOut } from '@/lib/auth/actions';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { ThemeSwitch } from '@/web-components/ui/ThemeSwitch';

/**
 * This browser — the theme, and the way out. The two controls on the account
 * screen that write no server row.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A CLIENT ON A PHONE COULD NOT SIGN OUT. AT ALL.
 *
 * `app/styles/app.css` sets `.rail{display:none}` below 900px, and the rail's
 * account foot is where **Sign out** and the **theme switch** live
 * (`AccountMenu.tsx`). The client's `TabBar` then takes an early return — four
 * tabs, no *More* button, no sheet — so at the width this portal actually ships
 * at there was no sign-out anywhere in the client half of the product, and no
 * theme control either. On a portal the spec ships *as a PWA for v1*,
 * installable to the home screen, where a borrowed or shared phone is exactly
 * the case that needs one.
 *
 * ── AND DELETING THAT EARLY RETURN IS NOT THE FIX ───────────────────────────
 *
 * `MoreSheet` builds its rows from `PRIMARY` and `ACCOUNT` — the *trainer's*
 * destinations and the trainer's *Your profile / Settings* rows. A client
 * opening it would be handed a sheet of screens `requirePortal` refuses them
 * from. The sheet is the trainer's shell, not a missing piece of this one.
 *
 * ── SO IT IS A CARD, ON THIS SCREEN, AND THE POSITION IS AN ARGUMENT ────────
 *
 * This is the page called *Me*: the only client destination whose subject is
 * the account itself, and where all three competitors put sign-out. The card is
 * the last one on the *Settings* tab, and the delete flow is the last one on
 * *Privacy* — which is the ordering the account page already reasons about.
 * `page.tsx` put the delete at the bottom because *"that is the right way round
 * for a card whose last section cannot be undone."* Signing out is recoverable;
 * deleting is not. Two tabs keeps them apart, and within the pair this one is
 * still the earlier.
 *
 * ── ONE CARD FOR BOTH, AND THE HEAD IS WHY ──────────────────────────────────
 *
 * *This device.* The theme is a preference held on this browser and sent
 * nowhere; signing out is this browser forgetting a token. Neither changes
 * anything about the account or anything another person can see, which is what
 * the sentence under the button says out loud — and it is the reason these two
 * belong together rather than filed with the notification switches above, every
 * one of which is a server row.
 *
 * ── NO CONFIRM STEP, WHICH IS `MoreSheet`'S REASONING AND NOT A SHORTCUT ────
 *
 * The rail's menu confirms because its row is on screen on every screen, two
 * rows under a name, where a misclick ends the session. `MoreSheet` drops the
 * confirm for the phone and says why: the row is three interactions deep, so
 * the accident it defends against cannot happen, *"and the cost is still named
 * in the line underneath rather than in a step."* This card is at the foot of
 * one tab of one destination, which is the same depth. The line underneath is
 * the sheet's, verbatim — the same sentence a trainer reads, because the fact it
 * states is the same fact.
 *
 * A `<form>` posting the server action, for `AccountMenu`'s reason unchanged:
 * the response IS the navigation, so nothing here can leave a half-signed-out
 * browser sitting on `/me/today`.
 */
export function ThisDevice() {
  return (
    <Card>
      <CardHead title="This device" />

      {/* ── the theme ──────────────────────────────────────────────────────

          `AccountMenu`'s own rule for the trainer's copy, and it reads the same
          here: this changes only how the product LOOKS, to this person, on this
          device.

          A `.row` and not a `KeyValueRow`: `.kv` gives its value
          `white-space:nowrap` and an 80px `min-width` to the key, which is
          right for a key and a figure and wrong for a key and a two-button
          group — the measurement `NotifySwitches` records one card up. `.sp` is
          §04's `flex:1`, so the group sits hard right at every width. */}
      <CardBody>
        <div className="row gap3">
          <h3 className="h5 sp">Theme</h3>
          <ThemeSwitch />
        </div>
      </CardBody>

      {/* ── the way out ────────────────────────────────────────────────────── */}
      <CardBody divided>
        <h3 className="h5">Sign out</h3>
        <p className="small mt2">
          Getting back in needs a fresh code by SMS. Nothing on your account changes.
        </p>
        <div className="mt3">
          {/* `type="submit"`, said explicitly — `Button` defaults to `button`
              precisely so a bare one inside a form cannot submit it by
              accident, and its own comment adds that "a call-site that wants a
              submit still says so." This is that call-site. */}
          <form action={signOut}>
            <Button variant="ghost" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </CardBody>
    </Card>
  );
}
