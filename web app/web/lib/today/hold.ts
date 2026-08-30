/**
 * The ten seconds, as constants — and the reason they are not in `actions.ts`.
 *
 * `actions.ts` is a `'use server'` module, and such a module may export ONLY
 * async functions: every export becomes a callable server endpoint, so a
 * `const` sitting among them invalidates the whole file rather than just itself.
 * Next says so as "The module has no exports at all", which is a confusing way to
 * report a real rule.
 *
 * These three are read on both sides of the boundary — the browser counts the
 * seconds down, the server decides whether a verb is held at all — so they live in
 * a plain module both can import.
 */

/** How long a message waits before it is actually sent. */
export const HOLD_SECONDS = 10;

/**
 * Which verbs are held, as a SET rather than a boolean flag.
 *
 * The line is not importance, it is **whether somebody outside this account finds
 * out**. `Remind`, `Check in` and `Wish` each hand a message to a client; `Renew`
 * writes a package row, `Mark` stamps a session done and `Close` shuts a log, and
 * none of those three tells anybody. So the first three wait and the last three
 * are instant — a blanket delay would make renewing a pack feel broken, and no
 * delay at all would make an undo an apology.
 *
 * `Assign` is in neither set and correctly so: it is a `<Link>`, and a navigation
 * that waited ten seconds would be a bug rather than a safeguard.
 *
 * `Nudge` was the old name for `Check in` and is deliberately NOT kept as an
 * alias. An alias here would let a stale `action` string flow through unheld —
 * which is the one failure mode this set exists to prevent — and the phone's copy
 * divergence is recorded in `deck.ts` rather than papered over here.
 */
export const HELD_VERBS = new Set(['Remind', 'Check in', 'Wish']);

export interface ActionResult {
  ok: boolean;
  /** What to tell the trainer. Present on failure, and on the WhatsApp handoff. */
  message?: string;
  /**
   * `wa.me/…`. The backend renders the message and logs the nudge; it does not
   * send it. Handed back so the browser can open it — which is the one part of
   * "sending a WhatsApp" that cannot happen on a server.
   */
  whatsappUrl?: string;
}
