import { NOT_CERTIFIED } from '@/lib/setup/options';
import { cleanList, MAX_ITEM_LENGTH, MAX_LIST } from './lists';

/**
 * The certification rules, as functions — shared by the setup step, the profile
 * tab and the server action that writes them.
 *
 * A module of its own because all three need the same two decisions and none of
 * them can import from the others: `lib/profile/api.ts` is `server-only`, the
 * picker is a client component, and `lib/setup/options.ts` is a deliberate
 * character-for-character copy of the phone's `app/src/setup/options.ts` — its
 * own header explains that the ids must match or one profile ends up carrying
 * two spellings of one answer. Adding behaviour to that file would break the
 * mirroring it exists to hold.
 *
 * The trimming and the caps are `lib/profile/lists.ts`, shared with the other
 * two list columns. What stays here is the one rule this list alone has.
 */

/** `TrainerService.MAX_LIST`. Over it the server 400s the WHOLE patch. */
export const MAX_CERTIFICATIONS = MAX_LIST;

/** `TrainerService.MAX_ITEM_LENGTH`. Over it the server silently truncates. */
export const MAX_CERTIFICATION_LENGTH = MAX_ITEM_LENGTH;

/**
 * Toggle, with the one rule this list has: **"Not certified yet" is exclusive
 * both ways.**
 *
 * Picking it clears everything else; picking anything else clears it. Holding
 * it alongside a certificate is a contradiction, and a profile that showed both
 * would be telling a client two things at once. This is the setup step's rule,
 * lifted verbatim — it is the reason this function exists rather than an inline
 * `includes` in each of the two screens that toggles chips.
 *
 * Specialities and languages have no equivalent and so have no function of
 * their own: every entry in those two catalogues can honestly stand beside
 * every other, so their toggle is the plain one and lives in the picker.
 */
export function toggleCertification(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (id === NOT_CERTIFIED) return [NOT_CERTIFIED];
  return [...current.filter((x) => x !== NOT_CERTIFIED), id];
}

/**
 * What actually goes on the wire — `cleanList`, plus the exclusivity re-applied.
 *
 * Re-applied here rather than trusted from the UI because this is the last place
 * before the column, and the toggle is not the only way a list can arrive: a
 * stale form, a replayed action, a future importer.
 */
export function cleanCertifications(ids: string[]): string[] {
  const out = cleanList(ids);
  if (out.includes(NOT_CERTIFIED) && out.length > 1) {
    // A contradiction has to resolve one way. It resolves toward the
    // certificates: they are the specific claim, and "not certified yet" is
    // what a trainer picked before they had one.
    return out.filter((id) => id !== NOT_CERTIFIED);
  }
  return out;
}
