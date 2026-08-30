import { CODE_TTL_MINUTES, LOCK_MINUTES, mmss } from './policy';
import type { OtpFailure, SendFailure } from './types';

/**
 * What the message slot says, and in which of its four tones.
 *
 * The tones are the argument of §05 and not styling: a wrong code is the
 * trainer's mistake and is red; an EXPIRED code is the clock's, spends nothing,
 * and is amber — styling a message that reports no error as an error is NN/g's
 * third hostile pattern. The two 429s split the same way for the same reason.
 */
export type Tone = 'err' | 'warn' | 'ok';
export type Icon = 'warn' | 'clock' | 'lock' | 'check';

export interface Message {
  tone: Tone;
  icon: Icon;
  /** Rendered bold and first. The sentence that names what happened. */
  lead: string;
  /** The rest, which is the recovery. */
  rest?: string;
}

/** "1 second" / "45 seconds" — the unit a person reads, pluralised. */
function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/**
 * The wait, in the unit a person actually reads.
 *
 * The number matters: the ladder refuses for half a minute and the day's
 * ceiling refuses for hours, and "give it a minute" is a lie in the second case
 * that the next attempt exposes. Mirrors `throttleMessage` in
 * `app/src/api/auth.ts` so the two cannot drift.
 */
export function throttleMessage(seconds: number): Message {
  const wait = Math.max(1, Math.round(seconds));
  if (wait <= 90) {
    return { tone: 'warn', icon: 'clock', lead: 'That’s a lot of codes.', rest: `Try again in ${plural(wait, 'second')}.` };
  }
  const minutes = Math.ceil(wait / 60);
  if (minutes < 90) {
    return { tone: 'warn', icon: 'clock', lead: 'That’s a lot of codes.', rest: `Try again in ${plural(minutes, 'minute')}.` };
  }
  const hours = Math.max(1, Math.round(wait / 3600));
  return {
    tone: 'warn',
    icon: 'clock',
    lead: 'That’s too many codes for this number today.',
    rest: `Try again in about ${plural(hours, 'hour')}.`,
  };
}

/**
 * A refused code, as a sentence.
 *
 * `secondsLeft` is passed rather than read from the failure because the lock
 * counts down on screen: the message is re-rendered every second and has to
 * quote the wait as it is now, not as it was when the server answered.
 */
export function verifyMessage(failure: OtpFailure, secondsLeft?: number): Message {
  switch (failure.kind) {
    case 'wrong': {
      // Only a real count is announced. `attemptsLeft: 0` means the next code is
      // the wall, not that 0 tries remain to spend, so it is not worth saying.
      const left = failure.attemptsLeft;
      const rest =
        left && left > 0
          ? `${plural(left, 'attempt')} left before this number is locked for ${LOCK_MINUTES} minutes.`
          : `Check the digits and try again.`;
      return { tone: 'err', icon: 'warn', lead: 'That code is wrong.', rest };
    }
    case 'expired':
      return {
        tone: 'warn',
        icon: 'clock',
        lead: 'That code has expired.',
        rest: `Codes last ${CODE_TTL_MINUTES} minutes. This one cost you nothing — send another.`,
      };
    case 'locked':
      return {
        tone: 'err',
        icon: 'lock',
        lead: 'Too many wrong codes.',
        rest: `This number is locked for ${mmss(secondsLeft ?? failure.retryAfterSeconds)}.`,
      };
    case 'offline':
      return {
        tone: 'err',
        icon: 'warn',
        lead: 'We couldn’t reach the server.',
        rest: 'Check your connection and try again — this cost you nothing.',
      };
    default:
      return {
        tone: 'err',
        icon: 'warn',
        lead: 'We couldn’t check that code.',
        rest: 'Try again in a moment.',
      };
  }
}

/** A refused send, as a sentence. Same countdown caveat as above. */
export function sendMessage(failure: SendFailure, secondsLeft?: number): Message {
  switch (failure.kind) {
    case 'throttled':
      return throttleMessage(secondsLeft ?? failure.retryAfterSeconds);
    case 'locked':
      return {
        tone: 'err',
        icon: 'lock',
        lead: 'Too many wrong codes.',
        rest: `This number is locked for ${mmss(secondsLeft ?? failure.retryAfterSeconds)}. No code was sent.`,
      };
    case 'invalid':
      return {
        tone: 'err',
        icon: 'warn',
        lead: 'That doesn’t look like a mobile number.',
        rest: failure.detail ?? 'Indian mobile numbers start with 6, 7, 8 or 9.',
      };
    case 'offline':
      return {
        tone: 'err',
        icon: 'warn',
        lead: 'We couldn’t reach the server.',
        rest: 'Check your connection and try again.',
      };
    default:
      return {
        tone: 'err',
        icon: 'warn',
        lead: 'We couldn’t send the code.',
        rest: 'Try again in a moment.',
      };
  }
}

/**
 * The one nobody designs. Without an explicit confirmation people press resend
 * three more times, burn the day's ceiling of 10 and land in a lockout for no
 * reason — so it is a state of the message slot rather than a toast.
 */
export const CODE_SENT: Message = { tone: 'ok', icon: 'check', lead: 'New code sent.' };
