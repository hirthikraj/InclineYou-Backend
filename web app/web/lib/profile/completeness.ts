import type { Identity } from '@/lib/profile/api';
import { PROFILE_TABS, profileTabHref, type ProfileTab } from '@/lib/profile/tabs';

/**
 * WHICH OF THE SEVEN SECTIONS HAVE BEEN ANSWERED.
 *
 * The profile is seven routes, and a trainer who has been through setup has
 * answered four of them without ever seeing this screen. Before this existed,
 * the only way to find out which three were still empty was to open all seven
 * — and the tab strip gives no hint, because a tab that is empty and a tab that
 * is full look exactly alike until it loads.
 *
 * ── IT IS A CHECKLIST AND NOT A SCORE ───────────────────────────────────────
 *
 * No percentage, no "profile strength", no ring that fills up. Those measure a
 * person against a target somebody else set, and the target here is not real:
 * a trainer with no certificates and no YouTube channel has an honest, finished
 * profile, and a bar telling them they are at 71% is the product calling that
 * a deficiency. What IS useful is the plain fact of which sections have nothing
 * in them, stated once, with a link — so this returns the list and lets the
 * caller draw it.
 *
 * ── WHAT COUNTS AS ANSWERED ─────────────────────────────────────────────────
 *
 * The narrowest true test per tab, and never a proxy. *Identity* is the name
 * AND the headline, because the headline is the line under the name on the
 * invite and a card with a blank one is the visible hole this screen is about;
 * the bio is not in the test, since it is genuinely optional and a trainer who
 * skips it has not left anything unanswered. *Certifications* counts
 * `NOT_CERTIFIED` as answered — it is an answer, and the one section where
 * saying no is the whole point.
 *
 * *Work* asks only for how, not where: a trainer who coaches online has no gym
 * and no neighbourhood, and requiring one would make the checklist unclearable
 * for them.
 */

/**
 * ── AND IT REPORTS THE SECTION, NOT WHAT IS MISSING INSIDE IT ───────────────
 *
 * It carried a sentence per empty section for a while — *Nothing listed, not
 * even “none”*, *No years on the floor* — drawn as a two-line row under the
 * section's name. MEASURED with all seven empty, which is a trainer who has
 * just finished setup and is exactly who the card is for: the aside came out
 * **979px tall in a 454px window**, and a sticky column more than twice its
 * scrollport has a bottom half nothing can scroll to, because the form beside
 * it only has 231px of scroll to push it with.
 *
 * The section's own name was already saying it. *Languages* under the heading
 * *Seven sections are still empty* does not need *No languages* under it, and
 * without those rows the card is a wrapped row of chips at a bounded height
 * whatever the count.
 */
export interface Section {
  key: ProfileTab;
  label: string;
  href: string;
  filled: boolean;
}

export function sectionsOf(identity: Identity): Section[] {
  const answered: Record<ProfileTab, boolean> = {
    identity: identity.name.trim().length > 0 && identity.headline.trim().length > 0,
    certifications: identity.certifications.length > 0,
    experience: identity.experienceBand.length > 0,
    specialities: identity.specialities.length > 0,
    languages: identity.languages.length > 0,
    work: identity.trainingModes.length > 0,
    social: identity.instagramUrl.length > 0 || identity.youtubeUrl.length > 0,
  };

  return PROFILE_TABS.map(({ key, label }) => ({
    key,
    label,
    href: profileTabHref(key),
    filled: answered[key],
  }));
}
