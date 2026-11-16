/**
 * A client who was deleted — and so erased (backend `erase_client()`, 9 Nov 2026).
 *
 * Their money stays in the books as amounts and dates, because tax law requires it, but
 * their name does not: the money reads (`GET /v1/payments`, the activity feed, the
 * practice report) answer `clientName: null` for them, and Business's roster lookups
 * simply do not find them. Every screen draws the same words, and none of them links
 * to a client file that no longer exists or offers a WhatsApp message to a number that
 * was erased.
 */
export const DELETED_CLIENT = 'Deleted client';

/** The name a money read answered, or the label for a client who was deleted. */
export function clientLabel(name: string | null | undefined): string {
  return name?.trim() || DELETED_CLIENT;
}
