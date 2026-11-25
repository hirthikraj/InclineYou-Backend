/**
 * A UUID v4 for an id the BROWSER mints (an idempotency key kept across retries).
 *
 * `crypto.randomUUID` exists only in a secure context — https, or `localhost` — so a phone reaching the dev server by its LAN
 * address (`http://192.168.x.x:3100`) has none, and a sheet minting with it crashed on open (found rendering "I've paid",
 * 23 Nov 2026). `crypto.getRandomValues` is available everywhere, so it is the fallback. No `server-only` (trap 18).
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
