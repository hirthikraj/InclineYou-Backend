'use client';

import { createContext, useContext, useMemo } from 'react';

/**
 * WHO HAS ALREADY BEEN MESSAGED — as context, and the reason it is context.
 *
 * `NudgeButton` sits in six different places, and in three of them — a table
 * row, a phone card, a *Ending soon* row — it is four or five components deep
 * inside a screen that is a single 1,200-line client component with its rows
 * declared as nested functions. Threading `lastNudgedAt` down to each of them
 * would mean adding a prop to every intermediate row component on every screen,
 * and a screen whose author forgot one would silently draw a button with no
 * *Messaged yesterday* under it — which looks exactly like a client who has not
 * been messaged.
 *
 * So the page provides the map once and the button reads it. A screen that does
 * not provide one gets buttons with no note, which is the correct degradation:
 * `/packages` and `/sessions` deliberately do not spend a request on this, and
 * their buttons still send.
 *
 * ── THE MAP IS THE WHOLE ROSTER, NOT A LOOKUP PER ROW ────────────────────────
 *
 * One `GET /v1/nudges` for the page, reduced to `clientId → sentAt`. A per-row
 * read would be the mistake `GET /v1/packages` was added to fix: twenty-two
 * requests to draw one screen, against a 120/min ceiling.
 */

interface LastContact {
  /** clientId → epoch ms of their most recent nudge, within the window read. */
  map: Record<string, number>;
  /**
   * The page's server instant. Held here so every button on one screen dates
   * *messaged yesterday* from the same clock — and so a server-rendered row and
   * its hydration agree, which `Date.now()` inside the button would not.
   */
  now: number;
}

const Ctx = createContext<LastContact | null>(null);

export function LastContactProvider({
  map,
  now,
  children,
}: {
  map: Record<string, number>;
  now: number;
  children: React.ReactNode;
}) {
  /* Memoised on the map's identity: these pages re-render on every keystroke in
     a search box, and a fresh object each time would re-render every button. */
  const value = useMemo(() => ({ map, now }), [map, now]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Null outside a provider, and null for a client nobody has messaged.
 *
 * `now` is null rather than `Date.now()` for the same reason the provider holds
 * one at all: reading the clock during render is impure — React's own lint rule
 * says so — and a component that dated *messaged yesterday* off `Date.now()`
 * would produce a different string on the server and on hydration. A screen with
 * no provider has no clock and no history, so the button simply draws no note,
 * which is the correct degradation rather than a guessed one.
 */
export function useLastContact(clientId: string): { at: number | null; now: number | null } {
  const ctx = useContext(Ctx);
  if (!ctx) return { at: null, now: null };
  return { at: ctx.map[clientId] ?? null, now: ctx.now };
}
