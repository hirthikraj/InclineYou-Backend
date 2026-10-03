import { redirect } from 'next/navigation';

import { clearSitting } from '@/lib/auth/session';
import { dropSkipped } from '@/lib/setup/skipped';

/**
 * `/sign-in/expired` — a session the server no longer honours.
 *
 * `SESSION_EXPIRED` (past its window) or `SESSION_REVOKED` (signed out from
 * another device, or by an account change) end up here from `/sign-in`, which
 * asks the server before it bounces anybody into the app. It is a route handler
 * and not a page because it has to DELETE cookies, which a render cannot — and
 * the cookie has to go, or `/sign-in` would see a token, bounce to `/today`, and
 * the guard there would bounce straight back: a loop with no exit.
 *
 * Then it hands over to `/sign-in` with a line saying which way it went, so the
 * person is told why they are looking at a phone field rather than their diary.
 */
export async function GET(request: Request) {
  const why = new URL(request.url).searchParams.get('why') === 'revoked' ? 'revoked' : 'expired';
  await clearSitting();
  await dropSkipped();
  redirect(`/sign-in?why=${why}`);
}
