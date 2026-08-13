/**
 * Warm starts for the screens that paint from SQLite.
 *
 * Every derived screen — the deck, the roster, the diary, the book — follows
 * the same shape: subscribe to a handful of tables, and re-derive on every
 * emission. The problem is the very first frame. A subscription cannot deliver
 * synchronously, so a freshly mounted screen renders whatever it was
 * initialised with, and that used to be an empty input.
 *
 * The result was a screen that asserted something false for a beat: "No
 * clients yet" on a roster of eight, "Hisaab clear" on ₹15,000 outstanding,
 * "That client isn't here any more" on a client who is. Then the real data
 * arrived and it all changed. That is worse than a blank pause — a wrong
 * sentence rendered confidently is a bug the user sees.
 *
 * So the last emission is kept here, outside React. A screen mounting for the
 * second time — a tab switch, a push, a back — starts from the data the last
 * one had, and the fresh emission that lands a tick later is almost always
 * identical, so nothing visibly changes. It is a cache of what is already on
 * this phone, not a guess.
 *
 * `ready` is the honest companion to that. It is false only until the first
 * emission of the app's life, and it exists so a screen can tell "no data yet"
 * apart from "no data" — the two look the same and mean opposite things.
 */

/** Held so sign-out can clear every cache without each one registering itself. */
const registry: { reset: () => void }[] = [];

export interface LiveCache<T> {
  readonly value: T;
  /** True once a real emission has landed. Never true from the empty value. */
  readonly ready: boolean;
  set(next: T): void;
}

export function liveCache<T>(empty: T): LiveCache<T> {
  let value = empty;
  let ready = false;

  const cache: LiveCache<T> = {
    get value() {
      return value;
    },
    get ready() {
      return ready;
    },
    set(next: T) {
      value = next;
      ready = true;
    },
  };

  registry.push({
    reset() {
      value = empty;
      ready = false;
    },
  });

  return cache;
}

/**
 * Drops every cached emission.
 *
 * Called when the local database is wiped on sign-out. Without this the next
 * trainer to sign in on this device would see the previous one's roster for a
 * frame — which is the one case where a warm start is exactly wrong.
 */
export function resetLiveCaches(): void {
  for (const entry of registry) entry.reset();
}
