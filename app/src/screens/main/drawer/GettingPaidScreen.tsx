/**
 * 5b · Getting paid.
 *
 * The screen where Train X says the hardest thing about itself: **we check the
 * format only.** `name@bank` is all a phone can validate. We cannot confirm the ID
 * belongs to this trainer, and we cannot see whether a payment arrived — so the
 * screen says both, and asks them to read it back to themselves before saving.
 * A UPI ID with one wrong character sends a client's money to a stranger, and the
 * app that collected it is the one that has to admit it cannot check.
 *
 * And the rule that stops a retrospective mess: **changing the gym percentage
 * applies from today, never backwards.** Sessions already recorded keep the split
 * they were recorded with — the percentage is copied onto each payment at record
 * time, in `db/money.ts`, which is what makes the promise true rather than
 * aspirational.
 */

import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { getTrainer, updateTrainer, type TrainerProfile } from '../../../api/trainer';
import { mergeProfileIntoDraft } from '../../../setup/profileSync';
import { usePrefs } from '../../../settings/usePrefs';
import { setPrefs, TONES } from '../../../settings/prefs';
import {
  AppBar,
  Callout,
  CalloutStrong,
  GroupHead,
  IconAlert,
  IconBack,
  IconButton,
  IconBuilding,
  IconClock,
  IconMessage,
  IconPercent,
  IconQr,
  IconShield,
  IconWallet,
  Setting,
  SettingList,
  Skeleton,
  Switch,
  Toast,
  colors,
  space,
} from '../../../design';
import ChoiceSheet, { type ChoiceSpec } from './ChoiceSheet';
import UpiSheet from './UpiSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function GettingPaidScreen() {
  const navigation = useNavigation<Nav>();
  const { prefs } = usePrefs();

  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [editingUpi, setEditingUpi] = useState(false);
  const [choice, setChoice] = useState<ChoiceSpec | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    getTrainer()
      .then(({ data }) => {
        if (!alive) return;
        setProfile(data);
        setFailed(false);
        // Keeps the deck's "Add your UPI ID" row honest — the meter reads the
        // local draft and this screen writes to the server.
        void mergeProfileIntoDraft(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(load);

  const saveUpi = async (vpa: string) => {
    setEditingUpi(false);
    try {
      const { data } = await updateTrainer({ upiVpa: vpa });
      setProfile(data);
      await mergeProfileIntoDraft(data);
      setNotice(vpa ? 'UPI ID saved. Read it back once more.' : 'UPI ID cleared.');
    } catch {
      setNotice('Could not save that. It needs a connection.');
    }
  };

  const savePercent = async (percent: number) => {
    try {
      const { data } = await updateTrainer({ gymSharePercent: percent });
      setProfile(data);
      setNotice(`The gym takes ${percent}% from today onwards.`);
    } catch {
      setNotice('Could not save that. It needs a connection.');
    }
  };

  const gym = profile?.gymName ?? null;
  const percent = profile?.gymSharePercent != null ? Number(profile.gymSharePercent) : null;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Getting paid"
          subtitle="Where the money goes"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {profile ? (
          <>
            <GroupHead label="Your UPI" />
            <SettingList>
              <Setting
                icon={IconWallet}
                label="UPI ID"
                meta="Goes on every reminder"
                value={profile.upiVpa ?? 'Not set'}
                onPress={() => setEditingUpi(true)}
              />
              <Setting
                icon={IconQr}
                label="Your QR"
                meta={
                  profile.upiVpa
                    ? 'Not in this build — see below'
                    : 'Add a UPI ID first'
                }
                onPress={() =>
                  setNotice(
                    'A scannable QR needs an encoder this build does not carry. Reminders send a UPI link instead, which opens the same apps.',
                  )
                }
              />
            </SettingList>

            <Callout icon={IconAlert} style={styles.note}>
              We check the <CalloutStrong>format only</CalloutStrong> — name@bank. Train X can&apos;t
              confirm the ID belongs to you, and can&apos;t see whether a payment arrived.{' '}
              <CalloutStrong>Read it back to yourself before you save.</CalloutStrong>
            </Callout>

            <GroupHead label="The gym's cut" />
            <SettingList>
              <Setting
                icon={IconBuilding}
                label="Where you work"
                meta={gym ?? 'On your own · you keep all of it'}
                onPress={() => navigation.navigate('Profile')}
              />
              {gym ? (
                <Setting
                  icon={IconPercent}
                  label="Floor sessions"
                  meta={gym}
                  value={percent != null ? `${percent}%` : 'Not set'}
                  onPress={() =>
                    setChoice({
                      title: "The gym's cut",
                      meta: 'What the gym keeps of a floor session. Applies from today onwards — sessions already recorded keep the split they were recorded with.',
                      options: [30, 40, 50, 60, 70].map((p) => ({
                        key: String(p),
                        label: `${p}%`,
                        meta: `You keep ${100 - p}%`,
                      })),
                      value: percent != null ? String(percent) : '',
                      onPick: (key) => void savePercent(Number(key)),
                    })
                  }
                />
              ) : null}
              {gym ? (
                /* Not editable, because it is not a setting — it is a rule. A row
                   that looks adjustable and is not is worse than a row that says
                   what the rule is. */
                <Setting
                  icon={IconPercent}
                  label="Remote sessions"
                  meta="Always yours, whatever the gym takes"
                  value="0%"
                />
              ) : null}
              <Setting
                icon={IconClock}
                label="When you settle"
                meta="Monthly, on the Gym share screen"
                onPress={() => navigation.navigate('MoneyGym')}
              />
            </SettingList>

            <Callout icon={IconShield} style={styles.note}>
              Changing the percentage applies from <CalloutStrong>today onwards</CalloutStrong>.
              Sessions already recorded keep the split they were recorded with.
            </Callout>

            <GroupHead label="Reminders" />
            <SettingList>
              <Setting
                icon={IconClock}
                label="Chase after"
                meta="Then it shows in Needs chasing"
                value={`${prefs.chaseAfterDays} day${prefs.chaseAfterDays === 1 ? '' : 's'}`}
                onPress={() =>
                  setChoice({
                    title: 'Chase after',
                    meta: 'How late a payment has to be before it appears in the chase list.',
                    options: [1, 3, 7, 14].map((d) => ({
                      key: String(d),
                      label: `${d} day${d === 1 ? '' : 's'}`,
                    })),
                    value: String(prefs.chaseAfterDays),
                    onPick: (key) => void setPrefs({ chaseAfterDays: Number(key) }),
                  })
                }
              />
              <Setting
                icon={IconMessage}
                label="Default tone"
                meta="Polite, firm, or your own"
                value={TONES.find((t) => t.key === prefs.tone)?.label}
                onPress={() =>
                  setChoice({
                    title: 'Default tone',
                    meta: 'The wording a reminder starts from. You can always edit it before sending.',
                    options: TONES.map((t) => ({ key: t.key, label: t.label, meta: t.meta })),
                    value: prefs.tone,
                    onPick: (key) => void setPrefs({ tone: key as typeof prefs.tone }),
                  })
                }
              />
              <Setting
                icon={IconQr}
                label="Attach a UPI link"
                meta="So they can pay in one tap"
                trailing={
                  <Switch
                    value={prefs.attachQr}
                    onChange={(next) => void setPrefs({ attachQr: next })}
                    label="Attach a UPI link to reminders"
                  />
                }
              />
            </SettingList>

            <Text style={styles.fine}>
              Train X never holds, moves or confirms money. It keeps the book, and the money goes
              straight from the client to you.
            </Text>
          </>
        ) : failed ? (
          <Callout style={styles.note}>
            These settings live on the server and this phone can&apos;t reach it right now. Recording
            payments still works offline — this screen is the only part that needs a connection.
          </Callout>
        ) : (
          <View style={styles.loading}>
            <Skeleton height={124} />
            <Skeleton height={196} style={styles.loadingGap} />
            <Skeleton height={172} style={styles.loadingGap} />
          </View>
        )}
      </ScrollView>

      <UpiSheet
        visible={editingUpi}
        current={profile?.upiVpa ?? ''}
        onSave={saveUpi}
        onClose={() => setEditingUpi(false)}
      />
      <ChoiceSheet spec={choice} onClose={() => setChoice(null)} />

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
  note: { marginTop: space.s3 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s5 },
  loading: { marginTop: space.s4 },
  loadingGap: { marginTop: space.s4 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
