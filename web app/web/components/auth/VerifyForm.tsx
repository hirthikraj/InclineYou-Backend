'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { checkDelivery, forgetPendingPhone, resendCode, verifyCode } from '@/lib/auth/actions';
import { CODE_SENT, type Message, sendMessage, verifyMessage } from '@/lib/auth/copy';
import {
  CODE_LENGTH,
  SECOND_PATH_AFTER_RESENDS,
  SUPPORT_WHATSAPP_NUMBER,
  formatPhone,
  mmss,
  resendDelay,
} from '@/lib/auth/policy';
import type { DeliveryStatus, OtpFailure, SendFailure } from '@/lib/auth/types';
import { IconWhatsApp } from './Icons';
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

  /** Where the WhatsApp message is — null until the server has said. */
  const [delivery, setDelivery] = useState<DeliveryStatus | null>(null);
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

  /* ── live delivery status ──────────────────────────────────────────────
     Asked every few seconds while the screen is up, and never once it is
     settled: `failed` is an answer, and `delivered`/`read` need no more
     asking. A refusal or a gone request comes back as null and draws
     nothing — there is no state here worth an error. The request id is in a
     cookie, so this holds only the status. */
  useEffect(() => {
    if (delivery === 'failed' || delivery === 'delivered' || delivery === 'read') return;
    let live = true;
    const poll = async () => {
      const status = await checkDelivery();
      if (live && status) setDelivery(status);
    };
    void poll();
    const id = setInterval(poll, 4000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [delivery, resends]);

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
      const result = await verifyCode(code);
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
  }, [code, pending, locked, router]);

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
        // The server's own next rung, not the local mirror's guess.
        setCooldown(result.resendAfterSeconds > 0 ? result.resendAfterSeconds : resendDelay(spent));
        setDelivery(null);
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

  // §06 · the second path opens after the SECOND resend, not the first — or as
  // soon as the server says WhatsApp could not deliver this one. Two resends is
  // roughly two minutes of the ladder, which is past the honest p95 for a
  // WhatsApp message; before that, waiting is still the right advice and a wall
  // of alternatives is noise. A `failed` status is the opposite case: waiting
  // cannot help, so the way out is shown at once.
    const secondPathOpen = resends >= SECOND_PATH_AFTER_RESENDS || delivery === 'failed';

  return (
    <>
      <h2 className="stp__hd" style={{ fontSize: 26 }} id="otp-h">
        Enter the code
      </h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        Sent on WhatsApp to {formatPhone(phone)} ·{' '}
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
      {delivery ? (
        <p className="small" role="status" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
          {deliveryLine(delivery)}
        </p>
      ) : null}

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

/** What the delivery status means to the person waiting, in one line. */
function deliveryLine(status: DeliveryStatus): string {
  switch (status) {
    case 'queued':
      return 'Sending the code…';
    case 'sent':
      return 'Sent — it should arrive on WhatsApp in a few seconds.';
    case 'delivered':
    case 'read':
      return 'Delivered to WhatsApp.';
    case 'failed':
      return 'WhatsApp could not deliver that code.';
    default:
      return '';
  }
}

/**
 * §06 · when the message does not arrive.
 *
 * WhatsApp is the only channel (decided 24 Sep 2026 — no SMS), so the old
 * panel's "send it on WhatsApp instead" and "call me" alternatives are gone: the
 * first is what already happened and the second never had an endpoint. What is
 * left is the route that works, and it is a person.
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
        Still no code? There is one more way in.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 11 }}>
        {/* An anchor when it can go somewhere, a dead button when it cannot.
            An <a> with no href is not focusable and not announced as a
            control, so an unconfigured support number would leave the ONE
            working route here invisible to a keyboard. */}
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
    </div>
  );
}
