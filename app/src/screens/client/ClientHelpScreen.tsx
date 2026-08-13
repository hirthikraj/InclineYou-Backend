/**
 * Help, in a client's words.
 *
 * Five questions, and every answer is a fact about how this app works rather than
 * a reassurance. The first is where an Indian client will actually ask — their
 * trainer, on WhatsApp — so that is the first thing on the screen.
 *
 * Not the trainer's Help screen with the words swapped: their FAQ is about a
 * roster, a diary and a book, and none of those are a client's to worry about.
 */

import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import { coachFirstName } from '../../client/client';
import { whatsappUri } from '../../money/money';
import {
  AppBar,
  Button,
  Faq,
  IconBack,
  IconButton,
  IconMessage,
  SectionHead,
  colors,
  space,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;

export default function ClientHelpScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);
  const coach = input.coach;
  const first = coachFirstName(coach);

  const entries = [
    {
      q: 'Does this work without internet?',
      a: `Yes, for everything that matters. Your plan, your sessions, every set you log and your whole history are stored **on this phone** and sync when there is a connection. Two things need a signal: paying by UPI, because your UPI app needs one, and Sunday's report, because ${first}'s server writes it.`,
    },
    {
      q: 'Can I move a session myself?',
      a: `No, and that is deliberate — a move changes ${first}'s working day too. Ask them, they send a new time, and you confirm it in one tap. **A move never uses up a session from your pack.**`,
    },
    {
      q: 'Where does my payment go?',
      a: `Straight to ${first}'s bank, through your own UPI app. **Train X never holds your money** and cannot confirm a payment — they mark it received when it lands, and your receipt comes from them.`,
    },
    {
      q: 'I logged the wrong weight. Can I delete it?',
      a: 'A reading is never overwritten — log the right one and the newest reading wins, and both stay in your history. It works that way so the series your trainer coaches from is the series that was actually recorded.',
    },
    {
      q: 'Can other clients see my numbers?',
      a: 'No. There are no leaderboards, no group feeds and no totals anybody could work you out from. The only two people who see your training are you and your trainer.',
    },
  ];

  const message = () => {
    const uri = whatsappUri(coach?.phone ?? null, `Hi ${first}, a question about the app —`);
    if (uri) void Linking.openURL(uri);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Help"
          subtitle="Five things worth knowing"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {coach ? (
          <>
            <SectionHead label="Ask the person who knows" first />
            <Button
              label={`Message ${first}`}
              icon={IconMessage}
              variant="secondary"
              block
              onPress={message}
            />
          </>
        ) : null}

        <SectionHead label="Questions" />
        <Faq entries={entries} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
});
