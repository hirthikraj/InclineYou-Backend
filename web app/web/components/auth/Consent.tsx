'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { abandonPending, acceptNotice } from '@/lib/auth/actions';
import { IconWarn } from './Icons';
import { TrustLine } from './TrustLine';
import { Button } from '@/web-components/ui/Button';

/**
 * `/sign-in/consent` — the privacy notice has changed since this trainer last
 * accepted it. Reached from `destinationFor` when the verify response's
 * `privacyPolicyVersion` is not its `currentPolicyVersion`.
 *
 * One decision, and it is genuinely binary: accept and carry on, or leave. There
 * is no "remind me later" — the app cannot be used under a notice nobody has
 * accepted, and a button that postponed it would be a way round the record.
 */
export function Consent({ version }: { version: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptNotice();
      if (result.ok) {
        router.push(result.next);
        return;
      }
      setError(result.message);
    });
  }

  function leave() {
    if (pending) return;
    startTransition(async () => {
      await abandonPending();
      router.push('/sign-in');
    });
  }

  return (
    <>
      <h2 className="stp__hd" style={{ fontSize: 26 }}>
        Our privacy notice has changed
      </h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        Read the current notice (version {version}) and accept it to carry on. Your account and
        everything in it are untouched.
      </p>

      <div aria-live="polite">
        {error ? (
          <div className="msg msg--err" style={{ marginTop: 16 }}>
            <IconWarn size={15} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <Button
        variant="primary"
        size="lg"
        style={{ width: '100%', marginTop: 20 }}
        onClick={accept}
        disabled={pending}
      >
        {pending ? 'Saving…' : 'I accept'}
      </Button>
      <Button variant="ghost" style={{ marginTop: 10 }} onClick={leave} disabled={pending}>
        Not now — sign out
      </Button>

      <TrustLine>
        We record the version and the date you accepted it. Accepting again for the same version
        changes nothing.
      </TrustLine>
    </>
  );
}
