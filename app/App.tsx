import React from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from './src/store/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

/**
 * Hold the native splash until OUR splash has painted.
 *
 * The native one is `#08090B` with no visible mark and so is `Splash`, so the
 * handoff is meant to be invisible — and it is only invisible if the native one
 * is still up when the lockup's first frame lays out. By default it is not:
 * expo-splash-screen auto-hides on React's `CONTENT_APPEARED` marker and then
 * fades out over 400ms, which uncovers the activity window while JS is still
 * laying out the first frame. That window is what shows through.
 *
 * Paired with `expo.backgroundColor` in app.json, which is the other half: the
 * generated `AppTheme` inherits `Theme.AppCompat.DayNight`, whose window
 * background is WHITE in day mode, and prebuild only writes
 * `android:windowBackground` when that key is set. Without it every uncovered
 * frame is white rather than canvas. Belt and braces on purpose — the theme fix
 * needs a rebuild to take effect, this one does not.
 *
 * Released by `Splash` itself, on its first layout.
 */
SplashScreen.preventAutoHideAsync().catch(() => {
  /* Already visible-or-hidden; either way there is nothing to hold. */
});

/**
 * The safe-area provider moved up here when the launch splash landed: the
 * splash renders BEFORE the navigation container, and until now the only
 * provider in the tree was the compat one each navigator mounts for itself, so
 * anything above navigation had no insets to read.
 *
 * `initialMetrics` is not optional. Without it the provider renders nothing
 * until the native view has measured, which on a cold start is a blank frame
 * where the first frame of the logo lift should be.
 */
export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
