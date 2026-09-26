'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * THE LEFT COLUMN'S FOLDED STATE — chosen, and remembered per device.
 *
 * Two columns on this route can fold, and this is the one implementation.
 *
 * ── WHY EITHER OF THEM FOLDS ─────────────────────────────────────────────────
 *
 * `--w-list` is 400px and the rail is 248px, so with both up the right pane is
 * 792px at 1440 and 888px at 1536. On `/programs/:id` that is under
 * `@container ws (max-width:900px)` either way: the balance panel drops out of
 * its 280px track, lands ABOVE the board, and pushes the day cards past the
 * fold. On `/programs/certified` it is the card grid that pays, in columns.
 *
 * 400px spent on a list you are not reading is what buys that, which is the
 * argument the 900px media query already makes for the phone — *"the Programs
 * tab IS that way back"* — arriving at the desk a width later.
 *
 * Folded, each column is a 44px SPINE and not nothing, the way the rail
 * collapses to 64px and not nothing: the way back stays on screen, and the
 * control that closed it is the control that opens it, in the same place.
 *
 * ── ONE FACTORY, TWO KEYS ────────────────────────────────────────────────────
 *
 * `shell/railCollapse.ts` states the argument for the machinery and this is a
 * second copy of it, which was defensible while there was one caller here. At
 * three copies it is not, so the caller-varying part — the storage key — is a
 * parameter and the rest is written once.
 *
 * A STORE AND NOT JUST A HOOK, because one of the two folds is now also set
 * from outside the column that owns the control. `Builder` folds the shelf when
 * the exercise library opens — the fold is what buys the library its 280px
 * track beside the board — and it renders the shelf as an OPAQUE NODE, so there
 * is no prop between the two. The module-level store is already the shared
 * thing here; `set` is the same `write` the toggle calls, so both routes into
 * the state go through one place and `useSyncExternalStore` notifies the column
 * either way.
 *
 * TWO KEYS AND NOT ONE, though. Folding the program shelf must not fold the
 * certified filters: they are different columns on different routes holding
 * different things, and a trainer who folds a 400px list of their own programs
 * has said nothing about a filter set they have not visited yet. One key would
 * make each fold a surprise on the other screen. `shell/railCollapse.ts` keeps
 * its own third key for the same reason, one layer up.
 *
 * ── AND WHY `useSyncExternalStore` ───────────────────────────────────────────
 *
 * `railCollapse.ts`'s reason: these columns are server-rendered, `localStorage`
 * is not there, and reading it in a `useState` initialiser makes the first
 * client render disagree with the HTML. `getServerSnapshot` returns *expanded* —
 * the default, and the state the server drew — so the server and the hydrating
 * client agree and the real value lands in the same commit. The `storage` event
 * is subscribed to so two tabs do not end up disagreeing about the width of
 * their own chrome.
 */
function makeCollapsed(
  key: string,
  /**
   * WHAT AN UNSET KEY MEANS, and for the shelf it is *folded*.
   *
   * The block above diagnoses the bug and the fold is the cure — but shipping
   * the cure behind a control nobody has pressed yet means every trainer's
   * FIRST look at a program is the broken layout. Measured at 900px tall, rail
   * and shelf both up: the balance panel lands full-width at y=287 and the
   * first day card at **y=993** — 93px past the fold — at 1280, 1366, 1440 and
   * 1512. Side-by-side needs a 1548px viewport, which is not a laptop.
   *
   * So the default is the state the argument already reaches, and the control
   * that closed it is still the control that opens it. Folding is remembered,
   * so a trainer who wants the list beside the board asks once. It only ever
   * applies with a program open — `Shelf`'s `foldable` gate means `/programs`
   * ignores the stored value either way, so this changes nothing on the route
   * where the shelf IS the page.
   */
  dflt = false,
): { use: () => [boolean, () => void]; set: (next: boolean) => void } {
  let cached: boolean | null = null;
  const watchers = new Set<() => void>();

  function read(): boolean {
    if (cached !== null) return cached;
    try {
      const stored = window.localStorage.getItem(key);
      // null is "never answered", which is the default — NOT `!== '1'`, which
      // would read an unset key as expanded and lose the argument above.
      cached = stored === null ? dflt : stored === '1';
    } catch {
      // A browser refusing storage. The default is a fine answer.
      cached = dflt;
    }
    return cached;
  }

  function write(next: boolean) {
    // A write that changes nothing still notifies every watcher, which is a
    // render of the whole column for no reason — and `Builder` calls `set(true)`
    // on EVERY library open, most of which land on an already-folded shelf.
    if (read() === next) return;
    cached = next;
    try {
      window.localStorage.setItem(key, next ? '1' : '0');
    } catch {
      // Private browsing, or a full quota. The toggle still works for this visit.
    }
    for (const w of watchers) w();
  }

  function subscribe(onChange: () => void): () => void {
    watchers.add(onChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      cached = null;
      onChange();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      watchers.delete(onChange);
      window.removeEventListener('storage', onStorage);
    };
  }

  /* The closure per key is the store, so the two stores below do not share a
     cache and cannot notify each other's watchers. */
  function useCollapsed(): [boolean, () => void] {
    /* `getServerSnapshot` returns the DEFAULT and not `false`: the server drew
       whatever the default is, so this is what makes the hydrating client
       agree with the HTML it was handed. Returning `false` under a `true`
       default is a hydration mismatch on every first paint. */
    const collapsed = useSyncExternalStore(subscribe, read, () => dflt);
    const toggle = useCallback(() => write(!read()), []);
    return [collapsed, toggle];
  }

  return { use: useCollapsed, set: write };
}

/** `/programs/:id` — the shelf of the trainer's own programs. Folded until
 *  asked otherwise; the reason is on `dflt` above. */
const shelfFold = makeCollapsed('inclineyou_web_pgshelf_collapsed', true);
export const useShelfCollapsed = shelfFold.use;

/**
 * FOLD THE SHELF FROM OUTSIDE IT — `Builder`, when the library opens.
 *
 * 400px of program list and a 280px library cannot both sit beside the board:
 * `@container ws (max-width:900px)` measures the plane, and with the shelf up
 * the plane is 873px at 1536 — so the dock landed ABOVE the week and pushed the
 * day it is adding to off the screen. *One click adds and the day is the
 * review* reviews nothing.
 *
 * Folding is the answer the section already has, so this presses the control the
 * trainer would have pressed. One-way on purpose: the fold is remembered, the
 * spine says *My programs 5* and is one click from restoring it, and a shelf
 * that sprang back the moment the library closed would fight a trainer who
 * spent the whole session adding exercises.
 */
export const foldShelf = () => shelfFold.set(true);

/** `/programs/certified` — the five filter groups. */
export const useFilterRailCollapsed = makeCollapsed('inclineyou_web_pgfilters_collapsed').use;
