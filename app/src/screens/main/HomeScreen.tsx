import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, SafeAreaView,
} from 'react-native';
import { useAuth } from '../../store/AuthContext';

const INDIGO = '#4F46E5';
const BG = '#F4F6FA';
const CARD = '#FFFFFF';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { trainerId, signOut } = useAuth();
  const shortId = trainerId ? trainerId.slice(0, 8) : '—';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>TrainX</Text>
          <Text style={styles.subHead}>Good morning, Coach</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard label="Clients" value="0" />
          <StatCard label="Today" value="0" />
          <StatCard label="Pending ₹" value="0" />
        </View>

        {/* Today's sessions */}
        <SectionHeader title="Today's Sessions" />
        <EmptyState message="No sessions scheduled for today." />

        {/* Clients */}
        <SectionHeader title="Clients" />
        <EmptyState message="No clients yet. Add your first client." />

        {/* Trainer ID (dev helper) */}
        <Text style={styles.devNote}>Trainer ID: {shortId}…</Text>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab}>
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: INDIGO,
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
    flex: 1, backgroundColor: CARD, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statValue: { fontSize: 26, fontWeight: '700', color: '#1A1A2E' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4, fontWeight: '500' },

  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#1A1A2E',
    marginBottom: 10,
  },

  emptyBox: {
    backgroundColor: CARD, borderRadius: 12,
    paddingVertical: 32, alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  emptyText: { fontSize: 14, color: '#AAA' },

  devNote: {
    textAlign: 'center', fontSize: 11,
    color: '#CCC', marginTop: 8,
  },

  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: INDIGO, alignItems: 'center', justifyContent: 'center',
    shadowColor: INDIGO, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  fabIcon: { fontSize: 28, color: '#fff', lineHeight: 32 },
});
