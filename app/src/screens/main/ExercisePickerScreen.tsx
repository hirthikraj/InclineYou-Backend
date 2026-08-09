import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observeExerciseSearch } from '../../db/programs';
import { deliverPick } from '../../db/exercisePick';
import type Exercise from '../../db/models/Exercise';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'ExercisePicker'>;

export default function ExercisePickerScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    const sub = observeExerciseSearch(query).subscribe(setExercises);
    return () => sub.unsubscribe();
  }, [query]);

  const handlePick = (exercise: Exercise) => {
    deliverPick({ id: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup || null });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pick exercise</Text>
        <View style={styles.cancelBtn} />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search exercises..."
          placeholderTextColor="#BBB"
          value={query}
          onChangeText={setQuery}
          autoFocus
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={exercises}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => handlePick(item)} activeOpacity={0.7}>
            <View style={styles.rowBody}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              {item.muscleGroup ? (
                <Text style={styles.rowMeta}>{item.muscleGroup}</Text>
              ) : null}
            </View>
            {item.isCustom ? <Text style={styles.customBadge}>Custom</Text> : null}
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {query ? 'No exercises match your search.' : 'Loading exercises...'}
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
  title: { fontSize: 17, fontWeight: '700', color: '#fff' },
  cancelBtn: { width: 70, alignItems: 'flex-start' },
  cancelText: { fontSize: 15, color: '#fff', fontWeight: '500' },

  searchRow: { padding: 12, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  searchInput: {
    backgroundColor: colors.bg, borderRadius: 10, height: 42, paddingHorizontal: 12,
    fontSize: 15, color: colors.ink,
  },

  list: { paddingBottom: 40 },

  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.card,
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  customBadge: {
    fontSize: 11, fontWeight: '700', color: colors.indigo,
    backgroundColor: colors.indigoTint, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20,
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: 16 },

  empty: { paddingTop: 48, alignItems: 'center' },
  emptyText: { fontSize: 14, color: colors.faint },
});
