/**
 * Rupees, in the grouping an Indian trainer reads.
 *
 * `₹1,24,500`, not `₹124,500`. The lakh grouping is the whole point: the second
 * form is a number a trainer has to stop and parse, and every figure in the
 * money book is one they are checking against what they remember.
 *
 * Mirrors `rupees()` in `app/src/money/money.ts` and the local `money()` in the
 * phone's `PacksScreen`.
 */
export function rupees(n: number): string {
  const value = Math.round(Math.abs(n));
  const sign = n < 0 ? '-' : '';
  const s = String(value);
  if (s.length <= 3) return `${sign}₹${s}`;
  // Last three digits stay together; everything before them groups in twos.
  return `${sign}₹${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${s.slice(-3)}`;
}

export type PackType = 'session_pack' | 'monthly' | 'single';

/**
 * One entry on a price list. The wire shape of a `packs` row, minus the columns
 * the server fills in — see `lib/setup/api.ts`.
 */
export interface Pack {
  id: string;
  name: string;
  type: PackType;
  /** Null on a monthly fee — there is no session count to divide by. */
  sessions: number | null;
  amount: number;
  validityDays: number | null;
  /** Whose price list this belongs on. The gym's counter sets its own. */
  owner: 'trainer' | 'gym';
  orderIndex: number;
}

/**
 * The per-session figure, or null when there isn't one.
 *
 * **Computed, never typed.** It is the number a client asks about and the number
 * a trainer gets wrong in their head, and a price list defined at setup is what
 * lets "₹750 a session" be derived rather than guessed on every later screen.
 */
export function perSession(pack: Pick<Pack, 'type' | 'sessions' | 'amount'>): number | null {
  if (pack.type === 'monthly') return null;
  const count = pack.type === 'single' ? 1 : (pack.sessions ?? 0);
  return count > 0 ? Math.round(pack.amount / count) : null;
}

/** What the pack is called when the trainer doesn't name it. The app's `autoName`. */
export function autoName(type: PackType, sessions: number): string {
  if (type === 'monthly') return 'Monthly';
  if (type === 'single') return 'Single session';
  return `${sessions || 0} sessions`;
}

/** The subtitle under a pack's name in the table. */
export function packSubtitle(pack: Pack): string {
  const per = perSession(pack);
  return per != null ? `${rupees(per)} a session` : 'Per month';
}
