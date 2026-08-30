/**
 * The phrases this screen repeats, in one place.
 *
 * `deck.ts` already owns the phrasing of every ROW — `moneyLine`, `packLine`,
 * `quietLine` — for the reason its own comment gives: "Pack is empty" here and
 * "Pack finished" there described the same package and gave a trainer no way to
 * know it. This file is the same rule applied to the sentences AROUND the rows:
 * the counts on the rail badges, the queue's own label and the money card's
 * footnote all say the same thing about the same number and were three separate
 * template literals.
 *
 * ── THE BUG THAT PUT THIS FILE HERE ──────────────────────────────────────────
 *
 * Every one of them pluralised the NOUN and not the VERB, so a trainer with one
 * debtor read **"1 client owe you"** — in an `aria-label`, which is the one place
 * a reader cannot see past the grammar to the meaning. English subject-verb
 * agreement runs the opposite way to the noun's, and a `${n === 1 ? '' : 's'}`
 * inlined at each site gets it wrong every time it is written out.
 */

/** `1 client` · `6 clients`. The noun only — for labels that supply their own verb. */
export function clients(n: number): string {
  return `${n} client${n === 1 ? '' : 's'}`;
}

/** `1 session` · `4 sessions`. */
export function sessions(n: number): string {
  return `${n} session${n === 1 ? '' : 's'}`;
}

/**
 * `1 client owes you` · `3 clients owe you`.
 *
 * The verb inflects against the singular and the noun against the plural, which
 * is why they cannot share one ternary.
 */
export function clientsOweYou(n: number): string {
  return `${clients(n)} ${n === 1 ? 'owes' : 'owe'} you`;
}

/** `1 client needs you` · `6 clients need you`. */
export function clientsNeedYou(n: number): string {
  return `${clients(n)} ${n === 1 ? 'needs' : 'need'} you`;
}

/** `1 session today` · `4 sessions today`. */
export function sessionsToday(n: number): string {
  return `${sessions(n)} today`;
}
