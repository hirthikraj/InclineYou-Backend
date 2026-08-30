/**
 * THE COOLDOWN — the rule that stops the product nagging.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE LIMIT, THREE HALVES, AND UNTIL NOW ONLY ONE OF THEM COULD SEE IT
 *
 * `COOLDOWN_DAYS` in `app/src/nudges/rules.ts` — "never twice in seven days to
 * the same person, whatever the rules say" — has been computed on the phone from
 * its local `nudge_log` since the drawer was designed. `lib/today/actions.ts`
 * recorded the consequence in as many words: `nudge_log` reached the wire only
 * inside the sync envelope, so a reminder sent from a laptop was invisible to the
 * phone's cap and a reminder sent from the phone was invisible to the web. The
 * web logged, and honoured nothing.
 *
 * `GET /v1/nudges` closes it. Both halves can read the same rows, and this file
 * is the web's reading of them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT SILENCES THE PROMPT. IT DOES NOT BLOCK THE BUTTON.
 *
 * This is the decision in the feature that is easiest to get wrong, so it is
 * written down: a contacted client falls OUT OF THE QUEUE'S RANKING and the
 * button beside their name says *Reminded 2 days ago* — and if the trainer
 * presses it anyway, it sends.
 *
 * Blocking was the first design. It is wrong because a trainer pressing *Remind*
 * on somebody they messaged on Monday knows something the product does not: the
 * client replied, or asked to be chased again on Thursday, or paid half. A
 * product that answers that with a refusal teaches the trainer to open WhatsApp
 * directly — and a message sent outside the app is a message the log never sees,
 * which breaks the cap for every client rather than enforcing it for one.
 *
 * So the enforcement is the queue going quiet. That is what "the Today screen
 * doesn't re-nag about a client the trainer contacted yesterday" means, and it is
 * all it means.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AND IT IS PER CLIENT, NEVER PER TEMPLATE
 *
 * The cap is a promise to a person, not to a row. A client who got a payment
 * reminder on Monday and a check-in on Tuesday has been messaged twice by
 * somebody they pay, whatever the two messages were about. Keying this on
 * `(client, template)` would let six bands each spend their own weekly message on
 * the same person, which is the failure the cap exists to prevent.
 */

import type { NudgeLogEntry } from './types';

/** Milliseconds in a day. Local to this module — `lib/today/time.ts` is Today's. */
const DAY_MS = 86_400_000;

/**
 * Never twice in this many days to the same person.
 *
 * The FOURTH copy of this number — `app/src/nudges/rules.ts`, the backend's
 * `NudgeService.COOLDOWN_DAYS`, this. The backend's is the one the default
 * `GET /v1/nudges` window uses; nothing enforces any of them, by the argument
 * above, so a drift here is a screen that goes quiet for the wrong span rather
 * than a message that escapes. Change all three anyway.
 */
export const COOLDOWN_DAYS = 7;

/**
 * The most recent nudge per client.
 *
 * The response is already newest-first, so the first row seen per client is the
 * one that counts — but the sort is not re-asserted here, because a reader that
 * silently depends on the server's ORDER BY is a reader that breaks the day
 * somebody adds a `?sort=` parameter. `Math.max` on the stamp instead: one pass,
 * order-independent, and it costs nothing on a few hundred rows.
 */
export function lastNudgeByClient(entries: NudgeLogEntry[]): Map<string, NudgeLogEntry> {
  const out = new Map<string, NudgeLogEntry>();
  for (const entry of entries) {
    const seen = out.get(entry.clientId);
    if (!seen || entry.sentAt > seen.sentAt) out.set(entry.clientId, entry);
  }
  return out;
}

/** Epoch ms of the last contact, or undefined. The shape a component wants. */
export function lastContactMap(entries: NudgeLogEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [clientId, entry] of lastNudgeByClient(entries)) out.set(clientId, entry.sentAt);
  return out;
}

/** Was this client contacted inside the window? `at` may be undefined. */
export function withinCooldown(at: number | undefined, now: number): boolean {
  if (at === undefined) return false;
  return now - at < COOLDOWN_DAYS * DAY_MS;
}

/**
 * "just now" · "yesterday" · "3 days ago".
 *
 * Whole days from the start of each day rather than from the elapsed
 * milliseconds, so a message sent at 23:50 reads as *yesterday* at 00:10 rather
 * than as *just now* — which is what the trainer means by it, and the same rule
 * `lib/today/time.ts` applies to everything else dated on this half.
 */
export function contactedLabel(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
