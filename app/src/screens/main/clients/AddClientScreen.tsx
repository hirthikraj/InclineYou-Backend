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

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useRoster } from '../../../clients/useRoster';
import {
  AppBar,
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  Control,
  FieldLabel,
  FieldMsg,
  IconBack,
  IconButton,
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

export default function AddClientScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const roster = useRoster();

  const [name, setName] = useState(route.params?.name ?? '');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);

  const digits = phone.replace(/\D/g, '');
  const validPhone = isPhone(digits);
  const trimmed = name.trim();
  const ready = trimmed.length > 0 && validPhone;

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
          <Steps count={2} current={0} />
          <StepsLabel current={0} count={2} />
        </View>
      </View>

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
          onChangeText={setPhone}
          onBlur={() => setTouched(true)}
          placeholder="98847 21160"
          keyboardType="phone-pad"
          seg="+91"
          error={touched && digits.length > 0 && !validPhone}
          accessibilityLabel="Phone number"
        />
        <FieldMsg tone={touched && digits.length > 0 && !validPhone ? 'error' : 'hint'}>
          {touched && digits.length > 0 && !validPhone
            ? 'An Indian mobile number is ten digits, starting 6 to 9'
            : 'Reminders and the invite both go to this number.'}
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
});
