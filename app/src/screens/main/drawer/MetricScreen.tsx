/**
 * 4b · Inside a metric.
 *
 * Delivered against booked, then by weekday, then by client.
 *
 * The callout is the point of the screen: **Wednesday is your closed day, so the
 * 8% there is one-off sessions you took anyway — not a gap you need to fill.** A
 * bar chart by weekday invites exactly one wrong conclusion, and the working-hours
 * table already knows the answer. `closedDayNote` only speaks when a genuinely
 * closed day has a small amount of activity, which is the only case where the bar
 * misleads.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useReports } from '../../../reports/useReports';
import { buildMetric } from '../../../reports/reports';
import {
  AppBar,
  Avatar,
  Bar,
  Callout,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconCalendar,
  IconChart,
  Legend,
  List,
  Reveal,
  Row,
  Skeleton,
  Tag,
  WeekBars,
  colors,
  radius,
  space,
  type,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'Metric'>;

export default function MetricScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const focused = useIsFocused();
  const { input, now, ready } = useReports(focused);

  const view = useMemo(
    () => buildMetric(input, now, params.range, params.metric),
    [input, now, params.range, params.metric],
  );

  const done = view.delivered;
  const missed = view.missed;
  const booked = Math.max(view.booked, done + missed);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view.title}
          subtitle={view.subtitle}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <Reveal ready={ready} skeleton={<MetricSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {booked === 0 ? (
            <Empty
              icon={IconChart}
              title="Nothing booked in this window"
              body="Come back once there are sessions in the diary — this screen is the breakdown of them."
              style={styles.empty}
            />
          ) : (
            <>
              {/* Built here rather than with `Figures`, which is the money
                  screen's component and speaks in collected and owed. The shape
                  is the same; the words are not, and a "collected" prop holding a
                  session count would be a lie in the code. */}
              <View style={styles.figures}>
                <View style={styles.figRow}>
                  <View style={styles.fig}>
                    <Text style={styles.figLabel}>Delivered</Text>
                    <Text style={[styles.figValue, styles.figOk]}>{done}</Text>
                  </View>
                  <View style={[styles.fig, styles.figRight]}>
                    <Text style={styles.figLabel}>Booked</Text>
                    <Text style={styles.figValue}>{booked}</Text>
                  </View>
                </View>
              </View>

              {/* Two segments only. A third for "still scheduled" would be a bar
                  about the future inside a report about what happened. */}
              <Bar
                style={styles.bar}
                segments={[
                  { key: 'done', fraction: booked ? done / booked : 0, color: colors.ok },
                  { key: 'missed', fraction: booked ? missed / booked : 0, color: colors.danger },
                ]}
              />
              <Legend
                style={styles.legend}
                entries={[
                  { key: 'done', label: `${done} done`, color: colors.ok },
                  {
                    key: 'missed',
                    label: `${missed} no-show${missed === 1 ? '' : 's'}`,
                    color: colors.danger,
                  },
                ]}
              />

              <GroupHead label="By day of the week" />
              <WeekBars
                style={styles.week}
                days={view.weekdays.map((d) => ({ label: d.label, value: d.count, on: d.open }))}
              />

              <GroupHead label="Who delivered most" count={view.leaders.length} />
              {view.leaders.length ? (
                <List>
                  {view.leaders.map((leader) => (
                    <Row
                      key={leader.clientId}
                      grouped
                      leading={<Avatar name={leader.name} size="sm" />}
                      title={leader.name}
                      subtitle={leader.meta || undefined}
                      onPress={() =>
                        navigation.navigate('ClientDetail', { clientId: leader.clientId })
                      }
                      trailing={<Tag label={String(leader.count)} tone="neutral" />}
                    />
                  ))}
                </List>
              ) : (
                <Callout style={styles.note}>Nobody has a delivered session in this window.</Callout>
              )}

              {view.note ? (
                <Callout icon={IconCalendar} style={styles.note}>
                  {view.note}
                </Callout>
              ) : null}
            </>
          )}
        </ScrollView>
      </Reveal>
    </SafeAreaView>
  );
}

function MetricSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Working out the breakdown">
      <Skeleton height={148} round={radius.r2} style={styles.figures} />
      <Skeleton width={124} height={10} style={styles.headGap} />
      <Skeleton height={72} round={radius.r2} />
      <Skeleton width={140} height={10} style={styles.headGap} />
      <Skeleton height={192} round={radius.r2} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  figures: {
    marginTop: space.s3,
    padding: space.cardPad,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  figRow: { flexDirection: 'row', alignItems: 'flex-start' },
  fig: { flex: 1, minWidth: 0 },
  figRight: { alignItems: 'flex-end' },
  figLabel: { ...type.micro, color: colors.ink3 },
  figValue: { ...type.numXl, color: colors.ink, marginTop: 6 },
  figOk: { color: colors.ok },
  bar: { marginTop: space.s4 },
  legend: { marginTop: space.s3 },
  week: { marginTop: space.s2, marginBottom: space.s2 },
  headGap: { marginTop: space.s5, marginBottom: space.s3 },
  note: { marginTop: space.s4 },
  empty: { marginTop: space.s7 },
});
