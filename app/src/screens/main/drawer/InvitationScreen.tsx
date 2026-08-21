/**
 * 6d · you've been invited to a team.
 *
 * A full screen, not a sheet, and that is the one decision worth defending here:
 * **this is consent.** Accepting hands a colleague standing visibility of every
 * client on your roster, for as long as you are in their team. A sheet is what
 * the app uses for a reversible choice on top of the screen you were reading;
 * this is not that.
 *
 * ── The three lines, and why the second one is on the screen ──────────────
 *
 * Every product that has ever built this draws the invitation as an upside:
 * shared programs, one library, work together. All true, and all of it is the
 * half that costs the invitee nothing. So this screen says all three things:
 *
 *   · your clients stay yours — nothing moves, and nothing moves back if you
 *     leave;
 *   · your money book stays private — no role can open it, see a payment, or see
 *     what a client owes you. The one exception, stated rather than buried: the
 *     OWNER sees a monthly total per coach (Phase 3's revenue roll-up). That
 *     sentence changed when the roll-up shipped, in the same commit, because a
 *     promise quietly narrowed is worse than one that was never made;
 *   · **admins can see your clients' training.** This is the actual cost, it is
 *     the one a trainer would be annoyed to discover later, and hiding it to
 *     raise the accept rate would be buying adoption with the trust the product
 *     is made of.
 *
 * Declining is a peer of accepting, not a way out of the screen — same size,
 * same weight of type, no scare copy. A coach who says no in March may say yes
 * in April, and the server lets them be invited again for exactly that reason.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { acceptInvitation, declineInvitation, TeamError } from '../../../api/team';
import { syncDatabase } from '../../../db/sync';
import { refreshTeamInvitations } from '../../../team/useTeamInvitations';
import {
  AppBar,
  Avatar,
  Banner,
  Button,
  Callout,
  IconBack,
  IconButton,
  IconCheck,
  IconCloudOff,
  IconLock,
  IconUsers,
  Toast,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'TeamInvitation'>;

export default function InvitationScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inviter = params.invitedByName?.trim() || 'A trainer';

  const answer = async (kind: 'accept' | 'decline') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'accept') {
        await acceptInvitation(params.invitationId);
        // Pull the team and its coaches down now rather than at the next
        // trigger, so the screen we land on is already populated.
        await syncDatabase('team');
        // And drop the answered invitation, or the home card and the drawer
        // badge would both still be advertising a decision already made.
        await refreshTeamInvitations();
        navigation.replace('Team');
      } else {
        await declineInvitation(params.invitationId);
        await syncDatabase('team');
        await refreshTeamInvitations();
        navigation.goBack();
      }
    } catch (e) {
      // The server's sentence, which already carries the recovery — a seat
      // limit says the team is full, an expired invite says to ask again.
      setError(e instanceof TeamError ? e.message : 'Could not answer that invitation.');
      setBusy(null);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Team invitation"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Avatar name={params.teamName} size="lg" square />
          <Text style={styles.team}>{params.teamName}</Text>
          <Text style={styles.from}>{inviter} invited you to coach here</Text>
        </View>

        <View style={styles.facts}>
          <Fact
            icon={IconCheck}
            title="Your clients stay yours"
            body="Nothing moves. Your roster, your programs and your sessions are exactly as they are now — and they stay that way if you leave."
          />
          <Fact
            icon={IconLock}
            title="Your money book stays private"
            body="No one sees your payments, your clients' packages or what anyone owes you — not the admins, not the owner. The owner can see one number: what the team collected in total each month, per coach."
          />
          <Fact
            icon={IconUsers}
            title="Team admins can see your clients’ training"
            body="Their profiles, programs, sessions and progress — so a colleague can cover a session. Never their payments."
          />
        </View>

        <Callout icon={IconUsers} style={styles.note}>
          You’ll share the team’s exercises and be able to copy any coach’s programs. You can leave
          the team whenever you like.
        </Callout>

        {offline ? (
          <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
            You’re offline. Answering an invitation needs a connection — it’ll still be here.
          </Banner>
        ) : null}

        <Button
          label={`Join ${params.teamName}`}
          variant="primary"
          size="lg"
          block
          loading={busy === 'accept'}
          disabled={offline || busy !== null}
          onPress={() => answer('accept')}
          style={styles.accept}
        />
        {/* A peer of accept, not an escape hatch. Same size, no scare copy. */}
        <Button
          label="Decline"
          variant="secondary"
          size="lg"
          block
          loading={busy === 'decline'}
          disabled={offline || busy !== null}
          onPress={() => answer('decline')}
        />
      </ScrollView>

      {error ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setError(null) }}>
          {error}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function Fact({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.fact}>
      <View style={styles.factIcon}>
        <Icon size={17} color={colors.ink2} strokeWidth={1.9} />
      </View>
      <View style={styles.factMain}>
        <Text style={styles.factTitle}>{title}</Text>
        <Text style={styles.factBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10, gap: space.s5 },
  hero: { alignItems: 'center', paddingTop: space.s4, gap: space.s2 },
  team: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  from: { fontSize: 14, lineHeight: 20, color: colors.ink3, textAlign: 'center' },
  facts: { gap: space.s4 },
  fact: { flexDirection: 'row', gap: space.s3 },
  factIcon: { width: 24, alignItems: 'center', paddingTop: 2 },
  factMain: { flex: 1, minWidth: 0 },
  factTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  factBody: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginTop: 2 },
  note: {},
  banner: {},
  accept: { marginBottom: space.s3 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
