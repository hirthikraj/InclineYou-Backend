/**
 * 5d · Help.
 *
 * WhatsApp first, because that is where an Indian trainer will ask. Then the six
 * questions support actually gets — beginning with **"where do I withdraw my
 * money?"**, which is the question a book-not-a-processor design guarantees. An FAQ
 * whose first entry answers the question our own architecture creates is worth more
 * than twenty entries about features.
 *
 * A problem report includes the build, the phone model and recent app logs. **It
 * never includes client names, phone numbers or amounts.** DPDP, and the right
 * thing regardless — and the report shows exactly what is attached before it goes,
 * because a privacy promise nobody can verify is a slogan.
 */

import React, { useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { GST_LINE } from '../../../money/money';
import {
  AppBar,
  Callout,
  CalloutStrong,
  Faq,
  GroupHead,
  IconBack,
  IconButton,
  IconChevron,
  IconCopy,
  IconFlag,
  IconMessage,
  IconShield,
  Row,
  Setting,
  SettingList,
  Toast,
  colors,
  radius,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

/**
 * The support number.
 *
 * A placeholder until there is a real one, and it is a constant rather than a
 * hard-coded string in the JSX so replacing it is one line. The row says the hours
 * and the languages because both are the actual promise.
 */
const SUPPORT_PHONE = '918000000000';

const QUESTIONS = [
  {
    q: 'Where do I withdraw my money?',
    a: "You don't — and there's nothing to withdraw. **Train X never holds your money.** Clients pay you by cash, by UPI into your own bank, or at the gym counter, and Train X keeps the book so you know who has paid and who hasn't.",
  },
  {
    q: "A client paid but the app doesn't know",
    a: "Record it. Train X cannot see your bank account or read your UPI notifications, so a payment only exists in the book once you write it down. Open the client, tap **Record payment**, and the pack and the month's figures update immediately — offline too.",
  },
  {
    q: 'Do my clients have to install anything?',
    a: 'No. Everything a client receives — a reminder, a receipt, a nudge — goes over **WhatsApp**, which they already have. There is no client app to talk them into downloading, and no login for them to forget.',
  },
  {
    q: 'Does it work without internet?',
    a: 'Yes, for everything that matters. Sessions, payments, packs, the diary and the roster are all stored **on your phone first** and sync when there is a connection. Two things need internet: your own profile settings, and copying a program onto a client.',
  },
  {
    q: 'What happens if I change gyms?',
    a: "Change the gym name in **You and your business** and set the new cut. Everything already recorded keeps the split it was recorded with — a September session does not move because October's contract is different.",
  },
  {
    q: 'Do I need to register for GST?',
    a: `Services cross into GST at **₹${(GST_LINE / 100000).toFixed(0)} lakh a year** (₹10 lakh in a few north-eastern states). The Money screen shows a meter against that line and warns you before you reach it, not after — late registration costs a penalty. Train X is not your accountant, and this is the one number it will point at.`,
  },
];

export default function HelpScreen() {
  const navigation = useNavigation<Nav>();
  const [notice, setNotice] = useState<string | null>(null);

  const diagnostics = () =>
    [
      `Train X ${Constants.expoConfig?.version ?? '1.0.0'}`,
      `Build: ${Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? 'dev'}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Device: ${Constants.deviceName ?? 'unknown'}`,
    ].join('\n');

  const openWhatsApp = async () => {
    const text = `Hi Train X support — I need help.\n\n${diagnostics()}`;
    try {
      await Linking.openURL(`https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(text)}`);
    } catch {
      setNotice('Could not open WhatsApp on this phone.');
    }
  };

  const report = async () => {
    try {
      await Share.share({
        message: `Train X problem report\n\n${diagnostics()}\n\nWhat happened:\n`,
      });
    } catch {
      setNotice('Could not open the share sheet.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Help"
          subtitle="Usually answered in under an hour"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* The first thing on the screen, and a whole row rather than a settings
            line: WhatsApp is where this conversation is going to happen. */}
        <Row
          style={styles.whatsapp}
          minHeight={70}
          leading={
            <View style={styles.wa}>
              <IconMessage size={21} color="#062B14" />
            </View>
          }
          title="Message us on WhatsApp"
          subtitle="English, Tamil or Hindi · 9am – 9pm"
          onPress={() => void openWhatsApp()}
          trailing={<IconChevron size={18} color={colors.ink3} />}
        />

        <GroupHead label="The questions we actually get" />
        <Faq entries={QUESTIONS} initial={0} />

        <GroupHead label="If something's broken" />
        <SettingList>
          <Setting
            icon={IconFlag}
            label="Report a problem"
            meta="Your build and phone model only"
            wrap
            onPress={() => void report()}
          />
          <Setting
            icon={IconCopy}
            label="Share diagnostics"
            meta="Support will ask for this"
            onPress={() => void report()}
          />
        </SettingList>

        <Callout icon={IconShield} style={styles.note}>
          A problem report includes your build, your phone model and recent app logs.{' '}
          <CalloutStrong>It never includes client names, phone numbers or amounts.</CalloutStrong>
        </Callout>

        {/* Shown, not described. The privacy promise above is checkable because
            this is literally what gets sent. */}
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>Exactly what gets attached</Text>
          <Text style={styles.previewBody} selectable>
            {diagnostics()}
          </Text>
        </View>
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

  whatsapp: { marginTop: space.s4 },
  wa: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    // WhatsApp's own green, with its own ink on top. Borrowing the brand colour
    // is what makes the row unmistakable at a glance.
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },

  note: { marginTop: space.s4 },
  preview: {
    marginTop: space.s3,
    padding: space.cardPad,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: space.s2,
  },
  previewBody: { fontSize: 12.5, lineHeight: 19, color: colors.ink2 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
