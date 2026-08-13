/**
 * Screen 17 · § 5b — one exercise's history, for one client.
 *
 * The same five columns as the log, read-only. A trainer should never have to
 * learn a second layout for their own data, so the Previous column is simply
 * repurposed: here it carries the RPE, which is the one thing worth keeping from
 * a set that already happened.
 *
 * Sessions run newest first. **Sets inside a session stay in the order they
 * happened**, because set 3 only means something after set 2 — and the PR tag is
 * on the set, not on the day.
 *
 * Every PR shown here was a record *at the time*: the history is walked forward
 * and each session judged against everything before it, by the same function
 * the floor screen uses. There is no stored flag to disagree with.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useLog } from '../../../log/useLog';
import { buildHistory } from '../../../log/log';
import {
  AppBar,
  Empty,
  IconBack,
  IconButton,
  IconDumbbell,
  IconEye,
  SetNote,
  SetRowStatic,
  Sets,
  SetsHead,
  Stat,
  StatRail,
  colors,
  space,
  tnum,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'ExerciseHistory'>;

export default function ExerciseHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { input } = useLog();

  const view = useMemo(
    () => buildHistory(input, params.clientId, params.exerciseId, Date.now()),
    [input, params.clientId, params.exerciseId],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view.name}
          subtitle={view.subtitle}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <IconButton
              icon={IconEye}
              label="Open the exercise"
              bare
              onPress={() =>
                navigation.navigate('Exercise', {
                  exerciseId: params.exerciseId,
                  clientId: params.clientId,
                })
              }
            />
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {view.empty ? (
          <Empty
            icon={IconDumbbell}
            title="Never logged"
            body="Nothing has been recorded against this one for this client yet. The first set is the number to beat."
            style={styles.empty}
          />
        ) : (
          <>
            <StatRail style={styles.rail}>
              {view.records.map((record) => (
                <Stat
                  key={record.label}
                  label={record.label}
                  value={record.value}
                  unit={record.unit || undefined}
                />
              ))}
            </StatRail>

            {view.sessions.map((session) => (
              <View key={session.workoutId} style={styles.session}>
                <View style={styles.stick}>
                  <Text style={styles.stickLabel}>{session.title}</Text>
                  <Text style={styles.stickVolume}>{session.volume}</Text>
                </View>

                <Sets>
                  <SetsHead previous="RPE" load={view.logType === 'reps' ? '—' : 'kg'} reps="Reps" />
                  {session.sets.flatMap((set) => {
                    const row = (
                      <SetRowStatic
                        key={`set-${set.number}`}
                        number={set.number}
                        meta={set.rpe != null ? `RPE ${set.rpe}` : '—'}
                        load={set.load}
                        reps={set.reps}
                        pr={set.pr}
                      />
                    );
                    return set.note
                      ? [row, <SetNote key={`note-${set.number}`} text={set.note} />]
                      : [row];
                  })}
                </Sets>
              </View>
            ))}
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
  rail: { marginTop: space.s2 },

  session: { marginTop: space.s4 },
  stick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.s1,
  },
  stickLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  stickVolume: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.37, color: colors.ink3, ...tnum },

  empty: { marginTop: space.s7 },
});
