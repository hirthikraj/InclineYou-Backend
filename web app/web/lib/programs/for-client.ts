'use client';

import { useSearchParams } from 'next/navigation';

/**
 * THE CLIENT A SHELF VISIT IS FOR. The client file's *Assign* verbs used to be plain links to
 * `/programs/templates`, which forgot who the plan was for: the page that opened named nobody, the rail
 * jumped to Fitness, and the trainer had to re-find the client (and recall their week) at the end.
 * `?client=<id>` is carried across the shelf and into the blueprint so the assign panel opens already
 * pointing at them. An id, never a name — no personal data in a URL.
 */
export function useForClient(): string | null {
  return useSearchParams().get('client');
}

/** `/programs/abc` → `/programs/abc?client=…` when there is a client to keep. */
export function withClient(href: string, clientId: string | null): string {
  return clientId ? `${href}${href.includes('?') ? '&' : '?'}client=${encodeURIComponent(clientId)}` : href;
}
