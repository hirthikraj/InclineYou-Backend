/**
 * My own training — the honest half of 2b.
 *
 * The mode sheet is designed; what is behind it is not. "Your log, your PRs, your
 * programs" is a subtitle, not a specification, and the decision it implies — is
 * the trainer a client of themselves, or a separate kind of record entirely? —
 * is the most structural one in the feature. Guessing at it from a sheet's
 * subtitle would put a schema in the database that a later design has to
 * unpick, and this codebase's schema law makes that expensive on purpose.
 *
 * So this screen says what it is. It is not a placeholder that pretends to be a
 * screen: it states the rule that will govern the mode when it is built, which
 * is the part already decided, and it gets the trainer back to coaching in one
 * tap — which the sheet promised.
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { setPrefs } from '../../../settings/prefs';
import {
  AppBar,
  Button,
  Callout,
  Empty,
  IconBack,
  IconButton,
  IconDumbbell,
  IconShield,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function SelfTrainingScreen() {
  const navigation = useNavigation<Nav>();

  const backToCoaching = async () => {
    await setPrefs({ mode: 'coaching' });
    // `popToTop` rather than `goBack`: the trainer switched books, and landing
    // them back on the profile screen they happened to pass through would be
    // the wrong place to arrive in the other one.
    navigation.popToTop();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="My own training"
          subtitle="Your book, not your clients'"
          leading={
            <IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Empty
          icon={IconDumbbell}
          title="Your log is not built yet"
          body="You're in your own book — nothing here is mixed in with a client's. The log, your personal records and your own programs are the next thing to arrive in this mode."
        />

        <Callout icon={IconShield} style={styles.note}>
          The rule is already settled: your own sets never appear in a client&apos;s history, and no
          money screen exists in this mode. Switching back takes one tap.
        </Callout>

        <Button
          label="Back to coaching"
          variant="primary"
          size="lg"
          block
          onPress={() => void backToCoaching()}
          style={styles.action}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10, paddingTop: space.s6 },
  note: { marginTop: space.s5 },
  action: { marginTop: space.s4 },
});
