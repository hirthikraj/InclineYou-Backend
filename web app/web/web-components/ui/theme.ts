'use client';

import { useSyncExternalStore } from 'react';

/**
 * The theme, for the whole product.
 *
 * ── WHY THE APP HAD NO LIGHT MODE ───────────────────────────────────────────
 *
 * Not because the palette was missing. §01 defines `[data-theme="light"]` in
 * full — all 54 tokens, every one of them a real value rather than a fallback.
 * What was missing was the switch: `app/layout.tsx` writes `data-theme="dark"`
 * on the server and nothing ever changed it, so half of a finished design
 * system was unreachable from the running product.
 *
 * This is that switch. It sets the same attribute the server sets, so there is
 * no second stylesheet and no duplicated tokens — the light palette that was
 * already there simply starts applying.
 *
 * ── ONE PREFERENCE, NOT TWO ─────────────────────────────────────────────────
 *
 * The library's toggle used to restore dark when you left it, because the
 * product shipped dark and landing on a product screen in an unsupported theme
 * would have been a bug. Now that the product supports both, that scoping is
 * the bug: a trainer who picks light means light, and the library is one more
 * screen. One key, one store, applied everywhere.
 *
 * ── THE ATTRIBUTE IS THE STATE ──────────────────────────────────────────────
 *
 * Read through `useSyncExternalStore` rather than mirrored into a `useState` on
 * mount. The DOM already holds the answer — `NO_FLASH` sets it before paint —
 * and copying it into React state means two sources that can disagree, plus a
 * render where the control says one thing over a page painted the other.
 */
export type Theme = 'dark' | 'light';

export const THEME_KEY = 'inclineyou-theme';

/**
 * Runs before the first paint, from a `<script>` in the root layout.
 *
 * A string rather than a module because it has to be inlined into the document:
 * anything bundled arrives after the dark first paint it exists to prevent, and
 * the whole screen would snap from dark to light on every navigation.
 *
 * `<html>` carries `suppressHydrationWarning` for this — the attribute is
 * legitimately client-owned, and React would otherwise log a mismatch on every
 * page a trainer loads in light.
 */
export const NO_FLASH = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}})()`;

let listeners: (() => void)[] = [];

function subscribe(notify: () => void) {
  listeners.push(notify);
  return () => {
    listeners = listeners.filter((l) => l !== notify);
  };
}

const read = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/* The server renders `data-theme="dark"`, so this is what the first client
   render has to agree with. A remembered light preference is applied by
   `NO_FLASH` and picked up on the first store read after hydration. */
const readOnServer = (): Theme => 'dark';

/**
 * ── THE PALETTE CROSSES OVER; IT DOES NOT CUT ───────────────────────────────
 *
 * Flipping the attribute repaints 54 tokens between two frames. Every surface,
 * every rule, every shadow and every word changes at once with no travel — the
 * screen does not change theme so much as it is REPLACED, and on a dark-to-light
 * flip that lands as a flash rather than as a setting being applied.
 *
 * The fix is a window, not a stylesheet: `data-theme-shift` on `<html>` says
 * "for the next `SHIFT_MS`, colour is allowed to move", and app.css turns that
 * into a colour-only transition on everything under it. Then it goes away. It
 * is deliberately temporary — a permanent transition on `*` would mean every
 * hover on every row in the product eased over 320ms instead of answering the
 * pointer, which is the opposite of what §01's `--tx-t-instant` exists for.
 *
 * Colour only. Not transform, not opacity: the account menu is OPEN when this
 * runs — the switch is inside it — and `tx-pop` must not be re-timed by a theme
 * change happening underneath it.
 */
const SHIFT_MS = 320; /* --tx-t-slow. A number in JS cannot read a token; app.css
                         spends the token and this has to be kept level with it. */

let shiftTimer: ReturnType<typeof setTimeout> | undefined;

function openShiftWindow(root: HTMLElement) {
  /* §01 already answers reduced-motion for the whole document, but the guard is
     here as well because this is the cheaper place to answer it: no attribute,
     no 320ms of transitions computed on every node just to be clamped to .001ms. */
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  root.dataset.themeShift = '';

  /* THIS LINE IS THE WHOLE MECHANISM AND IT LOOKS LIKE NOTHING.

     Setting the attribute and the theme in one go is one style change, and the
     transition would then have to start from a before-change style that never
     declared it. Browsers do honour the after-change style here, but the
     behaviour is subtle enough that it is not worth resting a visible effect
     on: reading a layout property forces the OLD palette to be committed with
     the transition already in place, so the flip below is unambiguously a
     change of value on a property that is already transitioning. */
  void root.offsetWidth;

  clearTimeout(shiftTimer);
  shiftTimer = setTimeout(() => {
    delete root.dataset.themeShift;
  }, SHIFT_MS);
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;

  /* Only animate a real change. The switch is two buttons and pressing the one
     already pressed is a normal thing to do — it must not restage a crossfade
     between a palette and itself, which reads as a stutter for no reason. The
     preference is still written: it is what the trainer just asked for. */
  if (root.dataset.theme !== theme) {
    openShiftWindow(root);
    root.dataset.theme = theme;
  }

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* A private window, or site data blocked. The theme still works for the life
       of the page; only the memory of it is lost. */
  }
  for (const notify of listeners) notify();
}

/** Re-applies what `NO_FLASH` already did. Idempotent, and safe to call twice. */
export function applyStoredTheme() {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    /* as above */
  }
  const next: Theme = stored === 'light' ? 'light' : 'dark';
  if (read() !== next) setTheme(next);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, read, readOnServer);
  return [theme, setTheme];
}
