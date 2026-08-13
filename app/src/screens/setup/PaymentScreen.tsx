/**
 * Screen 02 · Trainer setup · Step 6 of 6 · Getting paid.
 *
 * `agent/design system/screens/xreptrainersetup.html` § 05 — 5a empty,
 * 5b format valid, 5c bad format.
 *
 * We check that a UPI ID LOOKS like a UPI ID. We do not call a payment
 * provider, so we cannot confirm the account exists or that it belongs to this
 * trainer — a single wrong letter passes the check and sends the money to a
 * stranger. That is a real risk to someone's income, so on a valid format the
 * screen stops being a form and becomes a read-back: the ID repeated at 21px,
 * the limits of our check stated outright, and a ₹1 self-transfer offered as
 * the only proof actually available to us.
 *
 * The day a provider is wired in, the read-back is replaced by a name lookup —
 * not softened into "verified".
 */

import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { useSetup } from '../../setup/SetupContext';
import { UPI_HANDLES } from '../../setup/options';
import {
  Button,
  Callout,
  CalloutStrong,
  Card,
  Control,
  FieldLabel,
  FieldMsg,
  IconAlert,
  IconMessage,
  IconRefresh,
  IconRupee,
  colors,
  space,
  tnum,
  type,
  useKeyboardVisible,
} from '../../design';
import { SetupBar, SetupBody, SetupFoot, SetupScreen, SetupSub, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Payment'>;
};

/**
 * NPCI's virtual payment address shape: a handle after an `@`, no spaces. This
 * is the ONLY thing about a UPI ID we are in a position to check, and the copy
 * on this screen never claims otherwise.
 */
const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export function isUpiFormat(value: string): boolean {
  return UPI_PATTERN.test(value.trim());
}

export default function PaymentScreen({ navigation }: Props) {
  const { draft, patch, skip, finish } = useSetup();
  const [upi, setUpi] = useState(draft.upiId);
  const [touched, setTouched] = useState(false);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const keyboardUp = useKeyboardVisible();

  const trimmed = upi.trim();
  const valid = isUpiFormat(trimmed);
  const showError = touched && trimmed.length > 0 && !valid;

  const done = async () => {
    patch({ upiId: trimmed });
    await finish();
    navigation.navigate('Done');
  };

  const onSkip = async () => {
    skip('payment');
    await finish();
    navigation.navigate('Done');
  };

  /** The only real proof available to us: send yourself a rupee and watch. */
  const selfTest = async () => {
    const url = `upi://pay?pa=${encodeURIComponent(trimmed)}&pn=${encodeURIComponent(
      draft.name || 'Me',
    )}&am=1&cu=INR`;
    try {
      await Linking.openURL(url);
    } catch {
      setNotice('No UPI app on this phone. Open GPay, PhonePe or Paytm and send ₹1 there.');
    }
  };

  /* ------------------------------------------------------- 5b · read-back */

  if (reading) {
    return (
      <SetupScreen>
        <SetupBar step="payment" onBack={() => setReading(false)} onSkip={() => void onSkip()} />

        <SetupBody>
          {/* Not "verified" — read this back. The word matters. */}
          <SetupTitle tight>Read this back to yourself</SetupTitle>
          <SetupSub>
            The format is right. Now check every character — this is where your money lands.
          </SetupSub>

          <Card style={styles.readCard}>
            <Text style={styles.micro}>Your UPI ID</Text>
            <Text style={styles.readValue}>{trimmed}</Text>
          </Card>

          <Callout icon={IconAlert} style={styles.readNote}>
            <CalloutStrong>We only checked the format.</CalloutStrong> We can't tell whether this
            UPI ID is really yours — a single wrong letter still looks perfectly valid to us, and
            the money would go to a stranger.
          </Callout>

          <Button
            label="Send yourself ₹1 to be sure"
            variant="secondary"
            block
            icon={IconRupee}
            onPress={() => void selfTest()}
          />
          {notice ? <FieldMsg tone="warn">{notice}</FieldMsg> : null}

          <Callout icon={IconRefresh} style={styles.trailing}>
            Change it any time in Settings. If a payment doesn't arrive, this is the first thing to
            check.
          </Callout>
        </SetupBody>

        <SetupFoot>
          <View style={styles.pair}>
            <Button
              label="Edit"
              variant="ghost"
              size="lg"
              style={styles.pairEdit}
              onPress={() => setReading(false)}
            />
            <Button
              label="That's correct"
              variant="primary"
              size="lg"
              style={styles.pairConfirm}
              onPress={() => void done()}
            />
          </View>
        </SetupFoot>
      </SetupScreen>
    );
  }

  /* ------------------------------------------------------ 5a · 5c · entry */

  return (
    <SetupScreen>
      <SetupBar step="payment" onBack={() => navigation.goBack()} onSkip={() => void onSkip()} />

      <SetupBody>
        <SetupTitle tight>How should clients pay you?</SetupTitle>
        <SetupSub>Your UPI ID. Money goes straight to you — Train X never holds it.</SetupSub>

        <FieldLabel>UPI ID</FieldLabel>
        <Control
          value={upi}
          onChangeText={(next) => {
            setUpi(next);
            if (touched && isUpiFormat(next)) setTouched(false);
          }}
          onBlur={() => setTouched(true)}
          onSubmitEditing={() => valid && setReading(true)}
          error={showError}
          placeholder="name@okhdfcbank"
          inputMode="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="UPI ID"
        />
        <FieldMsg tone={showError ? 'error' : 'hint'}>
          {showError
            ? 'A UPI ID needs an @ and a handle after it'
            : 'Open GPay, PhonePe or Paytm → your profile → UPI ID'}
        </FieldMsg>

        {showError ? (
          <>
            <Callout icon={IconMessage} style={styles.shape}>
              It looks like <CalloutStrong>yourname@handle</CalloutStrong>. The handle depends on the
              app you use.
            </Callout>
            {keyboardUp ? null : (
              <Callout icon={IconRupee} style={styles.trailing}>
                Common handles: <CalloutStrong>{UPI_HANDLES.join(' · ')}</CalloutStrong>
              </Callout>
            )}
          </>
        ) : keyboardUp ? null : (
          <Callout icon={IconRupee} style={styles.trailing}>
            Skipping is fine. We'll ask again the first time you try to collect from a client —{' '}
            <CalloutStrong>which is when it actually matters.</CalloutStrong>
          </Callout>
        )}
      </SetupBody>

      <SetupFoot compact={keyboardUp}>
        <Button
          label="Finish"
          variant="primary"
          size="lg"
          block
          disabled={!valid}
          onPress={() => setReading(true)}
        />
      </SetupFoot>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  shape: { marginTop: 16 },
  trailing: { marginTop: 'auto' },

  readCard: { marginBottom: 14 },
  micro: { ...type.micro, color: colors.ink3 },
  /* 21px so every character is checkable, and it wraps rather than truncating —
     an ellipsised UPI ID defeats the entire purpose of this screen. */
  readValue: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0.42,
    color: colors.ink,
    marginTop: space.s2,
    ...tnum,
  },
  readNote: { marginBottom: 10 },

  pair: { flexDirection: 'row', gap: space.s2 },
  pairEdit: { flexGrow: 0, flexShrink: 0, flexBasis: 108 },
  pairConfirm: { flex: 1 },
});
