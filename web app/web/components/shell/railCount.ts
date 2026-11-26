'use client';

import { useEffect, useSyncExternalStore } from 'react';

import type { RailBadge } from './nav';

/**
 * TODAY'S BADGE — the *Needs you* count, on the sidebar's Today row (26 Nov 2026).
 *
 * The count is the deck's, and only `/today` builds the deck (nine requests the
 * layout must not pay on every route). So Today PUBLISHES it here when it
 * renders, and the shell reads it back. The store is module state, which lives
 * as long as the client app does: navigate from Today to Clients and the badge
 * stays, a fact as of the last time Today drew. A cold load straight onto
 * another route draws no badge — no number is better than an invented one — and
 * Today's own five-minute heartbeat keeps it fresh while it is open.
 *
 * One count, one meaning (the product owner's pick): clients who need a
 * decision. Zero draws nothing; a badge saying *0* is a row asking for a look
 * that it then tells you was not needed.
 */
let value: RailBadge | null = null;
const watchers = new Set<() => void>();

function subscribe(onChange: () => void) {
  watchers.add(onChange);
  return () => watchers.delete(onChange);
}

export function useTodayBadge(): RailBadge | null {
  return useSyncExternalStore(subscribe, () => value, () => null);
}

/** Called by Today with the number of clients its queue is showing. */
export function usePublishTodayBadge(count: number) {
  useEffect(() => {
    const next =
      count > 0
        ? { text: String(count), label: `${count} client${count === 1 ? '' : 's'} need you` }
        : null;
    if (next?.text === value?.text) return;
    value = next;
    watchers.forEach((w) => w());
  }, [count]);
}
