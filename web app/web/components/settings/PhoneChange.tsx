'use client';

import { useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { OtpInput } from '@/components/auth/OtpInput';
import type { Message } from '@/lib/auth/copy';
import { CODE_LENGTH, PHONE_PATTERN, formatPhone } from '@/lib/auth/policy';
import {
  cancelPhoneChange,
  confirmPhoneChange,
  requestNewNumber,
  startPhoneChange,
  verifyCurrentNumber,
} from '@/lib/account/actions';

/**
 * CHANGING THE NUMBER YOU SIGN IN WITH — four steps, two codes.
 *
 * ## Why two codes and not one
 *
 * The brief asks for authentication on the OLD number, and that half is what
 * stops a stolen session walking away with an account: the bearer token is seven
 * days long and lives in a cookie, so without this step anybody holding one
 * could re-point the account at a number they control and lock the trainer out
 * of their own book permanently.
 *
 * The NEW number is proved too, and that half is not in the brief. It is here
 * because the failure it prevents is worse than the one it costs: a trainer who
 * mistypes the last digit of a number nobody checks has moved their account to a
 * stranger's phone, and there is no way back — the old number no longer signs in
 * and the new one is not theirs. One extra code against an account that cannot
 * be recovered is not a close call.
 *
 * ## Why it is inline and not a modal
 *
 * The number being replaced is the thing on the row above, and a dialog would
 * cover it. Every step here reads back either the number a code went to or the
 * number about to be taken, so the two are on screen together at the point the
 * trainer commits — which is the only moment a mistyped digit is still cheap.
 *
 * ## Resending is the server's answer, not a countdown here
 *
 * `/sign-in/verify` draws the resend ladder because it OWNS the wait: it knows
 * how many times it has asked and can count down to the next one. This screen
 * does not, and reconstructing it would mean a fourth copy of
 * `RESEND_LADDER` — the root `CLAUDE.md` opens with what three copies of a
 * policy number already cost. So *Send another code* simply asks, and the server
 * answers with the wait it is actually enforcing (`OTP_THROTTLED` carries
 * `retryAfterSeconds`), which `sentenceFor` prints. The trainer is told the
 * truth by the only thing that knows it.
 */
type Step =
  /** The row, with a button. */
  | { at: 'closed' }
  /** A code has gone to the number they are on. */
  | { at: 'current' }
  /** The old number is proved. Type the new one. */
  | { at: 'number'; phone: string }
  /** A code has gone to the new number. */
  | { at: 'code'; phone: string }
  /** It moved. */
  | { at: 'done'; phone: string };

export function PhoneChange({ phone }: { phone: string }) {
  const [step, setStep] = useState<Step>({ at: 'closed' });
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();

  function fail(text: string, restart?: boolean) {
    setMessage({ tone: 'err', icon: 'warn', lead: text });
    // `restart` is the ticket having expired — see `lib/account/actions.ts`.
    // Sending them back to the row rather than leaving them on a step whose
    // proof is gone: every subsequent press would fail the same way, and a
    // screen that lets you keep trying something that cannot work is worse than
    // one that says where to start again.
    if (restart) {
      setStep({ at: 'closed' });
      setCode('');
    }
  }

  function open() {
    setMessage(null);
    setCode('');
    setTyped('');
    start(async () => {
      const res = await startPhoneChange();
      if (!res.ok) return fail(res.message);
      setStep({ at: 'current' });
      setMessage({
        tone: 'ok',
        icon: 'check',
        lead: `Code sent to ${formatPhone(phone)}.`,
        rest: 'It is good for 10 minutes.',
      });
    });
  }

  function close() {
    setStep({ at: 'closed' });
    setCode('');
    setMessage(null);
    // The ticket is a fact about a sitting, and this is the sitting ending.
    // Not awaited: nothing on screen depends on it, and a cookie that outlives
    // the panel by a few hundred milliseconds is expired within ten minutes
    // regardless.
    void cancelPhoneChange();
  }

  function submitCurrent() {
    if (code.length !== CODE_LENGTH) return;
    setMessage(null);
    start(async () => {
      const res = await verifyCurrentNumber(code);
      if (!res.ok) return fail(res.message, res.restart);
      setCode('');
      setStep({ at: 'number', phone: '' });
    });
  }

  function submitNumber(next: string) {
    setMessage(null);
    start(async () => {
      const res = await requestNewNumber(next);
      if (!res.ok) return fail(res.message, res.restart);
      const digits = next.replace(/\D/g, '').slice(-10);
      setStep({ at: 'code', phone: digits });
      setMessage({
        tone: 'ok',
        icon: 'check',
        lead: `Code sent to ${formatPhone(digits)}.`,
        rest: 'Enter it to move your account onto that number.',
      });
    });
  }

  function submitConfirm(next: string) {
    if (code.length !== CODE_LENGTH) return;
    setMessage(null);
    start(async () => {
      const res = await confirmPhoneChange(next, code);
      if (!res.ok) return fail(res.message, res.restart);
      setCode('');
      setStep({ at: 'done', phone: res.phone });
      setMessage(null);
    });
  }

  /* ───────────────────────────────────────────────────────────── the row ── */

  if (step.at === 'closed' || step.at === 'done') {
    const shown = step.at === 'done' ? step.phone : phone;
    return (
      <>
        <div className="kv">
          <span className="kv__k">Your number</span>
          <span className="kv__v mono">{shown ? formatPhone(shown) : '—'}</span>
        </div>
        {step.at === 'done' ? (
          <p className="small" style={{ marginTop: 8, color: 'var(--tx-accent-text)' }}>
            <b>Moved.</b> Your next code goes to this number. Nothing else changed — your clients,
            your money book and your history are all where they were.
          </p>
        ) : (
          <p className="small" style={{ marginTop: 8 }}>
            This is your login. Changing it takes a code to this number first, then one to the new
            one — we check you hold both before anything moves.
          </p>
        )}
        <button
          className="btn btn--secondary"
          type="button"
          style={{ marginTop: 12 }}
          disabled={pending}
          onClick={open}
        >
          {pending ? 'Sending…' : step.at === 'done' ? 'Change it again' : 'Change my number'}
        </button>
        <MessageSlot message={message} />
      </>
    );
  }

  /* ─────────────────────────────────────────────── 1 · the current number ── */

  if (step.at === 'current') {
    return (
      <Wrap
        title="First, the number you are on"
        // Read back rather than assumed: this is the last screen on which a
        // trainer signed in on somebody else's laptop can notice whose account
        // they are about to change.
        lead={`We sent a code to ${formatPhone(phone)}.`}
        onCancel={close}
        pending={pending}
      >
        <p className="fld__l" id="pc-current-l" style={{ marginBottom: 8 }}>
          The {CODE_LENGTH}-digit code
        </p>
        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next);
            if (message?.tone === 'err') setMessage(null);
          }}
          onSubmit={submitCurrent}
          state={message?.tone === 'err' ? 'err' : 'idle'}
          labelledBy="pc-current-l"
          disabled={pending}
          autoFocus
        />
        <MessageSlot message={message} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn--primary"
            type="button"
            disabled={pending || code.length !== CODE_LENGTH}
            onClick={submitCurrent}
          >
            {pending ? 'Checking…' : 'Continue'}
          </button>
          <button className="btn btn--ghost" type="button" disabled={pending} onClick={open}>
            Send another code
          </button>
        </div>
      </Wrap>
    );
  }

  /* ───────────────────────────────────────────────────── 2 · the new one ── */

  if (step.at === 'number') {
    const digits = typed.replace(/\D/g, '').slice(-10);
    const ready = PHONE_PATTERN.test(digits);
    return (
      <Wrap
        title="Now the number you want"
        lead="We will send a code to it. Nothing moves until you enter that code."
        onCancel={close}
        pending={pending}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) submitNumber(typed);
          }}
        >
          <div className="fld" style={{ maxWidth: 320 }}>
            <label className="fld__l" htmlFor="pc-new">
              New mobile number
            </label>
            <div className="affix">
              <span className="affix__p">+91</span>
              <input
                className="ctl mono"
                id="pc-new"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={14}
                placeholder="98765 43210"
                value={typed}
                disabled={pending}
                autoFocus
                onChange={(e) => {
                  setTyped(e.target.value);
                  if (message?.tone === 'err') setMessage(null);
                }}
                aria-describedby="pc-new-h"
              />
            </div>
            <span className="fld__h" id="pc-new-h">
              An Indian mobile number — it has to be one that can receive an SMS.
            </span>
          </div>

          <MessageSlot message={message} />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" type="submit" disabled={pending || !ready}>
              {pending ? 'Sending…' : 'Send the code'}
            </button>
          </div>
        </form>
      </Wrap>
    );
  }

  /* ────────────────────────────────────────────── 3 · prove the new one ── */

  return (
    <Wrap
      title="Last step"
      lead={`Enter the code we sent to ${formatPhone(step.phone)}.`}
      onCancel={close}
      pending={pending}
    >
      <p className="fld__l" id="pc-new-l" style={{ marginBottom: 8 }}>
        The {CODE_LENGTH}-digit code
      </p>
      <OtpInput
        value={code}
        onChange={(next) => {
          setCode(next);
          if (message?.tone === 'err') setMessage(null);
        }}
        onSubmit={() => submitConfirm(step.phone)}
        state={message?.tone === 'err' ? 'err' : 'idle'}
        labelledBy="pc-new-l"
        disabled={pending}
        autoFocus
      />
      <MessageSlot message={message} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/*
          The verb names what it does rather than saying "Confirm". This is the
          press that moves the account, and the number it moves to is in the
          button — the last place a wrong digit is still free to notice.
        */}
        <button
          className="btn btn--primary"
          type="button"
          disabled={pending || code.length !== CODE_LENGTH}
          onClick={() => submitConfirm(step.phone)}
        >
          {pending ? 'Moving…' : `Move my account to ${formatPhone(step.phone)}`}
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          disabled={pending}
          onClick={() => submitNumber(step.phone)}
        >
          Send another code
        </button>
      </div>
    </Wrap>
  );
}

/**
 * The frame each step sits in — a heading, one sentence, and the way out.
 *
 * The way out is on every step deliberately. A flow that sends two SMS messages
 * and rewrites the login is one a trainer should be able to abandon at any point
 * without guessing whether closing the tab left something half-done — and here
 * it genuinely does not: nothing is written until the last press, so cancelling
 * at any earlier step has changed nothing but the codes that went unused.
 */
function Wrap({
  title,
  lead,
  children,
  onCancel,
  pending,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 className="h5" style={{ margin: 0 }}>
          {title}
        </h3>
        <button className="btn btn--ghost btn--sm" type="button" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="small" style={{ marginTop: 3, marginBottom: 14 }}>
        {lead}
      </p>
      {children}
    </div>
  );
}
