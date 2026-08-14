/**
 * Screen 01 · § 07a — Number not recognised.
 *
 * Trainers create clients (FR-1), so the most likely first experience in this
 * whole product is a client downloading the app, typing their number, and the
 * system having never seen it — because their trainer hasn't added them yet, or
 * added a different number. Without this screen they are stuck at a spinner, and
 * that is the single most common way a coaching app loses a client on day one.
 *
 * One screen, two exits, and neither is a dead end. Note that it appears AFTER
 * OTP verification, never before: revealing which numbers exist before somebody
 * has proved they own one leaks the customer list.
 *
 * This is also where a trainer account now gets created. Signing in used to mint
 * one for any number that verified, which quietly handed a coaching workspace to
 * every client who tried the app first.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { AuthStackParamList } from '../../navigation/AuthStack';
import { claimTrainerAccount, needsSetup, roleOf } from '../../api/auth';
import { useAuth } from '../../store/AuthContext';
import {
  AuthBody,
  AuthFoot,
  AuthScreen,
  AuthSub,
  AuthTitle,
  AuthTop,
  BackButton,
  TrustNote,
  TrustStrong,
} from './authLayout';
import {
  Button,
  IconAlert,
  IconUserAdd,
  IconUsers,
  Sheet,
  colors,
  radius,
  space,
} from '../../design';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Unknown'>;
  route: RouteProp<AuthStackParamList, 'Unknown'>;
};

export default function UnknownScreen({ navigation, route }: Props) {
  const { phone, token } = route.params;
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** "I'm a trainer" — open the workspace, then straight into setup. */
  const beTrainer = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await claimTrainerAccount(token);
      if (!data.token) throw new Error('No token');
      await signIn({
        token: data.token,
        trainerId: data.trainerId,
        owesSetup: needsSetup(data),
        lens: roleOf(data) === 'client' ? 'client' : 'trainer',
        clientId: data.clientOf?.[0]?.clientId ?? null,
        memberships: data.clientOf ?? [],
      });
    } catch {
      setBusy(false);
      setError('Could not set that up just now. Check your connection and try again.');
    }
  };

  return (
    <AuthScreen>
      <AuthTop>
        <BackButton onPress={() => navigation.goBack()} />
      </AuthTop>

      <AuthBody>
        <AuthTitle>We don&apos;t know this number yet</AuthTitle>
        <AuthSub>+91 {format(phone)} isn&apos;t on XRep. Which are you?</AuthSub>

        <View style={styles.options}>
          <Option
            icon={IconUsers}
            title="I'm a trainer"
            body="Set up your roster — takes about a minute"
            onPress={() => void beTrainer()}
            disabled={busy}
          />
          <Option
            icon={IconUserAdd}
            title="I train with someone"
            body="Your trainer adds you — we'll show you how"
            onPress={() => setHowOpen(true)}
            disabled={busy}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

      </AuthBody>

      <AuthFoot>
        <Button
          label="Use a different number"
          variant="ghost"
          size="lg"
          block
          disabled={busy}
          onPress={() => navigation.popTo('Phone')}
        />
      </AuthFoot>

      {/* The second exit has to say something true and useful, and the true
          thing is that the fix is not on this phone. Their trainer adds them;
          nothing here can. */}
      <Sheet visible={howOpen} onClose={() => setHowOpen(false)} title="Your trainer adds you">
        <Text style={styles.sheetBody}>
          XRep works from your trainer&apos;s roster, so they add you with the number you just
          typed — there is nothing for you to set up.
        </Text>
        <Text style={styles.sheetBody}>
          Send them this number, <Text style={styles.sheetStrong}>+91 {format(phone)}</Text>, and
          sign in again once they say they&apos;ve added you. Your plan, your sessions and anything
          you owe will be here.
        </Text>
        <Text style={styles.sheetQuiet}>
          Nothing was created just now. Signing in again costs one more code.
        </Text>
        <Button
          label="Got it"
          size="lg"
          block
          style={styles.sheetButton}
          onPress={() => setHowOpen(false)}
        />
      </Sheet>
    </AuthScreen>
  );
}

/** 9884021774 → 98840 21774. */
function format(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

function Option({
  icon: Icon,
  title,
  body,
  onPress,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  body: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed, disabled && styles.optionOff]}
    >
      <View style={styles.optionIcon}>
        <Icon size={19} color={colors.ink2} />
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionBody}>{body}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  options: { gap: space.s2, marginBottom: space.s3 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    padding: 16,
    minHeight: 72,
    borderRadius: radius.r3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  optionPressed: { backgroundColor: colors.surface2 },
  optionOff: { opacity: 0.5 },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  optionBody: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: 3 },

  error: { fontSize: 13, lineHeight: 19, color: colors.danger, marginBottom: space.s3 },

  sheetBody: { fontSize: 14, lineHeight: 21, color: colors.ink2, marginBottom: space.s3 },
  sheetStrong: { color: colors.ink, fontWeight: '700' },
  sheetQuiet: { fontSize: 12.5, lineHeight: 19, color: colors.ink3 },
  sheetButton: { marginTop: space.s4 },
});
