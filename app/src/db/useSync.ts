import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { addNetworkStateListener } from 'expo-network';
import { getSyncState, refreshPending, subscribeSync, syncDatabase } from './sync';

export function useSyncState() {
  return useSyncExternalStore(subscribeSync, getSyncState);
}

/**
 * Drives sync from the three moments that matter offline-first: signing in,
 * returning to the foreground, and getting the network back.
 */
export function useSyncTriggers(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    refreshPending();
    syncDatabase('startup');

    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') syncDatabase('foreground');
    });

    const netSub = addNetworkStateListener(({ isConnected, isInternetReachable }) => {
      // isInternetReachable is undefined on some devices — only treat an
      // explicit false as "still offline".
      if (isConnected && isInternetReachable !== false) syncDatabase('reconnect');
    });

    return () => {
      appSub.remove();
      netSub.remove();
    };
  }, [enabled]);
}
