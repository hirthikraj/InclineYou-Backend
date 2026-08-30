/**
 * Screen 01 · § 05 — Whose book to open.
 *
 * Shown to one person only, at sign-in: a client who is training with more
 * than one trainer right now. Everybody else resolves silently and goes
 * straight through, which is the rule the design states twice and the
 * reason this file is short.
 *
 * ── What used to be here, and is back a different way ─────────────────────────
 *
 * This screen also used to resolve "you coach clients here AND you train
 * here", for the trainer who is also somebody's client. V18 removed that case
 * outright (`app_user.role` exclusive, the roster-add path refusing a phone
 * that already owned a trainer account) and this screen's job narrowed to
 * only the multi-trainer-client picker below.
 *
 * Trainer↔client duality is allowed again (23 Aug 2026), but it does NOT come
 * back through this screen: sign-in still opens straight into the trainer's
 * home role with no picker (see `OtpScreen`, `roleOf`), and a live membership
 * elsewhere surfaces as a drawer entry — "Switch to <trainer>'s client view"
 * — that calls `useAuth().switchIdentity('client', …)` at runtime rather than
 * at sign-in. That is a deliberate difference from the multi-trainer-client
 * case below: this screen exists because two client memberships are
 * genuinely ambiguous about which one to open, while a trainer's own account
 * is not ambiguous — it is simply the default, with the other mode one tap
 * away whenever they want it.
 *
 * Multi-trainer clients are the case this screen is still entirely for — one
 * person can be on two rosters, which is two client rows and one human being.
 *
 * Each card still carries proof of which is which — the trainer's name, their
 * gym, whether that roster is paused — because a picker with two bare labels
 * makes people guess, and finding out after you tap is finding out too late.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { AuthStackParamList } from '../../navigation/AuthStack';
import { isPaused } from '../../api/auth';
import { useAuth, type Lens } from '../../store/AuthContext';
import {
  AuthBody,
  AuthFoot,
  AuthScreen,
  AuthSub,
  AuthTitle,
  AuthTop,
  Brandmark,
} from './authLayout';
import {
  Avatar,
  Button,
  IconDumbbell,
  colors,
  radius,
  space,
} from '../../design';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Role'>;
  route: RouteProp<AuthStackParamList, 'Role'>;
};

/** Which membership the client lens will read. */
type Pick = { lens: Lens; clientId: string | null };

export default function RoleScreen({ route }: Props) {
  const { session } = route.params;
  const { signIn } = useAuth();

  // A paused roster is still selectable — the history is in it — but it is never
  // what the screen should land on preselected.
  const live = session.memberships.filter((m) => !isPaused(m));
  const [pick, setPick] = useState<Pick>({
    lens: 'client',
    clientId: (live[0] ?? session.memberships[0])?.clientId ?? null,
  });

  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    await signIn({
      token: session.token,
      trainerId: session.trainerId,
      owesSetup: session.owesSetup,
      lens: pick.lens,
      clientId: pick.lens === 'client' ? pick.clientId : null,
      memberships: session.memberships,
    });
  };

  return (
    <AuthScreen>
      <AuthTop>
        <Brandmark />
      </AuthTop>

      <AuthBody>
        <AuthTitle>
          {session.name ? `Welcome back, ${session.name}` : 'Welcome back'}
        </AuthTitle>
        <AuthSub>You train with more than one trainer. Whose book do you want to open?</AuthSub>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {session.memberships.map((m) => (
            <RoleCard
              key={m.clientId}
              icon={IconDumbbell}
              title={m.trainerName}
              // A paused card says so instead of naming the gym: which roster is
              // on hold is the only thing that distinguishes two cards here, and
              // finding out after you tap is finding out too late.
              proof={isPaused(m) ? 'Paused — your history is still here' : m.gymName ?? 'Your trainer'}
              avatar={m.trainerName}
              selected={pick.lens === 'client' && pick.clientId === m.clientId}
              onPress={() => setPick({ lens: 'client', clientId: m.clientId })}
            />
          ))}
        </ScrollView>

        <Text style={styles.note}>
          Switch any time from the menu. We&apos;ll open here next time.
        </Text>
      </AuthBody>

      <AuthFoot>
        <Button
          label="Continue"
          size="lg"
          block
          loading={busy}
          disabled={!pick.clientId}
          onPress={() => void go()}
        />
        <Text style={styles.foot}>
          Nothing here is a second account — it is the same sign-in, read from the other side.
        </Text>
      </AuthFoot>
    </AuthScreen>
  );
}

function RoleCard({
  icon: Icon,
  title,
  proof,
  avatar,
  selected,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  proof: string;
  avatar?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${proof}`}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardOn,
        pressed && !selected && styles.cardPressed,
      ]}
    >
      {avatar ? (
        <Avatar name={avatar} size="sm" />
      ) : (
        <View style={styles.icon}>
          <Icon size={19} color={selected ? colors.accentText : colors.ink3} />
        </View>
      )}
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, selected && styles.cardTitleOn]}>{title}</Text>
        <Text style={styles.cardProof}>{proof}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.s2, paddingBottom: space.s2 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    padding: 16,
    borderRadius: radius.r3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cardPressed: { backgroundColor: colors.surface2 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardTitleOn: { color: colors.accentText },
  cardProof: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: 3 },

  note: { fontSize: 12.5, color: colors.ink3, marginTop: space.s3 },
  foot: { fontSize: 11.5, lineHeight: 18, color: colors.ink3, textAlign: 'center', marginTop: 12 },
});
