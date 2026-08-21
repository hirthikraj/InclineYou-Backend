/**
 * 5a · Add a client — two fields.
 *
 * `agent/design system/screens/xrep-clients.html` § 08.
 *
 * The roster's empty state already made the promise — **a client needs a name
 * and a phone number** — so the form has to keep it. Everything a competitor
 * asks for at intake (goals, injuries, measurements, a program, a package) is a
 * row you can fill in later from the file, and none of it blocks the first
 * session. They appear here as three deferred rows showing an em dash, rather
 * than as empty required-looking fields.
 *
 * The initials preview is the same device the setup flow uses for the trainer's
 * own name: it shows what the field is *for* instead of only collecting it.
 *
 * Arriving from the search dead-end (2c), the name is already filled with the
 * query — which is the whole reason that dead-end offers this screen.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useRoster } from '../../../clients/useRoster';
import { checkClientPhone } from '../../../api/clients';
import { observePacks } from '../../../db/money';
import {
  AppBar,
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  Control,
  Empty,
  FieldLabel,
  FieldMsg,
  IconBack,
  IconButton,
  IconWallet,
  Setting,
  SettingList,
  Steps,
  StepsLabel,
  colors,
  initials,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'AddClient'>;

/** Ten digits, starting 6–9. The same test the sign-in screen applies. */
export function isPhone(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(raw.replace(/\D/g, ''));
}

/**
 * What lands in the phone field: digits, at most ten of them.
 *
 * A paste arrives with baggage — "+91 98765 43210", "098765 43210" — so the
 * country code and the trunk zero are peeled off first. Truncating without
 * that would keep the "91" and drop the number's own tail, leaving ten digits
 * that LOOK valid and are somebody else's.
 */
export function cleanPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  return digits.slice(0, 10);
}

export default function AddClientScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const roster = useRoster();

  const [name, setName] = useState(route.params?.name ?? '');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);

  /**
   * The sessions gate. A client is sold sessions, put on a week and given a
   * plan — with no packs on the price list, step 2 has nothing to offer and
   * the client would be created half-made. Null until the first emission, so
   * the form doesn't flash behind the gate (or the gate behind the form).
   */
  const [packCount, setPackCount] = useState<number | null>(null);
  useEffect(() => {
    const sub = observePacks().subscribe((rows) =>
      // Case-blind, same as packSessionsLeft — server-written rows have been
      // seen carrying either casing, and a pack counted as 'Active' would
      // otherwise leave this gate wrongly closed.
      setPackCount(rows.filter((p) => (p.status ?? '').toLowerCase() === 'active').length),
    );
    return () => sub.unsubscribe();
  }, []);

  const digits = phone.replace(/\D/g, '');
  const validPhone = isPhone(digits);
  const trimmed = name.trim();

  /**
   * A number that is somebody else — a trainer's own, or another trainer's
   * client. The server owns this rule; the form only asks it early.
   *
   * Keyed by the digits it was asked about, so an answer that arrives after the
   * trainer has typed a different number is ignored rather than shown against
   * it. A failed ask clears the block instead of setting one: offline is not
   * evidence that a number is taken, and the push refuses it anyway.
   */
  const [taken, setTaken] = useState<{ digits: string; message: string } | null>(null);

  useEffect(() => {
    if (!validPhone) {
      setTaken(null);
      return;
    }
    let alive = true;
    // Debounced — the last three digits of a ten-digit number would otherwise
    // be three requests, and the first two are about numbers nobody typed.
    const timer = setTimeout(() => {
      checkClientPhone(digits)
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

  // Not disabled while the ask is in flight: offline it would not answer for
  // fifteen seconds, and a button that dies for fifteen seconds is worse than
  // a refusal at the next sync.
  const ready = trimmed.length > 0 && validPhone && !blocked;

  const malformed = touched && digits.length > 0 && !validPhone;
  const phoneError = malformed
    ? 'An Indian mobile number is ten digits, starting 6 to 9'
    : (blocked?.message ?? null);

  // A number already on the roster is the one mistake this form can actually
  // catch, and catching it here beats a duplicate the trainer finds in a month.
  const clash = useMemo(
    () => (validPhone ? roster.rows.find((r) => r.phone?.replace(/\D/g, '') === digits) : undefined),
    [roster.rows, digits, validPhone],
  );

  const count = roster.rows.length;
  const first = trimmed.split(' ')[0] || 'They';

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Add a client"
          subtitle={`Clients · ${count} on your roster`}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
        <View style={styles.steps}>
          {/* `current` is 0-based — step one is 0. */}
          <Steps count={4} current={0} />
          <StepsLabel current={0} count={4} />
        </View>
      </View>

      {packCount === null ? null : packCount === 0 ? (
        /* No sessions to sell means nothing for the next three steps to offer.
           The gate sends the trainer to the price list first — the form is
           right here when they come back with a pack on it. */
        <View style={styles.gate}>
          <Empty
            icon={IconWallet}
            title="Set up your sessions first"
            body="A client gets sold sessions from your price list, and there's nothing on it yet. Add a pack — even one — and come back."
          />
          <Button
            label="Set up packs"
            size="lg"
            block
            onPress={() => navigation.navigate('MoneyPacks')}
            style={styles.gateGo}
          />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FieldLabel>Their name</FieldLabel>
        <Control
          value={name}
          onChangeText={setName}
          placeholder="Zubin Irani"
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="Their name"
        />
        <FieldMsg>Use the name they are already known by.</FieldMsg>

        <View style={styles.label}>
          <FieldLabel>Phone number</FieldLabel>
        </View>
        <Control
          value={phone}
          // Digits only, and never an eleventh: an Indian mobile number is ten,
          // and letting more in just to refuse them on blur is a worse message.
          onChangeText={(t) => setPhone(cleanPhone(t))}
          onBlur={() => setTouched(true)}
          placeholder="98*** *****"
          keyboardType="phone-pad"
          seg="+91"
          error={phoneError != null}
          accessibilityLabel="Phone number"
        />
        <FieldMsg tone={phoneError ? 'error' : 'hint'}>
          {phoneError ?? 'Reminders and the invite both go to this number.'}
        </FieldMsg>

        {/* Not drawn in 5b, but a duplicate number is the one mistake this form
            can actually catch, and it costs a trainer a split pack and a split
            history to find out later. Neutral, because it is a caution the
            trainer may legitimately override — two people do share a phone. */}
        {clash ? (
          <Callout style={styles.clash}>
            <CalloutStrong>{clash.name} is already on your roster</CalloutStrong> with this number.
            Two records for one person split their pack and their history in half.
          </Callout>
        ) : null}

        {trimmed ? (
          <Callout style={styles.preview}>
            <View style={styles.previewRow}>
              <Avatar name={trimmed} size="md" />
              <Text style={styles.previewText}>
                {first} shows up as <Text style={styles.strong}>{initials(trimmed)}</Text> on your
                roster and in your diary. The initials come from the field above — profile photos
                aren&apos;t in this version.
              </Text>
            </View>
          </Callout>
        ) : null}

        {/* Em dashes, not empty values. A row that looks like an unfilled
            required field makes the two above it look optional. */}
        <Text style={styles.group}>Any time later</Text>
        <SettingList>
          <Setting label="Program" meta="Assign one after their first session" value="—" />
          <Setting label="Pack" meta="Sell it on the day they pay" value="—" />
          <Setting label="Batch" meta="Morning, evening, or neither" value="—" />
        </SettingList>

        <Button
          label="Continue"
          size="lg"
          block
          disabled={!ready}
          onPress={() =>
            navigation.navigate('AddClientPay', { name: trimmed, phone: digits })
          }
          style={styles.go}
        />
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  steps: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: 2 },
  body: { paddingHorizontal: space.inset, paddingTop: space.s5, paddingBottom: space.s10 },

  label: { marginTop: space.s4 },
  clash: { marginTop: space.s3 },
  preview: { marginTop: space.s4 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  previewText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.ink2 },
  strong: { fontWeight: '700', color: colors.ink },

  group: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: space.s6,
    marginBottom: space.s2,
  },

  go: { marginTop: space.s6 },

  gate: { flex: 1, paddingHorizontal: space.inset, paddingTop: space.s8 },
  gateGo: { marginTop: space.s6 },
});
