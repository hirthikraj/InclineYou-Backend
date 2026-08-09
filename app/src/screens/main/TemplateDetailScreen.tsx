import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  FlatList, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { getTemplate, applyTemplate, type TemplateDetail, type TemplateExercise } from '../../api/programs';
import { observeClients } from '../../db/clients';
import { findExercisesByIds } from '../../db/programs';
import { syncDatabase } from '../../db/sync';
import type ClientModel from '../../db/models/Client';
import type Exercise from '../../db/models/Exercise';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'TemplateDetail'>;

function groupByDay(exercises: TemplateExercise[]) {
  const grouped: Record<string, TemplateExercise[]> = {};
  for (const ex of exercises) {
    const key = ex.day_of_week != null ? String(ex.day_of_week) : 'unscheduled';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ex);
  }
  return grouped;
}

export default function TemplateDetailScreen({ route, navigation }: Props) {
  const { templateId, templateName } = route.params;

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({});
  const [loading, setLoading] = useState(true);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clients, setClients] = useState<ClientModel[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    getTemplate(templateId)
      .then(async (t) => {
        setTemplate(t);
        const ids = t.exercises.map((e) => e.exercise_id);
        setExerciseMap(await findExercisesByIds(ids));
      })
      .catch(() => Alert.alert('Error', 'Could not load template.'))
      .finally(() => setLoading(false));
  }, [templateId]);

  useEffect(() => {
    const sub = observeClients().subscribe(setClients);
    return () => sub.unsubscribe();
  }, []);

  const handleApply = async (client: ClientModel) => {
    setShowClientPicker(false);
    setApplying(true);
    try {
      await applyTemplate(
        templateId,
        client.id,
        `${template?.name ?? templateName} — ${client.name}`,
        template?.goal ?? undefined,
      );
      await syncDatabase('apply-template');

      // Derive how many distinct training days the template has
      const dayNumbers = [...new Set(
        (template?.exercises ?? []).map((e) => e.day_of_week).filter((d): d is number => d != null && d > 0),
      )];
      const sessionsPerWeek = dayNumbers.length || 1;
      const durationMinutes = client.sessionDurationMinutes || 60;
      const dayLabels: Record<number, string> | undefined = template?.dayLabels
        ? Object.fromEntries(Object.entries(template.dayLabels).map(([k, v]) => [Number(k), v]))
        : undefined;

      navigation.navigate('WeeklySlotPicker', { clientId: client.id, sessionsPerWeek, durationMinutes, dayLabels });
    } catch (e: any) {
      Alert.alert('Apply failed', e?.message ?? 'Could not create program.');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{templateName}</Text>
          <View style={styles.backBtn} />
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.indigo} />
      </SafeAreaView>
    );
  }

  if (!template) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{templateName}</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.center}><Text style={styles.errorText}>Template not found.</Text></View>
      </SafeAreaView>
    );
  }

  const grouped = groupByDay(template.exercises);
  const dayKeys = Object.keys(grouped).sort((a, b) => {
    if (a === 'unscheduled') return 1;
    if (b === 'unscheduled') return -1;
    return Number(a) - Number(b);
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{template.name}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {template.goal ? <Text style={styles.goal}>{template.goal}</Text> : null}
        {template.description ? <Text style={styles.desc}>{template.description}</Text> : null}

        {template.exercises.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No exercises in this template yet.</Text>
          </View>
        ) : (
          dayKeys.map((key) => (
            <View key={key} style={styles.daySection}>
              <Text style={styles.dayTitle}>
                {key === 'unscheduled'
                  ? 'Unscheduled'
                  : template.dayLabels?.[key]
                    ? `Day ${key} · ${template.dayLabels[key]}`
                    : `Day ${key}`}
              </Text>
              {grouped[key].map((ex, i) => {
                const exercise = exerciseMap[ex.exercise_id];
                return (
                  <View key={ex.exercise_id + i} style={styles.exRow}>
                    <View style={styles.exBody}>
                      <Text style={styles.exName}>{exercise?.name ?? 'Unknown exercise'}</Text>
                      {exercise?.muscleGroup
                        ? <Text style={styles.exMeta}>{exercise.muscleGroup}</Text>
                        : null}
                    </View>
                    <Text style={styles.exSpec}>
                      {ex.sets ? `${ex.sets}×` : ''}{ex.reps ? `${ex.reps}` : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        )}

        <TouchableOpacity
          style={[styles.applyBtn, applying && { opacity: 0.6 }]}
          onPress={() => setShowClientPicker(true)}
          disabled={applying}
        >
          {applying
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.applyText}>Apply to client</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Client picker modal */}
      <Modal visible={showClientPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pick a client</Text>
            <TouchableOpacity onPress={() => setShowClientPicker(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={clients.filter((c) => c.status === 'active')}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.clientRow} onPress={() => handleApply(item)}>
                <Text style={styles.clientName}>{item.name}</Text>
                {item.goal ? <Text style={styles.clientGoal}>{item.goal}</Text> : null}
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={
              <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>
                No active clients.
              </Text>
            }
          />
        </SafeAreaView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: colors.muted },

  goal: { fontSize: 15, fontWeight: '600', color: colors.indigo, marginBottom: 6 },
  desc: { fontSize: 14, color: colors.body, marginBottom: 18, lineHeight: 20 },

  daySection: { marginBottom: 20 },
  dayTitle: { fontSize: 14, fontWeight: '700', color: colors.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  exRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 6,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  exBody: { flex: 1 },
  exName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  exMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  exSpec: { fontSize: 15, fontWeight: '700', color: colors.indigo, marginLeft: 8 },

  emptyBox: {
    backgroundColor: colors.card, borderRadius: 12,
    paddingVertical: 32, alignItems: 'center', marginBottom: 24,
  },
  emptyText: { fontSize: 14, color: colors.faint },

  applyBtn: {
    backgroundColor: colors.indigo, borderRadius: 12, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  applyText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  modalCancel: { fontSize: 15, color: colors.indigo, fontWeight: '600' },

  clientRow: {
    backgroundColor: colors.card, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  clientGoal: { fontSize: 13, color: colors.muted, marginTop: 3 },
});
