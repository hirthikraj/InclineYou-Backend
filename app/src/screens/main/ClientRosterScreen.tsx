import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observeRoster, type RosterEntry } from '../../db/clientStatus';
import { syncDatabase } from '../../db/sync';
import { useSyncState } from '../../db/useSync';
import { StatusChipRow } from '../../components/StatusChip';
import SyncBar from '../../components/SyncBar';
import { colors } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Clients'>;
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paymentDue', label: 'Payment due' },
  { key: 'packLow', label: 'Pack low' },
  { key: 'planExpiring', label: 'Expiring' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function ClientCard({ entry, onPress }: { entry: RosterEntry; onPress: () => void }) {
  const { client, status } = entry;
  const initial = client.name?.trim().charAt(0).toUpperCase() || '?';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.name} numberOfLines={1}>{client.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {client.goal || 'No goal set'}
          {client.paymentMode === 'gym_collects' ? ' · gym collects' : ''}
        </Text>
        <StatusChipRow chips={status.chips} max={3} />
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ClientRosterScreen({ navigation }: Props) {
  const { phase } = useSyncState();
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    const sub = observeRoster().subscribe((next) => {
      setEntries(next);
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, []);

  const counts = useMemo(() => {
    const c = { all: entries.length, active: 0, paymentDue: 0, packLow: 0, planExpiring: 0 };
    for (const e of entries) {
      if (e.status.flags.active) c.active += 1;
      if (e.status.flags.paymentDue) c.paymentDue += 1;
      if (e.status.flags.packLow) c.packLow += 1;
      if (e.status.flags.planExpiring) c.planExpiring += 1;
    }
    return c;
  }, [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== 'all' && !e.status.flags[filter]) return false;
      if (!needle) return true;
      const haystack = [e.client.name, e.client.phone, e.client.goal]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, query, filter]);

  const emptyMessage =
    entries.length === 0
      ? 'No clients yet. Add your first client.'
      : 'No clients match this search or filter.';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clients</Text>
        <View style={styles.backBtn} />
      </View>

      <SyncBar />

      <View style={styles.controls}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, phone or goal"
          placeholderTextColor="#BBB"
          autoCorrect={false}
        />
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(f) => f.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => {
            const selected = filter === item.key;
            const count = counts[item.key];
            return (
              <TouchableOpacity
                style={[styles.filter, selected && styles.filterSelected]}
                onPress={() => setFilter(item.key)}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                  {item.label}
                  {count > 0 ? ` ${count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.indigo} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(e) => e.client.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ClientCard
              entry={item}
              onPress={() => navigation.navigate('ClientDetail', { clientId: item.client.id })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={phase === 'syncing'}
              onRefresh={() => syncDatabase('pull-to-refresh')}
              colors={[colors.indigo]}
              tintColor={colors.indigo}
            />
          }
        />
      )}

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
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 40, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },

  controls: { paddingTop: 14, paddingBottom: 4 },
  search: {
    marginHorizontal: 20, height: 44, borderRadius: 10,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 12, fontSize: 15, color: colors.ink,
  },
  filterRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  filter: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
  },
  filterSelected: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  filterText: { fontSize: 13, color: colors.body, fontWeight: '600' },
  filterTextSelected: { color: '#fff' },

  loader: { marginTop: 40 },
  list: { paddingHorizontal: 20, paddingBottom: 100, gap: 10 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardBody: { flex: 1, gap: 4 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.indigoSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.indigo },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted },
  chevron: { fontSize: 24, color: '#CCC' },

  emptyBox: {
    backgroundColor: colors.card, borderRadius: 12,
    paddingVertical: 32, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  emptyText: { fontSize: 14, color: colors.faint },

  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.indigo, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.indigo, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  fabIcon: { fontSize: 28, color: '#fff', lineHeight: 32 },
});
