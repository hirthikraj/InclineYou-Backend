'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { sendCode } from '@/lib/auth/actions';
import { type Message, sendMessage } from '@/lib/auth/copy';
import { GOOGLE_SIGN_IN_ENABLED, PHONE_PATTERN } from '@/lib/auth/policy';
import { IconChevronDown, IconGoogle } from './Icons';
import { MessageSlot } from './MessageSlot';
import { TrustLine } from './TrustLine';
import { Button } from '@/web-components/ui/Button';

/**
 * Frame 1a · the number.
 *
 * `notice` is why the trainer is here instead of in the app — a session the server
 * ended (`/sign-in/expired`). It lives in the same slot as the field's refusals but
 * is about neither control, so it never paints the number box red.
 *
 * One field, one button, and the headline IS the field's label — there is no
 * caption above the box repeating it, which is why the input is labelled by the
 * `h2`. The button is dead until ten digits are present, so nobody presses it
 * early and reads an error they caused by being early.
 *
 * ── SIX CHILDREN, AND THE NUMBER MATTERS ────────────────────────────────────
 *
 * §04 staggers `.authwrap__card > *` by `:nth-child`, so what this returns at
 * the top level is what rises and in what order: the header, the form, the
 * rule, the second way in, the trust box. The header is a
 * `<header>` rather than a loose `h2` + `p` for exactly that reason — two
 * siblings there would have pushed everything below them a step down the
 * ladder and left the last child with no delay at all.
 *
 * ── THE GOOGLE BUTTON IS DRAWN, NOT WIRED ───────────────────────────────────
 *
 * There is no `/v1/auth/google`, no client ID and no session path for an email:
 * this product's account IS the mobile number — the roster, the two books and
 * every `inclineyou_client` check key off it, and a Google identity maps to no
 * trainer until the backend can exchange one for a phone. So the control exists
 * and the flow does not, and `GOOGLE_SIGN_IN_ENABLED` is the switch, on
 * `WHATSAPP_OTP_ENABLED`'s precedent two rows above it in the same file.
 *
 * What it must not do is nothing. A click that lands in silence is the first
 * heuristic's worst case, and it is worse here than usual — a trainer who
 * believes they pressed a sign-in button and saw no answer concludes the app is
 * broken, not that the feature is unbuilt. So it answers in the slot the phone
 * field already owns, in one sentence that names the state and points at the
 * control that does work.
 */
export function SignInForm({ notice = null }: { notice?: Message | null }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<Message | null>(notice);
  /* WHICH CONTROL THE MESSAGE IS ABOUT, AND IT IS NOT DECORATION.
     The slot is shared — it sits under the field because that is where the
     field's own refusals belong, and the Google button points at it with
     `aria-describedby` rather than growing a second live region two controls
     apart. But `fld--err` and `aria-invalid` were keyed off "is there a
     message at all", so the amber *Google sign-in is not switched on yet*
     painted the phone box red and told a screen reader the number was invalid.
     Nothing was wrong with the number; it was usually empty. §UIUX rule 5 is
     explicit — red is for errors, never for a valid state. */
  const [about, setAbout] = useState<'phone' | 'google' | 'session'>(notice ? 'session' : 'phone');
  const [pending, startTransition] = useTransition();
  const fieldErr = message !== null && about === 'phone';

  /* FOCUS THE FIELD WITHOUT SCROLLING TO IT.
     `autoFocus` was the obvious spelling and it cost the screen its first
     impression: §04 makes the canvas the scrollport, this column is taller than
     a 13" laptop, and the browser scrolls a focused element into view — so
     `/sign-in` opened already scrolled, with the lockup and the headline above
     the top edge. MEASURED at 1568x695: 111px of canvas scrolled before a key
     was pressed. `preventScroll` keeps the caret here and the page where it
     loaded; §04's short-window rung is the other half of the repair. */
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);

  // Ten digits, not the full regex. The button unlocks on length so it stops
  // being dead as soon as there is something worth sending; a number outside
  // the 6–9 series is refused by `sendCode` with a sentence that names the
  // problem, which is more use than a button that never lights up.
  const ready = phone.length === 10;

  function submit() {
    if (!ready || pending) return;
    setMessage(null);
    setAbout('phone');
    startTransition(async () => {
      const result = await sendCode(phone);
      if (result.ok) {
        router.push('/sign-in/verify');
        return;
      }
      setAbout('phone');
      setMessage(sendMessage(result.failure));
    });
  }

  return (
    <>
      <header>
        <h2 className="stp__hd">
          Sign in
        </h2>
        <p className="stp__sub" style={{ marginTop: 8 }}>
          Your mobile number is your account. There is no password to forget.
        </p>
      </header>

      <form
        style={{ marginTop: 26 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={`fld${fieldErr ? ' fld--err' : ''}`}>
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
              ref={field}
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              disabled={pending}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                // The message described the number that was refused. It stops
                // describing the one being typed the moment a key is pressed.
                if (message) setMessage(null);
              }}
              aria-invalid={fieldErr ? true : undefined}
              aria-describedby="ph-msg"
            />
          </div>
        </div>

        <div id="ph-msg">
          <MessageSlot message={message} />
        </div>

        <Button variant="primary" size="lg" type="submit" wide disabled={!ready || pending}>
          {pending ? 'Sending…' : 'Send me a code'}
        </Button>
      </form>

      <p className="authwrap__or">or</p>

      <Button
        variant="secondary"
        size="lg"
        wide
        icon={<IconGoogle size={17} />}
        aria-describedby={GOOGLE_SIGN_IN_ENABLED ? undefined : 'ph-msg'}
        onClick={() => {
          if (GOOGLE_SIGN_IN_ENABLED) return;
          setAbout('google');
          setMessage({
            tone: 'warn',
            icon: 'warn',
            lead: 'Google sign-in is not switched on yet.',
            rest: 'Your account is your mobile number — use the field above and we will send a code.',
          });
        }}
      >
        Continue with Google
      </Button>

      <TrustLine>
        We send a 6-digit code on <b>WhatsApp</b>. It is the only thing we will ever send this number
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
 * can never receive a WhatsApp message and there is nothing to retry.
 */
export const ACCEPTED_NUMBER = PHONE_PATTERN;
