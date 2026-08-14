/**
 * Screen 01 · § 07b — Your access is paused.
 *
 * FR-1 has pause AND soft delete, so both need an answer at sign-in. Paused is
 * not deleted, and this screen says so in those words: nothing they logged has
 * been removed, and it all comes back when their trainer resumes them.
 *
 * Naming the trainer and the date is what turns a wall into information. And the
 * button is a WhatsApp to them, not to us — the person who can undo this is the
 * one who did it.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { AuthStackParamList } from '../../navigation/AuthStack';
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
  openWhatsApp,
} from './authLayout';
import { Button, IconLock, IconMessage, colors, space } from '../../design';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Paused'>;
  route: RouteProp<AuthStackParamList, 'Paused'>;
};

export default function PausedScreen({ navigation, route }: Props) {
  const { trainerName, trainerPhone, pausedOn } = route.params;

  const message = () => {
    const text = `Hi ${trainerName}, my XRep access is paused. Could you turn it back on?`;
    if (trainerPhone) void openWhatsApp(trainerPhone, text);
  };

  return (
    <AuthScreen>
      <AuthTop>
        <BackButton onPress={() => navigation.popTo('Phone')} />
      </AuthTop>

      <AuthBody>
        <AuthTitle>Your access is paused</AuthTitle>
        <AuthSub>
          {trainerName} paused your account{pausedOn ? ` on ${longDate(pausedOn)}` : ''}. Your
          history is safe — you&apos;ll get everything back when they resume it.
        </AuthSub>

        <TrustNote icon={IconLock}>
          <TrustStrong>Paused is not deleted.</TrustStrong> Nothing you logged has been removed —
          every session, every set and every payment is still there.
        </TrustNote>
      </AuthBody>

      <AuthFoot>
        {trainerPhone ? (
          <Button
            label={`Message ${firstName(trainerName)}`}
            icon={IconMessage}
            size="lg"
            block
            onPress={message}
          />
        ) : (
          <Text style={styles.noNumber}>
            We don&apos;t have a number for {firstName(trainerName)} on this phone. Reach them the
            way you usually do.
          </Text>
        )}
      </AuthFoot>
    </AuthScreen>
  );
}

/** "2026-07-22" → "22 July". The year is noise on a date this recent. */
function longDate(iso: string): string {
  const at = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const styles = StyleSheet.create({
  noNumber: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.ink3,
    textAlign: 'center',
    paddingHorizontal: space.s3,
  },
});
