import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { useSyncTriggers } from '../db/useSync';
import { usePushRegistration } from '../push/usePush';
import { useProfilePush } from '../setup/useProfilePush';
import { colors } from '../design';
import AuthStack from './AuthStack';
import SetupStack from './SetupStack';
import MainStack from './MainStack';
import type { MainStackParamList } from './MainStack';

export default function RootNavigator() {
  const { token, isLoading, needsSetup, landing, clearLanding } = useAuth();
  const navRef = useNavigationContainerRef<MainStackParamList>();

  // All three only make sense once we have a token; they're no-ops otherwise.
  useSyncTriggers(!!token);
  usePushRegistration(!!token);

  const inApp = !!token && !needsSetup;

  // Only once setup is behind us: mid-flow there is nothing complete to send,
  // and the flow's own `finish()` owns the first attempt.
  useProfilePush(inApp);

  /**
   * "Add my first client" finishes setup AND names where to land, but the two
   * live in different navigators — completing setup unmounts the setup stack
   * and mounts this one, so the intent has to be replayed once MainStack is up.
   * Pushing rather than replacing keeps Home underneath, so back works.
   */
  useEffect(() => {
    if (!inApp || !landing) return;
    // A tick, so the swap to MainStack has committed and the route exists.
    const t = setTimeout(() => {
      if (landing === 'addClient' && navRef.isReady()) navRef.navigate('AddClient');
      clearLanding();
    }, 0);
    return () => clearTimeout(t);
  }, [inApp, landing, clearLanding, navRef]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
      {!token ? <AuthStack /> : needsSetup ? <SetupStack /> : <MainStack />}
    </NavigationContainer>
  );
}
