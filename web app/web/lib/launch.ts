/**
 * WHAT IS SWITCHED OFF FOR LAUNCH, AND WHY — one file, so turning a channel on is
 * one line and one review rather than a hunt through four screens.
 *
 * Pure constants, no `server-only` (AGENTS trap 18): read by server pages and
 * client components alike.
 */

/**
 * Session reminders from InclineYou's WhatsApp number (PRD D-17).
 *
 * The settings, the per-client exclusion, the client's opt-in and the delivery log
 * (`client_notification`, V26's status webhook) are all built — but nothing queues
 * a reminder when a session is booked and nothing sends one. Decided 6 Nov 2026:
 * launch with the switch visible, OFF and labelled *Coming soon*, so no trainer
 * believes their clients are being reminded. Turn this on in the same change that
 * ships the sender, the queueing on book/move/cancel, and the approved WhatsApp
 * utility template.
 */
export const SESSION_REMINDERS_SENDING = false;

/**
 * Web push to a client's device. The portal can collect a push subscription and the
 * backend stores it, but there is no push sender. Off for launch for the same reason
 * as reminders: an offer to notify that never notifies is worse than no offer.
 */
export const PUSH_SENDING = false;
