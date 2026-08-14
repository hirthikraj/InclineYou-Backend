import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { useSyncTriggers } from '../db/useSync';
import { usePushRegistration } from '../push/usePush';
import { useProfilePush } from '../setup/useProfilePush';
import { navTheme, Splash } from '../design';
import AuthStack from './AuthStack';
import SetupStack from './SetupStack';
import MainStack from './MainStack';
import ClientStack from './ClientStack';
import type { MainStackParamList } from './MainStack';

export default function RootNavigator() {
  const { token, isLoading, needsSetup, landing, clearLanding, lens } = useAuth();
  const navRef = useNavigationContainerRef<MainStackParamList>();

  // All three only make sense once we have a token; they're no-ops otherwise.
  useSyncTriggers(!!token);
  usePushRegistration(!!token);

  const client = lens === 'client';
  // Trainer setup is a trainer's flow. A client has nothing to set up — their
  // trainer maintains their record — so the client lens is never held behind it.
  const inApp = !!token && (client || !needsSetup);

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

  /**
   * Launch — frames 0a–0c of the login file, and the only place the full lockup
   * appears. It replaces a spinner: restoring a session and opening the local
   * database is the one wait every cold start has, and the design system spends
   * it on the mark rather than on a rotating circle.
   *
   * Held for the lift as well as for `isLoading`, because the two do not take
   * the same time. Auth usually resolves in well under the 2.5s launch runs
   * (`SPLASH_HOLD_MS` — the 1.4s lift plus the hold on the seated lockup), and a
   * logo cut off mid-lift reads as a crash; the reverse — a slow restore on a
   * cold device — just holds the seated frame until it is done. None of it gates
   * anything: local data resolves behind the whole splash, which is the whole of
   * FR-8. Under reduced motion `onDone` fires on the first frame, so nobody who
   * has asked for stillness waits on either.
   */
  const [liftDone, setLiftDone] = useState(false);
  /* Captured once: the note describes what the splash is waiting for, and a
     line that appears and vanishes mid-lift is worse than no line at all. */
  const note = useRef(isLoading ? 'Opening your book…' : undefined).current;

  if (isLoading || !liftDone) {
    return <Splash note={note} onDone={() => setLiftDone(true)} />;
  }

  return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      {!token ? (
        <AuthStack />
      ) : client ? (
        <ClientStack />
      ) : needsSetup ? (
        <SetupStack />
      ) : (
        <MainStack />
      )}
    </NavigationContainer>
  );
}
