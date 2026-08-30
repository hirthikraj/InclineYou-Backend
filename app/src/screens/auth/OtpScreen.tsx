/**
 * Screen 01 · Sign in · OTP verify.
 *
 * Built to `agent/design system/screens/xreploginotp.html` §§ 02, 03 and 06.
 * Six states live in here, because auth is judged on what happens when it goes
 * wrong and lumping every failure into "Invalid OTP" strands people who did
 * nothing wrong:
 *
 *   2a  waiting for the code      2b  verifying (auto-submitted)
 *   2c  verified                  3a  wrong code
 *   3b  code expired              3c  too many attempts — signing in paused
 *
 * The rules that are easy to get wrong, all from § 06:
 *   · auto-submit on the sixth digit; Verify stays for screen readers and paste
 *   · on a wrong code KEEP the digits — one was mistyped, clearing is hostile
 *   · resend cooldown escalates 30s → 60s → 120s, countdown always visible
 *   · expired is amber, not red: nobody did anything wrong
 *   · the attempt limit and the lock are server-enforced, never counted here
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../navigation/AuthStack';
import {
  ATTEMPT_LIMIT,
  ATTEMPTS_WARN_FROM,
  CODE_TTL_MINUTES,
  RESEND_LADDER,
  SUPPORT_WHATSAPP_NUMBER,
  WhatsAppUnavailableError,
  isPaused,
  needsSetup,
  readOtpFailure,
  readOtpLock,
  readSendThrottle,
  requestOtp,
  roleOf,
  requestOtpOnWhatsApp,
  throttleMessage,
  verifyOtp,
  type AuthResponse,
  type OtpFailure,
} from '../../api/auth';
import { useAuth } from '../../store/AuthContext';
import {
  Button,
  FieldMsg,
  IconCheck,
  IconLock,
  IconRefresh,
  IconShield,
  OtpInput,
  colors,
  radius,
  space,
  tnum,
  type FieldMsgTone,
  type OtpStatus,
} from '../../design';
import {
  AuthBody,
  AuthFoot,
  AuthLink,
  AuthScreen,
  AuthSub,
  AuthTitle,
  AuthTop,
  BackButton,
  Legal,
  TrustNote,
  TrustStrong,
  WhatsAppButton,
  openWhatsApp,
  useKeyboardVisible,
} from './authLayout';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Otp'>;
  route: RouteProp<AuthStackParamList, 'Otp'>;
};

type Phase = 'entry' | 'verifying' | 'verified' | 'locked';

/** Held long enough to register, short enough that nobody waits. */
const VERIFIED_HOLD_MS = 900;
/**
 * The WhatsApp path is offered from the 2nd delivery attempt — i.e. once SMS has
 * visibly let the trainer down. Indian SMS routes congest; WhatsApp is the
 * reliable second path, but it is never the first thing we show.
 */
const WHATSAPP_FROM_DELIVERY = 2;

export default function OtpScreen({ navigation, route }: Props) {
  const { phone, lockedFor } = route.params;
  const { signIn } = useAuth();

  const [code, setCode] = useState('');
  // Asking for a code can land us here already locked — 3c from a cold mount.
  const [phase, setPhase] = useState<Phase>(lockedFor ? 'locked' : 'entry');
  const [failure, setFailure] = useState<OtpFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [resending, setResending] = useState(false);

  const [resendLeft, setResendLeft] = useCountdown(RESEND_LADDER[0]);
  const [lockLeft, setLockLeft] = useCountdown(lockedFor ?? 0);
  /**
   * The lock's full length, which we only know when we watched it start. Coming
   * in already locked we know what's LEFT and nothing more, so this stays null
   * and the copy doesn't claim a duration — see `lockBody`.
   */
  const [lockTotal, setLockTotal] = useState<number | null>(null);

  const inputRef = useRef<TextInput>(null);
  const keyboardUp = useKeyboardVisible();

  /**
   * `autoFocus` is unreliable here: it fires while the stack is still animating
   * this screen in, and a focus request made mid-transition gets swallowed —
   * the field ends up focused with no keyboard. Ask once the screen has settled.
   */
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }, []),
  );

  const expired = failure?.kind === 'expired';
  const busy = phase === 'verifying';

  /* --- 2c → hand over. Three ways out, and one of them is not the app. ---
   *
   * A verified number goes straight through as a trainer or a client; somebody
   * who is genuinely both gets the role picker; a number on nobody's roster gets
   * 7a. Only the first stores a token, which is what makes the others reachable
   * at all — RootNavigator swaps stacks the moment one exists.
   *
   * A paused membership is NOT one of the ways out. It used to be — 7b, no
   * token, a wall — and that took the app off the phone of anybody whose package
   * lapsed. Pause now signs in like anything else and says so with a banner
   * inside the lens, because the history is still theirs and so is the logging.
   */
  useEffect(() => {
    if (phase !== 'verified' || !session) return;
    const t = setTimeout(() => {
      const role = roleOf(session);
      const memberships = session.clientOf ?? [];
      // A paused roster still opens, but it is not what sign-in should choose
      // for somebody who also has a live one, and it is not worth interrupting
      // a trainer with a picker over.
      const live = memberships.filter((m) => !isPaused(m));

      // Legacy: a backend from before the pause fix answers with no token and
      // nothing else to open. Only reachable during a rolling deploy.
      if (role === 'paused' && session.paused) {
        navigation.replace('Paused', {
          trainerName: session.paused.trainerName,
          trainerPhone: session.paused.trainerPhone,
          pausedOn: session.paused.pausedOn,
        });
        return;
      }

      if (role === 'pending' && session.token) {
        navigation.replace('Unknown', { phone, token: session.token });
        return;
      }

      // V18 · a trainer has named this number and it has never answered. The
      // token opens no sync scope, so nothing is signed in until they do.
      if (role === 'invited' && session.token) {
        const invite = memberships.find((m) => m.membershipStatus === 'invited');
        if (invite) {
          navigation.replace('Invite', { token: session.token, membership: invite });
          return;
        }
      }

      // V18 · a trainer ended it. Shown once — the acknowledgement is what
      // retires it, because the server row is kept forever.
      if (role === 'removed' && session.token && session.removed) {
        navigation.replace('Removed', { token: session.token, removed: session.removed });
        return;
      }

      // V18 · a client with nothing live. Deliberately not 7a: this number's
      // role is client, and offering it a coaching account is the wrong turn.
      if (role === 'unattached') {
        navigation.replace('Unattached', { trainerName: memberships[0]?.trainerName ?? null });
        return;
      }

      // Reserved and not built. Better an honest stop than a trainer's Deck
      // rendered over somebody else's data.
      if (role === 'gym_admin') {
        setPhase('entry');
        setNotice('Gym accounts aren’t available yet. Talk to your trainer for now.');
        return;
      }

      if (!session.token) {
        // Nothing to sign in with and no screen that fits — treat it as a
        // failure rather than a blank app.
        setPhase('entry');
        setNotice('Something is wrong with this sign-in. Try again in a moment.');
        return;
      }

      // § 05: skip the picker whenever it can be skipped. Since V18 it earns
      // its place for exactly one case — a client training with two people
      // right now — because `app_user.role` is exclusive and nobody is both a
      // trainer and somebody's client any more. A paused roster is reachable
      // from the lens switcher and never worth a screen at sign-in.
      const manyTrainers = role === 'client' && live.length > 1;
      if (manyTrainers) {
        navigation.replace('Role', {
          session: {
            token: session.token,
            trainerId: session.trainerId,
            owesSetup: needsSetup(session),
            memberships,
            name: session.trainerName ?? undefined,
          },
        });
        return;
      }

      void signIn({
        token: session.token,
        trainerId: session.trainerId,
        owesSetup: needsSetup(session),
        lens: role === 'client' ? 'client' : 'trainer',
        // Prefer a live roster; fall back to the paused one, which for an
        // all-paused client is the only thing there is — and is exactly the
        // lens we now want to open instead of the old wall.
        clientId: role === 'client' ? (live[0] ?? memberships[0])?.clientId ?? null : null,
        memberships,
      });
    }, VERIFIED_HOLD_MS);
    return () => clearTimeout(t);
  }, [phase, session, signIn, navigation, phone]);

  /* --- 3c → the lock lifts on its own; the trainer never has to guess when. --- */
  useEffect(() => {
    if (phase !== 'locked' || lockLeft > 0) return;
    if (lockedFor) {
      // We arrived locked, so no code was ever sent to this number. Dropping
      // them into "Enter the code" would be asking for a code that does not
      // exist — hand them back to the number to ask for one.
      navigation.goBack();
      return;
    }
    setPhase('entry');
    setFailure(null);
    setCode('');
    setResendLeft(0);
  }, [phase, lockLeft, lockedFor, navigation, setResendLeft]);

  const verify = async (candidate: string) => {
    if (phase === 'verifying' || phase === 'verified' || phase === 'locked') return;
    setPhase('verifying');
    setFailure(null);
    setNotice(null);
    try {
      const { data } = await verifyOtp(phone, candidate);
      Keyboard.dismiss();
      setSession(data);
      setPhase('verified');
    } catch (err) {
      const next = readOtpFailure(err);
      setFailure(next);

      if (next.kind === 'locked') {
        Keyboard.dismiss();
        setLockTotal(next.retryAfterSeconds);
        setLockLeft(next.retryAfterSeconds);
        setPhase('locked');
        return;
      }

      setPhase('entry');
      if (next.kind === 'wrong') {
        // Digits stay put, the caret goes to the end, resend goes live at once.
        setShakeNonce((n) => n + 1);
        inputRef.current?.focus();
      }
      if (next.kind === 'wrong' || next.kind === 'expired') setResendLeft(0);
    }
  };

  const resend = async (channel: 'sms' | 'whatsapp') => {
    if (resending) return;
    setResending(true);
    setNotice(null);
    try {
      if (channel === 'whatsapp') await requestOtpOnWhatsApp(phone);
      else await requestOtp(phone);

      setCode('');
      setFailure(null);
      setResendLeft(RESEND_LADDER[Math.min(resendCount + 1, RESEND_LADDER.length - 1)]);
      setResendCount((c) => c + 1);
      setNotice(channel === 'whatsapp' ? 'New code sent on WhatsApp.' : 'New code sent.');
      inputRef.current?.focus();
    } catch (err) {
      // "Send a new code" is the whole recovery out of 3b, and it is exactly
      // where a lock surfaces: our countdown is client-side, so it can reach
      // zero while the server's has not. Blaming the connection for that would
      // send the trainer round the same loop until the real lock lifts.
      const stillLocked = readOtpLock(err);
      if (stillLocked !== null) {
        Keyboard.dismiss();
        setFailure(null);
        setLockTotal(null); // only what's left of it is known here
        setLockLeft(stillLocked);
        setPhase('locked');
        return;
      }
      // Refused on the send rate, not on a wrong code and not on the network.
      // Our cooldown is client-side and the server's is the real one, so when
      // they disagree — after a restart, or at the day's ceiling — take the
      // server's number and put the button back on cooldown for exactly that.
      const throttledFor = readSendThrottle(err);
      if (throttledFor !== null) {
        setResendLeft(throttledFor);
        setNotice(throttleMessage(throttledFor));
        return;
      }
      setNotice(
        err instanceof WhatsAppUnavailableError
          ? "WhatsApp codes aren't switched on yet — the code comes by SMS."
          : "Couldn't send a new code. Check your connection.",
      );
    } finally {
      setResending(false);
    }
  };

  /* ------------------------------------------------------------ 2c · verified */

  if (phase === 'verified') {
    return (
      <AuthScreen>
        <AuthTop />
        <View style={styles.verified}>
          <View style={styles.verifiedRing}>
            <IconCheck size={38} color={colors.ok} strokeWidth={2.6} />
          </View>
          <Text style={styles.verifiedTitle}>You're in</Text>
          <Text style={styles.verifiedBody}>
            Setting up your workspace. This takes a second and only happens once.
          </Text>
        </View>
        <AuthFoot />
      </AuthScreen>
    );
  }

  /* ----------------------------------------------- 3c · signing in paused */

  if (phase === 'locked') {
    return (
      <AuthScreen>
        <AuthTop>
          <BackButton onPress={() => navigation.goBack()} />
        </AuthTop>
        <View style={styles.lock}>
          <View style={styles.lockRing}>
            <IconLock size={32} color={colors.danger} />
          </View>
          <Text style={styles.lockTitle}>Sign-in paused</Text>
          <Text style={styles.lockBody}>{lockBody(lockTotal)}</Text>
          <Text style={styles.lockCount}>{clock(lockLeft)}</Text>
        </View>
        <AuthFoot>
          {/* Never a disabled control here. `SUPPORT_WHATSAPP_NUMBER` reads an
              env var that defaults to '', so a deploy that forgets it used to
              render a dead button on the one screen a locked-out trainer
              reaches — and a fallback that silently switches itself off is
              indistinguishable from a product that never had one. When the
              number is absent the row is not drawn at all and the sentence
              underneath carries the recovery that is always true instead: the
              lock is on this number, and the wait is the way out. */}
          {SUPPORT_WHATSAPP_NUMBER ? (
            <WhatsAppButton
              label="Message support on WhatsApp"
              onPress={() => {
                void openWhatsApp(SUPPORT_WHATSAPP_NUMBER, `Locked out of XRep · +91 ${phone}`);
              }}
            />
          ) : null}
          <Legal>
            The lock is on this number, not on your account — it lifts by itself, and signing in on
            another device is not affected. Nothing has been lost either: your clients, sessions and
            payments are exactly where you left them.
          </Legal>
        </AuthFoot>
      </AuthScreen>
    );
  }

  /* ------------------------------------------ 2a · 2b · 3a · 3b · the field */

  const message = failure ? failureMessage(failure) : null;
  // resendCount + 1 = codes sent on this number, counting the one PhoneScreen sent.
  const showWhatsApp = expired || resendCount + 1 >= WHATSAPP_FROM_DELIVERY;
  const resendLive = resendLeft <= 0 && !resending;

  return (
    <AuthScreen>
      <AuthTop>
        <BackButton onPress={() => navigation.goBack()} />
      </AuthTop>

      <AuthBody>
        <AuthTitle>Enter the code</AuthTitle>
        <AuthSub>
          Sent to +91 {formatPhone(phone)} ·{' '}
          <AuthLink label="Change" onPress={() => navigation.goBack()} />
        </AuthSub>

        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next);
            // Same rule as the rest of the system: errors clear on input.
            if (failure) setFailure(null);
            if (notice) setNotice(null);
          }}
          onFilled={verify}
          status={slotStatus(phase, failure)}
          shakeNonce={shakeNonce}
          // Stays editable while verifying so the keyboard doesn't flap shut on
          // an auto-submit. Re-entry is harmless — verify() ignores re-entry.
          editable={!expired}
          inputRef={inputRef}
          accessibilityLabel="Enter the 6-digit code"
        />

        <FieldMsg tone={message?.tone ?? 'hint'} style={styles.msg}>
          {message?.text ?? notice}
        </FieldMsg>

        {expired ? (
          <>
            <Button
              label="Send a new code"
              variant="secondary"
              block
              icon={IconRefresh}
              loading={resending}
              onPress={() => void resend('sms')}
              style={styles.expiredAction}
            />
            <WhatsAppButton
              label="Get it on WhatsApp instead"
              onPress={() => void resend('whatsapp')}
            />
          </>
        ) : (
          <>
            <View style={styles.resend}>
              <Text style={styles.resendLabel}>Didn't get it?</Text>
              <Pressable
                onPress={() => void resend('sms')}
                disabled={!resendLive}
                hitSlop={{ top: 15, bottom: 15, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityState={{ disabled: !resendLive, busy: resending }}
              >
                <Text style={[styles.resendAction, resendLive && styles.resendLive]}>
                  {resending
                    ? 'Sending…'
                    : resendLive
                      ? 'Send a new code'
                      : `Resend in ${clock(resendLeft)}`}
                </Text>
              </Pressable>
            </View>

            {showWhatsApp ? (
              <WhatsAppButton
                label="Get it on WhatsApp instead"
                onPress={() => void resend('whatsapp')}
              />
            ) : null}

            {/* Steps aside while the keyboard is up — state 2b. */}
            {keyboardUp ? null : (
              <TrustNote icon={IconShield}>
                XRep will never ask for this code on a call or over WhatsApp.{' '}
                <TrustStrong>Nobody from XRep will ever ask you to share it.</TrustStrong>
              </TrustNote>
            )}
          </>
        )}
      </AuthBody>

      <AuthFoot compact={keyboardUp}>
        <Button
          label={busy ? 'Verifying' : 'Verify'}
          variant="primary"
          size="lg"
          block
          loading={busy}
          disabled={code.length !== 6 || expired}
          onPress={() => void verify(code)}
        />
      </AuthFoot>
    </AuthScreen>
  );
}

/* ------------------------------------------------------------------ helpers */

/** A one-second countdown that stops dead at zero. */
function useCountdown(initial: number) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

/**
 * The lock copy states the policy, so it reads it off the same constants the
 * server enforces rather than restating them — `retryAfterSeconds` is per
 * response, and a hard-coded "10 minutes" goes quietly wrong the day it isn't.
 */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** 3 → "Three". Small numbers are spelt in body copy, per the design file. */
function spell(n: number): string {
  const word = WORDS[n];
  return word ? word[0].toUpperCase() + word.slice(1) : String(n);
}

/** 600 → "10 minutes", 60 → "a minute". */
function minutes(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return m === 1 ? 'a minute' : `${m} minutes`;
}

/**
 * Say why and say when — § 06. The "when" is the countdown below it, which is
 * exact either way; the "for N minutes" is only stated when we watched the lock
 * start. Arriving on a lock already running, all the server tells us is what is
 * left of it, and "paused for 4 minutes" would be quietly wrong about a 10.
 */
function lockBody(total: number | null): string {
  const paused = total === null ? "We've paused it" : `We've paused it for ${minutes(total)}`;
  return `${spell(ATTEMPT_LIMIT)} wrong codes on this number. ${paused} to keep your clients' data safe.`;
}

/** m:ss — the countdown format the design file uses for both resend and lock. */
function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 9884021774 → 98840 21774, matching how the number was entered. */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

function slotStatus(phase: Phase, failure: OtpFailure | null): OtpStatus {
  if (phase === 'verified') return 'ok';
  if (failure?.kind === 'expired') return 'expired';
  if (failure?.kind === 'wrong') return 'error';
  return 'default';
}

/**
 * Three failures, three recoveries, three different words. Attempts remaining
 * only appears from 3 left onward — warn before the wall, not at it.
 */
function failureMessage(failure: OtpFailure): { text: string; tone: FieldMsgTone } {
  switch (failure.kind) {
    case 'wrong': {
      const left = failure.attemptsLeft;
      if (left !== null && left >= 1 && left <= ATTEMPTS_WARN_FROM) {
        return {
          text: `That code doesn't match. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
          tone: 'error',
        };
      }
      return { text: "That code doesn't match.", tone: 'error' };
    }
    case 'expired':
      return {
        text: `That code expired. They're good for ${CODE_TTL_MINUTES} minutes.`,
        tone: 'warn',
      };
    case 'offline':
      return { text: 'No internet. Signing in needs it, just this once.', tone: 'warn' };
    case 'locked':
      return { text: 'Sign-in paused on this number.', tone: 'error' };
    case 'unknown':
      return { text: "Couldn't check that code. Try again.", tone: 'error' };
  }
}

/* ------------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  msg: { marginTop: 10 },

  resend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  resendLabel: { fontSize: 13.5, color: colors.ink3 },
  resendAction: { fontSize: 13.5, fontWeight: '600', color: colors.ink3, ...tnum },
  resendLive: { color: colors.accentText },

  expiredAction: { marginTop: space.s4 },

  /* --- 2c --- */
  verified: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  verifiedRing: {
    width: 84,
    height: 84,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.okSoft,
    borderWidth: 1,
    borderColor: 'rgba(61,220,132,0.35)',
    shadowColor: colors.ok,
    shadowOpacity: 0.18,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 0 },
  },
  verifiedTitle: { fontSize: 23, fontWeight: '800', letterSpacing: -0.58, color: colors.ink },
  verifiedBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink2,
    textAlign: 'center',
    maxWidth: 260,
  },

  /* --- 3c --- */
  lock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s4,
  },
  lockRing: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,90,0.3)',
  },
  lockTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.53, color: colors.ink },
  lockBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink2,
    textAlign: 'center',
    maxWidth: 280,
  },
  lockCount: { fontSize: 34, fontWeight: '800', letterSpacing: -1.02, color: colors.ink, ...tnum },
});
