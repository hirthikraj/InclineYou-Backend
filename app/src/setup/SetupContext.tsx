/**
 * Holds the setup draft for the duration of the flow.
 *
 * Every screen writes through `patch`, which persists immediately — the flow is
 * six screens deep and a trainer who backgrounds the app on step four must come
 * back to step four, not to the start.
 *
 * The draft is mirrored in a ref as well as in state, and every write goes
 * through `commit`. That is not belt-and-braces: `PaymentScreen` patches the
 * UPI ID and finishes in the same handler, and a `finish` that closed over
 * render-time state would push the draft as it was BEFORE the last answer —
 * silently dropping the one field that decides where the money goes. The ref is
 * the value; the state exists to re-render.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EMPTY_DRAFT, clearDraft, loadDraft, saveDraft, type SetupDraft, type SetupStep } from './draft';
import { pushProfile } from './profileSync';

interface SetupContextValue {
  draft: SetupDraft;
  /** False until the stored draft has been read — screens must not render stale defaults. */
  ready: boolean;
  patch: (fields: Partial<SetupDraft>) => void;
  /** Marks a step passed over, so `nextStep` stops offering it. */
  skip: (step: SetupStep) => void;
  /** Throws the draft away. Used on sign-out, not on completion. */
  reset: () => Promise<void>;
  /**
   * End of flow — sends the profile to the server. Resolves either way: false
   * means it is queued for retry, not that anything was lost, and the caller
   * must let the trainer through regardless.
   */
  finish: () => Promise<boolean>;
}

const SetupContext = createContext<SetupContextValue | null>(null);

export function SetupProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<SetupDraft>(EMPTY_DRAFT);
  const [ready, setReady] = useState(false);
  const latest = useRef<SetupDraft>(EMPTY_DRAFT);

  /** The only writer. Ref first, so a read in the same tick sees the new value. */
  const commit = useCallback((next: SetupDraft) => {
    latest.current = next;
    setDraft(next);
    // Fire and forget: the screen must not wait on a keychain write to advance.
    void saveDraft(next);
  }, []);

  useEffect(() => {
    let alive = true;
    void loadDraft().then((stored) => {
      if (!alive) return;
      latest.current = stored;
      setDraft(stored);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const patch = useCallback(
    (fields: Partial<SetupDraft>) => commit({ ...latest.current, ...fields }),
    [commit],
  );

  const skip = useCallback(
    (step: SetupStep) => {
      const current = latest.current;
      if (current.skipped.includes(step)) return;
      commit({ ...current, skipped: [...current.skipped, step] });
    },
    [commit],
  );

  const reset = useCallback(async () => {
    latest.current = EMPTY_DRAFT;
    setDraft(EMPTY_DRAFT);
    await clearDraft();
  }, []);

  /**
   * The draft is NOT cleared afterwards. It is the phone's copy of the profile
   * — the completion meter reads it, and a failed push needs it to retry from.
   * `signOut` is what wipes it.
   */
  const finish = useCallback(() => pushProfile(latest.current), []);

  const value = useMemo(
    () => ({ draft, ready, patch, skip, reset, finish }),
    [draft, ready, patch, skip, reset, finish],
  );

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useSetup(): SetupContextValue {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error('useSetup must be inside SetupProvider');
  return ctx;
}
