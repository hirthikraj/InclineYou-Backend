/**
 * 7a · Edit client.
 *
 * `agent/design system/screens/inclineyou-clients.html` § 10.
 *
 * The boring screen, and it matters most: **a form that silently refuses an edit
 * teaches a trainer that the app is broken.** So four things are editable, three
 * are not, and the three sit together under a heading that says so — each naming
 * its own reason, which is always one of derived, historical or contractual.
 *
 * The phone number stays editable, because a client changing SIM is far more
 * common than one changing name — but the field warns what that does to their
 * invite.
 *
 * Save is pinned in a footer, the pattern the setup flow already uses, so a form
 * long enough to scroll never hides its own commit. Ending the relationship is a
 * text link at the bottom of the scroller, deliberately far from it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useClientFile } from '../../../clients/useClientFile';
import { buildHead, currentPack } from '../../../clients/file';
import { updateClient } from '../../../db/clients';
import { rupees } from '../../../home/time';
import { ms } from '../../../money/money';
import { dayStamp } from '../../../home/time';
import type { DeliveryMode } from '../../../home/mode';
import {
  AppBar,
  Button,
  Control,
  FieldLabel,
  FieldMsg,
  IconBack,
  IconButton,
  IconLock,
  Kv,
  KvRow,
  Segmented,
  Toast,
  colors,
  space,
} from '../../../design';
import { isPhone } from './AddClientScreen';
import { checkClientPhone } from '../../../api/clients';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'EditClient'>;

export default function EditClientScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useRoute<Rt>().params;
  const { input, now } = useClientFile(clientId);

  const head = useMemo(() => buildHead(input, now), [input, now]);
  const pack = useMemo(() => currentPack(input), [input]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<DeliveryMode>('floor');
  const [seeded, setSeeded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** A new number that turns out to be somebody else. Same rule as the add form. */
  const [taken, setTaken] = useState<{ digits: string; message: string } | null>(null);

  // Seeded once. Re-seeding on every emission would fight the trainer's typing
  // the moment a sync lands mid-edit.
  useEffect(() => {
    if (seeded || !head) return;
    setName(head.name);
    setPhone(head.phone ?? '');
    setMode(head.mode);
    setSeeded(true);
  }, [head, seeded]);

  const digits = phone.replace(/\D/g, '');
  const current = (head?.phone ?? '').replace(/\D/g, '');

  // Only a number that actually moved is asked about. Their own current number
  // is on another roster by definition — this client's — and asking would
  // refuse the edit that changes nothing.
  useEffect(() => {
    if (!isPhone(digits) || digits === current) {
      setTaken(null);
      return;
    }
    let alive = true;
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
  }, [digits, current]);

  if (!head) return null;

  const validPhone = digits.length === 0 || isPhone(digits);
  const blocked = taken?.digits === digits ? taken : null;
  const ready = name.trim().length > 0 && validPhone && !blocked && !saving;
  const changedPhone = digits !== current;

  const done = input.sessions.filter((s) => s.status === 'done').length;
  const perSession =
    pack?.sessionsTotal && pack.sessionsTotal > 0 ? Math.round(pack.amount / pack.sessionsTotal) : null;

  const save = async () => {
    if (!ready || !input.client) return;
    setSaving(true);
    try {
      await updateClient(clientId, {
        name: name.trim(),
        phone: digits || undefined,
        status: input.client.status,
        paymentMode:
          input.client.paymentMode === 'gym_collects' ? 'gym_collects' : 'trainer_collects',
        deliveryMode: mode,
        trainerSplitPercent: input.client.trainerSplitPercent ?? undefined,
      });
      navigation.goBack();
    } catch {
      setSaving(false);
      setNotice("Couldn't save that. It stays on this phone and goes up on the next sync.");
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Edit client"
          subtitle={head.name}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
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
          autoCapitalize="words"
          accessibilityLabel="Their name"
        />
        <FieldMsg>Changes on every receipt you send from today.</FieldMsg>

        <View style={styles.gap}>
          <FieldLabel>Phone number</FieldLabel>
        </View>
        <Control
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          seg="+91"
          error={!validPhone || blocked != null}
          accessibilityLabel="Phone number"
        />
        <FieldMsg tone={!validPhone || blocked ? 'error' : 'hint'}>
          {!validPhone
            ? 'An Indian mobile number is ten digits, starting 6 to 9'
            : blocked
              ? blocked.message
              : changedPhone
                ? 'A new number resends the invite; the old link dies.'
                : 'Reminders and the invite both go to this number.'}
        </FieldMsg>

        <Text style={styles.group}>Where they train</Text>
        <Segmented
          options={[
            { key: 'floor', label: 'Floor' },
            { key: 'remote', label: 'Remote' },
          ]}
          value={mode}
          onChange={(key) => setMode(key as DeliveryMode)}
        />
        <Text style={styles.hint}>
          Remote drops the gym&apos;s cut to 0%, <Text style={styles.strong}>from today on</Text>.
        </Text>

        {/* Under a heading that says so, rather than as fields that refuse to
            focus. Each row names its reason: derived, historical, contractual. */}
        <Text style={styles.group}>You can&apos;t change these</Text>
        <Kv>
          <KvRow
            label="Client since"
            leading={<IconLock size={13} color={colors.ink3} />}
            value={dayStamp(ms(input.client?.createdAt ?? now))}
            detail="Their first session, not a typed date"
            onPress={() => setNotice('Client since is the date of their first session, not a field.')}
          />
          <KvRow
            label="Sessions logged"
            leading={<IconLock size={13} color={colors.ink3} />}
            value={String(done)}
            detail="A record, not a field"
            onPress={() => setNotice('Sessions logged is counted from the diary. Nothing types it.')}
          />
          {perSession != null ? (
            <KvRow
              label="This pack's price"
              leading={<IconLock size={13} color={colors.ink3} />}
              value={rupees(perSession)}
              detail="Sold packs keep their price"
              onPress={() =>
                setNotice('A sold pack keeps the price it was sold at. Sell a new one to change it.')
              }
            />
          ) : null}
        </Kv>

        <Button
          label="Pause or end this client"
          variant="text"
          block
          onPress={() => navigation.navigate('ClientEnd', { clientId })}
          style={styles.end}
        />
      </ScrollView>

      {/* A form long enough to scroll must never hide its own commit. */}
      <View style={styles.foot}>
        <Button label="Save" size="lg" block disabled={!ready} onPress={() => void save()} />
      </View>

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
  body: { paddingHorizontal: space.inset, paddingTop: space.s4, paddingBottom: space.s8 },

  gap: { marginTop: space.s4 },
  group: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: space.s6,
    marginBottom: space.s2,
  },
  hint: { fontSize: 13, lineHeight: 19, color: colors.ink3, marginTop: space.s2 },
  strong: { fontWeight: '700', color: colors.ink2 },

  end: { marginTop: space.s6 },

  foot: {
    paddingHorizontal: space.inset,
    paddingTop: space.s3,
    paddingBottom: space.s5,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.canvas,
  },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
