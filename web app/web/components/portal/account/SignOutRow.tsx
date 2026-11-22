'use client';

import { useTransition } from 'react';

import { signOut } from '@/lib/auth/actions';
import { Button } from '@/web-components/ui/Button';

/**
 * Sign out of this browser, from the account screen (22 Nov 2026). On a desk it is also in the rail's account menu;
 * on a phone this is the only door — the portal's bottom bar has four destinations and no menu. Quiet, at the foot:
 * it ends a sitting, it does not delete anything, and it should not compete with the rows above it.
 */
export function SignOutRow() {
  const [pending, start] = useTransition();
  return (
    <div className="pacct__out">
      <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await signOut(); })}>
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  );
}
