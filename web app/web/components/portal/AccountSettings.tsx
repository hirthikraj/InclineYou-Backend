import type { MeWire } from '@/lib/portal/api';

import { MyDetails } from './MyDetails';
import { ThisDevice } from './ThisDevice';

/**
 * §5 · Settings — the things on this destination a client can CHANGE.
 *
 * Two cards, and the ordering is what each one writes and how hard it is to
 * take back:
 *
 *   1. **Your details** — the number they sign in with (four steps, two codes)
 *      and the health note their trainer reads. §5's *correct my data*.
 *   2. **This device** — the theme, and the way out. Nothing on the account.
 *
 * There are no notification switches: there is no notification service in v1.
 *
 * ── THE PRIVACY TAB IS NEXT DOOR, AND THE SPLIT IS THE POINT ────────────────
 *
 * These cards and the privacy card used to be one column. `lib/portal/account-tabs.ts`
 * carries the measurement; the shape of the argument is that a client changing
 * a setting should not be scrolling through the irreversible thing to do it,
 * and a client reading the trust screen should not arrive at it on the fourth
 * screen of a settings form.
 *
 * ── AND *This device* IS LAST ON PURPOSE ────────────────────────────────────
 *
 * `page.tsx` argued the ordering for the single page — *"the delete flow is at
 * the bottom, which is the right way round for a card whose last section cannot
 * be undone"* — and that argument survives the split: sign-out is the most
 * consequential thing on THIS tab, so it goes at its foot, and the one thing
 * more consequential than it is at the foot of the tab next door.
 */
export function AccountSettings({ me }: { me: MeWire }) {
  const first = me.trainer.name.split(' ')[0];

  return (
    <div className="portal col gap4">
      {/* ── §5's *contact, and health/injury information they can update* ─── */}
      <MyDetails
        phone={me.client.phone}
        health={me.client.health}
        hideWeight={me.prefs.hideWeight}
        trainerFirstName={first}
        rosterCount={me.rosters.length}
      />

      {/* ── the theme and the way out · absent at phone width until now ───── */}
      <ThisDevice />
    </div>
  );
}
