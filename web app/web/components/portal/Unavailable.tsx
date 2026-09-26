'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/web-components/ui/Button';

/**
 * The API did not give the client their portal.
 *
 * Two cases and two sentences, which is `components/today/Unavailable.tsx`'s own
 * split and its reason: the screen it replaced had one message, and somebody
 * meeting it during a twenty-second deploy could not tell it from a broken app.
 * What they need to know is whether waiting will fix it.
 *
 * ── THE COPY IS FOR A CLIENT, AND THAT IS THE WHOLE DIFFERENCE ───────────────
 *
 * The trainer's version reassures by scope — *"this screen only reads. Nothing
 * was half-written, nothing is queued, nothing is lost."* True here too, and
 * not the thing a client is worried about: they are worried that **their
 * training is gone**, or that their trainer has dropped them. So the sentence
 * names the two things that are definitely still true — their sessions are in
 * their trainer's diary, and their logs are on the server — and it says who to
 * ask if it keeps happening, which is a person rather than a support address.
 *
 * There is no jargon and no status code in the prose. A 502 means nothing to
 * the accountant §1 is written for; it is on the retry line, small, for the one
 * client who screenshots it.
 */
export function Unavailable({
  kind,
  status,
}: {
  kind: 'unreachable' | 'refused';
  status?: number;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /* The happy path unmounts this component, so the timer usually outlives it —
     held in a ref and cleared, the same reason the trainer's version gives: a
     `setTimeout` firing into an unmounted tree keeps a closure alive for four
     seconds after it can matter. */
  useEffect(() => () => clearTimeout(timer.current), []);

  const unreachable = kind === 'unreachable';

  return (
    <div className="app app--noshell">
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--tx-canvas)',
        }}
      >
        <div className="midcol" style={{ textAlign: 'center' }}>
          <p className="micro">{unreachable ? 'NO CONNECTION' : 'SOMETHING WENT WRONG'}</p>
          <h1 className="stp__hd" style={{ marginTop: 12, marginInline: 'auto' }}>
            {unreachable ? 'We cannot reach the server' : 'We could not load your training'}
          </h1>
          <p className="stp__sub" style={{ marginInline: 'auto' }}>
            {unreachable
              ? 'Your connection or ours. Nothing is lost — your sessions are in your trainer’s diary and everything you have logged is saved.'
              : 'Nothing is lost. Your sessions are in your trainer’s diary and everything you have logged is saved. This is our end, not yours.'}
          </p>
          <div className="row gap3 mt6" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              disabled={retrying}
              loading={retrying}
              onClick={() => {
                setRetrying(true);
                router.refresh();
                clearTimeout(timer.current);
                /* Cleared by the render that replaces this component, or by the
                   timeout if it fails again — a button stuck on *Trying…* reads
                   as frozen. */
                timer.current = setTimeout(() => setRetrying(false), 4000);
              }}
            >
              Try again
            </Button>
          </div>
          <p className="small mt4">
            {/* Their trainer, not a support address. A client whose portal is
                down has exactly one person who can tell them whether their
                Tuesday session is still on, and it is not us. */}
            If it keeps happening, message your trainer — they can tell you what is
            in the diary.
            {status ? <span className="ink3"> ({status})</span> : null}
          </p>
        </div>
      </div>
    </div>
  );
}
