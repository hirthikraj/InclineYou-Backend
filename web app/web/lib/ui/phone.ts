'use client';

import { useSyncExternalStore } from 'react';

/**
 * IS THIS A PHONE — for a surface that draws a different SHAPE below 620px, not
 * merely a different layout: a desk dialog or side panel above, a full-screen
 * `ScreenSheet` below (the assessment template editor and the pack panel,
 * 21 Nov 2026).
 *
 * A media query read in JS, which `AGENTS.md` warns against for anything rendered
 * on the server: a component that branches on a measured width paints the wrong
 * half for one frame and cannot be server-rendered. The two callers are exempt by
 * construction — both only ever MOUNT on a click, in the browser, so there is no
 * server render to disagree with and no first frame to get wrong. Do not reach
 * for this in anything a page draws on arrival; draw both and let CSS pick.
 *
 * The server snapshot is the desk, and is never used by those callers.
 */
const PHONE = '(max-width: 620px)';

function subscribe(cb: () => void) {
  const m = window.matchMedia(PHONE);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);
}
