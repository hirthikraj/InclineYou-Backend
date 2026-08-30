/**
 * NUDGES — the shapes, and the one product rule that shaped all of them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THERE IS NO NUDGES SCREEN, AND THAT IS THE FEATURE
 *
 * A nudge belongs next to the thing that triggered it. Making a trainer navigate
 * to a Nudges destination to follow up is exactly the friction that stops the
 * follow-up happening — so the buttons are on Today's session rows, the attention
 * queue, the client rows, the dues list, the packs that are ending and the
 * sessions nobody turned up to, and `/nudges` is a permanent redirect into
 * Settings.
 *
 * What is left when the sending moves onto the rows is the WORDING, which is a
 * setting: written once, edited rarely, read by every button above. That is
 * `/settings/nudges`, and it is the only nudge screen in the product.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WEB HOLDS NO COPY OF ANY TEMPLATE
 *
 * Not the wording, not the labels, not the variable list. All three come down
 * from `GET /v1/nudge-templates`, which merges the trainer's overrides with the
 * backend's `NudgeTemplateCatalog`. The root `CLAUDE.md` opens with what happens
 * when a policy number lives in three files — the OTP resend ladder — and eight
 * message bodies is a worse version of the same trap, because a drifted sentence
 * is one a client actually receives.
 *
 * The one thing declared here is the SET OF NAMES, because TypeScript needs a
 * union to check a call site against. If the backend adds a ninth, this file
 * gains a string and nothing else.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DELIVERY IS A `wa.me` DEEP LINK AND NOTHING ELSE SENDS
 *
 * The server renders the message, logs that it was drafted, and hands back
 * `https://wa.me/91XXXXXXXXXX?text=…`. The browser opens it; WhatsApp opens with
 * the message typed into the box; the trainer reads it and presses send.
 *
 * That is the right delivery for v1 and it is not a compromise. It costs
 * nothing, needs no Business API approval, no Meta trust tier and no template
 * review — and a message from the trainer's own number lands in a thread the
 * client already has open, where a message from a platform number lands beside
 * the delivery notifications. Automation would make this worse. Scheduled and
 * automatic nudges are v2, behind the Business API's trust tiers, and they are
 * v2 on purpose rather than for want of time.
 */

/**
 * The catalogue's names — the vocabulary `POST /v1/clients/{id}/nudge` speaks,
 * the key of a `nudge_template` override, and `nudge_log.template_name`.
 */
export type NudgeTemplateName =
  | 'renewal'
  | 'payment_reminder'
  | 'missed_session'
  | 'well_done'
  | 'session_summary'
  | 're_engagement'
  | 'check_in'
  | 'session_reminder';

/**
 * Every name the server knows, in the library screen's order.
 *
 * Used to sort a response and to reject a nonsense route parameter. It is NOT
 * used to render the library — the response is, so a template added on the
 * server appears here without a web deploy, at the bottom of the list.
 */
export const TEMPLATE_ORDER: NudgeTemplateName[] = [
  'renewal',
  'payment_reminder',
  'missed_session',
  'well_done',
  'session_summary',
  're_engagement',
  'check_in',
  'session_reminder',
];

/** What the trainer types, and what it becomes. Printed beside the editor. */
export interface NudgeVariable {
  /** `{name}` — braces included, so a chip can be inserted verbatim. */
  token: string;
  meaning: string;
}

export interface NudgeTemplate {
  name: string;
  label: string;
  /** One sentence on when a trainer would send it. */
  purpose: string;
  /** The wording that will actually be sent — theirs, or the built-in. */
  body: string;
  /** False once they have saved their own. Gates *Reset*. */
  isDefault: boolean;
  variables: NudgeVariable[];
}

/**
 * One row of the follow-up history.
 *
 * `message` is null on every row written before V32 added the column, and it is
 * deliberately left as an absence rather than re-rendered from `templateName`:
 * the wording belongs to the trainer now, so re-rendering March's reminder in
 * August's words would put a sentence in the history that was never sent.
 */
export interface NudgeLogEntry {
  id: string;
  clientId: string;
  clientName: string;
  templateName: string;
  /** Resolved server-side, so a renamed template renames every history at once. */
  templateLabel: string;
  channel: string;
  status: string;
  message: string | null;
  sentAt: number;
}

/** What a send answers with. `whatsappUrl` is the whole point of the call. */
export interface NudgeSendResult {
  ok: boolean;
  /** Present on failure — a sentence the server wrote, where it wrote one. */
  message?: string;
  whatsappUrl?: string;
  /** The draft, so a screen can show what it handed over. */
  draft?: string;
  sentAt?: number;
}
