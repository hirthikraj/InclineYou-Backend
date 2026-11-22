/**
 * What a write on the console can answer, and the two numbers beside it.
 *
 * Separate from `actions.ts` for the rule `lib/today/hold.ts` states: a
 * `'use server'` module may export only async functions, so a type or a constant
 * that lives next to one has to live in a different file.
 */

export type WriteResult =
  | { ok: true; id?: string }
  /* `code` is additive (21 Nov 2026): the server's error code where it sent one, so a screen
     can branch on the code rather than on the wording — `AGENTS.md`'s rule for the auth 429s. */
  | { ok: false; message: string; code?: string };
