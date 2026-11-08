import 'server-only';

import { headers } from 'next/headers';

/**
 * The browser's address, passed on to the backend.
 *
 * Only this server calls the API, so to the backend every web user arrives from
 * one address — this server's. Its abuse guard blocks an address for a day after
 * codes for five different numbers in an hour, so without this the sixth person
 * to sign in would lock everybody out. The backend (`ClientAddress`) believes the
 * address only alongside the shared secret, because anyone can set a header.
 *
 * The address is the RIGHTMOST `x-forwarded-for` entry: the one appended by the
 * proxy directly in front of this server. Every entry to its left came from the
 * caller and can say anything. With more than one proxy in front of Next this
 * is the nearest proxy's view, which is still one address per real connection.
 *
 * The address is sent only with the secret (unset in development); the User-Agent always. Nothing outside a request.
 */
export async function forwardedFor(): Promise<Record<string, string>> {
  let h: Awaited<ReturnType<typeof headers>>;
  try {
    h = await headers();
  } catch {
    return {};
  }
  // The browser's User-Agent, so a session minted here records the browser and not this server ("node") — the signed-in
  // devices list names each device from it (8 Nov 2026). Needs no secret: the backend only shows it back to the account's
  // own owner (and cuts it to 300 characters), and the browser could have sent any string anyway.
  const ua = h.get('user-agent')?.trim();
  const agent: Record<string, string> = ua ? { 'user-agent': ua } : {};

  const secret = process.env.INCLINEYOU_PROXY_SECRET;
  if (!secret) return agent;
  const ip = h.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).at(-1)
    ?? h.get('x-real-ip')?.trim();
  if (!ip) return agent;
  return { ...agent, 'x-inclineyou-forwarded-for': ip, 'x-inclineyou-proxy-key': secret };
}
