'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { Identity } from '@/lib/profile/api';

/**
 * THE PROFILE'S LIVE DRAFT — what the preview card is reading right now.
 *
 * The preview used to live inside the identity form, which meant it could only
 * ever redraw the four fields that form owns. Every other tab edited something
 * the card SHOWS — the specialities, the certificates, the languages, the
 * training modes — and none of them could see it. Six of the seven tabs were
 * editing a card they could not look at.
 *
 * So the card moved into the profile's layout, and this is what feeds it: one
 * provider, mounted once, that any panel can push a half-typed value into.
 *
 * ── IT IS AN OVERLAY, NOT A COPY ────────────────────────────────────────────
 *
 * `draft = { ...server, ...overlay }`, and the overlay starts empty.
 *
 * The obvious shape — `useState(initial)` — is wrong here for a reason that is
 * specific to a Next layout: React KEEPS a layout across a navigation between
 * its children, which is the whole reason the tab strip does not flash. So this
 * provider is mounted once and `initial` changes underneath it on every tab
 * load. A `useState` seeded from a prop ignores every value after the first,
 * and the card would still be drawing the profile as it was when Settings was
 * first opened — including, after a save on another tab, values the server has
 * already replaced.
 *
 * With an overlay the fresh server copy always wins for anything nobody is
 * currently typing, and a key that has been published is the same string the
 * server has anyway once the save lands.
 *
 * ── AND IT IS CLEARED ON EVERY NAVIGATION ───────────────────────────────────
 *
 * Deliberately, and it is the honest half. `SaveRow` warns that switching tab
 * loses unsaved edits, and that warning is TRUE — the panel unmounts and its
 * state goes with it. If the overlay outlived the navigation, the preview
 * would go on showing a name that no longer exists anywhere: not in the form,
 * not on the server, not on the invite. A preview that survives the thing it
 * was previewing is the one failure a preview cannot have.
 *
 * The clear is **stamped, not performed**: the overlay records the pathname it
 * was written on and is read as empty from anywhere else. An effect that
 * `setOverlay({})` on a pathname change passes review by eye and is trap 21 —
 * `react-hooks/set-state-in-effect` refuses it, and it would also paint one
 * frame of the previous tab's draft before clearing. Adjusting during render is
 * the documented pattern and here it costs nothing, because a stale stamp
 * needs no write to become false.
 */

const DraftContext = createContext<Identity | null>(null);
const PublishContext = createContext<(patch: Partial<Identity>) => void>(() => {});

export function ProfileDraftProvider({
  initial,
  children,
}: {
  initial: Identity;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  /* The stamp is the route the patch was typed on. Keyed on the pathname
     rather than on `initial`, which is a fresh object on every render of the
     layout and would clear the overlay mid-keystroke. */
  const [overlay, setOverlay] = useState<{ at: string; patch: Partial<Identity> }>({
    at: pathname,
    patch: {},
  });

  /* The stale-stamp read is INSIDE the memo, not a `const` above it: a
     conditional `{}` is a fresh object every render, so as a dependency it
     would defeat the memo it was passed to. */
  const draft = useMemo(
    () => ({ ...initial, ...(overlay.at === pathname ? overlay.patch : null) }),
    [initial, overlay, pathname],
  );

  /* Stable within a tab, and it has to change WITH the tab: the stamp it
     writes is this route's. Every panel calls it from an effect, so a new
     identity on every render would re-run all of them on every keystroke in
     any of them — once per navigation is the cost, and on a navigation the
     panel has just mounted anyway. */
  const publish = useCallback(
    (patch: Partial<Identity>) => {
      setOverlay((o) => ({
        at: pathname,
        patch: { ...(o.at === pathname ? o.patch : null), ...patch },
      }));
    },
    [pathname],
  );

  return (
    <DraftContext.Provider value={draft}>
      <PublishContext.Provider value={publish}>{children}</PublishContext.Provider>
    </DraftContext.Provider>
  );
}

/**
 * What the profile currently says — the server's copy with the open tab's
 * unsaved edits laid over it.
 *
 * Null outside the provider, which is a real case: `useProfileDraft` is called
 * by the aside, and the aside is only ever rendered inside it. A component that
 * might be used elsewhere should treat null as "no preview here" rather than
 * throwing.
 */
export function useProfileDraft(): Identity | null {
  return useContext(DraftContext);
}

/**
 * Push a value the trainer is typing at the preview.
 *
 * Call it from an effect on the value, not from the change handler: an event
 * handler that sets state in an ancestor re-renders the whole subtree
 * synchronously with the keystroke, and the field the trainer is typing in is
 * inside that subtree.
 */
export function usePublishDraft(): (patch: Partial<Identity>) => void {
  return useContext(PublishContext);
}
