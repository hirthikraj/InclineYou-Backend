import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY } from '../api/client';
import { resetLocalDatabase, syncDatabase } from '../db/sync';
import { unregisterPushToken } from '../push/registerPushToken';
import { clearDraft } from '../setup/draft';
import { clearPendingProfile } from '../setup/profileSync';

/**
 * Set to 'pending' the moment a brand-new trainer signs in, and deleted when
 * they come out the far side of setup. Written rather than inferred, so an
 * account created before trainer setup existed — or one that finished it on
 * another device — is never dropped back into the flow. Absent means "no
 * setup owed", which is the safe default for everyone else.
 */
const SETUP_KEY = 'trainx_setup_state';
const TRAINER_ID_KEY = 'trainx_trainer_id';

/** Where the app lands after setup. `addClient` is the Done screen's primary CTA. */
export type Landing = 'home' | 'addClient';

interface AuthState {
  token: string | null;
  trainerId: string | null;
  isLoading: boolean;
  /** True while the trainer has an account but no profile — the setup flow owns the screen. */
  needsSetup: boolean;
}

interface AuthContextValue extends AuthState {
  /** `owesSetup` comes from the server via `needsSetup()`, not from `isNewUser`. */
  signIn: (token: string, trainerId: string, owesSetup: boolean) => Promise<void>;
  /** Ends the setup flow and hands over to the app. */
  completeSetup: (landing: Landing) => Promise<void>;
  signOut: () => Promise<void>;
  /** One-shot: read and cleared by whoever acts on it. */
  landing: Landing | null;
  clearLanding: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    trainerId: null,
    isLoading: true,
    needsSetup: false,
  });
  const [landing, setLanding] = useState<Landing | null>(null);

  useEffect(() => {
    void (async () => {
      const [token, trainerId, setup] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(TRAINER_ID_KEY),
        SecureStore.getItemAsync(SETUP_KEY),
      ]);
      setState({
        token,
        trainerId,
        isLoading: false,
        needsSetup: !!token && setup === 'pending',
      });
    })();
  }, []);

  const signIn = async (token: string, trainerId: string, owesSetup: boolean) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(TRAINER_ID_KEY, trainerId);
    // Written on every sign-in, not only when it's pending: a trainer who
    // finished setup on another device must have a stale local flag cleared.
    if (owesSetup) await SecureStore.setItemAsync(SETUP_KEY, 'pending');
    else await SecureStore.deleteItemAsync(SETUP_KEY);
    setState({ token, trainerId, isLoading: false, needsSetup: owesSetup });
  };

  /**
   * Local only, and deliberately so. The server is stamped by the profile PATCH
   * at the end of the flow; if that never landed, `useProfilePush` retries it in
   * the background. Waiting on the network here would break the flow's own
   * promise that none of it needs internet.
   */
  const completeSetup = async (next: Landing) => {
    await SecureStore.deleteItemAsync(SETUP_KEY);
    setLanding(next);
    setState((current) => ({ ...current, needsSetup: false }));
  };

  const signOut = async () => {
    // Flush anything queued while the token is still valid, then wipe the
    // local database so the next trainer on this phone starts clean.
    await syncDatabase('sign-out');
    await unregisterPushToken();
    await resetLocalDatabase();
    await clearDraft();
    // The next trainer on this phone must not inherit a queued push of someone
    // else's profile against their token.
    await clearPendingProfile();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(TRAINER_ID_KEY);
    await SecureStore.deleteItemAsync(SETUP_KEY);
    setLanding(null);
    setState({ token: null, trainerId: null, isLoading: false, needsSetup: false });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        completeSetup,
        signOut,
        landing,
        clearLanding: () => setLanding(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
