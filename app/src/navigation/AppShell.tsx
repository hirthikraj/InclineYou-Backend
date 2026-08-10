/**
 * The chrome that outlives any one tab: the drawer and the + sheet.
 *
 * Both are opened from controls that live in the shell — the app bar's menu
 * button and the centre of the nav bar — so they are mounted once here rather
 * than per screen. A drawer mounted inside a tab screen unmounts when you
 * switch tabs, which is exactly when someone is most likely to still have it
 * open.
 */

import React, { createContext, useContext, useMemo, useState } from 'react';

export interface Shell {
  openDrawer: () => void;
  closeDrawer: () => void;
  drawerOpen: boolean;
  openAdd: () => void;
  closeAdd: () => void;
  addOpen: boolean;
  /**
   * Hides the nav bar so a screen can put a contextual bar in its place.
   *
   * Only the roster's selection mode uses this: § 03 turns the bottom bar into
   * the selection's actions, and sliding a second bar above the tabs instead
   * would move every row up by 64px at the exact moment the trainer is aiming
   * at one. The screen owns turning it back off, including on unmount.
   */
  chromeHidden: boolean;
  setChromeHidden: (hidden: boolean) => void;
}

const ShellContext = createContext<Shell | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);

  const value = useMemo<Shell>(
    () => ({
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      addOpen,
      openAdd: () => setAddOpen(true),
      closeAdd: () => setAddOpen(false),
      chromeHidden,
      setChromeHidden,
    }),
    [drawerOpen, addOpen, chromeHidden],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): Shell {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be inside ShellProvider');
  return ctx;
}
