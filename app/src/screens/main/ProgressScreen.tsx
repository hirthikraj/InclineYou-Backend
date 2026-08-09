import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, TouchableOpacity, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { computePRs, computeVolumeByWeek, type PrRecord, type VolumePoint } from '../../db/progress';
import { observeBodyMetrics } from '../../db/clients';
import { getClientReport } from '../../api/nudge';
import type BodyMetricModel from '../../db/models/BodyMetric';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'Progress'>;

const CHART_HEIGHT = 72;

function MiniBarChart({ data, color = colors.indigo }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return (
    <View style={chartStyles.row}>
      {data.map((v, i) => {
        const h = Math.max(4, ((v - min) / range) * (CHART_HEIGHT - 8) + 8);
        return (
          <View key={i} style={[chartStyles.barWrap, { height: CHART_HEIGHT }]}>
            <View style={[chartStyles.bar, { height: h, backgroundColor: color }]} />
          </View>
        );
      })}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    gap: 3,
    paddingVertical: 4,
  },
  barWrap: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
});

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </>
  );
}

function Row({ label, right, sub }: { label: string; right: string; sub?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.rowValue}>{right}</Text>
    </View>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatWeek(weekStart: string): string {
  return new Date(weekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function ProgressScreen({ route, navigation }: Props) {
  const { clientId, clientName } = route.params;

  const [prs, setPrs] = useState<PrRecord[]>([]);
  const [volume, setVolume] = useState<VolumePoint[]>([]);
  const [weights, setWeights] = useState<BodyMetricModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingReport, setSharingReport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prData, volData] = await Promise.all([
        computePRs(clientId),
        computeVolumeByWeek(clientId),
      ]);
      setPrs(prData);
      setVolume(volData);
    } catch {
      // silent — empty state shows
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sub = observeBodyMetrics(clientId).subscribe((rows) => {
      setWeights(rows.filter((m) => m.metricType === 'weight'));
    });
    return () => sub.unsubscribe();
  }, [clientId]);

  const handleShareReport = async () => {
    setSharingReport(true);
    try {
      const report = await getClientReport(clientId);
      await Share.share({ message: report });
    } catch {
      Alert.alert('Report unavailable', 'Could not fetch the report. Make sure you are connected.');
    } finally {
      setSharingReport(false);
    }
  };

  const weightValues = weights.slice(0, 12).map((w) => w.value).reverse();
  const volValues = volume.map((v) => v.volume);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {clientName ? `${clientName} · Progress` : 'Progress'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.indigo} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

          {/* Body weight chart */}
          <Card title="Body weight">
            {weightValues.length === 0 ? (
              <Text style={styles.empty}>No weight entries logged yet.</Text>
            ) : (
              <>
                <MiniBarChart data={weightValues} />
                <View style={styles.axisRow}>
                  <Text style={styles.axisLabel}>
                    {weights.length > 1
                      ? new Date(weights[weights.length - 1].recordedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : ''}
                  </Text>
                  <Text style={styles.axisLabel}>Latest: {weights[0]?.value} kg</Text>
                </View>
                {weights.slice(0, 5).map((w) => (
                  <Row
                    key={w.id}
                    label={new Date(w.recordedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    right={`${w.value} ${w.unit || 'kg'}`}
                  />
                ))}
              </>
            )}
          </Card>

          {/* Volume chart */}
          <Card title="Weekly volume (kg × reps)">
            {volValues.length === 0 ? (
              <Text style={styles.empty}>No workouts logged yet.</Text>
            ) : (
              <>
                <MiniBarChart data={volValues} color="#7C3AED" />
                <View style={styles.axisRow}>
                  {volume.length > 0 && (
                    <>
                      <Text style={styles.axisLabel}>{formatWeek(volume[0].weekStart)}</Text>
                      <Text style={styles.axisLabel}>{formatWeek(volume[volume.length - 1].weekStart)}</Text>
                    </>
                  )}
                </View>
                {volume.slice(-4).reverse().map((v) => (
                  <Row
                    key={v.weekStart}
                    label={`Wk ${formatWeek(v.weekStart)}`}
                    right={`${Math.round(v.volume).toLocaleString()} kg`}
                  />
                ))}
              </>
            )}
          </Card>

          {/* PR list */}
          <Card title={`Personal records (${prs.length})`}>
            {prs.length === 0 ? (
              <Text style={styles.empty}>No set data logged yet.</Text>
            ) : (
              prs.map((pr) => (
                <Row
                  key={pr.exerciseId}
                  label={pr.exerciseName}
                  right={`${pr.maxLoadKg} kg`}
                  sub={[
                    pr.maxReps ? `${pr.maxReps} reps` : null,
                    pr.sessionDate ? formatDate(pr.sessionDate) : null,
                  ].filter(Boolean).join(' · ')}
                />
              ))
            )}
          </Card>

          {/* Share weekly report */}
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShareReport}
            disabled={sharingReport}
          >
            {sharingReport
              ? <ActivityIndicator color={colors.indigo} />
              : <Text style={styles.shareBtnText}>Share weekly report</Text>}
          </TouchableOpacity>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 56, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },

  body: { padding: 20, paddingBottom: 60 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  card: {
    backgroundColor: colors.card, borderRadius: 12,
    paddingHorizontal: 14, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowLabel: { fontSize: 13, color: colors.ink, fontWeight: '500' },
  rowSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  rowValue: { fontSize: 14, color: colors.indigo, fontWeight: '700' },

  axisRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingBottom: 6,
  },
  axisLabel: { fontSize: 11, color: colors.faint },

  empty: { fontSize: 13, color: colors.faint, paddingVertical: 20, textAlign: 'center' },

  shareBtn: {
    height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.indigo,
  },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: colors.indigo },
});
