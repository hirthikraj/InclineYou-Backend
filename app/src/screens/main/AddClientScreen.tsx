import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { useAuth } from '../../store/AuthContext';
import { createClient } from '../../db/clients';
import { Field, Chip, formStyles } from '../../components/Form';
import { colors } from '../../theme';

const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active'] as const;

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'AddClient'>;
};

export default function AddClientScreen({ navigation }: Props) {
  const { trainerId } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [goal, setGoal] = useState('');
  const [paymentMode, setPaymentMode] = useState<'trainer_collects' | 'gym_collects'>('trainer_collects');
  const [splitPercent, setSplitPercent] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activityLevel, setActivityLevel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parseNumber = (raw: string): number | undefined => {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', "Enter the client's name.");
      return;
    }
    if (!trainerId) {
      Alert.alert('Not signed in', 'Sign in again and retry.');
      return;
    }

    setSaving(true);
    try {
      await createClient(trainerId, {
        name,
        phone: phone || undefined,
        goal: goal || undefined,
        paymentMode,
        trainerSplitPercent: paymentMode === 'gym_collects' ? parseNumber(splitPercent) : undefined,
        heightCm: parseNumber(heightCm),
        activityLevel: activityLevel ?? undefined,
        startingWeightKg: parseNumber(weightKg),
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
        <Text style={styles.headerTitle}>New Client</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Field label="Name *" value={name} onChangeText={setName} placeholder="Ramesh Kumar" />
          <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="9876543210" keyboardType="phone-pad" />
          <Field label="Goal" value={goal} onChangeText={setGoal} placeholder="Fat loss, strength…" />

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
          <Field label="Starting weight" value={weightKg} onChangeText={setWeightKg} placeholder="78.5" keyboardType="decimal-pad" suffix="kg" />

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
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={formStyles.saveText}>Save client</Text>}
          </TouchableOpacity>

          <Text style={formStyles.offlineNote}>
            Saves on this phone straight away — syncs when you're back online.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 40, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },

  body: { padding: 20, paddingBottom: 60 },
});
