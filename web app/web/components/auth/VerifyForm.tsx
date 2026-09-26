'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { forgetPendingPhone, resendCode, verifyCode } from '@/lib/auth/actions';
import { CODE_SENT, type Message, sendMessage, verifyMessage } from '@/lib/auth/copy';
import {
  CODE_LENGTH,
  SECOND_PATH_AFTER_RESENDS,
  SUPPORT_WHATSAPP_NUMBER,
  formatPhone,
  mmss,
  resendDelay,
} from '@/lib/auth/policy';
import type { OtpFailure, SendFailure } from '@/lib/auth/types';
import { IconCall, IconWhatsApp } from './Icons';
import { MessageSlot } from './MessageSlot';
import { OtpInput } from './OtpInput';
import { TrustLine } from './TrustLine';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';

/**
 * Frames 1b and 1c · the code.
 *
 * One screen. The only things that change between its states are the message
 * slot and the foot, which is the argument for one component rather than five
 * — and for the slot being always present, keeping its height whether or not it
 * holds anything, so nothing below it moves when a code is refused.
 */
export function VerifyForm({ phone }: { phone: string }) {
  const router = useRouter();

  const [code, setCode] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [slots, setSlots] = useState<'idle' | 'err' | 'ok'>('idle');
  const [pending, startTransition] = useTransition();

  /** How many resends have been spent. Paces the ladder, and opens the foot. */
  const [resends, setResends] = useState(0);
  /** Seconds until resend is allowed again. The first wait starts on arrival. */
  const [cooldown, setCooldown] = useState(() => resendDelay(0));
  /**
   * Seconds left on a lock, or 0. Held apart from `message` because it counts
   * down on screen: the sentence has to quote the wait as it is now.
   */
  const [lockLeft, setLockLeft] = useState(0);
  /** Which refusal produced the current countdown, so it re-renders in its own words. */
  const waiting = useRef<OtpFailure | SendFailure | null>(null);

  const locked = lockLeft > 0;

  /* ── one ticker, two countdowns ────────────────────────────────────────
     A single interval rather than one per counter: two intervals drift apart
     and the screen ends up showing 0:31 next to 0:29 for the same second. */
  useEffect(() => {
    if (cooldown <= 0 && lockLeft <= 0) return;
    const id = setInterval(() => {
      setCooldown((s) => (s > 0 ? s - 1 : 0));
      setLockLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown, lockLeft]);

  /* The lock lifts on its own; the trainer never has to guess when, and never
     has to reload to find out. The slot goes quiet at the same moment. */
  useEffect(() => {
    if (lockLeft !== 0 || waiting.current === null) return;
    const kind = waiting.current.kind;
    if (kind !== 'locked' && kind !== 'throttled') return;
    waiting.current = null;
    setMessage(null);
    setSlots('idle');
  }, [lockLeft]);

  /* While a countdown is running the sentence is rewritten each second. */
  useEffect(() => {
    const failure = waiting.current;
    if (!failure || lockLeft <= 0) return;
    setMessage(
      failure.kind === 'throttled'
        ? sendMessage(failure, lockLeft)
        : verifyMessage(failure as OtpFailure, lockLeft),
    );
  }, [lockLeft]);

  const submit = useCallback(() => {
    if (code.length !== CODE_LENGTH || pending || locked) return;
    startTransition(async () => {
      const result = await verifyCode(phone, code);
      if (result.ok) {
        setSlots('ok');
        setMessage(null);
        router.push(result.next);
        return;
      }

      const failure = result.failure;
      if (failure.kind === 'locked') {
        waiting.current = failure;
        setLockLeft(failure.retryAfterSeconds);
        setSlots('err');
        setMessage(verifyMessage(failure, failure.retryAfterSeconds));
        return;
      }
      // The digits are KEPT on every one of these. One was mistyped; clearing
      // all six is, in the mobile spec's words, "the most-complained-about OTP
      // behaviour there is" — the fix is one keystroke and the screen should
      // not make it six. An expired code is amber and not the trainer's fault,
      // so the slots do not take the danger edge for it either.
      setSlots(failure.kind === 'wrong' ? 'err' : 'idle');
      setMessage(verifyMessage(failure));
    });
  }, [code, pending, locked, phone, router]);

  function resend() {
    if (cooldown > 0 || pending) return;
    startTransition(async () => {
      const result = await resendCode(phone);
      const spent = resends + 1;

      if (result.ok) {
        // Counted here and not before the call: a resend the server REFUSED
        // sent no code, and the foot's "still nothing after two resends" would
        // then be claiming two codes went out when none did. The ladder is
        // paced by sends, not by presses.
        setResends(spent);
        // Without an explicit confirmation people press resend three more
        // times, burn the day's ceiling of 10 and land in a lockout for no
        // reason — so it is a state of the slot, not a toast that scrolls away.
        setMessage(CODE_SENT);
        setSlots('idle');
        setCode('');
        setCooldown(resendDelay(spent));
        return;
      }

      const failure = result.failure;
      if (failure.kind === 'throttled' || failure.kind === 'locked') {
        waiting.current = failure;
        setLockLeft(failure.retryAfterSeconds);
        // A throttle is the send rate and spends nothing, so the cooldown it
        // reports replaces the ladder's guess rather than adding to it.
        setCooldown(failure.retryAfterSeconds);
        setMessage(sendMessage(failure, failure.retryAfterSeconds));
        return;
      }
      setMessage(sendMessage(failure));
    });
  }

  async function changeNumber() {
    await forgetPendingPhone();
    router.push('/sign-in');
  }

  // §06 · the second path opens after the SECOND resend, not the first. Two
  // resends is roughly two minutes of the ladder, which is past the honest p95
  // for an Indian transactional SMS — before that, waiting is still the right
  // advice and a wall of alternatives is noise.
  const secondPathOpen = resends >= SECOND_PATH_AFTER_RESENDS;

  return (
    <>
      <h2 className="stp__hd" style={{ fontSize: 26 }} id="otp-h">
        Enter the code
      </h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        Sent by SMS to {formatPhone(phone)} ·{' '}
        <a
          className="authwrap__lnk"
          href="/sign-in"
          onClick={(e) => {
            e.preventDefault();
            void changeNumber();
          }}
        >
          change number
        </a>
      </p>

      <div style={{ marginTop: 24 }}>
        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next);
            // The red edge described the code that was refused. It stops
            // describing this one the moment a digit changes.
            if (slots === 'err') setSlots('idle');
            if (message && !locked) setMessage(null);
          }}
          onSubmit={submit}
          state={slots}
          labelledBy="otp-h"
          disabled={locked || pending}
          autoFocus
        />
      </div>

      <MessageSlot message={message} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2 }}>
        <span className="small" style={{ color: 'var(--tx-ink-3)' }}>
          Didn&rsquo;t get it?
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={resend}
          disabled={cooldown > 0 || pending}
        >
          {cooldown > 0 ? `Resend in ${mmss(cooldown)}` : 'Resend the code'}
        </Button>
      </div>

      <div style={{ marginTop: 16 }}>
        <Button
          variant="primary"
          size="lg"
          style={{ width: '100%' }}
          onClick={submit}
          // Verify STAYS LIVE after a wrong code — the digits are still there
          // and one keystroke fixes them. It is dead only while a lock is
          // running, when pressing it could do nothing but spend nothing.
          disabled={code.length !== CODE_LENGTH || pending || locked}
        >
          {pending ? 'Checking…' : 'Verify'}
        </Button>
      </div>

      {secondPathOpen ? <SecondPaths /> : null}

      <TrustLine>
        Nobody from InclineYou will ever ring you and ask for this code. If somebody does, it is
        not us.
      </TrustLine>
    </>
  );
}

/**
 * §06 · when the SMS does not arrive.
 *
 * Three routes are drawn and two of them do not exist. WhatsApp has a flag
 * (`WHATSAPP_OTP_ENABLED`) that is `false`; voice — the control the mobile
 * design put in its 8b, and the one most products skip — has no endpoint and no
 * channel value at all, since `OtpChannel` is `sms | whatsapp`.
 *
 * They are drawn because deleting them would hide two decisions, and labelled
 * because a live button that cannot work is worse than a dead one that says so.
 * On the 2026 delivery numbers — 92–98% for transactional SMS — this panel is
 * the only thing standing between a few percent of trainers and no way in.
 */
function SecondPaths() {
  const support = SUPPORT_WHATSAPP_NUMBER;

  return (
    <div
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: 'var(--tx-r2)',
        border: '1px solid var(--tx-warn)',
        background: 'var(--tx-warn-soft)',
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-ink)' }}>
        Still nothing after two resends. Here is every other way in.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 11 }}>
        <Button variant="secondary" style={{ width: '100%' }} disabled>
          <IconWhatsApp size={15} />
          Send the code on WhatsApp
          <Tag tone="warn" style={{ marginLeft: 'auto' }}>
            not wired
          </Tag>
        </Button>
        <Button variant="secondary" style={{ width: '100%' }} disabled>
          <IconCall size={15} />
          Call me with the code
          <Tag tone="danger" style={{ marginLeft: 'auto' }}>
            no endpoint
          </Tag>
        </Button>
        {/* An anchor when it can go somewhere, a dead button when it cannot.
            An <a> with no href is not focusable and not announced as a
            control, so an unconfigured support number would leave the ONE
            working route here invisible to a keyboard — worse than the two
            above it, which at least say why they are dead. */}
        {support ? (
          <Button
            href={`https://wa.me/${support}`}
            variant="primary"
            style={{ width: '100%' }}
            target="_blank"
            rel="noreferrer"
          >
            <IconWhatsApp size={15} />
            Message us and we&rsquo;ll sign you in by hand
          </Button>
        ) : (
          <Button variant="primary" style={{ width: '100%' }} disabled>
            <IconWhatsApp size={15} />
            Message us and we&rsquo;ll sign you in by hand
            <Tag tone="warn" style={{ marginLeft: 'auto' }}>
              no number set
            </Tag>
          </Button>
        )}
      </div>
      <p className="small" style={{ marginTop: 11, color: 'var(--tx-ink-3)' }}>
        Only the third one works today, and it is a person. <b>WhatsApp</b> has a flag
        (<code>WHATSAPP_OTP_ENABLED</code>) that is <code>false</code>. <b>Voice</b> was specified
        in the mobile design and has no endpoint at all — <code>OtpChannel</code> is{' '}
        <code>sms | whatsapp</code>, two values. Both are drawn because deleting them would hide
        two decisions; both are labelled because a live button that cannot work is worse than a
        dead one that says so.
      </p>
    </div>
  );
}
