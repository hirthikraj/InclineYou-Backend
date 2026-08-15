/**
 * Screen 01 · Sign in · Phone entry — the front door.
 *
 * Built to `agent/design system/screens/xreploginotp.html` § 01:
 *
 *   1a  default — CTA visible but disabled until 10 digits
 *   1b  filled, keyboard up — the CTA docks above the keyboard
 *   1c  invalid number — the error names the actual problem
 *
 * One field, one button. The headline IS the field's label rather than a
 * caption repeating itself above the box, so the input is labelled by it.
 */

import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { AuthStackParamList } from '../../navigation/AuthStack';
import {
  isOfflineError,
  isRateLimited,
  readOtpLock,
  readSendThrottle,
  readValidationDetail,
  requestOtp,
  throttleMessage,
} from '../../api/auth';
import {
  Button,
  Control,
  FieldMsg,
  FlagIN,
  IconChevronDown,
  IconCloudOff,
  colors,
  tnum,
  type FieldMsgTone,
} from '../../design';
import {
  AuthBody,
  AuthFoot,
  AuthScreen,
  AuthSub,
  AuthTitle,
  AuthTop,
  Brandmark,
  Legal,
  LegalLink,
  TrustNote,
  TrustStrong,
  useKeyboardVisible,
} from './authLayout';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Phone'>;
};

/** Indian mobile numbers are 10 digits. Never alphanumeric, never longer. */
const PHONE_LENGTH = 10;

/**
 * The whole rule, not just the length — a mirror of the `^[6-9]\d{9}$` on
 * `AuthController.OtpRequestBody`.
 *
 * Counting digits alone let a 5-leading number reach the network, where the
 * server's 400 arrived as "couldn't send the code. Try again." — which names
 * nothing, and points at the connection rather than the one character that is
 * wrong. TRAI allocates only the 6, 7, 8 and 9 series to mobile, so a number
 * outside them can never receive an SMS and there is nothing to retry.
 */
const PHONE_RE = /^[6-9]\d{9}$/;

/** 1c, for the one way a ten-digit number can still not be a mobile number. */
const LEAD_MSG = 'Indian mobile numbers start with 6, 7, 8 or 9.';

/**
 * The domain the OTP SMS is bound to (`@xrep.app #481234`), so these are the
 * same origin. Point them elsewhere the day legal copy moves.
 */
const TERMS_URL = 'https://xrep.app/terms';
const PRIVACY_URL = 'https://xrep.app/privacy';

export default function PhoneScreen({ navigation }: Props) {
  const [digits, setDigits] = useState('');
  const [message, setMessage] = useState<{ text: string; tone: FieldMsgTone } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const keyboardUp = useKeyboardVisible();

  // Not `autoFocus`: that only fires on mount, so coming back from "Change" on
  // the OTP screen would leave the field cold. Ask every time the screen lands.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }, []),
  );

  const complete = digits.length === PHONE_LENGTH;
  const invalid = message?.tone === 'error';

  const handleChange = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, PHONE_LENGTH);
    setDigits(next);
    // The error clears the moment the number becomes valid — not before, or it
    // flickers away while the number is still half-typed. A tenth digit that
    // still doesn't make a mobile number keeps the message: clearing it there
    // would hand the button back and invite the same rejection again.
    if (message && PHONE_RE.test(next)) setMessage(null);
  };

  /** Validation happens on blur, never on the first keystroke. */
  const handleBlur = () => {
    if (digits.length === 0) return;
    if (!complete) {
      setMessage({
        text: `That's ${digits.length} ${digits.length === 1 ? 'digit' : 'digits'} — Indian mobile numbers have ${PHONE_LENGTH}`,
        tone: 'error',
      });
      return;
    }
    // Ten digits and still not a mobile number: say which rule it missed,
    // rather than letting the server say it in worse words a round trip later.
    if (!PHONE_RE.test(digits)) setMessage({ text: LEAD_MSG, tone: 'error' });
  };

  const handleSend = async () => {
    if (!complete || loading) return;
    // Caught here rather than by disabling the CTA: state 1a earns the button at
    // ten digits, and a dead button that explains nothing is worse than a live
    // one that names the problem the moment it is pressed.
    if (!PHONE_RE.test(digits)) {
      setMessage({ text: LEAD_MSG, tone: 'error' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await requestOtp(digits);
      navigation.navigate('Otp', { phone: digits });
    } catch (err) {
      // Checked before the throttle: both answer 429, but a lock is wrong codes
      // on this number, not too many sends, and it has its own screen. The
      // countdown is what's LEFT of the lock, not its full length.
      const lockedFor = readOtpLock(err);
      if (lockedFor !== null) {
        navigation.navigate('Otp', { phone: digits, lockedFor });
        return;
      }
      // The send rate, which is not a lock and not a connection: the server says
      // how long is left, so quote that rather than guessing at "a minute".
      const throttledFor = readSendThrottle(err);
      if (throttledFor !== null) {
        setMessage({ text: throttleMessage(throttledFor), tone: 'warn' });
        return;
      }
      if (isOfflineError(err)) {
        setMessage({
          text: 'No internet. Signing in needs it, just this once.',
          tone: 'warn',
        });
      } else if (isRateLimited(err)) {
        // A 429 we can't read — an older server, or a proxy that ate the body.
        setMessage({
          text: "That's a lot of codes. Give it a minute before trying again.",
          tone: 'warn',
        });
      } else {
        // A refused field: the server has already written the sentence that
        // says what's wrong, so quote it rather than blaming the connection.
        // The local checks above should catch every case we know of — this is
        // the backstop for a rule the backend gains and the app hasn't learned.
        const detail = readValidationDetail(err);
        setMessage({
          text: detail ?? "Couldn't send the code. Try again.",
          tone: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <AuthTop>
        <Brandmark />
      </AuthTop>

      <AuthBody>
        <AuthTitle>Enter your mobile number</AuthTitle>
        <AuthSub>We'll text you a 6-digit code to sign you in.</AuthSub>

        <Control
          inputRef={inputRef}
          value={format(digits)}
          onChangeText={handleChange}
          onBlur={handleBlur}
          onSubmitEditing={() => void handleSend()}
          error={invalid}
          placeholder="98*** *****"
          keyboardType="phone-pad"
          inputMode="tel"
          maxLength={PHONE_LENGTH + 1} // the grouping space
          returnKeyType="go"
          textContentType="telephoneNumber"
          autoComplete="tel"
          // The headline is the label — see the note at the top of this file.
          accessibilityLabel="Enter your mobile number"
          seg={
            <>
              <FlagIN />
              <Text style={styles.dial}>+91</Text>
              <IconChevronDown size={13} color={colors.ink3} />
            </>
          }
        />

        <FieldMsg tone={message?.tone ?? 'hint'}>
          {message?.text ?? 'Your clients will see this number.'}
        </FieldMsg>

        {keyboardUp ? null : (
          <TrustNote icon={IconCloudOff}>
            <TrustStrong>This is the only screen that needs internet.</TrustStrong> After you're
            in, XRep works fully offline and syncs when it can.
          </TrustNote>
        )}
      </AuthBody>

      <AuthFoot compact={keyboardUp}>
        {/* Visible, not hidden: the next step is never a surprise. */}
        <Button
          label="Send code"
          variant="primary"
          size="lg"
          block
          loading={loading}
          disabled={!complete}
          onPress={() => void handleSend()}
        />
        {keyboardUp ? null : (
          <Legal>
            By continuing you agree to our <LegalLink label="Terms" url={TERMS_URL} /> and{' '}
            <LegalLink label="Privacy Policy" url={PRIVACY_URL} />.
          </Legal>
        )}
      </AuthFoot>
    </AuthScreen>
  );
}

/** 9884021774 → 98840 21774. Grouped so a 10-digit run stays scannable. */
function format(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

const styles = StyleSheet.create({
  dial: { color: colors.ink, fontSize: 16, fontWeight: '500', ...tnum },
});
