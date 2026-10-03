'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { abandonPending } from '@/lib/auth/actions';
import { IconUser } from './Icons';
import { TrustLine } from './TrustLine';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';

/**
 * `/sign-in/client` — a number that is only somebody's client.
 *
 * The code was right and nothing is wrong with the number: client sign-in is
 * not open yet (api-contract R60, `403 CLIENT_SIGN_IN_UNAVAILABLE`), and the
 * backend minted no credential. So the screen states the fact, says what the
 * client can do — their trainer shares the way in when it opens — and has no
 * error tone anywhere on it.
 *
 * There is deliberately no "I'm a trainer" here. A number that is a trainer's
 * AND a client's signs in as the trainer; one that is only a client's has not
 * asked to coach anybody.
 */
export function ClientSignIn() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function differentNumber() {
    if (pending) return;
    startTransition(async () => {
      await abandonPending();
      router.push('/sign-in');
    });
  }

  return (
    <>
      <h2 className="stp__hd" style={{ fontSize: 26 }}>
        Client sign-in opens soon
      </h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        Your trainer will share it. Nothing is wrong with your number or the code you just used.
      </p>

      <Card style={{ marginTop: 20 }}>
        <Card.Body style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
          <span
            style={{
              width: 38,
              height: 38,
              flex: '0 0 auto',
              borderRadius: 'var(--tx-r2)',
              background: 'var(--tx-surface-2)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--tx-ink-2)',
            }}
          >
            <IconUser size={19} />
          </span>
          <span>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-ink)' }}>
              What happens next
            </p>
            <p className="small" style={{ marginTop: 8 }}>
              InclineYou works from your trainer&rsquo;s roster. Your trainer already has this
              number; when client sign-in is open they will send you the link.
            </p>
          </span>
        </Card.Body>
      </Card>

      <Button
        variant="secondary"
        size="lg"
        style={{ marginTop: 16 }}
        onClick={differentNumber}
        disabled={pending}
      >
        {pending ? 'Starting again…' : 'Use a different number'}
      </Button>

      <TrustLine>
        You are not signed in. No session was opened for this number, and nothing of yours was
        shared.
      </TrustLine>
    </>
  );
}
