/**
 * Retries a setup profile that never reached the server.
 *
 * Same three moments as the database sync — signing in, coming back to the
 * foreground, getting the network back — because they are the same three
 * moments an offline-first app has anything new to say. Kept separate from
 * `useSyncTriggers` rather than folded into it: the profile is a plain REST
 * PATCH, not part of the WatermelonDB pull/push protocol, and mixing them
 * would make a profile failure look like a sync failure in the UI.
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { addNetworkStateListener } from 'expo-network';
import { flushPendingProfile, hydrateProfile } from './profileSync';

/** Push what's owed, then pull if this phone has no copy. Never both. */
async function reconcile(): Promise<void> {
  await flushPendingProfile();
  await hydrateProfile();
}

export function useProfilePush(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    void reconcile();

    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void reconcile();
    });

    const netSub = addNetworkStateListener(({ isConnected, isInternetReachable }) => {
      // isInternetReachable is undefined on some devices — only an explicit
      // false counts as "still offline".
      if (isConnected && isInternetReachable !== false) void reconcile();
    });

    return () => {
      appSub.remove();
      netSub.remove();
    };
  }, [enabled]);
}
