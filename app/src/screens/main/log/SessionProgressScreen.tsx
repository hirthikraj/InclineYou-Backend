/**
 * Screen 17 · § 5a — progress.
 *
 * What the trainer opens on the way to the gym, and what they turn the phone
 * round to show. Three things: **volume, the top set, and bodyweight** — and only
 * one of them gets a chart.
 *
 * ── Why only volume is charted ────────────────────────────────────────────
 *
 * §09: no bar chart of anything that is not a sum, and no chart with a non-zero
 * baseline. Volume adds up, so bars from zero tell the truth about it. A load
 * does not: a bar chart of 52.5 kg against 55 kg starting at zero makes a plate
 * look like nothing, and starting it at 50 makes a plate look like everything.
 * So the top set is written out as the sequence of numbers it actually is —
 * "45 → 47.5 → 50 → 52.5 → 55 kg" — which is also what a coach says out loud.
 *
 * Bodyweight gets no colour and no arrow verdict. The app has no opinion about
 * which way a client's weight should go.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useLog } from '../../../log/useLog';
import { buildProgress, type ProgressRange } from '../../../log/log';
import {
  AppBar,
  Chip,
  Empty,
  IconBack,
  IconButton,
  IconChart,
  IconChevron,
  Metric,
  Row,
  Segmented,
  Stat,
  StatRail,
  WeekBars,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'SessionProgress'>;

const RANGES = [
  { key: '8w' as const, label: '8 weeks' },
  { key: '6m' as const, label: '6 months' },
  { key: 'all' as const, label: 'All' },
];

export default function SessionProgressScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { input } = useLog();

  const [range, setRange] = useState<ProgressRange>('8w');
  const [at] = useState(() => Date.now());

  const view = useMemo(
    () => buildProgress(input, params.clientId, range, at),
    [input, params.clientId, range, at],
  );

  const nothing = view.sessions === 0 && view.sets === 0;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Progress"
          subtitle={[view.clientName, view.plan].filter(Boolean).join(' · ')}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Segmented options={RANGES} value={range} onChange={setRange} />

        {nothing ? (
          <Empty
            icon={IconChart}
            title="Nothing logged in this window"
            body="Progress is worked out from the sets. Try a longer range, or log a session."
            style={styles.empty}
          />
        ) : (
          <>
            <StatRail style={styles.rail}>
              <Stat label="Sessions" value={view.sessions} />
              <Stat label="Sets" value={view.sets} />
              <Stat label="Records" value={view.records} />
            </StatRail>

            {view.volume ? (
              <Metric
                label="Volume · this week"
                value={view.volume.value}
                delta={view.volume.delta ?? undefined}
                style={styles.metric}
              >
                <WeekBars
                  days={view.volume.weeks.map((w) => ({
                    label: w.label,
                    value: w.volumeKg,
                    on: w.current,
                  }))}
                />
                <Text style={styles.note}>{view.volume.note}</Text>
              </Metric>
            ) : null}

            {view.topSet ? (
              // No chart, on purpose. See the note at the top of this file.
              <Metric
                label={view.topSet.label}
                value={view.topSet.value}
                delta={
                  view.topSet.delta
                    ? {
                        direction: view.topSet.delta.startsWith('▲') ? 'up' : 'down',
                        text: view.topSet.delta.slice(2),
                      }
                    : undefined
                }
                style={styles.metric}
              >
                <Text style={styles.noteFlush}>{view.topSet.note}</Text>
              </Metric>
            ) : null}

            <Metric
              label="Bodyweight"
              value={view.bodyweight?.value ?? 'Not on record'}
              style={styles.metric}
            >
              <Text style={styles.noteFlush}>
                {view.bodyweight?.note ?? 'Logged from their file, not from here.'}
              </Text>
            </Metric>

            <Row
              title="Every exercise, every set"
              subtitle={`${view.exerciseCount} exercise${view.exerciseCount === 1 ? '' : 's'} in this window`}
              trailing={<IconChevron size={18} color={colors.ink3} />}
              onPress={() => navigation.navigate('ClientDetail', { clientId: params.clientId })}
              style={styles.link}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10, paddingTop: space.s2 },
  rail: { marginTop: space.s4 },
  metric: { marginTop: space.s2 },
  note: { fontSize: 12, lineHeight: 18, color: colors.ink3, marginTop: 11 },
  noteFlush: { fontSize: 12, lineHeight: 18, color: colors.ink3 },
  link: { marginTop: space.s4 },
  empty: { marginTop: space.s7 },
});
