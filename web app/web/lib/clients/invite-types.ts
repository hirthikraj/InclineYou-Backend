/**
 * THE INVITE WIRE — api-contract 1.2, tr-a1…tr-a3.
 *
 * Not `server-only`: the Invitations screen and the send sheet are client components and import these shapes, and
 * the one helper here (`waUrl`) runs in the browser, because the trainer edits the message there and the link has to
 * follow the edit.
 *
 * Nothing here is a secret except `InviteCreatedWire.link`, which the server returns once and never again. It is held
 * in component state for as long as the sheet is open and is not written to the URL, to storage or to the console log.
 */

/** `expired` is derived by the server from `expiresAt`; it is never a stored state. */
export type InviteState = 'pending' | 'expired' | 'accepted' | 'declined' | 'revoked';

export interface InviteWire {
  id: string;
  clientId: string;
  state: InviteState;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  declinedAt: number | null;
  /** `not_for_me | age_requirement`. */
  declineReason: string | null;
  revokedAt: number | null;
  /** `replaced | number_changed | trainer | client_removed | erased`. */
  revokedReason: string | null;
}

export interface InviteRowWire extends InviteWire {
  client: { id: string; name: string | null; phone: string | null };
}

export interface InviteCounts {
  pending: number;
  expired: number;
  accepted: number;
  declined: number;
  revoked: number;
}

/** `GET /v1/client-invites` */
export interface InviteListWire {
  items: InviteRowWire[];
  counts?: InviteCounts;
  nextCursor: string | null;
}

/** `POST /v1/clients/{id}/invites` — `link` is the raw token's only appearance. */
export interface InviteCreatedWire {
  invite: InviteWire;
  client: { id: string; name: string | null; membershipStatus: string };
  link: string;
  draft: string;
  waUrl: string;
}

/** The filters the screen offers, in tab order. The default is what needs the trainer. */
export const INVITE_TABS: { key: string; label: string; states: string }[] = [
  { key: 'waiting', label: 'Waiting', states: 'pending,expired' },
  { key: 'joined', label: 'Joined', states: 'accepted' },
  { key: 'declined', label: 'Declined', states: 'declined' },
  { key: 'withdrawn', label: 'Withdrawn', states: 'revoked' },
];

/**
 * The `wa.me` link for a message the trainer may have edited. Digits only for the number and `%20` for a space, which
 * is what the server's own URL does — so an unedited message reproduces `waUrl` exactly.
 */
export function waUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
