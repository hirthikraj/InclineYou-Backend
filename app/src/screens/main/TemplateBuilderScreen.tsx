import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { createTemplate } from '../../api/programs';
import { setPendingPick } from '../../db/exercisePick';
import { syncDatabase } from '../../db/sync';
import { Field, formStyles } from '../../components/Form';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'TemplateBuilder'>;

interface DayExercise {
  exerciseId: string;
  exerciseName: string;
  sets: string;
  reps: string;
  restSeconds: string;
  orderIndex: number;
}

type DayMap = Map<number, DayExercise[]>;

export default function TemplateBuilderScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [daysCount, setDaysCount] = useState(0);           // 0 = not set yet
  const [dayMap, setDayMap] = useState<DayMap>(new Map()); // day number (1-N) → exercises
  const [dayLabels, setDayLabels] = useState<Map<number, string>>(new Map()); // day number → name
  const [activeDay, setActiveDay] = useState(1);
  const [saving, setSaving] = useState(false);

  const days = Array.from({ length: daysCount }, (_, i) => i + 1);
  const getDay = (day: number): DayExercise[] => dayMap.get(day) ?? [];
  const totalExercises = Array.from(dayMap.values()).reduce((s, arr) => s + arr.length, 0);

  // Clamp active day if user reduces daysCount
  useEffect(() => {
    if (daysCount > 0 && activeDay > daysCount) setActiveDay(daysCount);
  }, [daysCount, activeDay]);

  const adjustCount = (delta: number) => {
    setDaysCount((prev) => {
      const next = Math.max(1, Math.min(7, (prev || 0) + delta));
      return next;
    });
  };

  const setDayLabel = (day: number, label: string) => {
    setDayLabels((prev) => {
      const next = new Map(prev);
      if (label.trim()) next.set(day, label);
      else next.delete(day);
      return next;
    });
  };

  const openPicker = (day: number) => {
    setPendingPick((picked) => {
      setDayMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(day) ?? [];
        next.set(day, [
          ...existing,
          {
            exerciseId: picked.id,
            exerciseName: picked.name,
            sets: '3',
            reps: '10',
            restSeconds: '60',
            orderIndex: existing.length,
          },
        ]);
        return next;
      });
    });
    navigation.navigate('ExercisePicker');
  };

  const updateExercise = (day: number, index: number, patch: Partial<DayExercise>) => {
    setDayMap((prev) => {
      const next = new Map(prev);
      const arr = (next.get(day) ?? []).map((e, i) => (i === index ? { ...e, ...patch } : e));
      next.set(day, arr);
      return next;
    });
  };

  const removeExercise = (day: number, index: number) => {
    setDayMap((prev) => {
      const next = new Map(prev);
      const arr = (next.get(day) ?? [])
        .filter((_, i) => i !== index)
        .map((e, i) => ({ ...e, orderIndex: i }));
      if (arr.length) next.set(day, arr);
      else next.delete(day);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Give the template a name.');
      return;
    }
    if (daysCount < 1) {
      Alert.alert('Days required', 'Set how many days per week first.');
      return;
    }
    if (totalExercises === 0) {
      Alert.alert('No exercises', 'Add at least one exercise to any day.');
      return;
    }
    setSaving(true);
    try {
      const exercises: {
        exerciseId: string; sets?: number; reps?: number;
        restSeconds?: number; dayOfWeek?: number; orderIndex: number;
      }[] = [];
      let globalIndex = 0;
      for (const [day, exList] of dayMap.entries()) {
        for (const ex of exList) {
          exercises.push({
            exerciseId: ex.exerciseId,
            sets: parseInt(ex.sets, 10) || undefined,
            reps: parseInt(ex.reps, 10) || undefined,
            restSeconds: parseInt(ex.restSeconds, 10) || undefined,
            dayOfWeek: day,
            orderIndex: globalIndex++,
          });
        }
      }

      const dayLabelsObj = dayLabels.size > 0
        ? Object.fromEntries(Array.from(dayLabels.entries()).map(([k, v]) => [k, v]))
        : undefined;

      await createTemplate({
        name: name.trim(),
        goal: goal.trim() || undefined,
        exercises,
        dayLabels: dayLabelsObj,
      });
      syncDatabase('create-template');
      navigation.goBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save template.';
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const dayExercises = getDay(activeDay);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.sideBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New template</Text>
          <View style={styles.sideBtn} />
        </View>

        {/* ── Template-level meta (name, goal, day count) ── */}
        <View style={styles.metaSection}>
          <Field
            label="Template name *"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Hypertrophy Program"
          />
          <Field
            label="Goal"
            value={goal}
            onChangeText={setGoal}
            placeholder="e.g. Build muscle"
          />

          {/* Days-per-week stepper */}
          <View style={styles.daysRow}>
            <View>
              <Text style={styles.daysLabel}>Days per week</Text>
              <Text style={styles.daysHint}>Number of training days in this template</Text>
            </View>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => adjustCount(-1)}
                disabled={daysCount <= 1}
              >
                <Text style={[styles.stepBtnText, daysCount <= 1 && styles.stepBtnDisabled]}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepCount}>{daysCount || '—'}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => adjustCount(1)}
                disabled={daysCount >= 7}
              >
                <Text style={[styles.stepBtnText, daysCount >= 7 && styles.stepBtnDisabled]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {daysCount > 0 ? (
          <>
            {/* ── Day tabs ── explicit height wrapper prevents flex collapse */}
            <View style={styles.dayTabsWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayTabsRow}
              >
                {days.map((day) => {
                  const count = getDay(day).length;
                  const isActive = activeDay === day;
                  const label = dayLabels.get(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayTab, isActive && styles.dayTabActive]}
                      onPress={() => setActiveDay(day)}
                    >
                      <View style={styles.dayTabInner}>
                        <Text style={[styles.dayTabLabel, isActive && styles.dayTabLabelActive]}>
                          Day {day}
                        </Text>
                        {count > 0 && (
                          <View style={[styles.dayBadge, isActive && styles.dayBadgeActive]}>
                            <Text style={styles.dayBadgeText}>{count}</Text>
                          </View>
                        )}
                      </View>
                      {label ? (
                        <Text
                          style={[styles.dayTabSub, isActive && styles.dayTabSubActive]}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* ── Day content (scrollable) ── */}
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.dayBody}
              keyboardShouldPersistTaps="handled"
            >
              {/* Day name */}
              <View style={styles.dayNameRow}>
                <Text style={styles.dayNamePrefix}>Day {activeDay} name</Text>
                <TextInput
                  style={styles.dayNameInput}
                  value={dayLabels.get(activeDay) ?? ''}
                  onChangeText={(v) => setDayLabel(activeDay, v)}
                  placeholder="e.g. Push Day, Leg Day (optional)"
                  placeholderTextColor={colors.faint}
                />
              </View>

              {/* Exercise section header */}
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>
                  {dayExercises.length} exercise{dayExercises.length !== 1 ? 's' : ''}
                </Text>
                <TouchableOpacity onPress={() => openPicker(activeDay)} style={styles.addExBtn}>
                  <Text style={styles.addExText}>+ Add exercise</Text>
                </TouchableOpacity>
              </View>

              {dayExercises.length === 0 ? (
                <TouchableOpacity style={styles.emptyBox} onPress={() => openPicker(activeDay)}>
                  <Text style={styles.emptyText}>Tap to add exercises for Day {activeDay}</Text>
                  <Text style={styles.emptyHint}>Rest day? Leave this empty.</Text>
                </TouchableOpacity>
              ) : (
                dayExercises.map((ex, index) => (
                  <View key={ex.exerciseId + index} style={styles.exCard}>
                    <View style={styles.exHeader}>
                      <Text style={styles.exName} numberOfLines={1}>{ex.exerciseName}</Text>
                      <TouchableOpacity onPress={() => removeExercise(activeDay, index)}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.exFields}>
                      <View style={styles.exFieldWrap}>
                        <Text style={styles.exFieldLabel}>Sets</Text>
                        <Field
                          label="" value={ex.sets}
                          onChangeText={(v) => updateExercise(activeDay, index, { sets: v })}
                          keyboardType="decimal-pad" placeholder="3"
                        />
                      </View>
                      <View style={styles.exFieldWrap}>
                        <Text style={styles.exFieldLabel}>Reps</Text>
                        <Field
                          label="" value={ex.reps}
                          onChangeText={(v) => updateExercise(activeDay, index, { reps: v })}
                          keyboardType="decimal-pad" placeholder="10"
                        />
                      </View>
                      <View style={styles.exFieldWrap}>
                        <Text style={styles.exFieldLabel}>Rest (s)</Text>
                        <Field
                          label="" value={ex.restSeconds}
                          onChangeText={(v) => updateExercise(activeDay, index, { restSeconds: v })}
                          keyboardType="decimal-pad" placeholder="60"
                        />
                      </View>
                    </View>
                  </View>
                ))
              )}

              {/* Summary before save */}
              {totalExercises > 0 && (
                <View style={styles.summaryBox}>
                  {days.filter((d) => getDay(d).length > 0).map((d) => (
                    <Text key={d} style={styles.summaryLine}>
                      Day {d}{dayLabels.get(d) ? ` · ${dayLabels.get(d)}` : ''}:{' '}
                      {getDay(d).length} exercise{getDay(d).length !== 1 ? 's' : ''}
                    </Text>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[formStyles.saveBtn, saving && formStyles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={formStyles.saveText}>
                      Save template ({totalExercises} exercise{totalExercises !== 1 ? 's' : ''})
                    </Text>}
              </TouchableOpacity>

              <Text style={formStyles.offlineNote}>Saves to server — requires connection.</Text>
            </ScrollView>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Set days per week</Text>
            <Text style={styles.emptyStateBody}>
              Tap + above to choose how many training days this template covers, then add exercises for each day.
            </Text>
          </View>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#fff' },
  sideBtn: { width: 70, alignItems: 'flex-start' },
  cancelText: { fontSize: 15, color: '#fff', fontWeight: '500' },

  // ── Template meta section ────────────────────────────────────────────────────
  metaSection: {
    backgroundColor: colors.card,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },

  daysRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
  },
  daysLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  daysHint: { fontSize: 11, color: colors.muted, marginTop: 2 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.indigoSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { fontSize: 22, fontWeight: '600', color: colors.indigo, lineHeight: 26 },
  stepBtnDisabled: { color: colors.border },
  stepCount: {
    minWidth: 36, textAlign: 'center',
    fontSize: 22, fontWeight: '800', color: colors.ink,
  },

  // ── Day tabs ─────────────────────────────────────────────────────────────────
  dayTabsWrap: {
    height: 72,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  dayTabsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  dayTab: {
    alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border,
    marginRight: 8, minWidth: 68,
  },
  dayTabActive: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  dayTabInner: { flexDirection: 'row', alignItems: 'center' },
  dayTabLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  dayTabLabelActive: { color: '#fff' },
  dayTabSub: { fontSize: 10, color: colors.muted, marginTop: 2 },
  dayTabSubActive: { color: 'rgba(255,255,255,0.75)' },
  dayBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.indigo,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, marginLeft: 6,
  },
  dayBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dayBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  // ── Day content ──────────────────────────────────────────────────────────────
  dayBody: { padding: 16, paddingBottom: 60 },

  dayNameRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 10,
    paddingHorizontal: 14, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  dayNamePrefix: { fontSize: 13, fontWeight: '600', color: colors.muted, marginRight: 10, minWidth: 80 },
  dayNameInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 12 },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, marginTop: 4,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  addExBtn: {
    backgroundColor: colors.indigoSoft, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
  },
  addExText: { fontSize: 14, fontWeight: '700', color: colors.indigo },

  emptyBox: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border,
    borderRadius: 12, paddingVertical: 28, alignItems: 'center', marginBottom: 20,
  },
  emptyText: { fontSize: 14, color: colors.muted },
  emptyHint: { fontSize: 12, color: colors.faint, marginTop: 4 },

  exCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  exHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  exName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  removeText: { fontSize: 13, color: '#C62828', fontWeight: '600' },
  exFields: { flexDirection: 'row', gap: 8 },
  exFieldWrap: { flex: 1 },
  exFieldLabel: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 4 },

  summaryBox: {
    backgroundColor: colors.indigoSoft, borderRadius: 10, padding: 14, marginBottom: 20,
  },
  summaryLine: { fontSize: 13, color: colors.indigo, fontWeight: '600', marginBottom: 3 },

  // ── Empty state (no days set yet) ────────────────────────────────────────────
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  emptyStateTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  emptyStateBody: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21 },
});
