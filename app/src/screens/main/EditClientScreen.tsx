import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { clientsCollection, updateClient, CLIENT_STATUSES } from '../../db/clients';
import { Field, Chip, formStyles } from '../../components/Form';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'EditClient'>;

const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active'] as const;

const num = (raw: string): number | undefined => {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** Optional columns read back as null, which would render as the string "null". */
const str = (value: unknown): string => (value == null ? '' : String(value));

export default function EditClientScreen({ route, navigation }: Props) {
  const { clientId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [goal, setGoal] = useState('');
  const [status, setStatus] = useState<string>('active');
  const [paymentMode, setPaymentMode] =
    useState<'trainer_collects' | 'gym_collects'>('trainer_collects');
  const [splitPercent, setSplitPercent] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [activityLevel, setActivityLevel] = useState<string | null>(null);

  // Load once into local form state — a live subscription would fight the typing.
  useEffect(() => {
    let cancelled = false;
    clientsCollection
      .find(clientId)
      .then((c) => {
        if (cancelled) return;
        setName(str(c.name));
        setPhone(str(c.phone));
        setGoal(str(c.goal));
        setStatus(str(c.status) || 'active');
        setPaymentMode(c.paymentMode === 'gym_collects' ? 'gym_collects' : 'trainer_collects');
        setSplitPercent(str(c.trainerSplitPercent));
        setHeightCm(str(c.heightCm));
        setActivityLevel(c.activityLevel ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        Alert.alert('Client not found', 'This client is no longer on your roster.');
        navigation.goBack();
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, navigation]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', "Enter the client's name.");
      return;
    }

    setSaving(true);
    try {
      await updateClient(clientId, {
        name,
        phone: phone || undefined,
        goal: goal || undefined,
        status,
        paymentMode,
        trainerSplitPercent: num(splitPercent),
        heightCm: num(heightCm),
        activityLevel: activityLevel ?? undefined,
      });
      navigation.goBack();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Could not save', message);
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
        <Text style={styles.headerTitle}>Edit Client</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.indigo} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Field label="Name *" value={name} onChangeText={setName} placeholder="Ramesh Kumar" />
            <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="9876543210" keyboardType="phone-pad" />
            <Field label="Goal" value={goal} onChangeText={setGoal} placeholder="Fat loss, strength…" />

            <Text style={formStyles.label}>Status</Text>
            <View style={formStyles.chipRow}>
              {CLIENT_STATUSES.map((s) => (
                <Chip key={s} label={s} selected={status === s} onPress={() => setStatus(s)} />
              ))}
            </View>

            <Text style={formStyles.label}>Who collects payment?</Text>
            <View style={formStyles.chipRow}>
              <Chip
                label="I collect"
                selected={paymentMode === 'trainer_collects'}
                onPress={() => setPaymentMode('trainer_collects')}
              />
              <Chip
                label="Gym collects"
                selected={paymentMode === 'gym_collects'}
                onPress={() => setPaymentMode('gym_collects')}
              />
            </View>

            {paymentMode === 'gym_collects' && (
              <Field
                label="My share"
                value={splitPercent}
                onChangeText={setSplitPercent}
                placeholder="60"
                keyboardType="decimal-pad"
                suffix="%"
              />
            )}

            <Text style={formStyles.sectionLabel}>Baseline intake</Text>

            <Field label="Height" value={heightCm} onChangeText={setHeightCm} placeholder="172" keyboardType="decimal-pad" suffix="cm" />

            <Text style={formStyles.label}>Activity level</Text>
            <View style={formStyles.chipRow}>
              {ACTIVITY_LEVELS.map((level) => (
                <Chip
                  key={level}
                  label={level}
                  selected={activityLevel === level}
                  onPress={() => setActivityLevel(activityLevel === level ? null : level)}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[formStyles.saveBtn, saving && formStyles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={formStyles.saveText}>Save changes</Text>}
            </TouchableOpacity>

            <Text style={formStyles.offlineNote}>
              Saves on this phone straight away — syncs when you're back online.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loader: { marginTop: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 40, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },

  body: { padding: 20, paddingBottom: 60 },
});
