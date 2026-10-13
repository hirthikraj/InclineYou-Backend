'use client';

import { useState, useTransition } from 'react';

import { signOut } from '@/lib/auth/actions';
import { acknowledgeRemoval } from '@/lib/portal/profile-actions';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';

/**
 * The removed wall. Before it is seen it says what happened, by whom and when, and the one thing to press is *Got it* — which records
 * that the client has read it (`POST /v1/portal/ack`, once). After it, the same screen is the honest end of the road: nobody is coaching
 * this number, and the way back is a new invite from a trainer. Never an error tone: nothing is broken.
 */
export function RemovedWall({ trainerName, by, on, seen }: { trainerName: string; by: 'trainer' | 'client'; on: string | null; seen: boolean }) {
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  function gotIt() {
    setFailure(null);
    start(async () => {
      const res = await acknowledgeRemoval();
      if (!res.ok) setFailure(res.message ?? 'We couldn’t record that just now.');
    });
  }

  return (
    <>
      <h2 className="stp__hd" style={{ fontSize: 26 }}>
        {by === 'client' ? `You left ${trainerName}` : `${trainerName} ended this arrangement`}
      </h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        {on ? <>That was on <b>{on}</b>. </> : null}
        {by === 'client' ? 'Nothing more is shared with them.' : 'You are not being asked to do anything.'}
      </p>

      <Card style={{ marginTop: 20 }}>
        <Card.Body>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-ink)' }}>{seen ? 'Nobody is coaching you right now' : 'What happens next'}</p>
          <p className="small" style={{ marginTop: 8 }}>
            To train with someone, ask them to add this number — you will get a personal link to open, and nothing is shared until you accept it.
          </p>
        </Card.Body>
      </Card>

      <div aria-live="polite">{failure ? <Message tone="err" className="mt3">{failure}</Message> : null}</div>

      {seen ? null : (
        <Button variant="primary" size="lg" style={{ width: '100%', marginTop: 16 }} disabled={pending} onClick={gotIt}>
          {pending ? 'Saving…' : 'Got it'}
        </Button>
      )}
      <Button variant={seen ? 'secondary' : 'ghost'} style={{ marginTop: 10 }} disabled={pending} onClick={() => start(async () => { await signOut(); })}>
        Sign out
      </Button>
    </>
  );
}
