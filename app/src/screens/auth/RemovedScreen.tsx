/**
 * Screen 01 · § 07d — "Ravi Kannan ended your coaching."
 *
 * Shown exactly once, and the "once" is the whole design.
 *
 * ── Why a screen at all ───────────────────────────────────────────────────────
 *
 * The alternative was silence: the membership simply stops resolving and the
 * person lands on "we don't know this number". That is indistinguishable from a
 * bug, and the support message it produces — "the app has forgotten me" — costs
 * more than the screen does. Somebody whose trainer ended things is owed the
 * sentence, with a name and a date on it, so they know what happened and who to
 * ask about it.
 *
 * ── Why it does not repeat ────────────────────────────────────────────────────
 *
 * The server row outlives the membership on purpose — the trainer's payments,
 * packages and session history all point at it, and deleting it to make the
 * client's app tidy would take money out of somebody's book. So `removed` stays
 * true forever, and without an acknowledgement this screen would be the app for
 * the rest of time. Tapping through stamps `removed_ack_at`, which is what
 * retires it.
 *
 * ── The wipe ──────────────────────────────────────────────────────────────────
 *
 * Local only. Their copy of the plans, sessions and logs goes; the trainer's
 * copy is untouched. Done AFTER the acknowledgement lands rather than before, so
 * a failed request leaves the phone as it was — a wipe that ran against a server
 * that never got the message would erase the data AND show this screen again.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { AuthStackParamList } from '../../navigation/AuthStack';
import { acknowledgeRemoval } from '../../api/auth';
import { resetLocalDatabase } from '../../db/sync';
import {
  AuthBody,
  AuthFoot,
  AuthScreen,
  AuthSub,
  AuthTitle,
  AuthTop,
  Brandmark,
  openWhatsApp,
} from './authLayout';
import { Avatar, Button, colors, radius, space } from '../../design';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Removed'>;
  route: RouteProp<AuthStackParamList, 'Removed'>;
};

export default function RemovedScreen({ navigation, route }: Props) {
  const { token, removed } = route.params;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const who = removed.trainerName || 'Your trainer';

  const acknowledge = async () => {
    setBusy(true);
    setError(null);
    try {
      // Server first. If this fails the phone keeps its data and the screen
      // comes back, which is the recoverable order of the two.
      await acknowledgeRemoval(token, removed.clientId);
      await resetLocalDatabase();
      navigation.replace('Unattached', { trainerName: removed.trainerName });
    } catch {
      setBusy(false);
      setError('Could not reach the server. Check your connection and try again.');
    }
  };

  return (
    <AuthScreen>
      <AuthTop>
        <Brandmark />
      </AuthTop>

      <AuthBody>
        <View style={styles.head}>
          <Avatar name={removed.trainerName || '?'} size="lg" />
          <View style={styles.headText}>
            <AuthTitle>{who} ended your coaching</AuthTitle>
            <AuthSub>{onDate(removed.removedOn)}</AuthSub>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What happens now</Text>
          <Text style={styles.cardBody}>
            Your plans, sessions and logs will be cleared from this phone. {who} keeps their own
            record, including anything you have already paid.
          </Text>
          <Text style={styles.cardBody}>
            Nothing else changes. Your number still works here, and any trainer can add you again.
          </Text>
        </View>

        {/* The fix is not on this phone. If they think this is a mistake, the
            person who can undo it is the trainer, so point straight at them
            rather than at a support address that would only forward it. */}
        {removed.trainerPhone ? (
          <Text style={styles.ask}>
            Think this is a mistake?{' '}
            <Text
              accessibilityRole="link"
              style={styles.askLink}
              onPress={() => {
                void openWhatsApp(
                  `91${removed.trainerPhone}`,
                  `Hi ${who}, has my XRep coaching ended?`,
                );
              }}
            >
              Message {who}
            </Text>
            .
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </AuthBody>

      <AuthFoot>
        <Button
          label="OK"
          size="lg"
          block
          loading={busy}
          disabled={busy}
          onPress={() => void acknowledge()}
        />
      </AuthFoot>
    </AuthScreen>
  );
}

/** "2026-08-14" → "on 14 August 2026". Undated removals just say it ended. */
function onDate(iso: string | null): string {
  if (!iso) return 'Your coaching here has ended.';
  const at = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(at.getTime())) return 'Your coaching here has ended.';
  return `on ${at.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginBottom: space.s4 },
  headText: { flex: 1 },

  card: {
    padding: 16,
    borderRadius: radius.r3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space.s2,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardBody: { fontSize: 13.5, lineHeight: 20, color: colors.ink2 },

  ask: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: space.s3 },
  askLink: { color: colors.ink2, textDecorationLine: 'underline' },

  error: { fontSize: 13, lineHeight: 19, color: colors.danger, marginTop: space.s3 },
});
