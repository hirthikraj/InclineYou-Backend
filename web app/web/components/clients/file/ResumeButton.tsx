'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { resumeClient } from '@/lib/clients/status-actions';
import { Button } from '@/web-components/ui/Button';

/**
 * THE PRIMARY ON A PAUSED CLIENT'S FILE.
 *
 * Overview offered a lime *Book a session* to somebody who is on hold, under a
 * sentence about sessions "paid for and none booked" — the wrong question to put in
 * front of a trainer whose client is away. The one thing that changes a paused
 * client's situation is bringing them back, and the file had no way to do it: the
 * only resume was a verb on the roster's row menu.
 *
 * The same write the roster menu makes (`resumeClient`), with no confirm for the
 * reason the roster has none: it is the cheap direction — a client can be paused
 * again — and it does not touch the pack, whose clock the server restarts.
 */
export function ResumeButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await resumeClient(clientId);
            if (!result.ok) setError(result.message ?? 'That did not save. Nothing changed.');
            else router.refresh();
          })
        }
      >
        {pending ? 'Resuming…' : 'Resume'}
      </Button>
      {error && (
        <span className="small" role="alert" style={{ color: 'var(--tx-danger)' }}>
          {error}
        </span>
      )}
    </>
  );
}
