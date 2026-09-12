/**
 * Screen 01 · § 07c — "Ravi Kannan added you."
 *
 * The consent step. A trainer typing somebody's number into their roster is a
 * CLAIM, not a relationship, and until this screen is answered there is a person
 * in the database who has never heard of us. This is where that gets fixed.
 *
 * ── Why it is a screen and not a toast ────────────────────────────────────────
 *
 * What is being agreed to is not trivial: from the moment they accept, their
 * trainer can see every set they log, every weight they record and every session
 * they keep or miss. Somebody who has only ever been told "I'll add you on the
 * app" deserves to read that in a sentence before it is true, and to have a
 * decline that actually works.
 *
 * So: both exits are real. Decline is not a smaller button in a corner — it sits
 * in the same footer at the same weight, because an accept that was the only way
 * out of the screen is not consent.
 *
 * ── What this screen may NOT do ───────────────────────────────────────────────
 *
 * Show any training data. The token behind it opens no sync scope — the server
 * refuses it on both `/v1/sync` and `/v1/client` — so there is nothing to leak
 * even by accident. The trainer's name and gym come from the sign-in response
 * itself, which is the least we can say and still let somebody tell whether they
 * recognise who is asking.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { AuthStackParamList } from '../../navigation/AuthStack';
import { acceptInvite, declineInvite, needsSetup, roleOf } from '../../api/auth';
import { useAuth } from '../../store/AuthContext';
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
} from './authLayout';
import {
  Avatar,
  Button,
  Dialog,
  IconChart,
  IconDumbbell,
  IconLock,
  colors,
  radius,
  space,
} from '../../design';

const PRIVACY_URL = 'https://inclineyou.app/privacy';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Invite'>;
  route: RouteProp<AuthStackParamList, 'Invite'>;
};

/**
 * What accepting actually means, in the order it matters to the person reading.
 *
 * Written as consequences rather than as features: "your trainer can see what
 * you log" is the sentence somebody needs, and "shared training log" is the
 * sentence that hides it.
 */
const TERMS = [
  {
    icon: IconDumbbell,
    title: 'They write your plan',
    body: 'Your sessions and workouts come from them, and show up here.',
  },
  {
    icon: IconChart,
    title: 'They see what you log',
    body: 'Every set, weight and session you record is visible to this trainer.',
  },
  {
    icon: IconLock,
    title: 'Nobody else does',
    body: 'No other client and no other trainer can see any of it. Ever.',
  },
] as const;

export default function InviteScreen({ navigation, route }: Props) {
  const { token, membership } = route.params;
  const { signIn } = useAuth();

  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy('accept');
    setError(null);
    try {
      const { data } = await acceptInvite(token, membership.clientId);
      if (!data.token) throw new Error('No token');
      await signIn({
        token: data.token,
        trainerId: data.trainerId,
        owesSetup: needsSetup(data),
        // The server has re-resolved the identity, so this is its answer and
        // not our guess — a client who accepted one of two invites is still a
        // client, and the roster list that comes back says which.
        lens: roleOf(data) === 'client' ? 'client' : 'trainer',
        clientId: data.clientOf?.[0]?.clientId ?? null,
        memberships: data.clientOf ?? [],
      });
    } catch {
      setBusy(null);
      setError('Could not send your answer. Check your connection and try again.');
    }
  };

  /**
   * Decline, and then land somewhere honest.
   *
   * The response says what is left. Another outstanding invite means this screen
   * again for the next trainer; nothing left means `unattached`, which is its
   * own screen and explicitly not 7a — this number is a client's, and offering
   * it a coaching account here would be the wrong turn.
   */
  const decline = async () => {
    setConfirmDecline(false);
    setBusy('decline');
    setError(null);
    try {
      const { data } = await declineInvite(token, membership.clientId);
      const next = (data.clientOf ?? []).find((m) => m.membershipStatus === 'invited');
      if (next && data.token) {
        navigation.replace('Invite', { token: data.token, membership: next });
        return;
      }
      navigation.replace('Unattached', { trainerName: membership.trainerName });
    } catch {
      setBusy(null);
      setError('Could not send your answer. Check your connection and try again.');
    }
  };

  const who = membership.trainerName || 'Your trainer';

  return (
    <AuthScreen>
      <AuthTop>
        <Brandmark />
      </AuthTop>

      <AuthBody>
        <View style={styles.head}>
          <Avatar name={membership.trainerName || '?'} size="lg" />
          <View style={styles.headText}>
            <AuthTitle>{who} added you</AuthTitle>
            <AuthSub>
              {membership.gymName
                ? `${membership.gymName} · as ${membership.clientName}`
                : `As ${membership.clientName}`}
            </AuthSub>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {TERMS.map((t) => (
            <View key={t.title} style={styles.term}>
              <View style={styles.termIcon}>
                <t.icon size={18} color={colors.ink2} />
              </View>
              <View style={styles.termText}>
                <Text style={styles.termTitle}>{t.title}</Text>
                <Text style={styles.termBody}>{t.body}</Text>
              </View>
            </View>
          ))}

          {/* The out, stated before they are asked to choose rather than after —
              a promise that declining is survivable is worth nothing once the
              only remaining button is "Accept". */}
          <Text style={styles.note}>
            You can leave at any time from your profile, and nothing is shared until you accept.
          </Text>
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </AuthBody>

      <AuthFoot>
        <Button
          label="Accept"
          size="lg"
          block
          loading={busy === 'accept'}
          disabled={busy !== null}
          onPress={() => void accept()}
        />
        {/* Same footer, same size. A decline that has to be hunted for is not a
            decline, and this is the screen where that matters most. */}
        <Button
          label="Not my trainer"
          variant="ghost"
          size="lg"
          block
          style={styles.decline}
          loading={busy === 'decline'}
          disabled={busy !== null}
          onPress={() => setConfirmDecline(true)}
        />
        <Legal>
          Accepting means you agree to our <LegalLink label="Privacy Policy" url={PRIVACY_URL} />.
        </Legal>
      </AuthFoot>

      <Dialog
        visible={confirmDecline}
        title={`Decline ${who}?`}
        confirmLabel="Decline"
        cancelLabel="Go back"
        onConfirm={() => void decline()}
        onCancel={() => setConfirmDecline(false)}
      >
        <Text style={styles.dialogBody}>
          They keep their own record of you, but nothing of yours is shared and you won&apos;t see
          their plans. They can invite you again.
        </Text>
      </Dialog>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginBottom: space.s4 },
  headText: { flex: 1 },

  list: { gap: space.s2, paddingBottom: space.s2 },
  term: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s3,
    padding: 14,
    borderRadius: radius.r3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  termIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termText: { flex: 1 },
  termTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  termBody: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: 3 },

  note: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: space.s2 },
  error: { fontSize: 13, lineHeight: 19, color: colors.danger, marginTop: space.s3 },

  decline: { marginTop: space.s2 },
  dialogBody: { fontSize: 14, lineHeight: 21, color: colors.ink2 },
});
