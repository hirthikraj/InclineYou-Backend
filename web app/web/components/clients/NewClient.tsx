'use client';

import type { NewClientData } from '@/lib/clients/new-api';
import { TopBar } from '@/components/shell/TopBar';

import { AddClientFlow } from './AddClientFlow';

/**
 * `/clients/new` — the same four steps as the roster's drawer, as a route.
 *
 * It is the more important of the two on a phone: `AddSheet.tsx` sends the
 * bottom bar's raised **+** here, and so do `/today`'s empty-roster CTA, the
 * end of setup, the log flow's empty state, and `Clients.tsx` whenever the
 * roster has not preloaded `newClientData`. The drawer is the desk's
 * convenience; this is the front door.
 *
 * It used to be its own ~800-line copy of the flow and had drifted four bugs
 * away from the drawer — `AddClientFlow`'s header lists them. Now it is a
 * shell: the bar, the main track, and the flow.
 *
 * **No `.ph`.** The band IS the header — it carries the client assembling, the
 * ridge and the rung labels, and it renders its title as the `<h1>` on this
 * shell. A `.ph` above it would have repeated *Add a client* 40px over the top
 * of a plate that already says it, which is the duplication this shell keeps
 * deleting.
 *
 * **And the bar says `‹ Clients`, not *Add a client*.** Below 900px the title
 * slot printed the same three words the band prints 40px beneath it — reported
 * from a screenshot, and it is the DUPLICATE test `TopBar` states for
 * `titleHref` in its own doc: pass it when the screen already names itself
 * below the bar, so the slot is spent on a word nothing else says. The pair is
 * a back control, so the label is the DESTINATION rather than this screen, and
 * the chevron is on screen exactly when the word is a door. `ClientFile` makes
 * the identical call one route over.
 *
 * It is also the only way back that costs nothing here. The ✕ and *Cancel* both
 * reach the roster, but the ✕ is 44px of band that reads as *dismiss* and
 * *Cancel* is in the foot, below the fold on a short phone at step 3.
 */
export function NewClient({ data, now: _now }: { data: NewClientData; now: number }) {
  return (
    <>
      <TopBar crumb="Clients / Add a client" title="Clients" titleHref="/clients" />
      <main className="main" id="main-content">
        <AddClientFlow data={data} shell="page" />
      </main>
    </>
  );
}
