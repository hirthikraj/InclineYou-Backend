/**
 * 7a · Weekly reports, and 7c · what happened to each one.
 *
 * The trainer's side of the screen the client has had all along. Every Sunday
 * night the server writes one row per client and delivers it; this is the list
 * of what went, to whom, and whether it arrived.
 *
 * ── Grouped by delivery, not by client ────────────────────────────────────
 *
 * A trainer opening this screen on Monday is not browsing. They are answering
 * one of two questions — "did Ravi get his?" and "is anything stuck?" — and the
 * second one is the job. So the groups that want something come first: no
 * number above queued above sent, which is the same ordering rule the adherence
 * screen keeps when it puts slipping above on track.
 *
 * ── The week strip ────────────────────────────────────────────────────────
 *
 * Weeks that have reports, newest first, each carrying its own count. That
 * count is what makes the strip worth scrolling: a week showing 27 next to one
 * showing 4 says something happened, and it is the only place in the app that
 * would say it.
 *
 * Weeks with no reports at all are absent rather than drawn empty. The server
 * had nothing to report on, and an empty week chip implies a delivery that
 * failed rather than a week nobody trained.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useWeekly } from '../../../reports/useWeekly';
import { buildWeeklyList, DELIVERY, type WeeklyRow } from '../../../reports/weekly';
import {
  AppBar,
  Avatar,
  Callout,
  CalloutStrong,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconChart,
  IconChevron,
  IconMessage,
  List,
  Months,
  Reveal,
  Row,
  Skeleton,
  SkeletonRow,
  Tag,
  colors,
  radius,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function WeeklyScreen() {
  const navigation = useNavigation<Nav>();
  const { input, ready } = useWeekly();

  /** Null means "the latest", which is what the builder resolves it to. */
  const [week, setWeek] = useState<string | null>(null);

  const view = useMemo(() => buildWeeklyList(input, week), [input, week]);

  const group = (label: string, rows: WeeklyRow[], alert = false) =>
    rows.length ? (
      <View key={label}>
        <GroupHead label={label} count={rows.length} tone={alert ? 'alert' : 'default'} />
        <List>
          {rows.map((row) => (
            <Row
              key={row.reportId}
              grouped
              severity={alert ? 'alert' : undefined}
              leading={<Avatar name={row.name} size="sm" />}
              title={row.name}
              subtitle={row.line}
              onPress={() => navigation.navigate('WeekReport', { reportId: row.reportId })}
              trailing={
                <View style={styles.trailing}>
                  <Tag label={DELIVERY[row.state].label} tone={DELIVERY[row.state].tone} />
                  <IconChevron size={16} color={colors.ink3} />
                </View>
              }
            />
          ))}
        </List>
      </View>
    ) : null;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Weekly reports"
          subtitle={ready ? view.subtitle : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <Reveal ready={ready} skeleton={<WeeklySkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {view.empty ? (
            <Empty
              icon={IconChart}
              title="No reports yet"
              body="XRep writes one for every client on Sunday night, from the sessions you logged that week. The first one lands after your first full week."
              style={styles.empty}
            />
          ) : (
            <>
              <Months
                style={styles.weeks}
                months={view.weeks.map((w) => ({
                  key: w.weekStart,
                  label: w.label,
                  total: String(w.count),
                }))}
                selected={view.week?.weekStart ?? ''}
                onSelect={setWeek}
              />

              {group('Failed', view.failed, true)}
              {group('No number', view.unreachable, true)}
              {group('Queued', view.queued)}
              {group('Sent', view.sent)}

              <Callout icon={IconChart} style={styles.note}>
                Reports are written by the server on{' '}
                <CalloutStrong>Sunday night</CalloutStrong> and never change afterwards — the
                figures here are the same row your client is reading, not a second calculation.
                Open one to send it again.
              </Callout>

              {/* Said once, on the screen that would otherwise look broken.
                  Queued is the honest state of everything until a BSP is wired,
                  and a trainer who is not told that reads it as a fault. */}
              {view.queued.length ? (
                <Callout icon={IconMessage} style={styles.note}>
                  <CalloutStrong>Queued means written, not delivered.</CalloutStrong> XRep does not
                  send WhatsApp messages on your behalf yet — open a report and send it from your
                  own WhatsApp, which is where your client expects it from anyway.
                </Callout>
              ) : null}
            </>
          )}
        </ScrollView>
      </Reveal>
    </SafeAreaView>
  );
}

function WeeklySkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Reading this week's reports">
      <Skeleton height={52} round={radius.r2} style={styles.weeks} />
      <Skeleton width={92} height={10} style={styles.headGap} />
      <List>
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonRow key={i} grouped trailing />
        ))}
      </List>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  weeks: { marginTop: space.s3, marginBottom: space.s2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  note: { marginTop: space.s4 },
  empty: { marginTop: space.s7 },
  headGap: { marginTop: space.s5, marginBottom: space.s3 },
});
