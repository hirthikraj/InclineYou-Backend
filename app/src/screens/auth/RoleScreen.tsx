/**
 * Screen 01 · § 05 — Resolve role. Only shown to people who are both.
 *
 * A person can coach clients and train with somebody, and that is not a corner
 * case: most independent coaches also train. For everyone else this screen never
 * appears — sign-in resolves the single role silently and goes straight through,
 * which is the rule the design states twice and the reason this file is short.
 *
 * Each card carries live proof that it is the right one — how many clients, whose
 * plan — because a role picker with two bare labels makes people guess.
 *
 * ── Where the proof comes from ────────────────────────────────────────────
 *
 * The roster count is read from the local database, not the network: this screen
 * is one tap after a verify and the first sync has not landed. On a returning
 * phone the number is there instantly; on a fresh install there is nothing to
 * count, and the card says what it is instead of showing a zero that would read
 * as "you have no clients".
 */

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { AuthStackParamList } from '../../navigation/AuthStack';
import { isPaused } from '../../api/auth';
import { useAuth, type Lens } from '../../store/AuthContext';
import { database } from '../../db';
import type ClientModel from '../../db/models/Client';
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
  IconUsers,
  colors,
  radius,
  space,
} from '../../design';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Role'>;
  route: RouteProp<AuthStackParamList, 'Role'>;
};

/** What the two cards resolve to. A membership id names which client record. */
type Pick = { lens: Lens; clientId: string | null };

export default function RoleScreen({ route }: Props) {
  const { session } = route.params;
  const { signIn } = useAuth();
  const clients = useClientCount(!!session.trainerId);

  const canCoach = !!session.trainerId;
  // A paused roster is still selectable — the history is in it — but it is never
  // what the screen should land on preselected.
  const live = session.memberships.filter((m) => !isPaused(m));
  const [pick, setPick] = useState<Pick>(
    // Coaching first when it exists — it is what they signed up to do, and the
    // design's own copy leads with it.
    canCoach
      ? { lens: 'trainer', clientId: null }
      : { lens: 'client', clientId: (live[0] ?? session.memberships[0])?.clientId ?? null },
  );

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

  const first = session.memberships[0];

  return (
    <AuthScreen>
      <AuthTop>
        <Brandmark />
      </AuthTop>

      <AuthBody>
        <AuthTitle>
          {session.name ? `Welcome back, ${session.name}` : 'Welcome back'}
        </AuthTitle>
        <AuthSub>
          {canCoach
            ? 'You coach clients here and you train here. Where do you want to start?'
            : 'You train with more than one trainer. Whose book do you want to open?'}
        </AuthSub>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {canCoach ? (
            <RoleCard
              icon={IconUsers}
              title="Coaching"
              proof={coachProof(clients)}
              selected={pick.lens === 'trainer'}
              onPress={() => setPick({ lens: 'trainer', clientId: null })}
            />
          ) : null}

          {session.memberships.map((m) => (
            <RoleCard
              key={m.clientId}
              icon={IconDumbbell}
              title={canCoach && session.memberships.length === 1 ? 'My own training' : m.trainerName}
              // A paused card says so instead of naming the gym: which roster is
              // on hold is the only thing that distinguishes two cards here, and
              // finding out after you tap is finding out too late.
              proof={
                isPaused(m)
                  ? `Paused — your history is still here`
                  : canCoach && session.memberships.length === 1
                    ? `With ${m.trainerName}${m.gymName ? ` · ${m.gymName}` : ''}`
                    : m.gymName ?? 'Your trainer'
              }
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
          disabled={pick.lens === 'client' && !pick.clientId}
          onPress={() => void go()}
        />
        {!canCoach && first ? (
          <Text style={styles.foot}>
            Nothing here is a second account — it is the same sign-in, read from the other side.
          </Text>
        ) : null}
      </AuthFoot>
    </AuthScreen>
  );
}

/** Live proof, or an honest sentence when there is nothing local to count yet. */
function coachProof(clients: number | null): string {
  if (clients === null) return 'Your roster, your day, your book';
  if (clients === 0) return 'Set up your roster — nobody on it yet';
  return `${clients} client${clients === 1 ? '' : 's'} · your day and your book`;
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

/**
 * How many clients are on this phone already.
 *
 * Null until the count is in, and null forever on a phone with an empty database
 * — the card has copy for that case rather than a zero.
 */
function useClientCount(active: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void database
      .get<ClientModel>('clients')
      .query()
      .fetchCount()
      .then((n) => {
        if (alive) setCount(n);
      })
      .catch(() => {
        // A read failure is not worth a screen. The card falls back to copy.
      });
    return () => {
      alive = false;
    };
  }, [active]);

  return count;
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
