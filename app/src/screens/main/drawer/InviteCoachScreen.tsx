/**
 * 6b · invite a coach.
 *
 * ── The invitation exists before WhatsApp opens ───────────────────────────
 *
 * The order here is the whole design. `POST /v1/team/invites` is awaited first,
 * and only then is WhatsApp opened with the link it returned. Which means a
 * trainer who backs out of the share sheet, or whose WhatsApp is not installed,
 * has still created a real invitation — it shows in the coach list as waiting,
 * with its own "send a new one" action. Coupling the invite's existence to a
 * share sheet nobody can observe would make the coach list lie about who has
 * been asked.
 *
 * The backend does not send messages and never has — the nudges work the same
 * way. The invitation travels by the inviter's own WhatsApp, from their own
 * number, which is also why the coach on the other end believes it.
 *
 * ── The number is checked while it is being typed ─────────────────────────
 *
 * Same shape as `AddClientScreen`, and for the same reason: a refusal that only
 * arrives on submit lands after the trainer has moved on. Debounced 400ms and
 * keyed by the digits it asked about, so a late answer about an old number is
 * dropped rather than shown against the new one. It is not the enforcement —
 * the invite applies the rule again — so an unanswered check never blocks.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { checkCoachPhone, inviteCoach, TeamError } from '../../../api/team';
import { syncDatabase } from '../../../db/sync';
import { useTeam } from '../../../team/useTeam';
import { buildTeam } from '../../../team/team';
import {
  AppBar,
  Banner,
  Button,
  Callout,
  Control,
  FieldLabel,
  FieldMsg,
  IconBack,
  IconButton,
  IconCloudOff,
  IconLock,
  IconSend,
  IconUserAdd,
  Toast,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

/** Ten digits, starting 6–9 — the same test the sign-in and add-client screens apply. */
function isPhone(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(raw.replace(/\D/g, ''));
}

export default function InviteCoachScreen() {
  const navigation = useNavigation<Nav>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const { input } = useTeam();
  const view = useMemo(() => buildTeam(input), [input]);

  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, '');
  const validPhone = isPhone(digits);

  /**
   * A number that cannot be invited, and the server's own sentence for why.
   *
   * Keyed by the digits it was asked about. A failed ask clears the block rather
   * than setting one — being offline is not evidence that a number is spoken
   * for, and telling a trainer that somebody else's number is taken when we
   * never asked would be inventing a fact about a third party.
   */
  const [taken, setTaken] = useState<{ digits: string; message: string } | null>(null);

  useEffect(() => {
    if (!validPhone) {
      setTaken(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      checkCoachPhone(digits)
        .then((verdict) => {
          if (!alive) return;
          setTaken(
            verdict.available || !verdict.message ? null : { digits, message: verdict.message },
          );
        })
        .catch(() => {
          if (alive) setTaken(null);
        });
    }, 400);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [digits, validPhone]);

  const blocked = taken?.digits === digits ? taken : null;
  const malformed = touched && digits.length > 0 && !validPhone;
  const error = malformed
    ? 'An Indian mobile number is ten digits, starting 6 to 9'
    : (blocked?.message ?? null);

  const send = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const invite = await inviteCoach(digits);
      // The invitation is real from here on, whatever WhatsApp does next.
      await syncDatabase('team');

      if (invite.whatsappUrl) {
        try {
          await Linking.openURL(invite.whatsappUrl);
        } catch {
          // Created, not delivered — and the coach list will say so. Naming the
          // difference is better than a generic failure that leaves the trainer
          // unsure whether to invite again.
          setNotice('Invite created, but WhatsApp wouldn’t open. Send it from their row.');
          setBusy(false);
          return;
        }
      }
      navigation.goBack();
    } catch (e) {
      setNotice(e instanceof TeamError ? e.message : 'Could not send that invite.');
      setBusy(false);
    }
  };

  const seatsFull = view.seatsFull;
  const ready = validPhone && !blocked && !offline && !seatsFull;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Invite a coach"
          subtitle={view.empty ? undefined : view.name}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Drawn before the number is typed, because a full team is not a
            problem with the number — and finding that out after typing it is
            the app wasting the trainer's time. */}
        {seatsFull ? (
          <Banner tone="error" style={styles.banner}>
            Every seat in {view.name} is taken. Free one up, or raise the seat limit from the team
            screen, before inviting anyone else.
          </Banner>
        ) : null}

        {offline ? (
          <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
            You’re offline. An invitation has to reach the coach, so this one needs a connection.
          </Banner>
        ) : null}

        <FieldLabel>Their mobile number</FieldLabel>
        <Control
          value={phone}
          onChangeText={setPhone}
          onBlur={() => setTouched(true)}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          autoFocus
          maxLength={13}
          seg={<Text style={styles.seg}>+91</Text>}
          error={error !== null}
          style={styles.control}
        />
        {error ? (
          <FieldMsg tone="error">{error}</FieldMsg>
        ) : (
          <FieldMsg>
            They don’t need XRep yet. If they’re new, the invitation waits for them to sign in with
            this number.
          </FieldMsg>
        )}

        <Callout icon={IconSend} style={styles.note}>
          You’ll send the invitation yourself on WhatsApp, from your own number — that’s why a coach
          trusts it. We create it first, so nothing is lost if you don’t send it straight away.
        </Callout>

        <Callout icon={IconLock} style={styles.note}>
          A coach joins as a coach: their clients and their money stay theirs, and they can see the
          team’s exercises and programs. You can make them an admin later.
        </Callout>

        <Button
          label="Create invite and open WhatsApp"
          variant="primary"
          size="lg"
          block
          icon={IconUserAdd}
          loading={busy}
          disabled={!ready || busy}
          onPress={send}
        />
      </ScrollView>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  banner: { marginBottom: space.s4 },
  control: { marginBottom: space.s2 },
  seg: { fontSize: 15, color: colors.ink2 },
  note: { marginTop: space.s4 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
