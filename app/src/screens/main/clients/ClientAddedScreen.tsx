/**
 * 5c · Added.
 *
 * `agent/design system/screens/xrep-clients.html` § 08, frame 5c.
 *
 * **No success animation.** A client was added, which is a Tuesday, not an
 * achievement — so the screen spends itself on the three things actually worth
 * doing next, and on repeating the roster's honest line: an invite is optional.
 *
 * "Add another client" is here because trainers add clients in batches, at the
 * counter, in one sitting.
 *
 * The record already exists on this phone by the time this screen renders, which
 * is why the second line is a statement rather than a spinner.
 */

import React, { useEffect, useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useClientFile } from '../../../clients/useClientFile';
import { buildHead } from '../../../clients/file';
import { useRoster } from '../../../clients/useRoster';
import { whatsappUri } from '../../../money/money';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  ClientHead,
  IconBack,
  IconButton,
  List,
  Row,
  SectionHead,
  Tag,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'ClientAdded'>;

export default function ClientAddedScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useRoute<Rt>().params;
  const { input, now, ready } = useClientFile(clientId);
  const roster = useRoster();

  const head = useMemo(() => buildHead(input, now), [input, now]);

  // The sync that started with the write can come back refusing this person —
  // a number that turns out to be a trainer's, or another trainer's client — and
  // the row is then taken off this phone seconds after this screen opened. A
  // congratulations page for somebody who no longer exists is worse than none,
  // so it stands down to the roster, where the refusal is waiting as a toast.
  //
  // `ready` is what separates "gone" from "not read yet": both are a null head.
  useEffect(() => {
    if (ready && !head) navigation.popToTop();
  }, [ready, head, navigation]);

  if (!head) return null;

  const first = head.name.split(' ')[0] || head.name;
  // "Mornings are your busiest hours" is only worth saying when it's true of
  // this trainer's actual diary, so it comes from the roster's own batches.
  const mornings = roster.rows.filter((r) => r.batch === 'morning').length;
  const evenings = roster.rows.filter((r) => r.batch === 'evening').length;
  const busiest = mornings === evenings ? null : mornings > evenings ? 'Mornings' : 'Evenings';

  // The plan step books the standing week when it can, so "book their first
  // session" would often be advice already taken. Count what's on the diary
  // and let the row say which of the two states this client is in.
  const booked = input.sessions.filter(
    (s) => s.status === 'scheduled' && new Date(s.scheduledAt).getTime() > now,
  ).length;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Clients"
          subtitle={`${roster.rows.length} on your roster`}
          leading={
            <IconButton
              icon={IconBack}
              label="Back to the roster"
              bare
              onPress={() => navigation.popToTop()}
            />
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <ClientHead
          name={head.name}
          tick
          phone={head.phoneLabel ?? undefined}
          tags={
            <>
              <Tag
                label={head.mode === 'remote' ? 'Remote' : 'Floor'}
                tone={head.mode === 'remote' ? 'remote' : 'floor'}
              />
              <Tag
                label={
                  input.client?.paymentMode === 'gym_collects' ? 'Gym collects' : 'You collect'
                }
              />
            </>
          }
        />

        <Text style={styles.h3}>Saved on this phone</Text>
        <Text style={styles.sub}>
          Nothing here needed a connection. It goes up on its own the next time you have one.
        </Text>

        <SectionHead label="What's worth doing now" />
        <List style={styles.list}>
          <Row
            grouped
            title={
              booked > 0
                ? `${booked} session${booked === 1 ? '' : 's'} already booked`
                : `Book ${first}'s first session`
            }
            subtitle={
              booked > 0
                ? 'From their plan — see them in the diary'
                : busiest
                  ? `${busiest} are your busiest hours`
                  : 'Pick a slot that repeats'
            }
            onPress={() =>
              navigation.navigate('Home', {
                screen: 'DiaryTab',
                params: booked > 0 ? { clientId } : { book: true, clientId },
              } as never)
            }
          />
          <Row
            grouped
            title={`Sell ${first} a pack`}
            subtitle="Nothing is owed until you record one"
            onPress={() => navigation.navigate('MoneyPacks')}
          />
          <Row
            grouped
            title="Send an invite"
            subtitle="Optional · they'd see their own app"
            onPress={() => {
              const uri = whatsappUri(
                head.phone,
                `Hi ${first}, I've added you to XRep. You'll get your sessions and what you owe on your own phone — install it if you like, and nothing changes if you don't.`,
              );
              if (uri) void Linking.openURL(uri);
            }}
          />
        </List>

        <Callout style={styles.note}>
          You can log {first}&apos;s sessions and take their money right now.{' '}
          <CalloutStrong>The invite only decides whether they see the app</CalloutStrong> — plenty of
          clients never install it, and nothing on your side stops working.
        </Callout>

        <Button
          label={`Open ${first}'s file`}
          size="lg"
          block
          onPress={() => navigation.replace('ClientDetail', { clientId })}
          style={styles.go}
        />
        <Button
          label="Add another client"
          variant="ghost"
          block
          onPress={() => navigation.replace('AddClient', {})}
          style={styles.again}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  h3: { fontSize: 17, fontWeight: '700', letterSpacing: -0.26, color: colors.ink, marginTop: space.s2 },
  sub: { fontSize: 13.5, lineHeight: 20, color: colors.ink3, marginTop: 4 },

  list: { marginBottom: space.s2 },
  note: { marginTop: space.s3 },
  go: { marginTop: space.s5 },
  again: { marginTop: space.s2 },
});
