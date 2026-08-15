/**
 * 5a · Settings.
 *
 * Your business · The app · Your data · Help. Four groups, deep enough to hold
 * everything and shallow enough to scan.
 *
 * **Delete my account is in the list**, not hidden, with its grace period on the
 * row. Erasure is a right, not a maze, and DPDP-era software should not make it a
 * scavenger hunt. It is drawn destructive before it is ever pressed, because
 * something that permanent should not look identical to Language.
 *
 * Every row carries its current value on the right. That is what makes a settings
 * list scannable — a trainer looking for their UPI ID reads the right-hand column,
 * not the labels.
 */

import React, { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { usePrefs } from '../../../settings/usePrefs';
import { languageLabel, notifyOnCount, setPrefs, APPEARANCES } from '../../../settings/prefs';
import { useSyncState } from '../../../db/useSync';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Callout,
  GroupHead,
  IconBack,
  IconBell,
  IconButton,
  IconCalendar,
  IconCopy,
  IconDownload,
  IconEye,
  IconFlag,
  IconGlobe,
  IconMessage,
  IconRefresh,
  IconShield,
  IconStar,
  IconTrash,
  IconUser,
  IconWallet,
  Setting,
  SettingList,
  Tag,
  Toast,
  colors,
  space,
} from '../../../design';
import ChoiceSheet, { type ChoiceSpec } from './ChoiceSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { prefs } = usePrefs();
  const { phase, hasPending, pendingCount } = useSyncState();
  const { signOut } = useAuth();

  const [choice, setChoice] = useState<ChoiceSpec | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const version = versionLine();

  /**
   * Deletion.
   *
   * A typed confirmation, per the tap map, and then a 30-day grace period. What
   * this build can honestly do is sign the trainer out and tell them the request
   * has to be made by a human — because there is no delete endpoint yet, and a
   * button that claims to have queued an erasure that nothing will process is the
   * worst possible thing to ship on this particular row.
   */
  const deleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'Everything goes: clients, sessions, the book. There is a 30-day grace period before it is permanent, and you can stop it by signing back in.\n\nXRep cannot process this from the app yet — message support and it is done within a day.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Message support',
          onPress: () => navigation.navigate('Help'),
        },
      ],
    );
  };

  /** Support asks for this every time, which is why it is one tap. */
  const shareVersion = async () => {
    const detail = [version, `Platform: ${Constants.platform ? Object.keys(Constants.platform)[0] : 'unknown'}`].join(
      '\n',
    );
    try {
      await Share.share({ message: detail });
    } catch {
      setNotice('Could not open the share sheet.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Settings"
          subtitle={version}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <GroupHead label="Your business" />
        <SettingList>
          <Setting
            icon={IconUser}
            label="You and your business"
            meta="Name, certifications, gym"
            onPress={() => navigation.navigate('Profile')}
          />
          <Setting
            icon={IconWallet}
            label="Getting paid"
            meta="UPI ID, gym cut, reminders"
            onPress={() => navigation.navigate('GettingPaid')}
          />
          <Setting
            icon={IconCalendar}
            label="When you work"
            meta="Your hours and closed days"
            onPress={() => navigation.navigate('WorkingHours')}
          />
        </SettingList>

        <GroupHead label="The app" />
        <SettingList>
          <Setting
            icon={IconBell}
            label="Notifications"
            meta="What reaches your phone"
            value={`${notifyOnCount(prefs)} on`}
            onPress={() => navigation.navigate('NotifySettings')}
          />
          <Setting
            icon={IconGlobe}
            label="Language"
            meta="Also used in nudges"
            value={languageLabel(prefs.language)}
            onPress={() =>
              setChoice({
                title: 'Language',
                meta: 'Used for the app and for the wording of nudges.',
                options: [
                  { key: 'en', label: 'English' },
                  { key: 'ta', label: 'Tamil' },
                  { key: 'hi', label: 'Hindi' },
                  { key: 'te', label: 'Telugu' },
                ],
                value: prefs.language,
                onPick: (key) => void setPrefs({ language: key }),
              })
            }
          />
          <Setting
            icon={IconRefresh}
            label="Sync"
            meta={
              hasPending
                ? `${pendingCount || 'Some'} change${pendingCount === 1 ? '' : 's'} waiting`
                : 'Everything has reached the server'
            }
            trailing={
              hasPending ? (
                <Tag label={phase === 'syncing' ? 'Syncing' : 'Queued'} tone="info" />
              ) : (
                <Tag label="Clear" tone="ok" />
              )
            }
            /* Opens the queue rather than firing a sync from here. The row has
               just told the trainer a number, and a row that quotes a number
               and then does something other than show it is a dead end — which
               is what this was until the queue screen existed. Sync now lives
               on that screen, next to the list it acts on. */
            onPress={() => navigation.navigate('SyncQueue')}
          />
          <Setting
            icon={IconEye}
            label="Appearance"
            meta="Follow the phone, or pick one"
            value={APPEARANCES.find((a) => a.key === prefs.appearance)?.label}
            onPress={() =>
              setChoice({
                title: 'Appearance',
                // Said plainly rather than left to be discovered: the app is
                // dark-first and the light palette is defined but not wired to a
                // runtime switch, so choosing light would change nothing.
                meta: 'XRep is dark for now. The light theme is built but not switched on yet — this remembers your choice for when it is.',
                options: APPEARANCES.map((a) => ({ key: a.key, label: a.label })),
                value: prefs.appearance,
                onPick: (key) => void setPrefs({ appearance: key as typeof prefs.appearance }),
              })
            }
          />
        </SettingList>

        <GroupHead label="Your data" />
        <SettingList>
          <Setting
            icon={IconDownload}
            label="Export everything"
            meta="Clients, sessions, money"
            onPress={() => navigation.navigate('Home', { screen: 'MoneyTab' } as never)}
          />
          <Setting
            icon={IconShield}
            label="Privacy and consent"
            meta="What clients agreed to"
            onPress={() => navigation.navigate('Help')}
          />
          <Setting
            icon={IconTrash}
            label="Delete my account"
            meta="Permanent · 30-day grace"
            destructive
            onPress={deleteAccount}
          />
        </SettingList>

        <GroupHead label="Help" />
        <SettingList>
          <Setting
            icon={IconMessage}
            label="Talk to us"
            meta="WhatsApp · usually under an hour"
            onPress={() => navigation.navigate('Help')}
          />
          <Setting
            icon={IconFlag}
            label="Report a problem"
            meta="Never includes client details"
            onPress={() => navigation.navigate('Help')}
          />
          <Setting
            icon={IconStar}
            label="Rate XRep"
            meta="On the Play Store"
            onPress={() => setNotice('Not on the store yet — this build is a dev client.')}
          />
        </SettingList>

        <Callout icon={IconCopy} style={styles.note}>
          Everything except your profile works with no signal. What you change offline queues up and
          goes out the moment there is a connection.
        </Callout>

        <Setting
          label={version}
          meta="Tap to share it with support"
          onPress={() => void shareVersion()}
          style={styles.version}
        />

        {/* Sign out lives here as well as in the drawer. Somebody who came to
            Settings looking for it should find it, and the sheet that guards it
            is the same one either way. */}
        <Setting
          label="Sign out"
          meta={hasPending ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} not synced yet` : 'On this phone'}
          destructive={hasPending}
          onPress={() => navigation.navigate('SignOut')}
        />

        <Text style={styles.fine}>Signed in as this phone&apos;s trainer. Signing out clears this device&apos;s copy.</Text>
      </ScrollView>

      <ChoiceSheet spec={choice} onClose={() => setChoice(null)} />

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function versionLine(): string {
  const config = Constants.expoConfig;
  const version = config?.version ?? '1.0.0';
  const build = config?.android?.versionCode ?? config?.ios?.buildNumber;
  return build ? `XRep ${version} (${build})` : `XRep ${version}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  note: { marginTop: space.s4 },
  version: { marginTop: space.s5 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s3 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
