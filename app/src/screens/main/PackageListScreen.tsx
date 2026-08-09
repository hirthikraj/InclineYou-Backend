import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observePackages, createPackage } from '../../db/packages';
import { useAuth } from '../../store/AuthContext';
import type PackageModel from '../../db/models/Package';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'PackageList'>;

const TYPE_LABELS: Record<string, string> = {
  session_pack: 'Session pack',
  monthly: 'Monthly',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#2E7D32',
  expired: '#9E9E9E',
  cancelled: '#B26A00',
  overdue: '#C62828',
};

function formatDate(s: string | null | undefined): string {
  return s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

interface AddState {
  type: 'session_pack' | 'monthly';
  sessions: string;
  amount: string;
  startDate: string;
  endDate: string;
}

export default function PackageListScreen({ route, navigation }: Props) {
  const { clientId, clientName } = route.params;
  const { trainerId } = useAuth();

  const [packages, setPackages] = useState<PackageModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState<AddState>({
    type: 'session_pack', sessions: '', amount: '', startDate: '', endDate: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sub = observePackages(clientId).subscribe((pkgs) => {
      setPackages(pkgs);
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [clientId]);

  const handleSave = async () => {
    const amount = parseFloat(add.amount);
    if (!amount || isNaN(amount)) {
      Alert.alert('Amount required', 'Enter the package amount in ₹.');
      return;
    }
    if (!trainerId) return;

    setSaving(true);
    try {
      await createPackage({
        trainerId,
        clientId,
        type: add.type,
        sessionsTotal: add.type === 'session_pack' && add.sessions ? parseInt(add.sessions, 10) : undefined,
        amount,
        startDate: add.startDate || undefined,
        endDate: add.endDate || undefined,
      });
      setShowAdd(false);
      setAdd({ type: 'session_pack', sessions: '', amount: '', startDate: '', endDate: '' });
    } catch {
      Alert.alert('Error', 'Could not save package. Try again.');
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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {clientName ? `${clientName} · Packages` : 'Packages'}
        </Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Text style={styles.addText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.indigo} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {packages.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No packages yet.</Text>
              <TouchableOpacity onPress={() => setShowAdd(true)}>
                <Text style={styles.linkText}>Add a package</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              {packages.map((pkg, i) => (
                <TouchableOpacity
                  key={pkg.id}
                  style={[styles.row, i === packages.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => navigation.navigate('PackageDetail', { packageId: pkg.id, clientId })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pkgType}>{TYPE_LABELS[pkg.type] ?? pkg.type}</Text>
                    <Text style={styles.pkgMeta}>
                      {pkg.type === 'session_pack'
                        ? `${pkg.sessionsRemaining ?? 0} / ${pkg.sessionsTotal ?? '?'} sessions · ₹${pkg.amount}`
                        : `₹${pkg.amount} · ${formatDate(pkg.startDate)} – ${formatDate(pkg.endDate)}`}
                    </Text>
                  </View>
                  <Text style={[styles.status, { color: STATUS_COLORS[pkg.status] ?? colors.muted }]}>
                    {pkg.status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Add package modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New package</Text>

            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.chipRow}>
              {(['session_pack', 'monthly'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, add.type === t && styles.chipActive]}
                  onPress={() => setAdd((s) => ({ ...s, type: t }))}
                >
                  <Text style={[styles.chipText, add.type === t && styles.chipTextActive]}>
                    {TYPE_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {add.type === 'session_pack' && (
              <>
                <Text style={styles.fieldLabel}>Number of sessions</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={add.sessions}
                  onChangeText={(v) => setAdd((s) => ({ ...s, sessions: v }))}
                  placeholder="e.g. 12"
                />
              </>
            )}

            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={add.amount}
              onChangeText={(v) => setAdd((s) => ({ ...s, amount: v }))}
              placeholder="e.g. 3000"
            />

            <Text style={styles.fieldLabel}>Start date (YYYY-MM-DD, optional)</Text>
            <TextInput
              style={styles.input}
              value={add.startDate}
              onChangeText={(v) => setAdd((s) => ({ ...s, startDate: v }))}
              placeholder="2026-08-01"
            />

            <Text style={styles.fieldLabel}>End date (YYYY-MM-DD, optional)</Text>
            <TextInput
              style={styles.input}
              value={add.endDate}
              onChangeText={(v) => setAdd((s) => ({ ...s, endDate: v }))}
              placeholder="2026-08-31"
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowAdd(false)}
                disabled={saving}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  addBtn: { width: 56, alignItems: 'center' },
  addText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  body: { padding: 20, paddingBottom: 60 },

  card: {
    backgroundColor: colors.card, borderRadius: 12,
    paddingHorizontal: 14, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  pkgType: { fontSize: 15, fontWeight: '600', color: colors.ink },
  pkgMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  status: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },

  emptyBox: {
    backgroundColor: colors.card, borderRadius: 12,
    paddingVertical: 40, alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: colors.faint },
  linkText: { fontSize: 13, color: colors.indigo, fontWeight: '600', marginTop: 10 },

  // Modal sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 20 },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 10,
    height: 44, paddingHorizontal: 12, fontSize: 15, color: colors.ink,
    backgroundColor: colors.bg,
  },
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bg,
  },
  chipActive: { borderColor: colors.indigo, backgroundColor: colors.indigoSoft },
  chipText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: colors.indigo },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  cancelText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  saveBtn: {
    flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.indigo,
  },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
