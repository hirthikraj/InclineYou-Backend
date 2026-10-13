'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { acceptInvite, resendInviteCode } from '@/lib/invite/actions';
import { CODE_LENGTH } from '@/lib/auth/policy';
import { OtpInput } from '@/components/auth/OtpInput';
import { Button } from '@/web-components/ui/Button';
import { Message } from '@/web-components/ui/Message';

/**
 * The code, and *Let me in*.
 *
 * One field and one button. The request the code answers, the date of birth and the notice are in the sealed sitting on the
 * server, so nothing about the person is in this component but the six digits being typed. A wrong code keeps the field and says
 * how many tries are left; a code that has run out, or a request that has gone, offers a new code rather than a dead end; and an
 * under-18 answer is flat and final, because by this step the date was already checked once and the invite is now closed.
 */
export function InviteVerify({
  token,
  trainerFirstName,
  phoneEnding,
  resendAt,
}: {
  token: string;
  trainerFirstName: string;
  phoneEnding: string;
  /** Epoch ms the first resend becomes possible — the server's ladder, not ours. */
  resendAt: number;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [wait, setWait] = useState(() => Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const closed = kind === 'age' || kind === 'unavailable' || kind === 'another-trainer';
  const ready = code.length === CODE_LENGTH && !pending && !closed;

  function letMeIn() {
    if (!ready) return;
    setError(null);
    setSent(false);
    start(async () => {
      const result = await acceptInvite(token, code);
      if (result.ok) {
        router.push(result.next);
        return;
      }
      setKind(result.kind);
      setError(result.message);
      if (result.kind === 'wrong') setCode('');
      if (result.kind === 'restart') router.push(`/invite/${encodeURIComponent(token)}`);
      if (result.kind === 'unavailable') router.refresh();
    });
  }

  function again() {
    if (wait > 0 || pending) return;
    setError(null);
    setKind(null);
    start(async () => {
      const result = await resendInviteCode(token);
      if (result.ok) {
        setCode('');
        setSent(true);
        setWait(result.resendAfterSeconds);
        return;
      }
      setKind(result.kind);
      setError(result.message);
      if (result.kind === 'throttled' && result.retryAfterSeconds) setWait(result.retryAfterSeconds);
    });
  }

  return (
    <div className="inv-start">
      <h2 className="stp__hd" style={{ fontSize: 26 }}>Enter your code</h2>
      <p className="stp__sub" style={{ marginTop: 0 }}>
        We sent six digits on WhatsApp to the number ending <b>{phoneEnding}</b>.
      </p>

      <div aria-live="polite">
        {error && <Message tone="err">{error}</Message>}
        {sent && !error && <Message tone="ok">A new code is on its way.</Message>}
      </div>

      <div id="inv-code-l" className="sr-only">Six-digit code</div>
      <OtpInput value={code} onChange={setCode} onSubmit={letMeIn} state={kind === 'wrong' ? 'err' : 'idle'} labelledBy="inv-code-l" disabled={pending || closed} autoFocus />

      <div className="inv-actions">
        <Button variant="primary" wide disabled={!ready} loading={pending} onClick={letMeIn}>
          {pending ? 'One moment…' : `Let me in`}
        </Button>
      </div>

      {!closed && (
        <p className="inv-num">
          Nothing arrived?{' '}
          <button type="button" className="inv-link" onClick={again} disabled={wait > 0 || pending}>
            {wait > 0 ? `Send it again in ${wait}s` : 'Send it again'}
          </button>
          . Joining makes you {trainerFirstName}’s client; you can leave any time.
        </p>
      )}
    </div>
  );
}
