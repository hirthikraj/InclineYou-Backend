/**
 * THE PHYSICAL CARD'S TWO DERIVATIONS — an age, and the way a date is written.
 *
 * ── THIS FILE WAS THE METABOLISM MATHS, AND MOST OF IT WAS DELETED ──────────
 *
 * It held Mifflin-St Jeor and an activity ladder, feeding *Resting metabolism*
 * and *Active metabolism* on the physical card. Both rows were cut on
 * 15 Sep 2026 and the arithmetic went with them rather than staying as dead
 * code somebody would later wire back up without the argument that justified it.
 *
 * Worth recording, because the deletion reached the schema: **`client.sex`
 * existed for exactly one thing** — the formula's two forms differ by a
 * constant, `+5` against `−161` — and with the formula gone it had no reader
 * anywhere in the product. A sex field on a training app that nothing reads is
 * not a harmless leftover, so the column was dropped too. Restoring either row
 * means making that case again from scratch.
 *
 * What is left is the arithmetic the *Birth day* row needs, kept out of the
 * component for the reason the whole file was: an age is a number a client may
 * be told, and it should be worked out in one place rather than inline in JSX.
 */

/**
 * Whole years, counted the way a person counts them: the birthday has to have
 * happened this year.
 *
 * `Math.floor(days / 365.25)` is the obvious version and it is out by a day for
 * anybody born on 29 February and for a birthday that is today — and "32" on
 * the morning of somebody's 33rd is exactly the kind of wrong a client notices
 * and a trainer gets told about.
 */
export function ageFrom(dateOfBirth: string | null, now: number): number | null {
  if (!dateOfBirth) return null;
  const born = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date(now);
  let years = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years < 130 ? years : null;
}

/** `21 Sept 1993` — the reference design's own shape, and `Sept` not `Sep`. */
export function birthDateStr(dateOfBirth: string): string {
  const d = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateOfBirth;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
