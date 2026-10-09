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

/**
 * THE WORD A QUEUE ROW LEADS WITH, and the summary of the rows folded under it.
 *
 * Eleven rows that all open with a name and a grey sentence carry one cue — the
 * 2px red edge — and that is colour alone. A lead word is the kind of thing the
 * row is about, said first and in the same place on every row, so the eye can run
 * down the column and a screen reader meets it before the sentence.
 *
 * Categories, not restatements: `PACK Pack ends in 2 sessions` would say the same
 * word twice, so the pack row leads *Renewal* and the money row *Money*. Two kinds
 * share *Diary* — an unmarked session and an open log are the same housekeeping
 * to a trainer, and a ninth word for a ninth kind is a legend to learn.
 */
import type { AttentionKind } from './deck';

export const KIND_LEAD: Record<AttentionKind, string> = {
  overdue: 'Money',
  pack: 'Renewal',
  quiet: 'Quiet',
  missed: 'Attendance',
  'no-program': 'Plan',
  assess: 'Measure',
  unmarked: 'Diary',
  log: 'Diary',
  milestone: 'Milestone',
};

/**
 * `2 money · 1 renewal · 2 quiet` — what is behind *Show 5 more rows*.
 *
 * A disclosure that states a count asks the trainer to click to find out whether
 * the count was worth clicking; the KINDS are what tell them. Order is first
 * appearance, which is the queue's own ranking, and it stops at four groups with
 * a `+N` for the tail because five clauses is a sentence nobody reads.
 */
export function foldedSummary(kinds: AttentionKind[], maxGroups = 4): string {
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(KIND_LEAD[k], (counts.get(KIND_LEAD[k]) ?? 0) + 1);
  const groups = [...counts.entries()];
  const shown = groups.slice(0, maxGroups).map(([w, n]) => `${n} ${w.toLowerCase()}`);
  const rest = groups.slice(maxGroups).reduce((sum, [, n]) => sum + n, 0);
  return rest > 0 ? `${shown.join(' · ')} · +${rest}` : shown.join(' · ');
}
