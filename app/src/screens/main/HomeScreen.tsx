import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { useAuth } from '../../store/AuthContext';
import { observeRoster, type RosterEntry } from '../../db/clientStatus';
import { useSyncState } from '../../db/useSync';
import { StatusChipRow } from '../../components/StatusChip';
import SyncBar from '../../components/SyncBar';
import { colors } from '../../theme';

/** How many clients the dashboard previews before deferring to the roster screen. */
const PREVIEW_COUNT = 5;

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Home'>;
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function ClientRow({ entry, onPress }: { entry: RosterEntry; onPress: () => void }) {
  const { client, status } = entry;
  const initial = client.name?.trim().charAt(0).toUpperCase() || '?';

  return (
    <TouchableOpacity style={styles.clientRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.clientBody}>
        <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
        <Text style={styles.clientMeta} numberOfLines={1}>
          {client.goal || 'No goal set'}
          {client.paymentMode === 'gym_collects' ? ' · gym collects' : ''}
        </Text>
        <StatusChipRow chips={status.chips} max={2} />
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }: Props) {
  const { trainerId, signOut } = useAuth();
  const { hasPending } = useSyncState();
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const shortId = trainerId ? trainerId.slice(0, 8) : '—';

  useEffect(() => {
    const sub = observeRoster().subscribe(setEntries);
    return () => sub.unsubscribe();
  }, []);

  const activeCount = entries.filter((e) => e.status.flags.active).length;
  const dueCount = entries.filter((e) => e.status.flags.paymentDue).length;

  // Signing out wipes local data. If anything is still queued, say so first.
  const handleSignOut = () => {
    if (!hasPending) {
      signOut();
      return;
    }
    Alert.alert(
      'Unsynced changes',
      "Some records haven't reached the server yet. Signing out now will lose them.",
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Sign out anyway', style: 'destructive', onPress: () => signOut() },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>TrainX</Text>
          <Text style={styles.subHead}>Good morning, Coach</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <SyncBar />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard label="Active" value={activeCount} />
          <StatCard label="Today" value="0" />
          <StatCard label="Payment due" value={dueCount} />
        </View>

        {/* Today's sessions */}
        <SectionHeader title="Today's Sessions" />
        <EmptyState message="No sessions scheduled for today." />

        {/* Clients */}
        <SectionHeader
          title="Clients"
          action={
            entries.length > 0 ? (
              <TouchableOpacity onPress={() => navigation.navigate('Clients')}>
                <Text style={styles.seeAll}>See all {entries.length}</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />
        {entries.length === 0 ? (
          <EmptyState message="No clients yet. Add your first client." />
        ) : (
          <View style={styles.clientList}>
            {entries.slice(0, PREVIEW_COUNT).map((e) => (
              <ClientRow
                key={e.client.id}
                entry={e}
                onPress={() => navigation.navigate('ClientDetail', { clientId: e.client.id })}
              />
            ))}
          </View>
        )}

        {/* Trainer ID (dev helper) */}
        <Text style={styles.devNote}>Trainer ID: {shortId}…</Text>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('AddClient')}>
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: colors.indigo,
  },
  appName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  subHead: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  signOutBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
  },
  signOutText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  body: { padding: 20, paddingBottom: 100 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statValue: { fontSize: 26, fontWeight: '700', color: colors.ink },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 4, fontWeight: '500' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  seeAll: { fontSize: 13, fontWeight: '700', color: colors.indigo },

  emptyBox: {
    backgroundColor: colors.card, borderRadius: 12,
    paddingVertical: 32, alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  emptyText: { fontSize: 14, color: colors.faint },

  clientList: { marginBottom: 24, gap: 10 },
  clientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  clientBody: { flex: 1, gap: 4 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.indigoSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.indigo },
  clientName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  clientMeta: { fontSize: 12, color: colors.muted },
  chevron: { fontSize: 24, color: '#CCC' },

  devNote: {
    textAlign: 'center', fontSize: 11,
    color: '#CCC', marginTop: 8,
  },

  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.indigo, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.indigo, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  fabIcon: { fontSize: 28, color: '#fff', lineHeight: 32 },
});
