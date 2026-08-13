/**
 * Screen 6a · Your week. FR-10.2.
 *
 * The one screen in the client app that does not come from local computation. The
 * server generates it on Sunday night and pushes it out — the trainer's
 * notification centre already reports "weekly report sent to 27 clients" — and
 * once it lands it is stored and never changes, because a report whose numbers
 * move after you have read it is not a report.
 *
 * So nothing here recomputes anything. The bars, the totals and the sentence about
 * the best lift are read back exactly as they were written, which is why the
 * figures on this screen and the figures the trainer got are the same figures:
 * they are the same row.
 *
 * Bars plus the figure in text on every chart, and the rest days labelled in the
 * legend rather than left as short bars a client will read as failure. The report
 * is warm in exactly one way — it opens with what they kept, not with what they
 * missed.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import { buildWeek, coachFirstName } from '../../client/client';
import {
  AppBar,
  Callout,
  CalloutStrong,
  Card,
  Empty,
  IconBack,
  IconButton,
  IconChart,
  IconStar,
  Legend,
  List,
  Row,
  RowTime,
  SectionHead,
  Stat,
  StatRail,
  Tag,
  WeekBars,
  colors,
  space,
  tnum,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;
type Rt = RouteProp<ClientStackParamList, 'Week'>;

export default function WeekScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);
  const [at] = useState(() => Date.now());

  const view = useMemo(
    () => (clientId ? buildWeek(input, clientId, at, route.params?.weekStart) : null),
    [input, clientId, at, route.params?.weekStart],
  );

  const first = coachFirstName(input.coach);

  if (!clientId) return null;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Your week"
          subtitle={view?.range ?? `from ${first}`}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      {!view ? (
        <Empty
          icon={IconChart}
          title="No report yet"
          body={`${first}'s server writes these on Sunday night and sends them out. This is the one thing in the app that needs a connection — everything else is on your phone.`}
          style={styles.empty}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Card>
            <View style={styles.head}>
              <View>
                <Text style={styles.label}>Sessions kept</Text>
                <Text style={styles.kept}>
                  {view.kept} of {view.planned}
                </Text>
              </View>
              <Tag label={`${view.percent}%`} tone={view.percent >= 100 ? 'ok' : 'neutral'} />
            </View>

            <WeekBars
              days={view.days.map((day) => ({
                label: day.label,
                value: day.trained ? 100 : 14,
                on: day.trained,
              }))}
              style={styles.bars}
            />
            <Legend
              entries={[
                { key: 'trained', label: view.trainedLabel, color: colors.accent },
                { key: 'rest', label: view.restLabel, color: colors.surface3 },
              ]}
            />
          </Card>

          <StatRail style={styles.rail}>
            {/* The unit is in the label, not beside the figure: 19,350 with a
                trailing "kg" truncates to "19,35…" at a third of a 360dp
                screen, and a truncated total is worse than a labelled one. */}
            <Stat label="Lifted · kg" value={view.volume} />
            <Stat label="Sets" value={view.sets} />
            <Stat label="New bests" value={view.newBests} />
          </StatRail>

          {view.best ? (
            <>
              <SectionHead label="New best this week" />
              <List style={styles.group}>
                <Row
                  grouped
                  leading={<IconStar size={17} color={colors.pr} filled />}
                  title={view.best.line}
                  subtitle={view.best.previous ?? undefined}
                  trailing={<Tag label="PR" tone="pr" />}
                />
              </List>
            </>
          ) : null}

          {view.next ? (
            <>
              <SectionHead
                label="What's next"
                action={{ label: 'Sessions', onPress: () => navigation.navigate('Sessions') }}
              />
              <List style={styles.group}>
                <Row
                  grouped
                  leading={<RowTime time={view.next.day} meridiem={view.next.month} />}
                  spine={view.next.now ? 'now' : undefined}
                  title={view.next.when}
                  subtitle={view.next.detail}
                  trailing={
                    <Tag
                      label={view.next.mode === 'remote' ? 'Remote' : 'Floor'}
                      tone={view.next.mode === 'remote' ? 'remote' : 'floor'}
                    />
                  }
                />
              </List>
            </>
          ) : null}

          <Callout tone="accent" style={styles.note}>
            {view.restIsThePlan ? (
              <>
                <CalloutStrong>Nothing here is a miss.</CalloutStrong> {view.restLabel} is what your
                plan asks for.{' '}
              </>
            ) : null}
            {first} got these same numbers on Sunday night — this report doesn&apos;t change after
            it&apos;s sent.
          </Callout>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  kept: { fontSize: 30, fontWeight: '800', letterSpacing: -1.05, color: colors.ink, marginTop: 8, ...tnum },
  bars: { marginTop: space.s4 },

  rail: { marginTop: space.s2 },
  group: { marginBottom: space.s2 },
  note: { marginTop: space.s3 },
  empty: { marginTop: space.s7 },
});
