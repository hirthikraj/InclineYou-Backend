'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { sendCode } from '@/lib/auth/actions';
import { type Message, sendMessage } from '@/lib/auth/copy';
import { PHONE_PATTERN } from '@/lib/auth/policy';
import { IconChevronDown } from './Icons';
import { MessageSlot } from './MessageSlot';
import { TrustLine } from './TrustLine';

/**
 * Frame 1a · the number.
 *
 * One field, one button, and the headline IS the field's label — there is no
 * caption above the box repeating it, which is why the input is labelled by the
 * `h2`. The button is dead until ten digits are present, so nobody presses it
 * early and reads an error they caused by being early.
 */
export function SignInForm() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();

  // Ten digits, not the full regex. The button unlocks on length so it stops
  // being dead as soon as there is something worth sending; a number outside
  // the 6–9 series is refused by `sendCode` with a sentence that names the
  // problem, which is more use than a button that never lights up.
  const ready = phone.length === 10;

  function submit() {
    if (!ready || pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await sendCode(phone);
      if (result.ok) {
        router.push('/sign-in/verify');
        return;
      }
      setMessage(sendMessage(result.failure));
    });
  }

  return (
    <>
      <h2 className="stp__hd" style={{ fontSize: 26 }}>
        Sign in
      </h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        Your mobile number is your account. There is no password to forget.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div style={{ marginTop: 26 }} className={`fld${message ? ' fld--err' : ''}`}>
          <label className="fld__l" htmlFor="ph">
            Mobile number
          </label>
          <div className="affix">
            {/* +91 is the only country code this product serves, so it is a
                fixed affix rather than a picker with one entry in it. */}
            <span
              className="affix__p"
              style={{
                height: 44,
                fontSize: 16,
                lineHeight: '44px',
                letterSpacing: '.06em',
              }}
            >
              {/* One child so the design's grid affix still centers as a unit;
                  the inner flex keeps the chevron and +91 on a single line. */}
              <span className="affix__in">
                <IconChevronDown size={13} />
                +91
              </span>
            </span>
            <input
              className="ctl"
              id="ph"
              style={{
                height: 44,
                fontSize: 16,
                lineHeight: '44px',
                fontFamily: 'var(--tx-mono)',
                letterSpacing: '.06em',
              }}
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              value={phone}
              disabled={pending}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                // The message described the number that was refused. It stops
                // describing the one being typed the moment a key is pressed.
                if (message) setMessage(null);
              }}
              aria-invalid={message ? true : undefined}
              aria-describedby="ph-msg"
            />
          </div>
        </div>

        <div id="ph-msg">
          <MessageSlot message={message} />
        </div>

        <button
          className="btn btn--primary btn--lg"
          type="submit"
          style={{ width: '100%' }}
          disabled={!ready || pending}
        >
          {pending ? 'Sending…' : 'Send me a code'}
        </button>
      </form>

      <TrustLine>
        We send a 6-digit code by <b>SMS</b>. It is the only thing we will ever send this number
        without being asked, and <b>we will never ring you and ask you to read it back</b>.
      </TrustLine>
    </>
  );
}

/**
 * The rule is the server's, not a length check.
 *
 * Exported so a test can assert the two agree. The field accepts
 * `^[6-9]\d{9}$` — the same regex as `AuthController.OtpRequestBody` — because
 * counting digits was not enough: a number starting 5 reached the network and
 * the server's 400 came back as "couldn't send the code. Try again.", which
 * names nothing, blames the connection for a typo, and invites the same number
 * again. TRAI allocates only the 6–9 series to mobile, so a number outside them
 * can never receive an SMS and there is nothing to retry.
 */
export const ACCEPTED_NUMBER = PHONE_PATTERN;
