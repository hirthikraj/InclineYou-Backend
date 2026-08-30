'use client';

import { Bell, Search } from './Icons';

/**
 * Breadcrumb · search · notifications.
 *
 * The breadcrumb is not decoration. On a phone "back" is unambiguous because
 * there is one stack; on the web a trainer can arrive anywhere from a URL, so
 * where-am-I has to be written down.
 *
 * ── THE SYNC PILL IS NOT HERE, AND THAT IS THE DECISION ───────────────────────
 *
 * `gen_rail.py`'s `top()` draws a pill reading *Synced* / *6 queued* / *Offline*,
 * and `gen_today.py` draws all three states. **None of them is built.** The web
 * app is online-only (decided 23 Aug 2026): every write goes straight to the
 * server and there is no local database to queue into, so a pill saying "Synced"
 * would be describing an architecture this half does not have — and one saying
 * "6 queued" could never be true. `AGENTS.md` carries the list this belongs to,
 * alongside the dashboard's offline banner and Settings' sync-queue screen.
 *
 * What replaces it is nothing, deliberately. A failed write on this half is
 * reported where it happened — in the row, by the action that failed — which is
 * a stronger promise than a pill in a corner.
 *
 * ── AND NO GREETING ANYWHERE ─────────────────────────────────────────────────
 *
 * `deck.ts` settles it in its own docstring: "no greeting at all". The page this
 * replaces opened with *Good morning, Anbu* in the most-read line of the
 * most-read screen. The subtitle here is the day and its state instead.
 */
export function TopBar({
  crumb,
  onSearch,
}: {
  crumb: string;
  /** Opens the palette. The bar's search box is a BUTTON — see below. */
  onSearch: () => void;
}) {
  return (
    <header className="top">
      <nav className="crumbs" aria-label="Breadcrumb">
        <b>{crumb}</b>
      </nav>

      {/*
        A button, not an input. Typing here does not filter anything on this
        screen — it opens the palette, which is a different surface with its own
        list and its own keyboard model. An input that steals the first keystroke
        and then hands it to a dialog is the kind of thing that works once and
        confuses forever. `.omni`'s `cursor:text` is kept because the affordance
        is still "type here".

        ── AND IT IS DRAWN TWICE, WHICH IS ONE COMPONENT AND NOT TWO ───────────

        `.omni` is a fixed 320px with `margin-left:auto`, so on a 390px screen it
        pushed the breadcrumb and the bell off the bar. Below 900px it is
        replaced by an icon button, and the swap is CSS rather than a width read
        in JSX — the same call `Rail.tsx` makes in the setup flow, for the same
        reason: a component that branches on a measured width is a component
        that renders the wrong half for one frame after every resize, and it
        cannot be server-rendered at all.

        The palette is kept on a phone rather than dropped with the ⌘K hint that
        summons it on a desk. It is MORE useful small, not less: twenty-two
        clients are four taps deep through the roster and one search away, and
        `aria-keyshortcuts` stays on both because a phone can have a keyboard.
      */}
      <button className="omni" type="button" onClick={onSearch} aria-keyshortcuts="Meta+K Control+K">
        <Search size={15} />
        <span>Search clients, sessions, exercises…</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="top__acts">
        <button
          className="btn btn--icon btn--ghost top__search"
          type="button"
          onClick={onSearch}
          aria-label="Search clients, sessions and exercises"
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search size={18} />
        </button>
        <button className="btn btn--icon btn--ghost" type="button" aria-label="Notifications">
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}
