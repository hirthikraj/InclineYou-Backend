/**
 * The caps and the one shape check the Account screen applies before it asks
 * the server.
 *
 * Its own file rather than constants in the panel, for the reason
 * `lib/profile/social.ts` and `lib/profile/identity.ts` are their own files: a
 * `maxLength` on an input and a `.slice()` in the action are the same number
 * said twice, and the second copy is the one that drifts.
 */

/** `trainer.name` is VARCHAR(100). The server trims to it silently. */
export const MAX_NAME = 100;

/**
 * RFC 5321's ceiling on an address, and `trainer.email`'s column width.
 *
 * The server REFUSES over this rather than truncating — unlike every other
 * string on `/v1/trainers/me` and for `headline`'s reason: half an address is
 * not a shorter address, it is a wrong one. So the field caps at the same number
 * and the action cuts to it, which means the refusal is unreachable from this
 * screen and stays as the belt to its braces.
 */
export const MAX_EMAIL = 254;

/**
 * Is this an address at all?
 *
 * Three rules — one `@`, something on each side of it, a dot in the domain — and
 * the restraint is the point. A regex that tries for RFC 5322 costs several
 * hundred characters, still gets quoted local parts wrong, and rejects addresses
 * that work. **The only check that ever settles an address is sending to it**,
 * and this product cannot send: there is no mail transport in the backend, which
 * is exactly why V36 stores this as a contact detail rather than a credential.
 *
 * Deliberately no stricter than `TrainerService.email` on the other side. A copy
 * that refused what the server would have accepted is the worse failure mode,
 * because the trainer has no way to appeal past the half that said no — the same
 * call `lib/profile/social.ts` makes for its two link checks.
 */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  if (v.length === 0 || v.length > MAX_EMAIL) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at <= 0 || at !== v.lastIndexOf('@') || at === v.length - 1) return false;
  const domain = v.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}
