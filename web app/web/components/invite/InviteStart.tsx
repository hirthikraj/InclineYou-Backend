'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { acceptMyInvite, declineInvite, declineMyInvite, sendInviteCode } from '@/lib/invite/actions';
import { Button } from '@/web-components/ui/Button';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { DateField } from '@/web-components/ui/DateField';
import { Message } from '@/web-components/ui/Message';

/**
 * The step under the card: *your date of birth, and a code to your number*.
 *
 * Two things are asked and both are the client's own. The date is an age check, and the server runs it here first without
 * changing anything, so a mistyped year is corrected in place and somebody who merely holds the link cannot spoil it by typing a
 * wrong date; the authoritative check comes again when they are let in. The tick is consent to the notice the card has just
 * shown, sent back by version so words they were not shown are never recorded as agreed.
 *
 * An under-18 answer is deliberately flat — no reason beyond the server's neutral sentence — and the form stays: it is a
 * correction a person can make, not a door that has shut.
 */
export function InviteStart({
  token,
  trainerFirstName,
  policyVersion,
  phoneEnding,
  signedInId,
}: {
  token: string;
  /** Set when the number already proved itself on the login page: the invite is chosen by id, there is no code, and *Let me in* is the button. */
  signedInId?: string;
  trainerFirstName: string;
  policyVersion: string;
  phoneEnding: string;
}) {
  const router = useRouter();
  const [dob, setDob] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [declined, setDeclined] = useState(false);

  const today = new Date();
  const eighteen = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const openAt = `${eighteen.getFullYear()}-${String(eighteen.getMonth() + 1).padStart(2, '0')}-${String(eighteen.getDate()).padStart(2, '0')}`;
  const ready = dob !== '' && agreed && !pending;

  function send() {
    if (!ready) return;
    setError(null);
    start(async () => {
      if (signedInId) {
        const joined = await acceptMyInvite(signedInId, dob, policyVersion);
        if (joined.ok) {
          router.push(joined.next);
          return;
        }
        setError(joined.message);
        if (joined.kind === 'restart') router.push('/sign-in');
        if (joined.kind === 'unavailable') router.refresh();
        return;
      }
      const result = await sendInviteCode(token, dob, policyVersion);
      if (result.ok) {
        router.push(`/invite/${encodeURIComponent(token)}/verify`);
        return;
      }
      setError(result.message);
      // An invite that died while the page was open: show the dead-link page rather than a form that can only fail.
      if (result.kind === 'unavailable') router.refresh();
    });
  }

  function decline() {
    setError(null);
    start(async () => {
      const result = signedInId ? await declineMyInvite(signedInId) : await declineInvite(token);
      if (result.ok) setDeclined(true);
      else setError(result.message ?? 'That did not go through.');
    });
  }

  if (declined) {
    return (
      <div className="inv-start" role="status">
        <h2 className="stp__hd" style={{ fontSize: 22 }}>Okay — {trainerFirstName} will know</h2>
        <p className="stp__sub" style={{ marginTop: 0 }}>
          Nothing was created, and this link no longer works. If you change your mind, ask {trainerFirstName} to send you a new one.
          You can close this page.
        </p>
      </div>
    );
  }

  return (
    <div className="inv-start">
      <div aria-live="polite">{error && <Message tone="err">{error}</Message>}</div>

      <DateField
        id="inv-dob"
        label="Your date of birth"
        block
        value={dob}
        max={openAt}
        openAt={openAt}
        describedBy="inv-dob-h"
        onChange={setDob}
        onEnter={send}
      />
      <p id="inv-dob-h" className="fld__h">You have to be 18 or over. We don’t show this to anyone but {trainerFirstName}.</p>

      <Checkbox
        className="inv-agree"
        align="start"
        checked={agreed}
        onChange={(e) => setAgreed(e.target.checked)}
        label={
          <>
            I’ve read what {trainerFirstName} can see, and I agree to the privacy notice (version {policyVersion}).
          </>
        }
      />

      <div className="inv-actions">
        <Button variant="primary" wide disabled={!ready} loading={pending} onClick={send}>
          {pending ? (signedInId ? 'One moment…' : 'Sending…') : signedInId ? 'Let me in' : 'Send me a code'}
        </Button>
      </div>
      {signedInId ? (
        <p className="inv-num">You’re signed in with the number ending <b>{phoneEnding}</b>, so there’s no code to type.</p>
      ) : (
        <p className="inv-num">We’ll send a 6-digit code on WhatsApp to the number ending <b>{phoneEnding}</b>.</p>
      )}

      {/* THE WAY OUT, and it is a quiet one: a person who was not expecting this should find it without it competing with the
          button they are being asked to press. Two steps (ask, then confirm) because it ends the link for good. */}
      {asking ? (
        <div className="inv-decline" role="group" aria-label="Decline this invite">
          <p className="inv-num">Tell {trainerFirstName} this isn’t for you? The link will stop working.</p>
          <div className="inv-decline__acts">
            <Button variant="secondary" size="sm" onClick={decline} loading={pending} disabled={pending}>Yes, decline</Button>
            <Button variant="ghost" size="sm" onClick={() => setAsking(false)} disabled={pending}>Keep it</Button>
          </div>
        </div>
      ) : (
        <p className="inv-num">
          Not expecting this?{' '}
          <button type="button" className="inv-link" onClick={() => setAsking(true)}>This isn’t for me</button>
        </p>
      )}
    </div>
  );
}
