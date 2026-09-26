'use client';

import { useState, useTransition } from 'react';

import { sendNudge } from '@/lib/nudges/actions';
import { useLastContact } from './LastContact';
import { contactedLabel, withinCooldown } from '@/lib/nudges/cooldown';
import type { NudgeTemplateName } from '@/lib/nudges/types';

/**
 * THE BUTTON. One component, every surface that knows about a client.
 *
 * Today's session rows, the attention queue's neighbours, the roster, the pending
 * list, the packs that are ending, the sessions nobody turned up to, the client
 * file. That is the whole feature: **a nudge belongs next to the thing that
 * triggered it**, and a trainer who has to navigate somewhere to follow up does
 * not follow up.
 *
 * ── WHAT PRESSING IT DOES ────────────────────────────────────────────────────
 *
 *   1. a server action drafts the message from the trainer's own template and
 *      the client's live figures, and logs that it was drafted;
 *   2. the browser opens `wa.me/91XXXXXXXXXX?text=…`;
 *   3. WhatsApp opens with the message typed in the box and the trainer reads it
 *      and presses send.
 *
 * Step 3 is not a limitation to be engineered away. A message from the trainer's
 * own number lands in a thread the client already has open; one from a platform
 * number lands beside the delivery notifications. The composer is also the review
 * step, which is why this button is not held for ten seconds the way the queue's
 * verbs are — see `lib/nudges/actions.ts`.
 *
 * ── THE POPUP MAY BE BLOCKED, AND THE ANSWER IS A LINK ───────────────────────
 *
 * `window.open` runs after an `await`, so it is outside the click's task and a
 * browser is entitled to refuse it. It usually does not — the click is still the
 * ancestor gesture — but a refusal would be invisible: the row would say sent and
 * nothing would have opened. So the sent state ALWAYS renders a real
 * *Open WhatsApp* link as well. A trainer whose popup blocker fired has one click
 * to recover, and one who watched the tab open ignores it.
 *
 * ── AND IT SAYS WHEN THEY WERE LAST CONTACTED ────────────────────────────────
 *
 * `lastNudgedAt` puts *Reminded 2 days ago* under the button and tones it down.
 * It does NOT disable it: the trainer knows things the log does not, and the
 * cooldown is enforced by the queue going quiet rather than by a refusal. The
 * whole argument is in `lib/nudges/cooldown.ts`.
 */

const WHATSAPP_GLYPH = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
  </svg>
);

/**
 * The verb, per template.
 *
 * Written here rather than taken from the template's own `label`, because the
 * two answer different questions. The library calls the row *Missed sessions* —
 * a name for a thing a trainer edits. A button has to say what pressing it does,
 * and *Check in* is that.
 *
 * `Check in` covers `missed_session` and `check_in` deliberately, and the
 * TEMPLATE is what differs: `check_in` asks how the week is going, which is a
 * question, and `missed_session` names what happened. `lib/today/deck.ts` made
 * the same call for the same reason — two rows offering *Nudge* and *Check in*
 * for the identical act is what the phrasing helpers exist to prevent.
 */
const VERB: Record<NudgeTemplateName, string> = {
  renewal: 'Remind',
  payment_reminder: 'Remind',
  missed_session: 'Check in',
  well_done: 'Wish',
  session_summary: 'Send summary',
  re_engagement: 'Check in',
  check_in: 'Check in',
  session_reminder: 'Confirm',
};

type State =
  | { kind: 'idle' }
  | { kind: 'sent'; whatsappUrl: string }
  | { kind: 'error'; message: string };

export interface NudgeButtonProps {
  clientId: string;
  /** Named in the accessible label and in the sent line — a mis-pressed send is
      the one failure this button cannot undo, so it says who it is about. */
  clientName: string;
  template: NudgeTemplateName;
  /** Overrides `VERB`. Used where the row already says what it is about. */
  label?: string;
  /** Extra `btn` classes. Defaults to a small secondary. */
  className?: string;
  /** No text, glyph only. The accessible name still carries the whole verb. */
  iconOnly?: boolean;
  /**
   * Epoch ms of the last nudge to this client.
   *
   * Usually omitted: the button reads `LastContactProvider` instead, because on
   * three of the six surfaces it lives four rows deep inside a screen whose rows
   * are nested functions. Pass it only where a caller genuinely holds a better
   * answer than the page's map.
   */
  lastNudgedAt?: number | null;
  /** Injected so a server-rendered row and its hydration agree on the date. */
  now?: number;
  /** Drawn under the button rather than beside it. Table cells want `false`. */
  showContactedNote?: boolean;
  /**
   * An ARIA role for the control itself — `'menuitem'` and nothing else so far.
   *
   * The roster's row menu is a `role="menu"` whose arrow keys walk
   * `[role="menuitem"]:not([disabled])`, so a nudge dropped into it without one
   * is a row the keyboard silently steps over. Passing the role rather than
   * rebuilding the send here is the whole point of this component existing once:
   * the popup-block recovery, the cooldown note and the error sentence come with
   * it. It lands on the SENT state's anchor too, because that anchor is the same
   * row in the same list a moment later.
   */
  role?: string;
}

export function NudgeButton({
  clientId,
  clientName,
  template,
  label,
  className = 'btn btn--sm btn--secondary',
  iconOnly = false,
  lastNudgedAt = null,
  now,
  showContactedNote = true,
  role,
}: NudgeButtonProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();
  const ambient = useLastContact(clientId);

  const verb = label ?? VERB[template];
  /*
   * Both come from the page rather than from `Date.now()`, so a server-rendered
   * row and its hydration produce the same string. An explicit prop wins over
   * the provider; a screen with neither draws no note at all, which is the
   * correct degradation — `/packages` and `/sessions` deliberately do not spend
   * a request on the history, and their buttons still send.
   */
  const at = now ?? ambient.now;
  const seenAt = lastNudgedAt ?? ambient.at;
  /* Both halves are required: a stamp with no clock to measure it against is a
     note this component cannot honestly draw, and reading the clock here would
     be a hydration mismatch on top of an impure render. */
  const contacted = seenAt != null && at != null && withinCooldown(seenAt, at);

  const press = () => {
    setState({ kind: 'idle' });
    startTransition(async () => {
      const result = await sendNudge(clientId, template);
      if (result.ok && result.whatsappUrl) {
        /* `noopener` is not optional: a window opened without it can reach back
           through `window.opener`, and the destination here is a third party. */
        window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
        setState({ kind: 'sent', whatsappUrl: result.whatsappUrl });
      } else {
        setState({ kind: 'error', message: result.message ?? 'Something went wrong.' });
      }
    });
  };

  if (state.kind === 'sent') {
    return (
      <span className="ndg ndg--sent">
        <a
          className={className}
          href={state.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          role={role}
        >
          {WHATSAPP_GLYPH}
          {!iconOnly && 'Open WhatsApp'}
        </a>
        {showContactedNote && (
          <span className="ndg__note ok">Drafted for {clientName}</span>
        )}
      </span>
    );
  }

  return (
    <span className="ndg">
      <button
        className={className}
        type="button"
        role={role}
        onClick={press}
        disabled={pending}
        title={`${verb} — ${clientName} on WhatsApp`}
        aria-label={`${verb} ${clientName} on WhatsApp`}
      >
        {WHATSAPP_GLYPH}
        {!iconOnly && (pending ? 'Drafting…' : verb)}
      </button>
      {state.kind === 'error' && <span className="ndg__note err">{state.message}</span>}
      {state.kind === 'idle' && contacted && showContactedNote && seenAt != null && at != null && (
        <span className="ndg__note">Messaged {contactedLabel(seenAt, at)}</span>
      )}
    </span>
  );
}
