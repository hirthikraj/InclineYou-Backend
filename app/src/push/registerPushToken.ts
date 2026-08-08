import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';

/**
 * Asks for notification permission, reads the NATIVE device token (FCM on
 * Android, APNs on iOS) and hands it to the backend, which sends through the
 * Firebase Admin SDK.
 *
 * Requires a development/production build — expo-notifications' remote push
 * support is unavailable in Expo Go on Android from SDK 53 onwards.
 * Everything here is best-effort: a trainer who declines notifications must
 * still get a fully working app.
 */
export async function registerPushToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      // Android 13+ needs a channel to exist before permission can be requested.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      status = requested.status;
    }

    if (status !== 'granted') {
      console.log('[push] permission not granted — skipping token registration');
      return null;
    }

    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    await api.post('/v1/devices/token', {
      token: devicePushToken.data,
      platform: devicePushToken.type,
    });

    return devicePushToken.data;
  } catch (e) {
    // No Firebase config, running in Expo Go, or the device is offline —
    // none of which should break sign-in.
    console.warn('[push] token registration skipped:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function unregisterPushToken(): Promise<void> {
  try {
    await api.delete('/v1/devices/token');
  } catch {
    // Signing out offline is fine — the backend drops stale tokens on send.
  }
}
