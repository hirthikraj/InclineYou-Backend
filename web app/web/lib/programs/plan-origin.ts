/**
 * WHERE THE TRAINER CAME INTO `/clients/:id/program/:pid` FROM, and why that is
 * a question the URL has to answer rather than the screen.
 *
 * A client's copy of a plan hangs off TWO shelves, and both are true:
 *
 *   the client file   `/clients/:id/program`   every plan this person has been on
 *   the programs list `/programs`              every client's copy, whoever they are
 *
 * The screen is identical either way — same client, same copy, same board — so
 * nothing in the payload can tell the two apart. `document.referrer` could, and
 * it is wrong for the reason every referrer-driven back control is wrong: it
 * survives no reload, no bookmark and no soft navigation the router served from
 * cache, so the crumb would change under a trainer who pressed F5.
 *
 * So the door is in the address. `?from=programs` is written by the list that
 * has no other way to say it; the bare URL is the canonical one and means the
 * client file, which is where the copy LIVES and the right answer for a link
 * somebody pasted.
 *
 * ── AND NOT A PATH SEGMENT, WHICH IS THE HOUSE PREFERENCE ───────────────────
 *
 * `lib/assessments/address.ts` argues for a second ROUTE over a `?from=`, and
 * that screen was right: a check-in read inside a file is a different SCOPE —
 * different crumb, different tab strip, different title — and the guard checks
 * the pair. Nothing here is scoped. The copy belongs to one client at one
 * address no matter which list was on screen a second ago; the only thing that
 * differs is which way back the trainer wants, which is a fact about the
 * journey and not about the resource. A second route for it would be two URLs
 * for one plan, which is the thing that file is protecting against.
 *
 * Trap 25 — *a search-param change is a server round trip* — is satisfied by
 * this being written once, by the link, and never changed on the screen.
 */

/** `file` is the default and the canonical address. */
export type PlanOrigin = 'file' | 'programs';

/**
 * `?from=programs` → the programs list. Anything else, an absent value and a
 * repeated one all fall back to the client file, which is the address's own
 * meaning — an unreadable `from` is a crumb pointing somewhere the trainer may
 * never have been, and the fallback is a true statement about where the plan
 * lives.
 */
export function parsePlanOrigin(v: string | string[] | undefined): PlanOrigin {
  const one = (Array.isArray(v) ? v[0] : v) ?? '';
  return one === 'programs' ? 'programs' : 'file';
}

/**
 * The address of one client's copy, carrying the door it was opened by.
 *
 * `file` writes NO parameter rather than `?from=file`: the bare URL is what
 * every other surface already links to and what `revalidatePath` is called
 * with, and two spellings of one canonical address is how a cache ends up
 * holding the same screen twice.
 */
export function planHref(clientId: string, programId: string, from: PlanOrigin = 'file'): string {
  const base = `/clients/${clientId}/program/${programId}`;
  return from === 'programs' ? `${base}?from=programs` : base;
}
