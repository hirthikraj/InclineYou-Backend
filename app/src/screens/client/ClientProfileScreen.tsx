/**
 * Your details — the client's own record, read-only, and honest about why.
 *
 * A client cannot edit this, and the screen says whose job it is rather than
 * showing greyed-out fields. Their trainer created the record (FR-1) and keeps
 * it: the name on their receipts and the number their sessions are booked
 * against are the trainer's book, not a profile the client maintains.
 *
 * What is deliberately absent: their trainer's phone number as text, and his UPI
 * ID. The coach block reaches him without printing either.
 */

import React, { useMemo } from 'react';
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
  Callout,
  Coach,
  IconBack,
  IconButton,
  Receipt,
  ReceiptRow,
  SectionHead,
  colors,
  space,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;

export default function ClientProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId, memberships } = useAuth();
  const { input } = useClient(clientId);

  const me = input.me;
  const coach = input.coach;
  const first = coachFirstName(coach);
  const phone = useMemo(
    () => memberships.find((m) => m.clientId === clientId)?.trainerPhone ?? null,
    [memberships, clientId],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Your details"
          subtitle={coach ? `kept by ${first}` : 'your record'}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <SectionHead label="On the roster as" first />
        <Receipt>
          <ReceiptRow label="Name" value={me?.name ?? '—'} />
          <ReceiptRow
            label="Usually trained"
            value={me?.deliveryMode === 'remote' ? 'Remote' : 'On the floor'}
          />
          <ReceiptRow
            label="Added"
            value={me ? new Date(me.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
          />
        </Receipt>

        <Callout style={styles.note}>
          {first} keeps this record — it is the same one your sessions, your pack and your receipts
          hang off. Ask them to change anything here and it updates on both phones.
        </Callout>

        {coach ? (
          <Coach
            label="Your trainer"
            name={coach.name}
            detail={coach.gymName}
            action={{
              label: `Message ${first}`,
              onPress: () => {
                const uri = whatsappUri(coach.phone ?? phone, `Hi ${first}, could you update my details?`);
                if (uri) void Linking.openURL(uri);
              },
            }}
            onCall={coach.phone ? () => void Linking.openURL(`tel:${coach.phone}`) : undefined}
            style={styles.coach}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  note: { marginTop: space.s3 },
  coach: { marginTop: space.s3 },
});
