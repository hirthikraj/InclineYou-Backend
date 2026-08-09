import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { createSession } from '../../api/sessions';
import { observeClients } from '../../db/sessions';
import { syncDatabase } from '../../db/sync';
import type Client from '../../db/models/Client';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'ScheduleSession'>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function parseDateTime(date: string, time: string): number | null {
  // date: "YYYY-MM-DD", time: "HH:MM"
  const d = date.trim();
  const t = time.trim() || '09:00';
  const iso = `${d}T${t}:00`;
  const ms = new Date(iso).getTime();
  return isNaN(ms) ? null : ms;
}

export default function ScheduleSessionScreen({ route, navigation }: Props) {
  const prefillClientId = route.params?.clientId;

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(prefillClientId ?? '');
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);

  useEffect(() => {
    if (prefillClientId) return;
    const sub = observeClients().subscribe(setClients);
    return () => sub.unsubscribe();
  }, [prefillClientId]);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const handleSave = async () => {
    const clientIdToUse = prefillClientId ?? selectedClientId;
    if (!clientIdToUse) {
      Alert.alert('Missing client', 'Please select a client.');
      return;
    }
    const scheduledAt = parseDateTime(date, time);
    if (scheduledAt === null) {
      Alert.alert('Invalid date/time', 'Use YYYY-MM-DD for date and HH:MM for time.');
      return;
    }

    setSaving(true);
    try {
      await createSession({
        clientId: clientIdToUse,
        scheduledAt,
        durationMinutes: duration ? parseInt(duration, 10) || undefined : undefined,
        notes: notes.trim() || undefined,
      });
      await syncDatabase('schedule-session');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? e?.message ?? 'Could not schedule session.');
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
        <Text style={styles.title}>Schedule session</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Client selector — only when no clientId provided */}
        {!prefillClientId && (
          <Field label="Client">
            <TouchableOpacity
              style={styles.input}
              onPress={() => setShowClientPicker((v) => !v)}
              activeOpacity={0.75}
            >
              <Text style={selectedClientId ? styles.inputText : styles.inputPlaceholder}>
                {selectedClient?.name ?? 'Select a client…'}
              </Text>
            </TouchableOpacity>
            {showClientPicker && (
              <View style={styles.pickerList}>
                {clients.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.pickerRow}
                    onPress={() => { setSelectedClientId(c.id); setShowClientPicker(false); }}
                  >
                    <Text style={[styles.pickerRowText, c.id === selectedClientId && styles.pickerRowActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                {clients.length === 0 && (
                  <Text style={styles.pickerEmpty}>No clients found</Text>
                )}
              </View>
            )}
          </Field>
        )}

        <Field label="Date (YYYY-MM-DD)">
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="2026-08-10"
            placeholderTextColor="#BBB"
            keyboardType="numeric"
          />
        </Field>

        <Field label="Time (HH:MM, 24h)">
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={setTime}
            placeholder="09:00"
            placeholderTextColor="#BBB"
            keyboardType="numeric"
          />
        </Field>

        <Field label="Duration (minutes)">
          <TextInput
            style={styles.input}
            value={duration}
            onChangeText={setDuration}
            placeholder="60"
            placeholderTextColor="#BBB"
            keyboardType="number-pad"
          />
        </Field>

        <Field label="Notes (optional)">
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="E.g. Leg day — focus on squat form"
            placeholderTextColor="#BBB"
            multiline
            numberOfLines={3}
          />
        </Field>

      </ScrollView>
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
  saveBtn: { width: 56, alignItems: 'flex-end' },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  body: { padding: 20, paddingBottom: 60 },

  field: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: colors.body, marginBottom: 6 },
  input: {
    backgroundColor: colors.card, borderRadius: 10, height: 46,
    paddingHorizontal: 12, fontSize: 15, color: colors.ink,
    borderWidth: 1.5, borderColor: colors.border,
    justifyContent: 'center',
  },
  inputText: { fontSize: 15, color: colors.ink },
  inputPlaceholder: { fontSize: 15, color: '#BBB' },
  textArea: { height: 80, paddingTop: 12, textAlignVertical: 'top' },

  pickerList: {
    backgroundColor: colors.card, borderRadius: 10, marginTop: 4,
    borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden',
  },
  pickerRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  pickerRowText: { fontSize: 15, color: colors.ink },
  pickerRowActive: { color: colors.indigo, fontWeight: '700' },
  pickerEmpty: { padding: 14, fontSize: 14, color: colors.muted },
});
