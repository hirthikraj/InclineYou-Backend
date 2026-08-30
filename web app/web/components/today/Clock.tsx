'use client';

import { useEffect, useState } from 'react';

import { minuteOfDay, relativeMinutes } from '@/lib/today/time';

/**
 * The only part of this screen that ticks, and the reason it is the only part.
 *
 * `useDeck` on the phone re-derives the WHOLE deck every 30 seconds, because on
 * a phone the deck is already in memory and re-deriving it is free. Here the deck
 * is built on the server from seven requests, and re-deriving it in the browser
 * would mean shipping every client, session, payment and package to the browser
 * plus `buildDeck` itself — to keep two strings current.
 *
 * So the split is: **the server owns the deck, the browser owns the clock.** The
 * three things that go stale in thirty seconds are a countdown, a minutes-left
 * figure and the position of the now line, and each is a pure function of one
 * timestamp the server already sent. Everything else — who is done, what is late,
 * what the month billed — changes when the trainer or their client does something,
 * and is refreshed on that event (`revalidatePath`) plus a slow heartbeat.
 *
 * The phone's own reason for ticking at all applies unchanged: the hero says
 * "starts in 34 min", and if that number is frozen from page load it is worse
 * than absent.
 */

/** The phone's `TICK_MS`. Same number, so both halves round the same way. */
const TICK_MS = 30_000;

/**
 * `now`, ticked.
 *
 * Seeded from the server's instant rather than the browser's, so the first client
 * render matches the server's HTML exactly and React has nothing to reconcile.
 * A screen whose entire subject is what time it is is the last place to accept a
 * hydration warning — and seeding from `Date.now()` guarantees one, since the two
 * clocks are milliseconds and a network hop apart.
 */
export function useNow(serverNow: number): number {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    /*
     * The catch-up happens straight away but NOT synchronously, and the
     * difference matters on both counts.
     *
     * Straight away, because the server's instant is already as old as the
     * request took, and coming back to a countdown half a minute stale is worse
     * than one that was never running.
     *
     * Not synchronously, because `setNow` in the effect body runs before the
     * browser has painted the server's HTML — so the first paint a trainer sees
     * is the second render, and the hydrated markup is thrown away for a value
     * milliseconds different from it. A zero timeout puts the catch-up after that
     * paint, where it costs one cheap re-render of two strings instead of
     * discarding the whole first frame.
     */
    let ticker: ReturnType<typeof setInterval> | undefined;
    const kick = setTimeout(() => {
      setNow(Date.now());
      ticker = setInterval(() => setNow(Date.now()), TICK_MS);
    }, 0);
    return () => {
      clearTimeout(kick);
      if (ticker) clearInterval(ticker);
    };
  }, [serverNow]);

  return now;
}

/**
 * "starts in 7 h 48 min" / "started 5 min ago".
 *
 * `suppressHydrationWarning` is NOT used and must not be: the first render is
 * seeded from the server's own instant, so the strings agree. If they ever stop
 * agreeing that is a real bug about time, and silencing the warning would hide
 * exactly the class of defect this screen is most exposed to.
 */
export function Relative({ at, now }: { at: number; now: number }) {
  return <>{relativeMinutes(at - now)}</>;
}

/**
 * Elapsed, as a COUNT OF MINUTES and not as a clock.
 *
 * MEASURED BUG, and the worst kind on this screen — one where both readings are
 * plausible. This returned `${mins}:00`, borrowing the phone's `formatClock`
 * shape without the phone's seconds behind it. Two things went wrong with it.
 *
 * The seconds were a lie: `TICK_MS` is 30 seconds, so the `:00` was frozen
 * punctuation dressed as precision — a stopwatch whose second hand never moves.
 *
 * And the shape collides with the other figure this same slot draws. `Next` puts
 * `formatMinute` in it, so the hero says **17:00** meaning *five in the
 * afternoon*; twelve minutes into a session it said **12:00**, meaning *twelve
 * minutes*. Same slot, same font, same size, same glyphs, opposite units. A
 * trainer glancing at the largest number on the page had no way to tell which
 * question it was answering.
 *
 * The phone can carry `mm:ss` because it ticks every second and its hero has one
 * state visible at a time. Here the figure is a count and the unit underneath it
 * says so — which is also how every other minute on this screen is stated
 * ("48 min", "34 min left", "under the hour a session needs").
 */
export function Elapsed({ from, now }: { from: number; now: number }) {
  return <>{elapsedMinutes(from, now)}</>;
}

/** The same figure as a number, for the `aria-label` that has to spell it out. */
export function elapsedMinutes(from: number, now: number): number {
  return Math.max(0, Math.round((now - from) / 60_000));
}

/** Whole minutes between now and a moment ahead of it, floored at zero. */
export function minutesUntil(at: number, now: number): number {
  return Math.max(0, Math.round((at - now) / 60_000));
}

/**
 * The now line on the ribbon.
 *
 * Rendered here rather than in `buildRibbon` for one reason: it moves. Everything
 * else on the ribbon is fixed for the whole day, so this is the only element that
 * would force the server to re-render to stay true.
 *
 * Null outside the day's extent, and that matters more than it looks. At 20:52 on
 * a ribbon that closes at 20:30 the marker sat past the end of the track: the line
 * was clipped by the track's overflow and the chip, which lives on the ruler, was
 * not — so a label reading 20:52 floated past the 20:00 tick. A day that is over
 * has no "now" on it, and the hero already says so.
 */
export function NowMarker({
  now,
  fromMinute,
  toMinute,
  span,
  variant,
}: {
  now: number;
  fromMinute: number;
  toMinute: number;
  /**
   * The ribbon's span in minutes, when the ribbon it sits on is the FLUID one.
   *
   * `/today`'s ribbon stretches to fill a wide column, so its children are
   * positioned as a percentage of the span rather than at one pixel a minute —
   * see `components/today/DayRibbon.tsx`. This marker is the one child of that
   * track that is not drawn by `day.ts`, so it has to be told the denominator.
   * Omitted, it falls back to the 1:1 pixel offset the setup flow's fixed
   * ribbon still uses.
   */
  span?: number;
  /** The line lives in the track; the chip lives on the ruler under it. */
  variant: 'line' | 'chip';
}) {
  const minute = minuteOfDay(now);
  if (minute < fromMinute || minute > toMinute) return null;
  const offset = minute - fromMinute;
  const left = span && span > 0 ? `${(offset / span) * 100}%` : offset;

  if (variant === 'chip') {
    return (
      <span className="dr__nt" style={{ left }}>
        {String(Math.floor(minute / 60)).padStart(2, '0')}:{String(minute % 60).padStart(2, '0')}
      </span>
    );
  }
  return (
    <div className="dr__now" style={{ left }} aria-hidden="true">
      <i />
    </div>
  );
}

/**
 * The slow heartbeat.
 *
 * Five minutes, not thirty seconds. The clock above keeps every number a trainer
 * reads current for free; this exists only so the *facts* catch up — a session
 * crossing into `late`, a client's payment landing on their own phone — on a tab
 * that has been open since six in the morning. Seven server requests every thirty
 * seconds to learn that nothing changed is a cost with no reader.
 *
 * Every action on this screen already calls `revalidatePath('/today')`, so the
 * trainer's OWN changes are never waiting on this.
 */
export function useHeartbeat(refresh: () => void, ms = 5 * 60_000): void {
  useEffect(() => {
    const t = setInterval(() => {
      // A refresh behind a hidden tab spends the trainer's data plan and their
      // rate-limit budget on a screen nobody is looking at. It catches up the
      // moment the tab is looked at again — same reasoning as `useDeck`'s
      // `active` flag, which stops the phone's clock behind another tab.
      if (document.visibilityState === 'visible') refresh();
    }, ms);
    return () => clearInterval(t);
  }, [refresh, ms]);
}
