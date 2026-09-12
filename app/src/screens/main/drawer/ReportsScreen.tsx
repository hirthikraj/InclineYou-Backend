/**
 * 4a · Reports.
 *
 * Two metrics with sparklines, then the four numbers that decide whether this is
 * a business: **kept clients, revenue per client, hours, no-shows.**
 *
 * Trainerize computes these too — and shows them on a web dashboard only. Yours
 * are on the phone, because that is the only screen you have on a gym floor. That
 * is the whole argument, and it is why every figure on this screen is derived from
 * SQLite rather than fetched.
 *
 * Rows that cannot be computed honestly are **absent, not zero**. A retention
 * figure over a roster nobody has had for three months is not 0% and is not 100%;
 * it does not exist yet, and `buildReports` returns no row for it. The same goes
 * for revenue per client with no payments and hours with no sessions. Every zero
 * on this screen is a real zero.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useReports } from '../../../reports/useReports';
import { buildReports, RANGES, type Range } from '../../../reports/reports';
import {
  AppBar,
  Callout,
  CalloutStrong,
  Empty,
  GroupHead,
  IconBack,
  IconBan,
  IconButton,
  IconChart,
  IconChevron,
  IconClock,
  IconDownload,
  IconMessage,
  IconPercent,
  IconWallet,
  List,
  Metric,
  Reveal,
  Row,
  Segmented,
  Skeleton,
  Tag,
  Toast,
  colors,
  radius,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const ROW_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  kept: IconPercent,
  'per-client': IconWallet,
  hours: IconClock,
  'no-shows': IconBan,
};

export default function ReportsScreen() {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const { input, now, ready } = useReports(focused);

  const [range, setRange] = useState<Range>('30d');
  const [notice, setNotice] = useState<string | null>(null);

  const view = useMemo(() => buildReports(input, now, range), [input, now, range]);

  /**
   * Export.
   *
   * The OS share sheet with CSV text in it, not a written file. Same choice the
   * money export made and for the same reason: writing a `.csv` needs a file-system
   * dependency this app does not carry, and the share sheet already contains
   * "copy" and every mail client on the phone.
   */
  const share = async () => {
    const lines = [
      `InclineYou reports,${view.subtitle}`,
      '',
      'Metric,Value,Change',
      ...view.metrics.map((m) => `${m.label},${m.value},${m.delta?.text ?? ''}`),
      '',
      'Figure,Value,Detail',
      ...view.rows.map((r) => `${r.label},${r.value},"${r.meta}"`),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      setNotice('Could not open the share sheet.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Reports"
          subtitle={ready ? view.subtitle : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <IconButton icon={IconDownload} label="Export" bare onPress={() => void share()} />
          }
        />
      </View>

      <Reveal ready={ready} skeleton={<ReportsSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Segmented options={RANGES} value={range} onChange={setRange} style={styles.range} />

          {view.empty ? (
            <Empty
              icon={IconChart}
              title="Nothing to report yet"
              body="These figures come from sessions you've marked done and payments you've recorded. Both start filling in as soon as you do."
              style={styles.empty}
            />
          ) : (
            <>
              <View style={styles.stack}>
                {view.metrics.map((metric) => (
                  <Metric
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    delta={metric.delta ?? undefined}
                    spark={metric.spark}
                    onPress={() =>
                      navigation.navigate('Metric', { metric: metric.key, range })
                    }
                  />
                ))}
              </View>

              {view.rows.length ? (
                <>
                  <GroupHead label="Where it comes from" />
                  <List>
                    {view.rows.map((row) => {
                      const Icon = ROW_ICONS[row.key];
                      return (
                        <Row
                          key={row.key}
                          grouped
                          leading={Icon ? <Icon size={19} color={row.alert ? colors.danger : colors.ink3} /> : undefined}
                          title={row.label}
                          subtitle={row.meta}
                          severity={row.alert ? 'alert' : undefined}
                          trailing={<Tag label={row.value} tone={row.alert ? 'danger' : 'neutral'} />}
                          onPress={
                            row.key === 'no-shows'
                              ? () => navigation.navigate('Metric', { metric: 'delivered', range })
                              : undefined
                          }
                        />
                      );
                    })}
                  </List>
                </>
              ) : null}

              <Callout icon={IconChart} style={styles.note}>
                Trainerize computes these too, and shows them{' '}
                <CalloutStrong>on a web dashboard only</CalloutStrong>. Yours are on the phone,
                because that is the only screen you have on a gym floor.
              </Callout>
            </>
          )}

          {/* Outside the empty branch on purpose: the range switcher above can
              empty this screen while last month's reports still exist, and the
              way in to them must not disappear with the figures. */}
          <GroupHead label="What your clients got" />
          <List>
            <Row
              grouped
              leading={<IconMessage size={19} color={colors.ink3} />}
              title="Weekly reports"
              subtitle="Written every Sunday night · one per client"
              trailing={<IconChevron size={16} color={colors.ink3} />}
              onPress={() => navigation.navigate('Weekly')}
            />
          </List>
        </ScrollView>
      </Reveal>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function ReportsSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Working out your figures">
      <Skeleton height={48} round={radius.r2} style={styles.range} />
      <View style={styles.stack}>
        <Skeleton height={132} round={radius.r2} />
        <Skeleton height={132} round={radius.r2} />
      </View>
      <Skeleton width={132} height={10} style={styles.headGap} />
      <Skeleton height={224} round={radius.r2} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  range: { marginTop: space.s3 },
  stack: { marginTop: space.s4, gap: space.cardGap },
  headGap: { marginTop: space.s5, marginBottom: space.s3 },
  note: { marginTop: space.s4 },
  empty: { marginTop: space.s7 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
