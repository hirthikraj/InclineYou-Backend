'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { WeekLayout } from '@/lib/schedule/pivot';

/**
 * WHICH ARRANGEMENT OF THE WEEK, REMEMBERED PER DEVICE.
 *
 * ── WHY THIS IS REMEMBERED WHEN THE MODE FILTERS ON THE SAME SCREEN ARE NOT ──
 *
 * `view.ts` states the line the URL is drawn at and ends by saying the filters
 * and the gap overlay "drop back to their defaults" on a reload, and that this
 * is the right trade. That argument is about a URL, and it holds. This is a
 * different question — not *should it be linkable* but *should it survive a
 * reload* — and the answer differs because a filter and an arrangement are not
 * the same kind of thing:
 *
 *  · **A filter SUBTRACTS.** `Remote` un-ticked means sessions are on the book
 *    and not on the screen, and a hidden thing that is silently still hidden
 *    tomorrow morning is how a trainer misses a booking. Forgetting it is a
 *    safety property, not an oversight.
 *  · **An arrangement hides nothing.** Both layouts draw the same week from the
 *    same list. Choosing one costs the trainer nothing to be wrong about, and
 *    re-choosing it on every visit is `/today`'s complaint about its own filter
 *    chips arriving here: a preference that resets on every launch has not been
 *    chosen, it has been guessed at.
 *
 * The view itself (day / week / month) stays in the URL, because that decides
 * what is FETCHED. This decides only what is drawn from rows already held.
 *
 * ── AND WHY `useSyncExternalStore` ───────────────────────────────────────────
 *
 * `shell/railCollapse.ts` states the argument for the machinery: this screen is
 * server-rendered, `localStorage` is not there, and reading it in a `useState`
 * initialiser makes the first client render disagree with the HTML it is
 * hydrating. `getServerSnapshot` returns the default — which is what the server
 * drew — so the two agree and the stored value lands in the same commit. The
 * `storage` event is subscribed to so two tabs do not disagree.
 *
 * ── THE THIRD COPY OF THIS MACHINERY, AND WHAT TO DO ABOUT THE FOURTH ────────
 *
 * `programs/collapse.ts` already generalised `railCollapse.ts` into a factory
 * over the storage KEY, and wrote down the rule: two copies were defensible,
 * three are not. This is the third file and it does not reuse that factory for
 * one reason — that factory's value is a BOOLEAN, and `hours | clients` is an
 * enum with a third member the day somebody wants the week by program or by
 * pack. Squeezing an enum into `collapsed: true` is how a control ends up
 * named after a state it no longer has.
 *
 * So the honest fix, when a fourth caller arrives, is to generalise
 * `makeCollapsed` over its VALUE TYPE and delete both copies into it — not to
 * write this file again with a different set of strings.
 */

const KEY = 'inclineyou_web_weeklayout';

/**
 * The hours grid, and it is the default deliberately.
 *
 * It is the arrangement every calendar a trainer has ever used opens in, it is
 * the one that can place an 07:30 start and a 90-minute session, and it is the
 * one the booking form is attached to. The pivot answers a question a trainer
 * asks weekly rather than hourly, and a screen that opened in it would be
 * answering the second question first.
 */
const DEFAULT: WeekLayout = 'hours';

const watchers = new Set<() => void>();
let cached: WeekLayout | null = null;

function read(): WeekLayout {
  if (cached !== null) return cached;
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = raw === 'clients' || raw === 'hours' ? raw : DEFAULT;
  } catch {
    // A browser refusing storage. The default is a fine answer.
    cached = DEFAULT;
  }
  return cached;
}

function write(next: WeekLayout) {
  if (read() === next) return;
  cached = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // Private browsing, or a full quota. The toggle still works for this visit.
  }
  for (const w of watchers) w();
}

function subscribe(onChange: () => void): () => void {
  watchers.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cached = null;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    watchers.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useWeekLayout(): [WeekLayout, (next: WeekLayout) => void] {
  const layout = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const set = useCallback((next: WeekLayout) => write(next), []);
  return [layout, set];
}
