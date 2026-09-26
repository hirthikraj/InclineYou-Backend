'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * The section pane's collapsed state — chosen, and remembered per device.
 *
 * This was `railCollapse.ts`. 13 Sep 2026 split the two columns apart: the RAIL
 * is fixed at 64px (`.app--rail-min` is unconditional in both shells) and the
 * PANE carries the control. Two adjacent columns that both narrow to icons gave
 * the chrome four states where the question has two, and the 212px of page names
 * is the width actually worth trading.
 *
 * `useSyncExternalStore` and not `useState`: the shell is server-rendered and
 * `localStorage` does not exist there, so a `useState` initialiser makes the
 * first client render disagree with the HTML. `getServerSnapshot` returns
 * expanded — the default, and what the server drew.
 *
 * The key stays a parameter because the portal is one `pages` array away from
 * having a pane of its own, and one browser may hold both halves.
 */
export const PANE_KEY = 'inclineyou_web_pane_collapsed';
export const PORTAL_PANE_KEY = 'inclineyou_web_portal_pane_collapsed';

/* Per KEY, not one variable: a single `cached` would hand the portal's answer to
   the trainer's pane, and `useSyncExternalStore` would never notice — it
   compares snapshots, and both would be the same wrong boolean. */
const cache = new Map<string, boolean>();
const watchers = new Map<string, Set<() => void>>();

function read(key: string): boolean {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let value: boolean;
  try {
    value = window.localStorage.getItem(key) === '1';
  } catch {
    // A browser refusing storage. Expanded is a fine answer — it is the default.
    value = false;
  }
  cache.set(key, value);
  return value;
}

function write(key: string, next: boolean) {
  cache.set(key, next);
  try {
    window.localStorage.setItem(key, next ? '1' : '0');
  } catch {
    // Private browsing, or a full quota. The toggle still works for this visit.
  }
  for (const w of watchers.get(key) ?? []) w();
}

function subscribe(key: string, onChange: () => void): () => void {
  let set = watchers.get(key);
  if (!set) {
    set = new Set();
    watchers.set(key, set);
  }
  set.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key) return;
    cache.delete(key);
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    set.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePaneCollapsed(key: string = PANE_KEY): [boolean, () => void] {
  /* Both closures are keyed, so a shell that somehow changed its key would
     resubscribe rather than keep reporting the old one's snapshot. */
  const collapsed = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribe(key, onChange), [key]),
    useCallback(() => read(key), [key]),
    () => false,
  );
  const toggle = useCallback(() => write(key, !read(key)), [key]);
  return [collapsed, toggle];
}

/**
 * `[` — collapse / expand the section pane. §07's table. It was the rail's until
 * the rail stopped having a state to be in.
 *
 * Guarded on the modifiers and on where the caret is: an unprefixed key bound at
 * the window is a key somebody cannot type into a field.
 *
 * `enabled` is `Boolean(section)`. A paneless route would otherwise flip a
 * remembered answer nothing on screen reflects — and `/schedule` binds `[`
 * itself to step a week, so both listeners would fire.
 */
export function usePaneCollapseShortcut(toggle: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== '[') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      event.preventDefault();
      toggle();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, enabled]);
}
