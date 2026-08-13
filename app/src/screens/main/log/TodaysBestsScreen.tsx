/**
 * Screen 17 · § 4b — not every PR is worth a shout.
 *
 * Four candidates checked, two of them genuine bests, one worth saying out loud.
 * The threshold is not decoration: **it decides whether the client's phone
 * buzzes**, and a trainer who forwards five records a week has taught a client
 * that records mean nothing.
 *
 * The three tests, and the one that comes after them, are stated on the screen
 * rather than hidden in a help page — a threshold nobody can see is a threshold
 * nobody trusts.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useLog } from '../../../log/useLog';
import { buildLog, type Verdict } from '../../../log/log';
import {
  AppBar,
  Callout,
  Empty,
  IconAlert,
  IconBack,
  IconBadge,
  IconButton,
  List,
  PrCard,
  Row,
  Tag,
  colors,
  space,
  tnum,
  type TagTone,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'TodaysBests'>;

const TAG: Record<Verdict, { label: string; tone: TagTone }> = {
  record: { label: 'Record', tone: 'pr' },
  quiet: { label: 'Quiet', tone: 'neutral' },
  matched: { label: 'Matched', tone: 'neutral' },
  first: { label: 'First log', tone: 'neutral' },
  none: { label: '—', tone: 'neutral' },
};

export default function TodaysBestsScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { input } = useLog();

  const view = useMemo(() => buildLog(input, params.workoutId, Date.now()), [input, params.workoutId]);

  const announced = view?.records.filter((r) => r.announced).length ?? 0;
  const quiet = view?.records.filter((r) => !r.announced) ?? [];

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Today's bests"
          subtitle={view ? `${view.clientName} · ${view.bests.length} checked · ${announced} announced` : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {!view || view.bests.length === 0 ? (
          <Empty
            icon={IconBadge}
            title="Nothing checked yet"
            body="Records are worked out from the sets. Log one and this fills itself in."
            style={styles.empty}
          />
        ) : (
          <>
            <List>
              {view.bests.map((best) => (
                <Row
                  key={best.exerciseId}
                  grouped
                  wrap
                  title={best.name}
                  subtitle={best.detail}
                  onPress={() =>
                    navigation.navigate('ExerciseHistory', {
                      clientId: view.clientId,
                      exerciseId: best.exerciseId,
                    })
                  }
                  trailing={<Tag label={TAG[best.verdict].label} tone={TAG[best.verdict].tone} />}
                />
              ))}
            </List>

            {quiet.map((record) => (
              <PrCard
                key={record.exerciseId}
                setLabel={record.name}
                value={record.value}
                unit={record.unit}
                was={record.was}
                delta={record.delta}
                why={record.why}
                quiet
                style={styles.card}
              />
            ))}

            <Callout icon={IconAlert} style={styles.note}>
              <Text style={styles.strong}>Three tests before gold.</Text> There has to be an earlier
              session — you cannot beat nothing. It has to beat the old number by one plate or one
              clean rep. And only the top set is checked, so a warm-up can never make one. A gold
              record is also the only one that sends a message, once, after the session.
            </Callout>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  card: { marginTop: space.s3 },
  note: { marginTop: space.s4 },
  strong: { color: colors.ink2, fontWeight: '600', ...tnum },
  empty: { marginTop: space.s7 },
});
