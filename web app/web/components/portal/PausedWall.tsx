'use client';

import { useTransition } from 'react';

import { signOut } from '@/lib/auth/actions';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';

/**
 * The paused wall: a fact and a way to the person who can change it, never a fault. The trainer paused this (a holiday, an injury, a
 * gap in payment — we do not say which and the client's screen must not guess), so the screen names who to talk to and, when the trainer
 * set one, the date it lifts. `whatsappUrl` carries no text and gets none: the client writes their own first line.
 */
export function PausedWall({ trainerName, until, whatsappUrl }: { trainerName: string; until: string | null; whatsappUrl: string | null }) {
  const [pending, start] = useTransition();

  return (
    <>
      <h2 className="stp__hd" style={{ fontSize: 26 }}>
        Your training is on hold
      </h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        {trainerName} has paused your plan{until ? <> until <b>{until}</b></> : ''}. Your sessions and history are exactly where you left them.
      </p>

      <Card style={{ marginTop: 20 }}>
        <Card.Body>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-ink)' }}>To pick it up sooner</p>
          <p className="small" style={{ marginTop: 8 }}>
            Ask {trainerName}. They can resume it from their side, and it opens straight away.
          </p>
        </Card.Body>
      </Card>

      {whatsappUrl ? (
        <Button variant="primary" size="lg" href={whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ width: '100%', marginTop: 16 }}>
          Message {trainerName} on WhatsApp
        </Button>
      ) : null}
      <Button variant="ghost" style={{ marginTop: 10 }} disabled={pending} onClick={() => start(async () => { await signOut(); })}>
        Sign out
      </Button>
    </>
  );
}
