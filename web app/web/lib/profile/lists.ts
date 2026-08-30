/**
 * WHAT A LIST COLUMN WILL ACCEPT — trim, drop, de-duplicate, cap.
 *
 * `trainer.specialities`, `.certifications` and `.languages` are three JSONB
 * columns that go through one method on the server (`TrainerService.clean`), so
 * they get one function here rather than three copies of the same four lines in
 * three server actions.
 *
 * The caps are the server's, named after its constants so a change there has an
 * obvious counterpart here. They are not the same KIND of limit and the
 * difference decides what this file does:
 *
 *   · over `MAX_ITEM_LENGTH` the server silently truncates the entry, so the
 *     worst case is a shortened certificate;
 *   · over `MAX_LIST` it answers **400 for the whole PATCH**. On a screen where
 *     one tab writes one column that costs the save; in setup, where the phone
 *     sends the whole profile at once, it would cost every answer in it. So the
 *     list is cut here rather than sent long and refused.
 */

/** `TrainerService.MAX_LIST`. Over it the server 400s the WHOLE patch. */
export const MAX_LIST = 25;

/** `TrainerService.MAX_ITEM_LENGTH`. Over it the server silently truncates. */
export const MAX_ITEM_LENGTH = 80;

/**
 * What actually goes on the wire.
 *
 * Runs in the server action rather than only in the picker, because this is the
 * last point before the column and a toggle is not the only way a list can
 * arrive — a stale tab, a replayed action, a future importer.
 *
 * **The product caps are deliberately not applied here.** Specialities are five
 * because "does everything" tells a client nothing, and that is a rule about
 * what a trainer should SAY, enforced where they say it — the picker refuses the
 * sixth chip and explains itself. Enforcing it again at the wire would mean a
 * list that arrived at six silently lost one, which is the app editing an answer
 * nobody asked it to touch. Only the server's own limit is structural, so only
 * the server's own limit is applied twice.
 */
export function cleanList(ids: string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim().slice(0, MAX_ITEM_LENGTH);
    if (!id || out.includes(id)) continue;
    out.push(id);
  }
  return out.slice(0, MAX_LIST);
}
