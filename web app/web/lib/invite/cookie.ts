import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { cookies } from 'next/headers';

/**
 * THE INVITE SITTING — what the page remembers between *send me a code* and *let me in*.
 *
 * A client's date of birth, the id of the code that was sent for them and the notice they agreed to have to survive one page
 * load and nothing longer. The contract is explicit about where they do not go: never a URL (a URL is read aloud, pasted into
 * WhatsApp and logged by every proxy), and not plain in a cookie either, because a date of birth is personal data and a cookie
 * jar is read by extensions. So it is a sealed cookie: AES-256-GCM, httpOnly, scoped to `/invite`, thirty minutes.
 *
 * The key is `INVITE_COOKIE_SECRET`. In production a missing key is a refusal to seal, not a quiet fallback to a published
 * one; in development a fixed key keeps `next dev` working without setup.
 */
const COOKIE = 'inclineyou_invite';
const MAX_AGE = 30 * 60;
const SECURE = process.env.NODE_ENV === 'production';

export interface InviteSitting {
  /** The link's token — the credential for this sitting, so a cookie for one link is useless on another. */
  token: string;
  /** The code that was sent. Replaced by every resend; only the newest can be verified. */
  requestId: string;
  /** `YYYY-MM-DD`. Sent back to accept, which re-checks it against the database's calendar. */
  dateOfBirth: string;
  policyVersion: string;
  /** Epoch ms, for the countdown beside *Send again*. */
  resendAt: number;
}

function key(): Buffer {
  const secret = process.env.INVITE_COOKIE_SECRET;
  if (!secret) {
    if (SECURE) throw new Error('INVITE_COOKIE_SECRET is not set: refusing to seal an invite sitting with a development key.');
    return createHash('sha256').update('inclineyou-dev-invite-cookie').digest();
  }
  return createHash('sha256').update(secret).digest();
}

function seal(value: InviteSitting): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function open(sealed: string): InviteSitting | null {
  try {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const v = JSON.parse(text) as Partial<InviteSitting>;
    return typeof v.token === 'string' && typeof v.requestId === 'string' && typeof v.dateOfBirth === 'string'
      && typeof v.policyVersion === 'string' && typeof v.resendAt === 'number'
      ? (v as InviteSitting)
      : null;
  } catch {
    // Tampered, truncated, or sealed under another key: all the same answer, which is a fresh start.
    return null;
  }
}

export async function setSitting(value: InviteSitting): Promise<void> {
  (await cookies()).set(COOKIE, seal(value), {
    httpOnly: true,
    secure: SECURE,
    // `lax`: the link arrives from WhatsApp, a cross-site navigation, and `strict` would drop the cookie on that first hop.
    sameSite: 'lax',
    path: '/invite',
    maxAge: MAX_AGE,
  });
}

/** The sitting for THIS link, or null — a cookie sealed for another token is not this client's. */
export async function getSitting(token: string): Promise<InviteSitting | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const v = raw ? open(raw) : null;
  return v && v.token === token ? v : null;
}

export async function clearSitting(): Promise<void> {
  (await cookies()).set(COOKIE, '', { path: '/invite', maxAge: 0 });
}
