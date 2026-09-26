'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { unreadCount } from '@/lib/notifications/types';
import { NotificationPanel, type NotificationView } from '@/web-components/ui/NotificationPanel';

/**
 * The notification centre, mounted once, for every screen inside a shell.
 *
 * ── WHY THE SHELL AND NOT THE TOP BAR ────────────────────────────────────────
 *
 * The bell is drawn by `TopBar`, which every screen renders for itself. Three
 * things follow from that and each one points here:
 *
 * 1 · **The count would be per-screen.** A page that forgot to fetch the feed
 *     would draw a bell with no number on it, and the reader would take that as
 *     "nothing happened". That is the exact defect `PaletteHost` exists to close
 *     for the search box, which was wired to nothing on fifteen of twenty
 *     screens; a bell that lies about being empty is the worse version of it,
 *     because a search box that does nothing at least does nothing visibly.
 *
 * 2 · **The panel cannot live inside the bar.** §24 gives `.top` a
 *     backdrop-filter, which makes it a stacking context — so a dropdown
 *     positioned inside the bar is trapped in it and `.main`, which is
 *     `position:relative` and later in the DOM, paints over it at any z-index.
 *     §03 anchors `.ntf` to the shell instead.
 *
 * 3 · **The state has to survive a navigation.** Reading a row goes somewhere,
 *     and the whole point of a persistent shell is that the layout is not
 *     rebuilt on the way. The read stamps are held here, one level above
 *     everything that swaps.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT IS ONE HOST FOR BOTH BELLS, AND IT KNOWS NOTHING ABOUT EITHER FEED
 *
 * `AppShell` mounts it over the trainer's four kinds and `PortalShell` over the
 * client's five. What it takes is `NotificationView[]` — rows already reduced to
 * a tone, a glyph, a sentence and an href by the adapter beside each shell — so
 * nothing in this file switches on a kind, names a route or writes a word of
 * English. `NotificationPanel`'s header carries the full argument for the split;
 * the reason it reaches up to here as well is that everything below is true of a
 * feed whoever is reading it: a bell opens, a row is read, Escape closes, a
 * click outside closes, and the clock is taken once per open.
 *
 * ── THE READ STAMPS ARE AN OVERLAY, NOT A COPY OF THE LIST ───────────────────
 *
 * This used to hold the server's rows in state and reset them when the prop
 * changed, which needed a render-time `served !== notifications` comparison to
 * tell "the server answered again" from "the parent re-rendered". With views
 * built by an adapter the parent hands down a **new array every render**, so
 * that comparison would fire every time and throw away every stamp.
 *
 * So what is held is only what this component KNOWS and the server does not: a
 * map of id → the moment it was read here. It is merged over whatever the
 * server last said, which makes the reset unnecessary rather than clever — a
 * row the server already reports as read is unaffected, and a row stamped in
 * the browser stays stamped until the server's own answer catches up.
 *
 * The one thing it means is that a second tab does not update this one. That is
 * the right trade for a record of things that already happened: a feed that
 * re-ordered itself under the pointer because another window read a row is
 * worse than one that is a few minutes old.
 */
type Ctx = {
  unread: number;
  open: boolean;
  toggle: () => void;
};

/*
 * THE TRIGGER IS FOUND BY CLASS, NOT HELD AS A REF, and the lint rule is right.
 *
 * Two things here need the bell: Escape has to put the caret back on it, and
 * the outside-click listener has to not close on the press that toggles it.
 * The obvious shape is a ref in the context that `TopBar` attaches — and
 * `react-hooks/refs` refuses it, correctly: once any member of the context
 * object flows into a `ref` prop the whole object is a ref source, so the same
 * consumer reading `unread` during its render is reading a ref during render.
 * A callback ref does not help; the taint is on the object, not the member.
 *
 * `.top__bell` is §03's class for the wrapper and there is exactly one bar on
 * screen, so the query is unambiguous. It is the same technique `AccountMenu`
 * uses for `.menu__i` and `NotificationPanel` for `.ntf__i` — a component
 * reaching into markup it owns — with one difference worth naming: this one
 * reaches into markup another component owns, and it is a class in the design
 * system rather than a private one, which is what keeps that safe.
 */
const BELL = '.top__bell';
const bellButton = () => document.querySelector<HTMLElement>(`${BELL} button`);

const NotificationsContext = createContext<Ctx | null>(null);

/**
 * The bell's wiring. Returns `undefined` outside a shell — `/sign-in` and
 * `/setup` draw none, exactly as `usePaletteOpener` returns `undefined` there,
 * so a `TopBar` rendered in both places does not have to branch on which.
 */
export function useNotifications(): Ctx | undefined {
  return useContext(NotificationsContext) ?? undefined;
}

export function NotificationsHost({
  views,
  onRead,
  onReadAll,
  empty,
  children,
}: {
  /** The server's feed, already reduced. See the adapter beside each shell. */
  views: NotificationView[];
  /**
   * Fire-and-forget: the browser is already navigating when a row is opened, so
   * holding the click for a stamp is a bell that hesitates. A failure costs one
   * row that comes back unread on the next full load.
   */
  onRead: (id: string) => void;
  onReadAll: () => void;
  /** The unfiltered empty state's two sentences. Required — `NotificationPanel`
   *  says why a default would be one half's copy serving the other. */
  empty: { title: string; body: string };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /**
   * id → when it was read IN THIS BROWSER. See the header: an overlay, not a
   * copy of the list.
   *
   * Ids of rows that have since left the feed accumulate here and are harmless:
   * the map is only ever read by id, it dies with the shell, and a feed windowed
   * to three weeks cannot make it large.
   */
  const [stamps, setStamps] = useState<Record<string, number>>({});
  /*
   * One clock per open, taken when the panel opens rather than during render.
   *
   * Every stamp in the panel is relative, so reading `Date.now()` while
   * rendering would give the server and the browser two different answers for
   * the same row and React would report a hydration mismatch. Taking it in the
   * click handler also means the feed does not tick while it is being read,
   * which is the honest model: nothing on this list is still happening.
   */
  const [openedAt, setOpenedAt] = useState(0);

  const rows = useMemo(
    () => views.map((v) => (v.readAt || !stamps[v.id] ? v : { ...v, readAt: stamps[v.id] })),
    [views, stamps],
  );

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) bellButton()?.focus();
  }, []);

  const toggle = useCallback(() => {
    setOpen((was) => {
      if (was) {
        bellButton()?.focus();
        return false;
      }
      setOpenedAt(Date.now());
      return true;
    });
  }, []);

  /* A click anywhere else. `pointerdown` rather than `click`, which is what
     `AccountMenu` settled and for its reason: a press that starts on the page
     and ends in here (or the reverse) is a drag, and every other menu on the
     platform closes on the press.

     The bell is excluded because it is a TOGGLE — without this the press closes
     the panel and the click that follows reopens it, which reads as a bell that
     ignores the second click. */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      /* `closest`, not a ref on a wrapper. `.app` is a GRID, so a plain <div>
         around the panel would be auto-placed into an implicit row and push
         the shell's three tracks about; `.ntf` itself is `position:absolute`
         and therefore out of flow, which is why it can be a direct child at
         all. The same reason `PaletteHost` mounts `.pal` bare. */
      if (target instanceof Element && target.closest('.ntf')) return;
      if (target instanceof Element && target.closest(BELL)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, close]);

  const onOpenRow = useCallback(
    (id: string) => {
      setStamps((current) => (current[id] ? current : { ...current, [id]: Date.now() }));
      onRead(id);
    },
    [onRead],
  );

  const onMarkAll = useCallback(() => {
    const at = Date.now();
    setStamps((current) => {
      const next = { ...current };
      for (const row of views) if (!row.readAt) next[row.id] ??= at;
      return next;
    });
    onReadAll();
  }, [views, onReadAll]);

  const ctx = useMemo<Ctx>(
    () => ({ unread: unreadCount(rows), open, toggle }),
    [rows, open, toggle],
  );

  return (
    <NotificationsContext.Provider value={ctx}>
      {children}
      {/* Mounted only while open, exactly as the palette is — the filter chip
          and the scroll position are per-visit state, and a panel that
          remembered *Unread* from three screens ago would open onto a list that
          is empty for a reason nobody can see. */}
      {open && (
        <NotificationPanel
          notifications={rows}
          now={openedAt}
          onOpen={onOpenRow}
          onMarkAll={onMarkAll}
          onClose={close}
          empty={empty}
        />
      )}
    </NotificationsContext.Provider>
  );
}
