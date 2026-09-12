/**
 * 5c · Notifications.
 *
 * Eight switches, grouped by what they are about, each with **when it fires on the
 * row** rather than in a sub-screen. InclineYou only pings for things that need a
 * decision; everything else waits for the app to be opened, which is why this list
 * is short.
 *
 * And a floor nobody can turn off: **muted 10pm to 7am.** A trainer's phone at
 * 11pm is not a work phone. It is a constant in `settings/prefs.ts`, not a
 * preference, and it is stated at the bottom so its absence from the list reads as
 * a decision rather than an omission.
 *
 * Each flip writes to the phone immediately and mirrors to the server behind it.
 * The mirror matters because push decisions are made server-side — a notification
 * switch that only exists on the device it was flipped on is a switch that does
 * nothing. The phone is still the source of truth for what this screen draws, so
 * a flip in a basement stays flipped.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { usePrefs } from '../../../settings/usePrefs';
import {
  NOTIFY_ROWS,
  QUIET_FROM_HOUR,
  QUIET_TO_HOUR,
  notifyOnCount,
  setPrefs,
  type NotifyPrefs,
} from '../../../settings/prefs';
import {
  AppBar,
  Callout,
  CalloutStrong,
  GroupHead,
  IconAlert,
  IconBack,
  IconBan,
  IconBell,
  IconButton,
  IconCalendar,
  IconChart,
  IconClock,
  IconLock,
  IconMessage,
  IconRupee,
  IconUserAdd,
  Setting,
  SettingList,
  Switch,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

/** One icon per switch, matching what it is about rather than what it does. */
const ICONS: Record<keyof NotifyPrefs, React.ComponentType<{ size?: number; color?: string }>> = {
  paymentIn: IconRupee,
  overdue: IconAlert,
  nextSession: IconClock,
  cancelled: IconBan,
  tomorrow: IconCalendar,
  personalRecord: IconChart,
  goneQuiet: IconMessage,
  inviteAccepted: IconUserAdd,
};

/** The order the design groups them in: money first, because that is the wedge. */
const GROUPS = ['Money', 'Sessions', 'Clients'] as const;

export default function NotifySettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { prefs } = usePrefs();

  const on = notifyOnCount(prefs);
  const off = Object.keys(prefs.notify).length - on;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Notifications"
          subtitle={`${on} on · ${off} off`}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Callout icon={IconBell} style={styles.lead}>
          InclineYou only pings you for things that <CalloutStrong>need a decision</CalloutStrong>.
          Everything else waits for you to open the app — which is why this list is short.
        </Callout>

        {GROUPS.map((group) => (
          <View key={group}>
            <GroupHead label={group} />
            <SettingList>
              {NOTIFY_ROWS.filter((row) => row.group === group).map((row) => (
                <Setting
                  key={row.key}
                  icon={ICONS[row.key]}
                  label={row.label}
                  meta={row.meta}
                  trailing={
                    <Switch
                      value={prefs.notify[row.key]}
                      onChange={(next) => void setPrefs({ notify: { [row.key]: next } })}
                      label={row.label}
                    />
                  }
                />
              ))}
            </SettingList>
          </View>
        ))}

        <Callout icon={IconLock} style={styles.note}>
          Notifications are muted{' '}
          <CalloutStrong>
            {QUIET_FROM_HOUR - 12}pm to {QUIET_TO_HOUR}am
          </CalloutStrong>{' '}
          whatever you pick here. A trainer&apos;s phone at 11pm is not a work phone.
        </Callout>

        <Text style={styles.fine}>
          These are settings for what InclineYou sends. Your phone&apos;s own notification permission sits
          above them — if Android is blocking InclineYou, nothing here will get through.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  lead: { marginTop: space.s3 },
  note: { marginTop: space.s4 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s3 },
});
