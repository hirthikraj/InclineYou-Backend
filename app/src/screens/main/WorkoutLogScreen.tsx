import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { listSets, addSet, updateSet, deleteSet, type SetResponse } from '../../api/sessions';
import { setPendingPick } from '../../db/exercisePick';
import { fetchProgramExercisesForDay, findExercisesByIds } from '../../db/programs';
import { syncDatabase } from '../../db/sync';
import type Exercise from '../../db/models/Exercise';
import type ProgramExercise from '../../db/models/ProgramExercise';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'WorkoutLog'>;

interface AddState {
  exerciseId: string;
  exerciseName: string;
  load: string;
  reps: string;
  rpe: string;
}

interface EditState {
  set: SetResponse;
  exerciseName: string;
  load: string;
  reps: string;
  rpe: string;
}

export default function WorkoutLogScreen({ route, navigation }: Props) {
  const { workoutId, programId, templateDay } = route.params;

  const [sets, setSets] = useState<SetResponse[]>([]);
  const [plannedExercises, setPlannedExercises] = useState<ProgramExercise[]>([]);
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({});
  const [loading, setLoading] = useState(true);
  const [addState, setAddState] = useState<AddState | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSets = useCallback(async () => {
    try {
      const data = await listSets(workoutId);
      setSets(data);
    } catch {
      Alert.alert('Error', 'Could not load logged sets.');
    }
  }, [workoutId]);

  // Load planned exercises from local WatermelonDB (fast, offline)
  useEffect(() => {
    if (!programId || templateDay == null) return;
    fetchProgramExercisesForDay(programId, templateDay)
      .then(setPlannedExercises)
      .catch(() => {});
  }, [programId, templateDay]);

  useEffect(() => {
    fetchSets().finally(() => setLoading(false));
  }, [fetchSets]);

  // Build exercise name map for all IDs (planned + logged)
  useEffect(() => {
    const plannedIds = plannedExercises.map((pe) => pe.exerciseId);
    const loggedIds = sets.map((s) => s.exerciseId);
    const ids = [...new Set([...plannedIds, ...loggedIds])].filter(Boolean);
    if (!ids.length) { setExerciseMap({}); return; }
    findExercisesByIds(ids).then(setExerciseMap);
  }, [plannedExercises, sets]);

  // Group logged sets by exercise
  const groupedSets = useMemo(() => {
    const map: Record<string, SetResponse[]> = {};
    for (const s of sets) {
      if (!map[s.exerciseId]) map[s.exerciseId] = [];
      map[s.exerciseId].push(s);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.setNumber - b.setNumber);
    }
    return map;
  }, [sets]);

  // Unified ordered list: planned exercises first, then any ad-hoc logged exercises
  const orderedExerciseIds = useMemo(() => {
    const plannedIds = plannedExercises.map((pe) => pe.exerciseId);
    const adHocIds = [...new Set(sets.map((s) => s.exerciseId))].filter(
      (id) => !plannedIds.includes(id),
    );
    return [...plannedIds, ...adHocIds];
  }, [plannedExercises, sets]);

  // Map from exerciseId → planned program exercise (for showing targets)
  const plannedMap = useMemo(() => {
    const map: Record<string, ProgramExercise> = {};
    for (const pe of plannedExercises) map[pe.exerciseId] = pe;
    return map;
  }, [plannedExercises]);

  const openAddExercise = () => {
    setPendingPick((picked) => {
      setAddState({
        exerciseId: picked.id,
        exerciseName: picked.name,
        load: '',
        reps: '',
        rpe: '',
      });
    });
    navigation.navigate('ExercisePicker');
  };

  const openAddSetFor = (exerciseId: string, defaultReps?: number) => {
    const name = exerciseMap[exerciseId]?.name ?? 'Exercise';
    setAddState({
      exerciseId,
      exerciseName: name,
      load: '',
      reps: defaultReps != null ? String(defaultReps) : '',
      rpe: '',
    });
  };

  const handleAddSet = async () => {
    if (!addState) return;
    const existingSets = groupedSets[addState.exerciseId] ?? [];
    const setNumber = existingSets.length + 1;
    setSaving(true);
    try {
      await addSet(workoutId, {
        exerciseId: addState.exerciseId,
        setNumber,
        loadKg: addState.load ? parseFloat(addState.load) : undefined,
        reps:   addState.reps ? parseInt(addState.reps, 10) : undefined,
        rpe:    addState.rpe  ? parseFloat(addState.rpe)  : undefined,
      });
      await fetchSets();
      setAddState((s) => s ? { ...s, load: '', reps: s.reps, rpe: '' } : null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not add set.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (s: SetResponse) => {
    setEditState({
      set: s,
      exerciseName: exerciseMap[s.exerciseId]?.name ?? 'Exercise',
      load: s.loadKg != null ? String(s.loadKg) : '',
      reps: s.reps   != null ? String(s.reps)   : '',
      rpe:  s.rpe    != null ? String(s.rpe)     : '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editState) return;
    setSaving(true);
    try {
      await updateSet(workoutId, editState.set.id, {
        loadKg: editState.load ? parseFloat(editState.load) : undefined,
        reps:   editState.reps ? parseInt(editState.reps, 10) : undefined,
        rpe:    editState.rpe  ? parseFloat(editState.rpe)   : undefined,
      });
      await fetchSets();
      setEditState(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update set.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSet = (s: SetResponse) => {
    Alert.alert('Remove set', `Delete set ${s.setNumber}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteSet(workoutId, s.id);
            await fetchSets();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not delete set.');
          }
        },
      },
    ]);
  };

  const handleDone = async () => {
    await syncDatabase('workout-done');
    navigation.popToTop();
  };

  const headerTitle = templateDay != null
    ? `Day ${templateDay} log`
    : 'Workout log';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.indigo} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

          {orderedExerciseIds.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyHead}>No exercises yet</Text>
              <Text style={styles.emptyBody}>Tap "Add exercise" to start logging.</Text>
            </View>
          )}

          {orderedExerciseIds.map((exId) => {
            const exSets = groupedSets[exId] ?? [];
            const exName = exerciseMap[exId]?.name ?? 'Unknown exercise';
            const exMuscle = exerciseMap[exId]?.muscleGroup;
            const planned = plannedMap[exId];
            const isExpanded = addState?.exerciseId === exId;

            return (
              <View key={exId} style={styles.exerciseBlock}>
                {/* Exercise header */}
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseMeta}>
                    <Text style={styles.exerciseName}>{exName}</Text>
                    {exMuscle ? <Text style={styles.exerciseMuscle}>{exMuscle}</Text> : null}
                  </View>
                  {planned ? (
                    <View style={styles.targetBadge}>
                      <Text style={styles.targetText}>
                        {planned.sets ? `${planned.sets}×` : ''}{planned.reps ?? '?'} target
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.adHocBadge}>
                      <Text style={styles.adHocText}>ad-hoc</Text>
                    </View>
                  )}
                </View>

                {/* Set table */}
                {exSets.length > 0 && (
                  <View style={styles.setTable}>
                    <View style={styles.setHeaderRow}>
                      <Text style={[styles.setCell, styles.setHeaderText, styles.setCellNarrow]}>Set</Text>
                      <Text style={[styles.setCell, styles.setHeaderText]}>Load (kg)</Text>
                      <Text style={[styles.setCell, styles.setHeaderText]}>Reps</Text>
                      <Text style={[styles.setCell, styles.setHeaderText]}>RPE</Text>
                    </View>
                    {exSets.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={styles.setRow}
                        onPress={() => openEdit(s)}
                        onLongPress={() => handleDeleteSet(s)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.setCell, styles.setCellNarrow]}>{s.setNumber}</Text>
                        <Text style={styles.setCell}>{s.loadKg ?? '—'}</Text>
                        <Text style={styles.setCell}>{s.reps    ?? '—'}</Text>
                        <Text style={styles.setCell}>{s.rpe     ?? '—'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Inline "log a set" form for the active exercise */}
                {isExpanded && (
                  <View style={styles.inlineForm}>
                    <Text style={styles.inlineTitle}>
                      Set {exSets.length + 1}
                      {planned?.reps ? ` — target ${planned.reps} reps` : ''}
                    </Text>
                    <View style={styles.inlineRow}>
                      <View style={styles.inlineField}>
                        <Text style={styles.inlineLabel}>Load (kg)</Text>
                        <TextInput
                          style={styles.inlineInput}
                          value={addState.load}
                          onChangeText={(v) => setAddState((s) => s && ({ ...s, load: v }))}
                          keyboardType="decimal-pad"
                          placeholder="—"
                          placeholderTextColor="#BBB"
                        />
                      </View>
                      <View style={styles.inlineField}>
                        <Text style={styles.inlineLabel}>Reps</Text>
                        <TextInput
                          style={styles.inlineInput}
                          value={addState.reps}
                          onChangeText={(v) => setAddState((s) => s && ({ ...s, reps: v }))}
                          keyboardType="number-pad"
                          placeholder={planned?.reps ? String(planned.reps) : '—'}
                          placeholderTextColor="#BBB"
                        />
                      </View>
                      <View style={styles.inlineField}>
                        <Text style={styles.inlineLabel}>RPE</Text>
                        <TextInput
                          style={styles.inlineInput}
                          value={addState.rpe}
                          onChangeText={(v) => setAddState((s) => s && ({ ...s, rpe: v }))}
                          keyboardType="decimal-pad"
                          placeholder="7"
                          placeholderTextColor="#BBB"
                        />
                      </View>
                    </View>
                    <View style={styles.inlineBtns}>
                      <TouchableOpacity
                        style={[styles.inlineAdd, saving && { opacity: 0.6 }]}
                        onPress={handleAddSet}
                        disabled={saving}
                      >
                        {saving
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.inlineAddText}>+ Log set</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.inlineCancel}
                        onPress={() => setAddState(null)}
                      >
                        <Text style={styles.inlineCancelText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {!isExpanded && (
                  <TouchableOpacity
                    style={styles.addSetBtn}
                    onPress={() => openAddSetFor(exId, planned?.reps ?? undefined)}
                  >
                    <Text style={styles.addSetBtnText}>
                      {exSets.length === 0
                        ? '+ Log first set'
                        : `+ Add set ${exSets.length + 1}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          <TouchableOpacity style={styles.addExerciseBtn} onPress={openAddExercise}>
            <Text style={styles.addExerciseBtnText}>+ Add exercise</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>Tap set to edit · Long-press to remove</Text>
        </ScrollView>
      )}

      {/* Edit set modal */}
      <Modal
        visible={editState !== null}
        animationType="slide"
        presentationStyle="formSheet"
        transparent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {editState?.exerciseName} — Set {editState?.set.setNumber}
            </Text>

            <Text style={styles.modalLabel}>Load (kg)</Text>
            <TextInput
              style={styles.modalInput}
              value={editState?.load ?? ''}
              onChangeText={(v) => setEditState((s) => s && ({ ...s, load: v }))}
              keyboardType="decimal-pad"
              placeholder="80"
              placeholderTextColor="#BBB"
            />

            <Text style={styles.modalLabel}>Reps</Text>
            <TextInput
              style={styles.modalInput}
              value={editState?.reps ?? ''}
              onChangeText={(v) => setEditState((s) => s && ({ ...s, reps: v }))}
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor="#BBB"
            />

            <Text style={styles.modalLabel}>RPE (1–10)</Text>
            <TextInput
              style={styles.modalInput}
              value={editState?.rpe ?? ''}
              onChangeText={(v) => setEditState((s) => s && ({ ...s, rpe: v }))}
              keyboardType="decimal-pad"
              placeholder="7.5"
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
  doneBtn: { width: 56, alignItems: 'flex-end' },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  body: { padding: 16, paddingBottom: 80 },

  emptyBox: { alignItems: 'center', paddingTop: 48 },
  emptyHead: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: colors.muted },

  exerciseBlock: {
    backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  exerciseHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  exerciseMeta: { flex: 1 },
  exerciseName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  exerciseMuscle: { fontSize: 12, color: colors.muted, marginTop: 2 },

  targetBadge: {
    backgroundColor: colors.indigoSoft, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8,
  },
  targetText: { fontSize: 11, fontWeight: '700', color: colors.indigo },

  adHocBadge: {
    backgroundColor: '#F5F5F5', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8,
  },
  adHocText: { fontSize: 11, fontWeight: '600', color: colors.muted },

  setTable: { marginBottom: 6 },
  setHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  setHeaderText: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  setRow: {
    flexDirection: 'row', paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline,
  },
  setCell: { flex: 1, fontSize: 14, color: colors.ink, textAlign: 'center' },
  setCellNarrow: { flex: 0.5 },

  inlineForm: { marginTop: 8, padding: 10, backgroundColor: colors.bg, borderRadius: 10 },
  inlineTitle: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 8 },
  inlineRow: { flexDirection: 'row', gap: 8 },
  inlineField: { flex: 1 },
  inlineLabel: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  inlineInput: {
    backgroundColor: colors.card, borderRadius: 8, height: 40,
    textAlign: 'center', fontSize: 15, color: colors.ink,
    borderWidth: 1.5, borderColor: colors.border,
  },
  inlineBtns: { flexDirection: 'row', gap: 8, marginTop: 10 },
  inlineAdd: {
    flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.indigo,
    alignItems: 'center', justifyContent: 'center',
  },
  inlineAddText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  inlineCancel: {
    height: 40, paddingHorizontal: 14, borderRadius: 8,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  inlineCancelText: { color: colors.body, fontSize: 14 },

  addSetBtn: { marginTop: 4, paddingVertical: 8, alignItems: 'center' },
  addSetBtnText: { color: colors.indigo, fontWeight: '700', fontSize: 14 },

  addExerciseBtn: {
    height: 50, borderRadius: 12, borderWidth: 2, borderColor: colors.indigo,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  addExerciseBtnText: { color: colors.indigo, fontWeight: '700', fontSize: 15 },

  hint: { textAlign: 'center', fontSize: 12, color: colors.faint },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 18 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: colors.body, marginBottom: 6 },
  modalInput: {
    backgroundColor: colors.bg, borderRadius: 10, height: 46, paddingHorizontal: 12,
    fontSize: 16, color: colors.ink, marginBottom: 14,
    borderWidth: 1.5, borderColor: colors.border,
  },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
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
