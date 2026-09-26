/**
 * THE BELL, AND THE ONE LINE THAT KEEPS IT FROM BECOMING A SECOND TODAY.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A NOTIFICATION IS AN EVENT. THE QUEUE IS A STATE.
 *
 * `lib/today/deck.ts` already computes eleven attention bands — a pack that has
 * run out, an invoice eleven days late, a client who has gone quiet — and puts
 * the verb that fixes each one on its row. Those are STATE: they were not true
 * at a moment, they are true until somebody acts, and re-reading them tomorrow
 * gives the same list.
 *
 * This is the other half. Somebody else did something, at a time, and the
 * trainer was not looking: a client called off Thursday, the gym's front desk
 * took ₹9,000, a coach took a client onto their own roster. It happened once,
 * it is read once, and then it is history.
 *
 * The distinction is not academic. `AttentionItem` carries an `at` field whose
 * own comment reads *"so a notification centre can date it"* — an invitation to
 * make the bell a dated copy of the queue, which is the one thing it must not
 * be. Two surfaces listing the same rows means every verb in the product has
 * two homes and the trainer has to clear both to know what is left. So:
 *
 *   Today's queue   the WORKLIST.  Carries verbs. Rows leave when fixed.
 *   The bell        the RECORD.    Carries no verb. Rows leave when read.
 *
 * A notification never offers to change the book. It names what happened and
 * links to the thing it happened to, and the work — if there is work — arrives
 * in the queue on its own, computed from the same row.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THERE ARE FOUR KINDS AND NOT FOURTEEN
 *
 * Every kind here is something the product can actually observe. That test is
 * the same one `TopBar.tsx` applies to the sync pill it refuses to draw — a
 * control that reports a state the architecture cannot produce is worse than no
 * control — and it is why there is no *client replied to your reminder*: nudges
 * go out through `wa.me`, WhatsApp does not tell this app what came back, and
 * `lib/nudges/types.ts` says so in its own docstring.
 *
 * Two of the four — `cancelled` and `metric` — are things a CLIENT does, and
 * the client half of this product is currently one `NotBuilt` route. They are
 * kept anyway, and that is a different call from the sync pill's: the pill
 * described an architecture the web app has DECIDED AGAINST, so "6 queued"
 * could never be true; the client portal is a screen the design set has already
 * drawn (`webapp-client-portal.html`) and the product has not reached yet. The
 * mock seeds both so the panel can be reviewed against them.
 */
export type NotificationKind =
  /** The gym's front desk took money, or a client's UPI landed. */
  | 'payment'
  /** A client called off a session. */
  | 'cancelled'
  /** A client's weight was recorded. */
  | 'metric'
  /** A teammate or the team's admin moved a client. */
  | 'team';

/** What `/v1/notifications` sends. Facts, never a rendered sentence — see
 *  `mock/types.ts` for the argument, and `copy.ts` for what writes the line. */
export interface Notification {
  id: string;
  kind: NotificationKind;
  clientId: string | null;
  clientName: string | null;
  /** Whole rupees. `payment` only. */
  amount: number | null;
  /** The moment the event is ABOUT, when that is not the moment it happened. */
  subjectAt: number | null;
  /** How a payment arrived, a coach's name, a reading and its unit. */
  text: string | null;
  at: number;
  readAt: number | null;
}

/**
 * The five tones §04 gives `.ntf__ic`, and the one rule behind the mapping:
 * **nothing here is `danger`.** A notification is never an emergency — the
 * emergencies are in the attention queue, where the verb that ends them is. A
 * red plate on a row whose only affordance is *go and look* is a promise the
 * row cannot keep.
 */
export const KIND_TONE: Record<NotificationKind, string> = {
  payment: 'money',
  cancelled: 'diary',
  metric: 'floor',
  team: 'team',
};

/**
 * Where the row goes when it is opened.
 *
 * Every one of them lands on the screen that holds the FULL fact, not on a
 * detail view of the notification itself — there is no such screen and there
 * should not be. A payment opens the client's payments tab, where the pack and the
 * gym's cut are; a cancellation opens their file, where the rest of the week
 * is. The notification is the pointer, and a pointer that leads to a copy of
 * itself has not moved anybody forward.
 *
 * `null` for a row with no client, which the panel renders as a line rather
 * than as a link — a dead link is worse than a fact you cannot click.
 */
export function hrefFor(n: Notification): string | null {
  if (!n.clientId) return null;
  switch (n.kind) {
    case 'payment':
      return `/clients/${n.clientId}/payments`;
    case 'metric':
      return `/clients/${n.clientId}/progress`;
    case 'cancelled':
    case 'team':
      return `/clients/${n.clientId}`;
  }
}

/**
 * Unread first is NOT the sort — see `copy.ts`. This is only the count.
 *
 * Generic over anything with a `readAt`, because the bell's count is taken from
 * the rows the HOST is holding, and since the client portal got a feed of its
 * own those are `NotificationView`s rather than wire rows. Nothing about
 * counting what has not been read is a fact about whose feed it is.
 */
export function unreadCount(rows: { readAt: number | null }[]): number {
  return rows.reduce((n, row) => (row.readAt ? n : n + 1), 0);
}
