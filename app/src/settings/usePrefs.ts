/**
 * Reads preferences into a component.
 *
 * A subscription to the module-level store in `prefs.ts` rather than a context.
 * Five screens and the drawer read these; a provider high in the tree would
 * re-render all four tabs when a notification switch moves, and a notification
 * switch has nothing to do with any of them.
 */

import { useEffect, useState } from 'react';
import { getPrefs, loadPrefs, prefsLoaded, subscribePrefs, type Prefs } from './prefs';

export interface UsePrefs {
  prefs: Prefs;
  /**
   * False until the phone's copy has been read once.
   *
   * Worth gating on: the defaults are opinions, and drawing "6 on" from the
   * defaults for a frame before the trainer's real "3 on" arrives is a wrong
   * number, not a placeholder.
   */
  ready: boolean;
}

export function usePrefs(): UsePrefs {
  const [prefs, setPrefs] = useState(getPrefs);
  const [ready, setReady] = useState(prefsLoaded);

  useEffect(() => {
    const stop = subscribePrefs(() => {
      setPrefs(getPrefs());
      setReady(prefsLoaded());
    });
    // Idempotent after the first success, so every mount calling it is fine.
    void loadPrefs();
    return stop;
  }, []);

  return { prefs, ready };
}
