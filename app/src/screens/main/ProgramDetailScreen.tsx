import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import {
  observeProgramExercises, programsCollection, findExercisesByIds,
} from '../../db/programs';
import {
  addProgramExercise, removeProgramExercise, updateProgramExercise,
} from '../../api/programs';
import { setPendingPick } from '../../db/exercisePick';
import { syncDatabase } from '../../db/sync';
import type ProgramExercise from '../../db/models/ProgramExercise';
import type Program from '../../db/models/Program';
import type Exercise from '../../db/models/Exercise';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'ProgramDetail'>;

interface EditState {
  pe: ProgramExercise;
  sets: string;
  reps: string;
  restSeconds: string;
}

export default function ProgramDetailScreen({ route, navigation }: Props) {
  const { programId } = route.params;

  const [program, setProgram] = useState<Program | null>(null);
  const [programExercises, setProgramExercises] = useState<ProgramExercise[]>([]);
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({});
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  // Load program metadata
  useEffect(() => {
    programsCollection.find(programId)
      .then(setProgram)
      .catch(() => {});
  }, [programId]);

  // Observe program exercises reactively
  useEffect(() => {
    const sub = observeProgramExercises(programId).subscribe(setProgramExercises);
    return () => sub.unsubscribe();
  }, [programId]);

  // Load exercise names whenever the exercise IDs change
  useEffect(() => {
    const ids = [...new Set(programExercises.map((pe) => pe.exerciseId).filter(Boolean))];
    if (!ids.length) { setExerciseMap({}); return; }
    findExercisesByIds(ids).then(setExerciseMap);
  }, [programExercises]);

  const displayed = useMemo(
    () => selectedDay === null
      ? programExercises
      : programExercises.filter((pe) => pe.dayOfWeek === selectedDay),
    [programExercises, selectedDay],
  );

  // Group displayed exercises by day for rendering
  // Dynamic tabs: All + one per distinct training day
  const dayTabs = useMemo(() => {
    const days = [...new Set(
      programExercises.map((pe) => pe.dayOfWeek).filter((d): d is number => d != null),
    )].sort((a, b) => a - b);
    return [
      { label: 'All', value: null as number | null },
      ...days.map((d) => ({ label: `Day ${d}`, value: d as number | null })),
    ];
  }, [programExercises]);

  const grouped = useMemo(() => {
    const map: Record<string, ProgramExercise[]> = {};
    for (const pe of displayed) {
      const key = pe.dayOfWeek != null ? String(pe.dayOfWeek) : 'unscheduled';
      if (!map[key]) map[key] = [];
      map[key].push(pe);
    }
    return map;
  }, [displayed]);

  const groupedKeys = Object.keys(grouped).sort((a, b) => {
    if (a === 'unscheduled') return 1;
    if (b === 'unscheduled') return -1;
    return Number(a) - Number(b);
  });

  const openAddExercise = () => {
    setPendingPick(async (picked) => {
      setAdding(true);
      try {
        const dayForNew = selectedDay ?? undefined;
        await addProgramExercise(programId, {
          exerciseId: picked.id,
          sets: 3,
          reps: 10,
          dayOfWeek: dayForNew,
          orderIndex: programExercises.length,
        });
        await syncDatabase('add-exercise');
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Could not add exercise.');
      } finally {
        setAdding(false);
      }
    });
    navigation.navigate('ExercisePicker');
  };

  const handleRemove = (pe: ProgramExercise) => {
    const name = exerciseMap[pe.exerciseId]?.name ?? 'this exercise';
    Alert.alert('Remove exercise', `Remove "${name}" from the program?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await removeProgramExercise(programId, pe.id);
            await syncDatabase('remove-exercise');
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not remove exercise.');
          }
        },
      },
    ]);
  };

  const openEdit = (pe: ProgramExercise) => {
    setEditState({
      pe,
      sets: pe.sets != null ? String(pe.sets) : '',
      reps: pe.reps != null ? String(pe.reps) : '',
      restSeconds: pe.restSeconds != null ? String(pe.restSeconds) : '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editState) return;
    setSaving(true);
    try {
      await updateProgramExercise(programId, editState.pe.id, {
        sets: parseInt(editState.sets, 10) || undefined,
        reps: parseInt(editState.reps, 10) || undefined,
        restSeconds: parseInt(editState.restSeconds, 10) || undefined,
      });
      await syncDatabase('update-exercise');
      setEditState(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update exercise.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{program?.name ?? 'Program'}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAddExercise} disabled={adding}>
          {adding
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.addText}>+ Add</Text>}
        </TouchableOpacity>
      </View>

      {/* Day tabs */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabBar} contentContainerStyle={styles.tabContent}
      >
        {dayTabs.map((tab) => (
          <TouchableOpacity
            key={String(tab.value)}
            style={[styles.tab, selectedDay === tab.value && styles.tabActive]}
            onPress={() => setSelectedDay(tab.value)}
          >
            <Text style={[styles.tabText, selectedDay === tab.value && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {displayed.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {selectedDay != null ? `No exercises on Day ${selectedDay}.` : 'No exercises yet.'}
            </Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={openAddExercise}>
              <Text style={styles.emptyAddText}>+ Add exercise</Text>
            </TouchableOpacity>
          </View>
        ) : (
          groupedKeys.map((key) => (
            <View key={key} style={styles.daySection}>
              {selectedDay === null ? (
                <Text style={styles.dayTitle}>
                  {key === 'unscheduled' ? 'Unscheduled' : `Day ${key}`}
                </Text>
              ) : null}
              {grouped[key].map((pe) => {
                const exercise = exerciseMap[pe.exerciseId];
                return (
                  <TouchableOpacity
                    key={pe.id}
                    style={styles.exCard}
                    onPress={() => openEdit(pe)}
                    onLongPress={() => handleRemove(pe)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.exBody}>
                      <Text style={styles.exName}>{exercise?.name ?? 'Unknown exercise'}</Text>
                      {exercise?.muscleGroup
                        ? <Text style={styles.exMeta}>{exercise.muscleGroup}</Text>
                        : null}
                    </View>
                    <View style={styles.exSpec}>
                      <Text style={styles.exSpecMain}>
                        {pe.sets ?? '?'}×{pe.reps ?? '?'}
                      </Text>
                      {pe.restSeconds ? (
                        <Text style={styles.exSpecSub}>{pe.restSeconds}s rest</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
        <Text style={styles.hint}>Tap an exercise to edit · Long-press to remove</Text>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editState !== null} animationType="slide" presentationStyle="formSheet" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {editState ? (exerciseMap[editState.pe.exerciseId]?.name ?? 'Exercise') : ''}
            </Text>

            <Text style={styles.modalLabel}>Sets</Text>
            <TextInput
              style={styles.modalInput}
              value={editState?.sets ?? ''}
              onChangeText={(v) => setEditState((s) => s && ({ ...s, sets: v }))}
              keyboardType="number-pad"
              placeholder="3"
              placeholderTextColor="#BBB"
            />

            <Text style={styles.modalLabel}>Reps</Text>
            <TextInput
              style={styles.modalInput}
              value={editState?.reps ?? ''}
              onChangeText={(v) => setEditState((s) => s && ({ ...s, reps: v }))}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor="#BBB"
            />

            <Text style={styles.modalLabel}>Rest (seconds)</Text>
            <TextInput
              style={styles.modalInput}
              value={editState?.restSeconds ?? ''}
              onChangeText={(v) => setEditState((s) => s && ({ ...s, restSeconds: v }))}
              keyboardType="number-pad"
              placeholder="90"
              placeholderTextColor="#BBB"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setEditState(null)}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, saving && { opacity: 0.6 }]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSaveText}>Save</Text>}
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
  addBtn: { width: 56, alignItems: 'flex-end' },
  addText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  tabBar: { maxHeight: 52, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  tabContent: { paddingHorizontal: 12, gap: 4, alignItems: 'center' },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  tabActive: { backgroundColor: colors.indigo },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: '#fff' },

  body: { padding: 16, paddingBottom: 60 },

  daySection: { marginBottom: 20 },
  dayTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  exCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 6,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  exBody: { flex: 1 },
  exName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  exMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  exSpec: { alignItems: 'flex-end' },
  exSpecMain: { fontSize: 15, fontWeight: '700', color: colors.indigo },
  exSpecSub: { fontSize: 11, color: colors.muted, marginTop: 2 },

  emptyBox: { alignItems: 'center', paddingTop: 48, paddingBottom: 24 },
  emptyText: { fontSize: 15, color: colors.muted, marginBottom: 18 },
  emptyAddBtn: { backgroundColor: colors.indigo, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 10 },
  emptyAddText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  hint: { textAlign: 'center', fontSize: 12, color: colors.faint, marginTop: 8 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 20 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: colors.body, marginBottom: 6 },
  modalInput: {
    backgroundColor: colors.bg, borderRadius: 10, height: 46, paddingHorizontal: 12,
    fontSize: 16, color: colors.ink, marginBottom: 14,
    borderWidth: 1.5, borderColor: colors.border,
  },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: {
    flex: 1, height: 48, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: colors.body },
  modalSave: {
    flex: 1, height: 48, borderRadius: 10, backgroundColor: colors.indigo,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
