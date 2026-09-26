'use client';

import {
  createContext, useCallback, useContext, useMemo, useState, useTransition,
} from 'react';

import { setDefaultWorkspace, switchWorkspace } from '@/lib/workspace/actions';
import type { Workspace } from '@/lib/workspace/types';

/**
 * THE WORKSPACE, CARRIED TO THE BAR THAT DRAWS IT.
 *
 * ── WHY A CONTEXT AND NOT A PROP ─────────────────────────────────────────────
 *
 * `TopBar` is rendered by twenty screens, not by the shell — every page mounts
 * its own, which is why the search box and the bell went through hosts of their
 * own (`PaletteHost`, `NotificationsHost`) rather than through twenty prop
 * chains. The workspace is the same shape of problem and gets the same answer:
 * the layout reads it once, the host holds it, and any bar under the shell can
 * ask. Twenty call sites that have to remember to pass a prop is twenty places
 * one can be forgotten, and a bar that forgot would draw no switcher at all.
 *
 * ── AND `undefined` IS A REAL ANSWER ─────────────────────────────────────────
 *
 * `useWorkspace()` returns `undefined` outside the host, exactly as
 * `useNotifications()` does, and `TopBar` falls back to the breadcrumb. That is
 * not a defensive nicety: `/setup`, `/me` and the component library draw bars
 * outside the shell, and a switcher with nothing to switch between would be the
 * dead control this codebase keeps deleting.
 */
export interface WorkspaceState {
  workspaces: Workspace[];
  /** The book open right now — this sitting's choice. */
  activeId: string;
  /** The book the app opens in. Never `null`: with nothing stored it resolves to
   *  the solo workspace, so the menu always has exactly one row starred. */
  defaultId: string;
  /** The row that was clicked while a switch is in flight, else `null`. The
   *  menu marks that row rather than spinning the whole bar — the trainer needs
   *  to see WHICH book is opening. */
  switching: string | null;
  switchTo: (id: string) => void;
  /** Star a row. Does not switch to it — `setDefaultWorkspace` says why. */
  makeDefault: (id: string) => void;
}

const Ctx = createContext<WorkspaceState | undefined>(undefined);

export function useWorkspace(): WorkspaceState | undefined {
  return useContext(Ctx);
}

export function WorkspaceHost({
  workspaces,
  activeId,
  defaultId,
  onSwitch,
  onDefault,
  children,
}: {
  workspaces: Workspace[];
  activeId: string;
  defaultId: string;
  /**
   * Overrides the server action. The component library renders this host over
   * local state so the specimen can actually be switched — a design review that
   * cannot click the control is reading a screenshot. Absent in the app, where
   * the cookie and the re-render have to happen in the same response.
   */
  onSwitch?: (id: string) => void;
  /** The same override for the star — see `onSwitch`. */
  onDefault?: (id: string) => void;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);

  /*
   * THE STAR IS NOT IN THE TRANSITION, AND THAT IS DELIBERATE.
   *
   * `switchTo` marks a row while its transition is in flight because a switch
   * changes the whole screen and takes a visible moment. Starring changes ONE
   * mark inside an open menu; a "saving…" state on a control whose whole effect
   * is the icon it lives in would be louder than the thing it is reporting.
   * The revalidation moves the star when it lands, which for a cookie write is
   * the same frame a spinner would still be spinning in.
   */

  const switchTo = useCallback(
    (id: string) => {
      // Clicking the row you are already in is not a switch. Without this it is
      // a full layout revalidation that changes nothing, which reads as a
      // half-second of the whole app flickering for no reason.
      if (id === activeId) return;
      if (onSwitch) {
        onSwitch(id);
        return;
      }
      setTarget(id);
      start(() => {
        void switchWorkspace(id);
      });
    },
    [activeId, onSwitch, start],
  );

  /*
   * THE MARK IS GATED ON `pending`, AND THAT IS WHY NOTHING CLEARS IT.
   *
   * The obvious shape is a piece of state set on click and cleared when the
   * action resolves — and the clear is the part that goes wrong, because the
   * thing that ends this switch is the LAYOUT re-rendering with a new
   * `activeId`, which arrives as a new prop rather than as a promise this
   * component is holding. Gating the stored target on the transition means the
   * mark cannot outlive the switch: the moment the server's re-render lands,
   * `pending` is false and `switching` is `null` again, with no effect to write
   * and no way to leave a row spinning forever if the action throws.
   */
  const makeDefault = useCallback(
    (id: string) => {
      // Starring the row that is already starred is not a change. Without this
      // it is a full layout revalidation that moves nothing, which reads as the
      // whole app flickering because somebody pressed a mark that was already on.
      if (id === defaultId) return;
      if (onDefault) {
        onDefault(id);
        return;
      }
      /* Clears the switch's target first, and this is a real bug rather than
         tidiness: both writes share one `useTransition`, so a star pressed after
         a switch would re-raise `pending` with the PREVIOUS switch's id still in
         `target` — and the row that was opened a minute ago would say
         "Opening…" again, about nothing. */
      setTarget(null);
      start(() => {
        void setDefaultWorkspace(id);
      });
    },
    [defaultId, onDefault, start],
  );

  const value = useMemo<WorkspaceState>(
    () => ({
      workspaces,
      activeId,
      defaultId,
      switching: pending ? target : null,
      switchTo,
      makeDefault,
    }),
    [workspaces, activeId, defaultId, pending, target, switchTo, makeDefault],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
