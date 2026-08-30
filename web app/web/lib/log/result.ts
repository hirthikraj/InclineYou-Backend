/**
 * What a write on the console can answer, and the two numbers beside it.
 *
 * Separate from `actions.ts` for the rule `lib/today/hold.ts` states: a
 * `'use server'` module may export only async functions, so a type or a constant
 * that lives next to one has to live in a different file.
 */

export type WriteResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

/**
 * HOW LONG A DELETED SET CAN BE PUT BACK.
 *
 * §09: **undo after, never confirm before.** A trainer logs twelve sets a
 * session and four sessions a morning; twenty confirmations is a different app.
 * So delete goes straight through and this is the window it can be reversed in —
 * held in the tab, exactly like the schedule's ten-second move hold, and honest
 * about the same cost: the row is already gone from the server, and Undo writes
 * it back rather than cancelling anything.
 *
 * Longer than the schedule's ten because nothing was sent to anybody. The one
 * place a confirm survives on this screen is discarding a whole session, which
 * is not reversible.
 */
export const UNDO_SECONDS = 20;

/** The three blast radii of a swap, widest last. Frame 3b draws all three. */
export type SwapScope = 'today' | 'program' | 'template';
