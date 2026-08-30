import type { AttentionKind } from '@/lib/today/deck';

import type { NudgeTemplateName } from './types';

/**
 * WHICH TEMPLATE A QUEUE ROW SENDS — one table, so two screens cannot disagree.
 *
 * `lib/today/deck.ts` raises the row, `components/today/AttentionQueue.tsx`
 * commits it, and `lib/clients/roster.ts` raises the same bands again in a
 * different order for a different question. All three used to decide the
 * template at their own call site, and the queue's `runVerb` still does — see
 * below for why that one is left alone.
 *
 * ── THREE KINDS ANSWER `null`, AND THAT IS THE INTERESTING HALF ──────────────
 *
 * `unmarked`, `no-program` and `log` are the trainer's own housekeeping. Their
 * verbs — *Mark*, *Assign*, *Close* — write a row and tell nobody, and there is
 * no message that would help: WhatsApping a client about a session log the
 * trainer forgot to close is a message about the trainer's admin sent to
 * somebody who is paying them. So those rows get no nudge button anywhere, and
 * `null` is what says so rather than a template nobody should send.
 *
 * ── `quiet` IS `check_in`, NOT `re_engagement` ───────────────────────────────
 *
 * Both exist, and the difference is how long the silence has been. The deck's
 * `quiet` band fires at `QUIET_DAYS` — a week or two — where *how's your week
 * going* is the right register. `re_engagement` names the gap in days and offers
 * to find a slot, which is the right register at a month and reads as heavy at
 * ten days.
 *
 * Nothing raises `re_engagement` automatically, because nothing on this half
 * raises a *lapsed* row: the roster's `lapsed` tag is a tag, not a band, so it
 * has no verb. It is offered from the client's own file, where a trainer looking
 * at somebody who stopped in June can choose it deliberately.
 */
export const TEMPLATE_FOR_KIND: Record<AttentionKind, NudgeTemplateName | null> = {
  pack: 'renewal',
  overdue: 'payment_reminder',
  missed: 'missed_session',
  quiet: 'check_in',
  milestone: 'well_done',
  'no-program': null,
  unmarked: null,
  log: null,
};

/**
 * Takes a plain `string`, not `AttentionKind`, and that is deliberate.
 *
 * There are TWO `AttentionKind` unions on this half — `lib/today/deck.ts`'s
 * eight and `lib/clients/roster.ts`'s, which adds `'setup'` for a client who is
 * on the roster and not yet set up. Narrowing this to either one would make the
 * other screen's call a type error, and widening one union to satisfy the other
 * would let a `'setup'` row reach the deck's ranking.
 *
 * So the lookup is by name and an unknown name is `null` — which is the same
 * answer `'setup'` should get anyway: a client who has not been given a schedule
 * or a plan needs the trainer to finish setting them up, not a WhatsApp about it.
 */
export function templateForKind(kind: string): NudgeTemplateName | null {
  return TEMPLATE_FOR_KIND[kind as AttentionKind] ?? null;
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY `AttentionQueue.runVerb` STILL SWITCHES ON `item.action`
 *
 * It dispatches on the VERB — *Remind*, *Check in*, *Wish*, *Renew*, *Mark*,
 * *Close* — because three of those six are not messages at all, and the
 * component's state machine is built around one result shape for all of them.
 * This table maps the message-shaped half only, so it cannot replace that switch
 * without the queue growing a second dispatch beside it.
 *
 * Where they overlap they agree, and that is the thing to check if either
 * changes: `overdue` → *Remind* → `payment_reminder`, `missed` → *Check in* →
 * `missed_session`, `quiet` → *Check in* → `check_in`, `milestone` → *Wish* →
 * `well_done`. `pack` → *Renew* is the one asymmetry — the queue's verb writes a
 * package row rather than messaging, and this table's `renewal` is what the
 * BUTTON beside it sends. Two different acts about the same pack, which is why
 * *Ending soon* on the price list now draws both.
 * ═══════════════════════════════════════════════════════════════════════════
 */
