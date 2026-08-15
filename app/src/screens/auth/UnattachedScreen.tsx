/**
 * Screen 01 · § 07e — a client with nobody.
 *
 * Reached three ways: declining the only invite, acknowledging the only
 * removal, or signing in later on a number whose memberships are all already
 * answered and gone.
 *
 * ── Why this is not 7a ────────────────────────────────────────────────────────
 *
 * 7a ("we don't know this number") offers two exits, and one of them mints a
 * coaching account. That is right for a number the product has never seen and
 * wrong for this one: `app_user.role` says client, and role is exclusive now, so
 * "I'm a trainer" is a door that would either fail at the server or — worse —
 * quietly convert somebody who declined one invite into a trainer with an empty
 * roster. Same dead end, different reason, so it gets its own screen with the
 * honest sentence and no misleading second option.
 *
 * The one thing this screen must do is not read as a failure. Nothing went
 * wrong; there is simply nobody attached to this number right now, and the fix
 * is on somebody else's phone.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  Brandmark,
} from './authLayout';
import { Button, IconUserAdd, colors, radius, space } from '../../design';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Unattached'>;
  route: RouteProp<AuthStackParamList, 'Unattached'>;
};

export default function UnattachedScreen({ navigation, route }: Props) {
  const { trainerName } = route.params;

  return (
    <AuthScreen>
      <AuthTop>
        <Brandmark />
      </AuthTop>

      <AuthBody>
        <AuthTitle>You&apos;re not training with anyone</AuthTitle>
        <AuthSub>
          {trainerName
            ? `That's done with ${trainerName}. Nothing else is attached to this number.`
            : 'Nothing is attached to this number right now.'}
        </AuthSub>

        <View style={styles.card}>
          <View style={styles.icon}>
            <IconUserAdd size={19} color={colors.ink2} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>A trainer adds you</Text>
            <Text style={styles.cardBody}>
              XRep works from your trainer&apos;s roster, so there is nothing for you to set up.
              Give them this number and sign in again once they say they&apos;ve added you.
            </Text>
          </View>
        </View>

        <Text style={styles.quiet}>
          Signing in again costs one more code. Your number stays yours either way.
        </Text>
      </AuthBody>

      <AuthFoot>
        <Button
          label="Back to sign in"
          size="lg"
          block
          onPress={() => navigation.popTo('Phone')}
        />
      </AuthFoot>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s3,
    padding: 16,
    marginTop: space.s3,
    borderRadius: radius.r3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardBody: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginTop: 4 },

  quiet: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: space.s3 },
});
