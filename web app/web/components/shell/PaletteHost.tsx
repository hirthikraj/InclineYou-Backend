'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { AttentionItem, DeckSession } from '@/lib/today/deck';
import { Palette, type PaletteClient } from '@/components/today/Palette';

/**
 * The command palette, mounted once, for every screen inside the shell.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ──────────────────────────────────────────
 *
 * `TopBar` draws a search box with `⌘K` printed inside it and
 * `aria-keyshortcuts="Meta+K Control+K"` on the element. It did that on all
 * twenty screens. The palette was mounted on five of them.
 *
 * The other fifteen passed `onSearch={() => {}}`: Business, Programs, Exercises,
 * Team, every Settings screen, every screen in the logging flow, the session
 * detail, the client report. On those the box was a promise in print that
 * nothing bound — a control that reads as interactive, announces a shortcut to
 * a screen reader, takes a click, and produces nothing. It is the exact defect
 * the codebase already records for the rail's accelerators, fifteen times over.
 *
 * A per-screen mount cannot fix that class of bug, because the fix is a line
 * every future screen has to remember. The shell can, because there is one of
 * it: mount here and the promise is kept by construction.
 *
 * ── THE SCREEN STILL GETS TO MAKE IT BETTER ──────────────────────────────────
 *
 * The palette is best when it can offer *Renew Kavya M's pack* — a row of the
 * attention queue, reached by typing — and that needs the deck, which only Today
 * holds. So this carries a floor rather than a ceiling: the roster comes from the
 * layout and is always there, and a screen that already has the richer rows hands
 * them up with `usePaletteRows`. Today and Schedule do. Everywhere else the
 * palette finds a person by name and jumps to them, which is what it is mostly
 * for and is infinitely more than nothing.
 *
 * ── ONE LISTENER, NOT TWENTY ─────────────────────────────────────────────────
 *
 * `Palette` binds ⌘K itself while it is open, for Escape and the arrows. The
 * OPENING chord has to be bound while it is closed, and it used to be bound by
 * whichever screen had mounted the palette — so on fifteen screens ⌘K did
 * nothing at all, including inside the flow where a trainer's hands are already
 * on the keyboard. One listener here covers every route the shell wraps.
 */
type Rows = {
  clients: PaletteClient[];
  attention: AttentionItem[];
  today: DeckSession[];
};

type Ctx = {
  open: () => void;
  /** What a screen hands up. `null` means "use the shell's roster". */
  setRows: (rows: Rows | null) => void;
};

const PaletteContext = createContext<Ctx | null>(null);

/**
 * Opens the palette. Returns `undefined` outside the shell — `/sign-in`,
 * `/setup` and `/me` draw no TopBar, so nothing there can call it, and the
 * optional return means a component rendered in both places does not have to
 * branch on which.
 */
export function usePaletteOpener(): (() => void) | undefined {
  return useContext(PaletteContext)?.open;
}

/**
 * Hand the palette this screen's richer rows for as long as the screen is
 * mounted, then put the shell's floor back.
 *
 * The cleanup is the point. Without it, navigating from Today to Settings would
 * leave Today's attention queue in the palette, offering *Renew Rohan's pack* on
 * a screen that has no idea what that is — a palette showing rows from a page
 * that is no longer on screen is worse than one showing fewer rows.
 */
export function usePaletteRows(rows: Rows | null): void {
  const ctx = useContext(PaletteContext);
  const setRows = ctx?.setRows;
  /* Depended on by identity, so a caller passing a fresh object literal every
     render does not loop. The three arrays are the state; the wrapper is not. */
  const clients = rows?.clients;
  const attention = rows?.attention;
  const today = rows?.today;
  useEffect(() => {
    if (!setRows) return;
    if (!clients) return;
    setRows({ clients, attention: attention ?? [], today: today ?? [] });
    return () => setRows(null);
  }, [setRows, clients, attention, today]);
}

export function PaletteHost({
  roster,
  children,
}: {
  roster: PaletteClient[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Rows | null>(null);

  const openPalette = useCallback(() => setOpen(true), []);

  /*
   * ⌘K / Ctrl-K. Suppressed while the palette is already open, where `Palette`
   * owns the keyboard — a second ⌘K there is a no-op rather than a reopen that
   * would blank the field the trainer is typing in.
   *
   * `preventDefault` because Firefox binds ⌘K to its own search bar and Chrome
   * will bind it to the address bar in a PWA. The chord is printed on the
   * control, so the app has claimed it.
   */
  useEffect(() => {
    if (open) return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ctx = useMemo<Ctx>(() => ({ open: openPalette, setRows }), [openPalette]);

  const clients = rows?.clients ?? roster;
  const attention = rows?.attention ?? [];
  const today = rows?.today ?? [];

  return (
    <PaletteContext.Provider value={ctx}>
      {children}
      {/* Mounted only while open — see the note in Palette.tsx about why that is
          a mounting decision and not a reset effect. */}
      {open && (
        <Palette
          open
          onClose={() => setOpen(false)}
          clients={clients}
          attention={attention}
          today={today}
        />
      )}
    </PaletteContext.Provider>
  );
}
