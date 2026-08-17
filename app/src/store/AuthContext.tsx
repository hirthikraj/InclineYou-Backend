import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY } from '../api/client';
import type { Membership } from '../api/auth';
import { resetLocalDatabase, setSyncScope, syncDatabase } from '../db/sync';
import { seedDefaultWorkingHours } from '../db/diary';
import { hydratePrefs, resetPrefs } from '../settings/prefs';
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
const SETUP_KEY = 'xrep_setup_state';
const TRAINER_ID_KEY = 'xrep_trainer_id';

/* --------------------------------------------------------- FR-11 · the lens */

/**
 * Which half of the product is on screen.
 *
 * The role is a lens, not an account: same person, same login, same records,
 * same sync state. Switching changes the tab bar and the home composition and
 * nothing else — which is why it is stored on the phone and not on the server. A
 * trainer who opens at 6am to coach and at 8pm to lift should not re-pick every
 * time; opening where they left off is right far more often than asking.
 */
export type Lens = 'trainer' | 'client';

const LENS_KEY = 'xrep_lens';
/** Which client record the client lens is reading. A person can be on two rosters. */
const CLIENT_ID_KEY = 'xrep_client_id';
/**
 * Every roster this number is on, as the server last described it.
 *
 * Cached because the first thing the client lens draws is the coach block — a
 * name, a gym — and the first sync has not landed yet on a fresh install. It is
 * a copy of a server answer, so it is refreshed on every sign-in and never
 * written to.
 */
const MEMBERSHIPS_KEY = 'xrep_memberships';

export type Landing = 'home' | 'addClient';

interface AuthState {
  token: string | null;
  trainerId: string | null;
  isLoading: boolean;
  /** True while the trainer has an account but no profile — the setup flow owns the screen. */
  needsSetup: boolean;
  /** Which lens is open. `client` routes to the client's four tabs. */
  lens: Lens;
  /** The client record the client lens reads. Null in the trainer lens. */
  clientId: string | null;
  /** Rosters this number is on. Empty for a trainer who trains nobody's clients. */
  memberships: Membership[];
}

/** Everything a successful verify tells us. */
export interface SignInSession {
  token: string;
  trainerId: string | null;
  owesSetup: boolean;
  lens: Lens;
  clientId: string | null;
  memberships: Membership[];
}

interface AuthContextValue extends AuthState {
  signIn: (session: SignInSession) => Promise<void>;
  /** Ends the setup flow and hands over to the app. */
  completeSetup: (landing: Landing) => Promise<void>;
  /**
   * Flip the lens. `clientId` is required going into the client lens and is
   * ignored coming out of it — the trainer lens has no client.
   */
  switchLens: (lens: Lens, clientId?: string) => Promise<void>;
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
    lens: 'trainer',
    clientId: null,
    memberships: [],
  });
  const [landing, setLanding] = useState<Landing | null>(null);

  useEffect(() => {
    void (async () => {
      const [token, trainerId, setup, lens, clientId, memberships] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(TRAINER_ID_KEY),
        SecureStore.getItemAsync(SETUP_KEY),
        SecureStore.getItemAsync(LENS_KEY),
        SecureStore.getItemAsync(CLIENT_ID_KEY),
        SecureStore.getItemAsync(MEMBERSHIPS_KEY),
      ]);

      // A stored `client` lens with no client id is not a lens, it is a bug that
      // would render a screen with nothing to read. Fall back to the trainer.
      const restored: Lens = lens === 'client' && clientId ? 'client' : 'trainer';

      // Sync has to know which endpoint it is talking to before the first
      // trigger fires, and the triggers start the moment a token exists.
      setSyncScope(restored === 'client' ? { clientId } : null);

      setState({
        token,
        trainerId,
        isLoading: false,
        needsSetup: !!token && setup === 'pending',
        lens: restored,
        clientId: restored === 'client' ? clientId : null,
        memberships: parseMemberships(memberships),
      });

      // Preferences come off SecureStore, and only reach for the server's copy
      // on a phone that has never had its own. Not awaited above: the app must
      // not wait on the network to decide which screen to show. The server's
      // copy lives on `/v1/trainers/me`, so a session with no trainer account
      // has nowhere to hydrate from — the defaults stand.
      if (token && trainerId) void hydratePrefs();
    })();
  }, []);

  const signIn = async (session: SignInSession) => {
    await SecureStore.setItemAsync(TOKEN_KEY, session.token);
    if (session.trainerId) await SecureStore.setItemAsync(TRAINER_ID_KEY, session.trainerId);
    else await SecureStore.deleteItemAsync(TRAINER_ID_KEY);
    // Written on every sign-in, not only when it's pending: a trainer who
    // finished setup on another device must have a stale local flag cleared.
    if (session.owesSetup) await SecureStore.setItemAsync(SETUP_KEY, 'pending');
    else await SecureStore.deleteItemAsync(SETUP_KEY);

    await SecureStore.setItemAsync(LENS_KEY, session.lens);
    if (session.clientId) await SecureStore.setItemAsync(CLIENT_ID_KEY, session.clientId);
    else await SecureStore.deleteItemAsync(CLIENT_ID_KEY);
    await SecureStore.setItemAsync(MEMBERSHIPS_KEY, JSON.stringify(session.memberships));

    setSyncScope(session.lens === 'client' ? { clientId: session.clientId } : null);

    setState({
      token: session.token,
      trainerId: session.trainerId,
      isLoading: false,
      needsSetup: session.owesSetup,
      lens: session.lens,
      clientId: session.lens === 'client' ? session.clientId : null,
      memberships: session.memberships,
    });
  };

  /**
   * Local only, and deliberately so. The server is stamped by the profile PATCH
   * at the end of the flow; if that never landed, `useProfilePush` retries it in
   * the background. Waiting on the network here would break the flow's own
   * promise that none of it needs internet.
   */
  /**
   * The end of trainer setup — and the one moment a working week can be seeded.
   *
   * Setup asks for hours now (the `hours` step), because adding a client picks
   * their slots FROM these windows — but the step is skippable, and a skipped
   * answer must not leave the table empty. With no rows the diary reports every
   * day closed and offers no bookable slot anywhere, which reads as a broken
   * app rather than as a setting nobody has touched. A default week is a
   * visible, obviously-editable wrong answer, and a trainer corrects one of
   * those. `seedDefaultWorkingHours` no-ops if any row exists, so a trainer who
   * answered the step keeps exactly what they said.
   *
   * Best-effort on purpose: this is a convenience, and a trainer who has just
   * finished setup must reach their deck whether or not the write lands.
   */
  const completeSetup = async (next: Landing) => {
    if (state.trainerId) {
      try {
        await seedDefaultWorkingHours(state.trainerId);
      } catch {
        /* The hours screen is one tap from Settings; a failed seed is not a
           reason to hold someone at the last screen of onboarding. */
      }
    }

    await SecureStore.deleteItemAsync(SETUP_KEY);
    setLanding(next);
    setState((current) => ({ ...current, needsSetup: false }));
  };

  /**
   * The switch itself. Not a sign-in: the token, the queue and the local
   * database are all untouched, because the two lenses read the same records.
   *
   * The pending queue is flushed first. A trainer with four logged sets waiting
   * and a client lens that pushes to a different endpoint must not leave those
   * sets to be sent under the wrong scope.
   */
  const switchLens = async (lens: Lens, clientId?: string) => {
    if (lens === 'client' && !clientId) return;
    await syncDatabase('lens-switch');

    await SecureStore.setItemAsync(LENS_KEY, lens);
    if (lens === 'client' && clientId) await SecureStore.setItemAsync(CLIENT_ID_KEY, clientId);

    setSyncScope(lens === 'client' ? { clientId: clientId ?? null } : null);
    setState((current) => ({
      ...current,
      lens,
      clientId: lens === 'client' ? (clientId ?? null) : null,
    }));
  };

  const signOut = async () => {
    // Flush anything queued while the token is still valid.
    await syncDatabase('sign-out');
    await unregisterPushToken();
    await clearDraft();
    // The next trainer on this phone must not inherit a queued push of someone
    // else's profile against their token.
    await clearPendingProfile();
    // Notification switches, the language, the chase window, and which book the
    // trainer was in. All of it is this trainer's, and none of it belongs to the
    // next one who signs in on the same phone.
    await resetPrefs();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(TRAINER_ID_KEY);
    await SecureStore.deleteItemAsync(SETUP_KEY);
    await SecureStore.deleteItemAsync(LENS_KEY);
    await SecureStore.deleteItemAsync(CLIENT_ID_KEY);
    await SecureStore.deleteItemAsync(MEMBERSHIPS_KEY);
    setSyncScope(null);
    setLanding(null);
    setState({
      token: null,
      trainerId: null,
      isLoading: false,
      needsSetup: false,
      lens: 'trainer',
      clientId: null,
      memberships: [],
    });
    // Only after the state flip. Dropping the token swaps the navigator to the
    // auth stack, which unmounts every screen holding a live query — and
    // Watermelon refuses to reset the database while any of those
    // subscriptions are still attached.
    await resetLocalDatabase();
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        completeSetup,
        switchLens,
        signOut,
        landing,
        clearLanding: () => setLanding(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** A stored copy of a server answer. Unreadable means "ask again", not a crash. */
function parseMemberships(raw: string | null): Membership[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Membership[]) : [];
  } catch {
    return [];
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
