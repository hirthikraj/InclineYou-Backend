import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { scheduledSessionsCollection, findClientsByIds, endSession } from '../../db/sessions';
import { updateSession } from '../../api/sessions';
import { syncDatabase } from '../../db/sync';
import type ScheduledSession from '../../db/models/ScheduledSession';
import type Client from '../../db/models/Client';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'SessionDetail'>;

const STATUS_COLOR: Record<string, string> = {
  scheduled: colors.indigo,
  done:       '#2E7D32',
  no_show:    '#B26A00',
  cancelled:  '#9E9E9E',
};

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function SessionDetailScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<ScheduledSession | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');

  useEffect(() => {
    scheduledSessionsCollection.find(sessionId)
      .then((s) => { setSession(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (!session?.clientId) return;
    findClientsByIds([session.clientId]).then((map) => {
      setClient(map[session.clientId] ?? null);
    });
  }, [session?.clientId]);

  // Re-observe the session for live status updates
  useEffect(() => {
    try {
      const sub = scheduledSessionsCollection
        .findAndObserve(sessionId)
        .subscribe(setSession);
      return () => sub.unsubscribe();
    } catch { /* record deleted */ }
  }, [sessionId]);

  const handleMarkDone = () => {
    Alert.alert('Mark session done?', 'This will create a workout log and decrement the client\'s session pack.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark done', onPress: async () => {
          setActing(true);
          try {
            // Local-first, same path the home screen's End uses — one
            // implementation of "session delivered", and it works offline.
            const workoutSessionId = await endSession(sessionId);
            navigation.replace('WorkoutLog', {
              workoutId: workoutSessionId,
              programId:   session?.programId   ?? undefined,
              templateDay: session?.templateDay  ?? undefined,
            });
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not mark session done.');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  const openReschedule = () => {
    if (!session) return;
    const ms = session.scheduledAt instanceof Date ? session.scheduledAt.getTime() : Number(session.scheduledAt);
    const d = new Date(ms);
    setRescheduleDate(d.toLocaleDateString('en-CA')); // YYYY-MM-DD
    setRescheduleTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setShowReschedule(true);
  };

  const handleReschedule = async () => {
    if (!rescheduleDate.match(/^\d{4}-\d{2}-\d{2}$/) || !rescheduleTime.match(/^\d{2}:\d{2}$/)) {
      Alert.alert('Invalid input', 'Enter date as YYYY-MM-DD and time as HH:MM (24h).');
      return;
    }
    const newMs = new Date(`${rescheduleDate}T${rescheduleTime}:00`).getTime();
    if (isNaN(newMs)) {
      Alert.alert('Invalid date/time', 'Could not parse the date and time you entered.');
      return;
    }
    setActing(true);
    try {
      await updateSession(sessionId, { scheduledAt: newMs });
      await syncDatabase('reschedule-session');
      setShowReschedule(false);
      Alert.alert('Rescheduled', 'Session moved to the new time.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not reschedule session.');
    } finally {
      setActing(false);
    }
  };

  const handleMarkStatus = (status: 'no_show' | 'cancelled') => {
    const label = status === 'no_show' ? 'No-show' : 'Cancel';
    Alert.alert(`${label} session?`, `Mark this session as "${status.replace('_', '-')}"?`, [
      { text: 'Back', style: 'cancel' },
      {
        text: label, style: 'destructive', onPress: async () => {
          setActing(true);
          try {
            await updateSession(sessionId, { status });
            await syncDatabase('update-session-status');
            navigation.goBack();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not update session.');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.indigo} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Session</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Session not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const ms = session.scheduledAt instanceof Date
    ? session.scheduledAt.getTime()
    : Number(session.scheduledAt);
  const isScheduled = session.status === 'scheduled';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Session</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Status pill */}
        <View style={styles.statusRow}>
          <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[session.status] + '22' }]}>
            <Text style={[styles.statusText, { color: STATUS_COLOR[session.status] ?? colors.muted }]}>
              {session.status.replace('_', '-').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Details card */}
        <View style={styles.card}>
          <Row label="Client"   value={client?.name ?? '…'} />
          <Row label="When"     value={formatDateTime(ms)} />
          <Row label="Duration" value={session.durationMinutes ? `${session.durationMinutes} min` : '—'} />
          {session.notes ? <Row label="Notes" value={session.notes} /> : null}
        </View>

        {/* Action buttons */}
        {isScheduled && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, acting && { opacity: 0.6 }]}
              onPress={handleMarkDone}
              disabled={acting}
            >
              {acting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnPrimaryText}>Mark done + Log workout</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnReschedule, acting && { opacity: 0.6 }]}
              onPress={openReschedule}
              disabled={acting}
            >
              <Text style={styles.btnRescheduleText}>Reschedule</Text>
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, { flex: 1 }, acting && { opacity: 0.6 }]}
                onPress={() => handleMarkStatus('no_show')}
                disabled={acting}
              >
                <Text style={styles.btnSecondaryText}>No-show</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, { flex: 1 }, acting && { opacity: 0.6 }]}
                onPress={() => handleMarkStatus('cancelled')}
                disabled={acting}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {session.status === 'done' && (
          <Text style={styles.hint}>
            Session logged. Open the client's workout history to review sets.
          </Text>
        )}
      </ScrollView>

      {/* Reschedule modal */}
      <Modal visible={showReschedule} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Reschedule session</Text>
            <Text style={styles.modalLabel}>New date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={rescheduleDate}
              onChangeText={setRescheduleDate}
              placeholder="2026-08-15"
              keyboardType="numeric"
              autoCapitalize="none"
            />
            <Text style={styles.modalLabel}>New time (HH:MM, 24h)</Text>
            <TextInput
              style={styles.modalInput}
              value={rescheduleTime}
              onChangeText={setRescheduleTime}
              placeholder="09:00"
              keyboardType="numeric"
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, { flex: 1 }]}
                onPress={() => setShowReschedule(false)}
                disabled={acting}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                onPress={handleReschedule}
                disabled={acting}
              >
                {acting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.btnPrimaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  statusRow: { alignItems: 'center', marginBottom: 20 },
  statusPill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  card: {
    backgroundColor: colors.card, borderRadius: 14,
    paddingHorizontal: 16, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline, gap: 12,
  },
  rowLabel: { fontSize: 13, color: colors.muted, flexShrink: 0 },
  rowValue: { fontSize: 14, color: colors.ink, fontWeight: '600', textAlign: 'right', flex: 1 },

  actions: { gap: 12 },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.indigo },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSecondary: {
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.card,
  },
  btnSecondaryText: { color: colors.body, fontSize: 14, fontWeight: '600' },
  secondaryRow: { flexDirection: 'row', gap: 12 },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15, color: colors.muted },

  hint: { textAlign: 'center', fontSize: 13, color: colors.muted, marginTop: 12 },

  btnReschedule: {
    borderWidth: 1.5, borderColor: colors.indigo, backgroundColor: colors.card,
  },
  btnRescheduleText: { color: colors.indigo, fontSize: 14, fontWeight: '600' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalSheet: {
    backgroundColor: colors.card, borderRadius: 16, padding: 24, width: '100%',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 16 },
  modalLabel: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  modalInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 10,
    height: 44, paddingHorizontal: 12, fontSize: 15, color: colors.ink,
    backgroundColor: colors.bg, marginBottom: 14,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
