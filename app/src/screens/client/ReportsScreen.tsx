/**
 * Every week that has landed.
 *
 * Not a designed frame — the report itself is 6a, and this is how somebody gets
 * back to one from three weeks ago. Deliberately a plain list: the reports are
 * stored exactly as they were sent, so there is nothing to filter, sort or
 * recompute, and a screen that offered any of those would be implying otherwise.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import { coachFirstName } from '../../client/client';
import {
  AppBar,
  Empty,
  IconBack,
  IconButton,
  IconChart,
  IconChevron,
  List,
  Row,
  RowValue,
  colors,
  space,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;

export default function ReportsScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);

  const reports = useMemo(
    () =>
      input.reports
        .filter((r) => r.clientId === clientId)
        .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)),
    [input.reports, clientId],
  );

  const first = coachFirstName(input.coach);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Weekly reports"
          subtitle={reports.length ? `${reports.length} sent` : `from ${first}`}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      {reports.length ? (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <List>
            {reports.map((report) => (
              <Row
                key={report.id}
                grouped
                title={weekLabel(report.weekStart, report.weekEnd)}
                subtitle={`${report.sessionsKept} of ${report.sessionsPlanned} kept · ${Math.round(report.volumeKg).toLocaleString('en-IN')} kg${report.newBests ? ` · ${report.newBests} new best${report.newBests === 1 ? '' : 's'}` : ''}`}
                onPress={() => navigation.navigate('Week', { weekStart: report.weekStart })}
                trailing={
                  <View style={styles.tail}>
                    <RowValue
                      value={
                        report.sessionsPlanned > 0
                          ? `${Math.round((report.sessionsKept / report.sessionsPlanned) * 100)}%`
                          : '—'
                      }
                      unit="kept"
                    />
                    <IconChevron size={18} color={colors.ink3} />
                  </View>
                }
              />
            ))}
          </List>
        </ScrollView>
      ) : (
        <Empty
          icon={IconChart}
          title="No reports yet"
          body={`${first}'s server writes one every Sunday night. The first one lands at the end of your first full week.`}
          style={styles.empty}
        />
      )}
    </SafeAreaView>
  );
}

/** "3–9 August", collapsing the month when both ends share it. */
function weekLabel(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const month = end.toLocaleDateString('en-GB', { month: 'long' });
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} ${month}`;
  return `${start.getDate()} ${start.toLocaleDateString('en-GB', { month: 'short' })} – ${end.getDate()} ${month}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  tail: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  empty: { marginTop: space.s7 },
});
