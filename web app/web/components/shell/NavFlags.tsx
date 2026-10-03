'use client';

import { createContext, useContext } from 'react';

import type { SectionPage } from './nav';

/**
 * WHAT THE TRAINER'S PROFILE SWITCHES ON IN THE NAVIGATION — one flag, so far.
 *
 * `nav.tsx` is a constant: a list of places. A place that exists only for some
 * trainers (*Gym share* is meaningless without a gym) cannot be a constant row,
 * and filtering it at the two surfaces that draw a section's pages — the pane and
 * the phone's sheet — would be two copies of one rule. So the rule is one helper
 * here, the flag arrives once from the layout (which already reads the profile for
 * the workspace switcher, so it costs nothing extra), and both surfaces read it.
 *
 * It only hides the ROW. The route answers to anyone, so a bookmark kept after
 * leaving a gym lands on a page that says what to do instead of a 404.
 */
export interface NavFlags {
  /** A gym is on the profile (typed or picked). */
  hasGym: boolean;
}

const Ctx = createContext<NavFlags>({ hasGym: false });

export const NavFlagsProvider = Ctx.Provider;

export function useNavFlags(): NavFlags {
  return useContext(Ctx);
}

/** The pages of a section this trainer should see. */
export function visiblePages(pages: SectionPage[], flags: NavFlags): SectionPage[] {
  return pages.filter((p) => p.needs !== 'gym' || flags.hasGym);
}
