import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observeClient, observeBodyMetrics } from '../../db/clients';
import { observeClientStatus, type ClientStatus } from '../../db/clientStatus';
import type ClientModel from '../../db/models/Client';
import type BodyMetricModel from '../../db/models/BodyMetric';
import { StatusChipRow } from '../../components/StatusChip';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'ClientDetail'>;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </>
  );
}

function formatDate(d: Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString() : '—';
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  trainer_collects: 'I collect',
  gym_collects: 'Gym front office collects',
};

export default function ClientDetailScreen({ route, navigation }: Props) {
  const { clientId } = route.params;

  const [client, setClient] = useState<ClientModel | null>(null);
  const [status, setStatus] = useState<ClientStatus | null>(null);
  const [metrics, setMetrics] = useState<BodyMetricModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subs = [
      observeClient(clientId).subscribe((c) => {
        setClient(c);
        setLoading(false);
      }),
      observeClientStatus(clientId).subscribe(setStatus),
      observeBodyMetrics(clientId).subscribe(setMetrics),
    ];
    return () => subs.forEach((s) => s.unsubscribe());
  }, [clientId]);

  const weights = useMemo(
    () => metrics.filter((m) => m.metricType === 'weight'),
    [metrics],
  );

  // Sorted newest-first by the query, so the last entry is the baseline.
  const latestWeight = weights[0];
  const baselineWeight = weights.length > 1 ? weights[weights.length - 1] : undefined;
  const weightDelta =
    latestWeight && baselineWeight ? latestWeight.value - baselineWeight.value : null;

  const handleCall = () => {
    if (!client?.phone) return;
    Linking.openURL(`tel:${client.phone}`).catch(() =>
      Alert.alert('Could not open dialler', 'No phone app is available on this device.'),
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={styles.loader} color={colors.indigo} />
      </SafeAreaView>
    );
  }

  if (!client) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Client</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>This client is no longer on your roster.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initial = client.name?.trim().charAt(0).toUpperCase() || '?';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{client.name}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('EditClient', { clientId })}
          style={styles.editBtn}
        >
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.identityBody}>
            <Text style={styles.name}>{client.name}</Text>
            <Text style={styles.goal}>{client.goal || 'No goal set'}</Text>
            {status ? <StatusChipRow chips={status.chips} /> : null}
          </View>
        </View>

        {client.phone ? (
          <TouchableOpacity style={styles.callBtn} onPress={handleCall}>
            <Text style={styles.callText}>Call {client.phone}</Text>
          </TouchableOpacity>
        ) : null}

        <Card title="Details">
          <Row label="Phone" value={client.phone || '—'} />
          <Row label="Status" value={client.status || 'active'} />
          <Row
            label="Payment"
            value={PAYMENT_MODE_LABELS[client.paymentMode] || client.paymentMode || '—'}
          />
          {client.paymentMode === 'gym_collects' ? (
            <Row
              label="My share"
              value={client.trainerSplitPercent != null ? `${client.trainerSplitPercent}%` : 'Not set'}
            />
          ) : null}
          <Row label="Client since" value={formatDate(client.createdAt)} />
        </Card>

        <Card title="Baseline intake">
          <Row label="Height" value={client.heightCm != null ? `${client.heightCm} cm` : '—'} />
          <Row label="Activity level" value={client.activityLevel || '—'} />
          <Row
            label="Starting weight"
            value={baselineWeight ? `${baselineWeight.value} ${baselineWeight.unit || 'kg'}` : '—'}
          />
        </Card>

        <Text style={styles.sectionTitle}>Body metrics</Text>
        {weights.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No weight entries logged yet.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.latestRow}>
              <View>
                <Text style={styles.latestValue}>
                  {latestWeight.value} {latestWeight.unit || 'kg'}
                </Text>
                <Text style={styles.latestLabel}>
                  Latest · {formatDate(latestWeight.recordedAt)}
                </Text>
              </View>
              {weightDelta != null ? (
                <Text style={[styles.delta, weightDelta <= 0 ? styles.deltaDown : styles.deltaUp]}>
                  {weightDelta > 0 ? '+' : ''}
                  {weightDelta.toFixed(1)} kg
                </Text>
              ) : null}
            </View>

            {weights.slice(0, 8).map((m) => (
              <View key={m.id} style={styles.row}>
                <Text style={styles.rowLabel}>{formatDate(m.recordedAt)}</Text>
                <Text style={styles.rowValue}>
                  {m.value} {m.unit || 'kg'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footNote}>
          Everything here is read from this phone — edits save offline and sync later.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 56, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },
  editBtn: { width: 56, alignItems: 'center' },
  editText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  body: { padding: 20, paddingBottom: 60 },

  identity: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 18 },
  identityBody: { flex: 1, gap: 6 },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.indigoSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: colors.indigo },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink },
  goal: { fontSize: 13, color: colors.muted },

  callBtn: {
    backgroundColor: colors.card, borderRadius: 10, height: 46,
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
    borderWidth: 1.5, borderColor: colors.border,
  },
  callText: { fontSize: 15, fontWeight: '600', color: colors.indigo },

  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: colors.ink,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.card, borderRadius: 12,
    paddingHorizontal: 14, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowLabel: { fontSize: 13, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  latestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  latestValue: { fontSize: 24, fontWeight: '700', color: colors.ink },
  latestLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  delta: { fontSize: 15, fontWeight: '700' },
  deltaDown: { color: '#2E7D32' },
  deltaUp: { color: '#B26A00' },

  emptyBox: {
    backgroundColor: colors.card, borderRadius: 12,
    paddingVertical: 32, alignItems: 'center', marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  emptyText: { fontSize: 14, color: colors.faint },

  footNote: { textAlign: 'center', fontSize: 12, color: colors.faint },
});
