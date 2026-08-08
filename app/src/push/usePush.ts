import { useEffect } from 'react';
import { registerPushToken } from './registerPushToken';

/** Registers this device's push token once the trainer is signed in. */
export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    registerPushToken();
  }, [enabled]);
}
