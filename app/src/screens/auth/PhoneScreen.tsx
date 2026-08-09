/**
 * Screen 01 · Sign in · Phone entry — the front door.
 *
 * Built to `agent/design system/screens/trainxloginotp.html` § 01:
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
import { isOfflineError, isRateLimited, readOtpLock, requestOtp } from '../../api/auth';
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
 * The domain the OTP SMS is bound to (`@trainx.app #481234`), so these are the
 * same origin. Point them elsewhere the day legal copy moves.
 */
const TERMS_URL = 'https://trainx.app/terms';
const PRIVACY_URL = 'https://trainx.app/privacy';

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
    // The error clears the moment the tenth digit lands — not before, or it
    // flickers away while the number is still half-typed.
    if (message && next.length === PHONE_LENGTH) setMessage(null);
  };

  /** Validation happens on blur, never on the first keystroke. */
  const handleBlur = () => {
    if (digits.length === 0 || complete) return;
    setMessage({
      text: `That's ${digits.length} ${digits.length === 1 ? 'digit' : 'digits'} — Indian mobile numbers have ${PHONE_LENGTH}`,
      tone: 'error',
    });
  };

  const handleSend = async () => {
    if (!complete || loading) return;
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
      if (isOfflineError(err)) {
        setMessage({
          text: 'No internet. Signing in needs it, just this once.',
          tone: 'warn',
        });
      } else if (isRateLimited(err)) {
        setMessage({
          text: "That's a lot of codes. Give it a minute before trying again.",
          tone: 'warn',
        });
      } else {
        setMessage({ text: "Couldn't send the code. Try again.", tone: 'error' });
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
          placeholder="98765 43210"
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
            in, Train X works fully offline and syncs when it can.
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
