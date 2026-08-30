import 'server-only';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.XREP_API_URL ?? 'http://localhost:8080';

/** Fetches the signed-in trainer's display name for the persistent shell.
 *  Returns empty string on any failure — the Rail renders without a name
 *  rather than crashing the layout. */
export async function getTrainerName(): Promise<string> {
  const token = await getToken();
  if (!token) return '';
  try {
    const res = await fetch(`${BASE}/v1/trainers/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return '';
    const data = await res.json();
    return typeof data?.name === 'string' ? data.name : '';
  } catch {
    return '';
  }
}
