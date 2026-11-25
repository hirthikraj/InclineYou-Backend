import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { cookies } from 'next/headers';

/**
 * THE JOIN SITTING — the code's id and the number it went to, between *Send me a code* and *Send my request*.
 *
 * The invite's sitting (`lib/invite/cookie.ts`) and for the same reasons: never in a URL, never in script the page can read.
 * Sealed with AES-256-GCM under a key derived from `INVITE_COOKIE_SECRET` with its own label, httpOnly, scoped to `/join`,
 * thirty minutes. What the person typed into the form stays in the form; only what the server answered is kept here.
 */
const COOKIE = 'inclineyou_join';
const MAX_AGE = 30 * 60;
const SECURE = process.env.NODE_ENV === 'production';

export interface JoinSitting {
  slug: string;
  requestId: string;
  phone: string;
  resendAt: number;
}

function key(): Buffer {
  const secret = process.env.INVITE_COOKIE_SECRET;
  if (!secret) {
    if (SECURE) throw new Error('INVITE_COOKIE_SECRET is not set: refusing to seal a join sitting with a development key.');
    return createHash('sha256').update('inclineyou-dev-join-cookie').digest();
  }
  return createHash('sha256').update(`join:${secret}`).digest();
}

function seal(value: JoinSitting): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function open(sealed: string): JoinSitting | null {
  try {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const v = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as Partial<JoinSitting>;
    return typeof v.slug === 'string' && typeof v.requestId === 'string' && typeof v.phone === 'string' && typeof v.resendAt === 'number'
      ? (v as JoinSitting)
      : null;
  } catch {
    return null;
  }
}

export async function setJoinSitting(value: JoinSitting): Promise<void> {
  (await cookies()).set(COOKIE, seal(value), { httpOnly: true, secure: SECURE, sameSite: 'lax', path: '/join', maxAge: MAX_AGE });
}

/** The sitting for THIS page and number, or null. */
export async function getJoinSitting(slug: string, phone: string): Promise<JoinSitting | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const v = raw ? open(raw) : null;
  return v && v.slug === slug && v.phone === phone ? v : null;
}

export async function clearJoinSitting(): Promise<void> {
  (await cookies()).set(COOKIE, '', { path: '/join', maxAge: 0 });
}
