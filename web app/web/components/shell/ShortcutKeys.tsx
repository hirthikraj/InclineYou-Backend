'use client';

import { useSyncExternalStore } from 'react';

/**
 * A keyboard chord, printed in the notation of the machine reading it.
 *
 * ── IT SAID ⌘K TO EVERYBODY ──────────────────────────────────────────────────
 *
 * The search box printed `⌘K` as a literal string. The handler has always
 * accepted `metaKey || ctrlKey`, so the shortcut worked on Windows and Linux —
 * the label was the only thing that was wrong, and it was wrong in the way that
 * costs the most: a trainer on Windows reads a glyph for a key that is not on
 * their keyboard and concludes the app has no shortcut. The feature was there
 * and the print hid it.
 *
 * ── WHY `useSyncExternalStore` AND NOT A `useEffect` FLAG ────────────────────
 *
 * The platform is not knowable on the server, and this renders inside a server
 * layout. Reading it in an effect means a first paint that says ⌘ and a second
 * that says Ctrl, which is a visible flicker in the top bar on every page load.
 * `useSyncExternalStore` gives the server snapshot separately from the client
 * one, so React renders the server's ⌘ into the HTML, then swaps once during
 * hydration with no intermediate committed frame.
 *
 * The server's answer is ⌘ rather than Ctrl on purpose: it is the narrower key
 * cap, so the box does not reflow when the wider word replaces it — text getting
 * wider inside a fixed 320px control is a layout shift, and it only ever happens
 * once per session.
 *
 * `userAgentData.platform` first, with the `navigator.platform` deprecation
 * fallback: `platform` is deprecated but still the only answer in Firefox and
 * Safari, and an undefined check is cheaper than being wrong on half the market.
 */
const subscribe = () => () => {};

function isApple(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = nav.userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(p);
}

export function useIsApple(): boolean {
  return useSyncExternalStore(subscribe, isApple, () => true);
}

/**
 * `⌘K` on a Mac, `Ctrl K` everywhere else.
 *
 * Two `<kbd>` elements off the Mac, because Ctrl and K are two keys and one
 * `<kbd>CtrlK</kbd>` reads as a key called "CtrlK" to anything parsing the
 * document. The Mac form keeps them joined, which is how macOS itself prints a
 * chord.
 */
export function ShortcutKeys({ letter }: { letter: string }) {
  const apple = useIsApple();
  if (apple) return <kbd>⌘{letter}</kbd>;
  return (
    <>
      <kbd>Ctrl</kbd>
      <kbd>{letter}</kbd>
    </>
  );
}
