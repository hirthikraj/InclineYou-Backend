/**
 * 8a · Weight and waist. 8b · Add a measurement.
 *
 * `agent/design system/screens/xrep-clients.html` § 11.
 *
 * One decision separates this screen from every competitor's: **a saved
 * measurement cannot be edited or deleted.** Trainerize, TrueCoach, Everfit and
 * Hevy all let a trainer change a past reading, and it is the wrong call for the
 * one screen whose whole job is to be believed — a client who has watched their
 * weight chart change shape after the fact will never trust it again.
 *
 * A wrong number is corrected by appending the right one, and the history says
 * so on the row. The superseded reading stays where it is. That is what
 * append-only looks like when it is honest.
 *
 * The deltas are deliberately neither green nor red: −3.8 kg is progress for one
 * client and a failure for another, and the app does not know which.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useClientFile } from '../../../clients/useClientFile';
import { METRIC_KINDS, buildHead, buildMetrics, type MetricKind } from '../../../clients/file';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Card,
  Empty,
  IconBack,
  IconButton,
  IconChart,
  IconPlus,
  Measure,
  Measures,
  SectionHead,
  Segmented,
  colors,
  space,
  tnum,
} from '../../../design';
import MeasureSheet from './MeasureSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'BodyMetrics'>;

export default function BodyMetricsScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useRoute<Rt>().params;
  const { input, now } = useClientFile(clientId);

  const [kind, setKind] = useState<MetricKind>('weight');
  const [adding, setAdding] = useState(false);

  const head = useMemo(() => buildHead(input, now), [input, now]);
  const view = useMemo(() => buildMetrics(input, kind), [input, kind]);

  if (!head) return null;

  const peak = view.spark.length ? Math.max(...view.spark) : 0;
  const floor = view.spark.length ? Math.min(...view.spark) : 0;
  const span = peak - floor;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Body metrics"
          subtitle={`${head.name} · ${view.count} reading${view.count === 1 ? '' : 's'}`}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <IconButton icon={IconPlus} label="Add a measurement" bare onPress={() => setAdding(true)} />
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.pair}>
          {view.current.map((c) => (
            <Card key={c.key} style={styles.metric}>
              <Text style={styles.label}>{c.label}</Text>
              <View style={styles.figureRow}>
                <Text style={styles.figure}>{c.value}</Text>
                <Text style={styles.unit}>{c.unit}</Text>
              </View>
              {/* Never coloured. The sign is the direction; the app has no
                  opinion about whether the direction is good. */}
              <Text style={styles.delta}>{c.delta}</Text>
            </Card>
          ))}
        </View>

        <Segmented
          options={METRIC_KINDS.map((k) => ({ key: k.key, label: k.label }))}
          value={kind}
          onChange={(key) => setKind(key as MetricKind)}
          style={styles.seg}
        />

        {view.spark.length > 1 ? (
          <>
            <View style={styles.spark}>
              {view.spark.map((value, i) => (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    // Scaled to the range these readings cover, not from zero:
                    // from zero a weight series is eight identical bars.
                    { height: span > 0 ? 6 + ((value - floor) / span) * 34 : 20 },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.caption}>
              {view.sentence} Bars are scaled to the range those readings cover, not from zero — from
              zero these are identical bars.
            </Text>
          </>
        ) : null}

        {view.rows.length ? (
          <>
            <Callout style={styles.note}>
              <CalloutStrong>Nothing below can be edited or deleted.</CalloutStrong> A wrong number
              is corrected by adding the right one — the first stays in the list, marked as
              replaced.
            </Callout>

            <SectionHead label="Every reading" count={view.rows.length} />
            <Measures style={styles.list}>
              {view.rows.map((row) => (
                <Measure
                  key={row.id}
                  when={row.when}
                  note={row.note}
                  value={row.value}
                  unit={row.unit}
                  delta={row.delta}
                  replaced={row.replaced}
                />
              ))}
            </Measures>
          </>
        ) : (
          <Empty
            icon={IconChart}
            title={`No ${kind} readings yet`}
            body="Add one and it is fixed for good — this list can be added to, never edited. That is what makes it worth showing a client."
            action={<Button label="Add a measurement" onPress={() => setAdding(true)} />}
            style={styles.empty}
          />
        )}
      </ScrollView>

      <MeasureSheet
        visible={adding}
        clientId={clientId}
        lastWeight={buildMetrics(input, 'weight').last}
        lastWaist={buildMetrics(input, 'waist').last}
        onClose={() => setAdding(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  pair: { flexDirection: 'row', gap: space.s2 },
  metric: { flex: 1 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 9 },
  figure: { fontSize: 26, fontWeight: '800', letterSpacing: -0.91, color: colors.ink, ...tnum },
  unit: { fontSize: 12, fontWeight: '700', color: colors.ink3 },
  delta: { fontSize: 11, fontWeight: '800', color: colors.ink3, marginTop: 4, ...tnum },

  seg: { marginTop: space.s4 },

  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 40, marginTop: space.s4 },
  bar: { flex: 1, borderRadius: 2, backgroundColor: colors.accent, minHeight: 3 },
  caption: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: space.s3 },

  note: { marginTop: space.s4 },
  list: { marginBottom: space.s2 },
  empty: { marginTop: space.s6 },
});
