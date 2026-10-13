'use server';

import { getBell, postSeen } from './api';
import type { BellWire } from './types';

/**
 * The bell is read from the browser, because it sits in a bar that every screen draws and a screen cannot be asked to fetch
 * it for the bar. A failure is `null` — the bell then shows nothing, which is the honest answer: an absent count is a
 * missing number, where a wrong one would send a trainer looking for something that is not there.
 */
export async function loadBell(): Promise<BellWire | null> {
  try {
    return await getBell();
  } catch {
    return null;
  }
}

/** Opening the bell is what clears the count. Best effort: a failed mark leaves the badge as it was, which is true. */
export async function markBellSeen(): Promise<boolean> {
  try {
    await postSeen();
    return true;
  } catch {
    return false;
  }
}
