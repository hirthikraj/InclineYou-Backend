import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observePrograms } from '../../db/programs';
import type Program from '../../db/models/Program';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'ProgramList'>;

const STATUS_COLOR: Record<string, string> = {
  active: '#2E7D32',
  completed: '#4F46E5',
  paused: '#B26A00',
};

export default function ProgramListScreen({ route, navigation }: Props) {
  const { clientId } = route.params;
  const [programs, setPrograms] = useState<Program[]>([]);

  useEffect(() => {
    const sub = observePrograms(clientId).subscribe(setPrograms);
    return () => sub.unsubscribe();
  }, [clientId]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Programs</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={programs}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ProgramDetail', { programId: item.id })}
            activeOpacity={0.75}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              {item.goal ? <Text style={styles.cardGoal} numberOfLines={1}>{item.goal}</Text> : null}
              {item.startDate || item.endDate ? (
                <Text style={styles.cardDates}>
                  {item.startDate || '?'} → {item.endDate || 'ongoing'}
                </Text>
              ) : null}
            </View>
            <View style={styles.cardRight}>
              <Text style={[styles.statusBadge, { color: STATUS_COLOR[item.status] ?? colors.muted }]}>
                {item.status}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyHead}>No programs yet</Text>
            <Text style={styles.emptyBody}>
              Apply a template from the Templates screen to create a program for this client.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 56, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },

  list: { padding: 16, paddingBottom: 40 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardLeft: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardGoal: { fontSize: 13, color: colors.muted, marginTop: 3 },
  cardDates: { fontSize: 12, color: colors.faint, marginTop: 4 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  chevron: { fontSize: 22, color: colors.border },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyHead: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21 },
});
