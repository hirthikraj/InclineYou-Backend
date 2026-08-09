import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Share, Linking, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observePackages, observePayments, createPayment, confirmPayment } from '../../db/packages';
import { getTrainerProfile } from '../../api/payments';
import type PackageModel from '../../db/models/Package';
import type PaymentModel from '../../db/models/Payment';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'PackageDetail'>;

const TYPE_LABELS: Record<string, string> = {
  session_pack: 'Session pack',
  monthly: 'Monthly',
};

function formatDate(s: string | null | undefined): string {
  return s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function PackageDetailScreen({ route, navigation }: Props) {
  const { packageId, clientId } = route.params;

  const [pkg, setPkg] = useState<PackageModel | null>(null);
  const [payments, setPayments] = useState<PaymentModel[]>([]);
  const [trainerUpiVpa, setTrainerUpiVpa] = useState<string | null>(null);
  const [trainerName, setTrainerName] = useState<string>('Trainer');
  const [loading, setLoading] = useState(true);

  const [showConfirmRef, setShowConfirmRef] = useState<string | null>(null); // paymentId to confirm
  const [upiRef, setUpiRef] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const subPkg = observePackages(clientId).subscribe((pkgs) => {
      setPkg(pkgs.find((p) => p.id === packageId) ?? null);
      setLoading(false);
    });
    const subPay = observePayments(packageId).subscribe(setPayments);
    return () => { subPkg.unsubscribe(); subPay.unsubscribe(); };
  }, [packageId, clientId]);

  useEffect(() => {
    getTrainerProfile()
      .then((t) => { setTrainerUpiVpa(t.upiVpa); setTrainerName(t.name); })
      .catch(() => {});
  }, []);

  const handleRequestPayment = async () => {
    if (!pkg) return;
    const amount = pkg.amount;

    if (!trainerUpiVpa) {
      Alert.alert(
        'UPI ID not set',
        'You need to save your UPI ID before generating a payment link. Go to your profile to add it.',
      );
      return;
    }

    const upiUrl = `upi://pay?pa=${encodeURIComponent(trainerUpiVpa)}&pn=${encodeURIComponent(trainerName)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Training Fee')}`;

    Alert.alert(
      'Collect ₹' + amount,
      'Share the UPI link with your client, or open it here if paying in person.',
      [
        { text: 'Share link', onPress: () => Share.share({ message: upiUrl }) },
        { text: 'Open UPI app', onPress: () => Linking.openURL(upiUrl).catch(() => Alert.alert('Could not open UPI app')) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleMarkGymPaid = async () => {
    if (!pkg) return;
    setActing(true);
    try {
      await createPayment({
        trainerId: pkg.trainerId,
        clientId: pkg.clientId,
        packageId: pkg.id,
        amount: pkg.amount,
        method: 'front_office',
        collectedBy: 'gym',
      });
      // Then immediately confirm it
      const paymentList = await new Promise<PaymentModel[]>((resolve) => {
        const sub = observePayments(packageId).subscribe((p) => { resolve(p); sub.unsubscribe(); });
      });
      const pending = paymentList.find((p) => p.status === 'pending');
      if (pending) await confirmPayment(pending.id);
      Alert.alert('Marked paid', 'Payment recorded as collected by gym.');
    } catch {
      Alert.alert('Error', 'Could not record payment. Try again.');
    } finally {
      setActing(false);
    }
  };

  const handleConfirmUpiPayment = async () => {
    if (!pkg || !showConfirmRef) return;
    setActing(true);
    try {
      await confirmPayment(showConfirmRef, upiRef.trim() || undefined);
      setShowConfirmRef(null);
      setUpiRef('');
    } catch {
      Alert.alert('Error', 'Could not confirm payment. Try again.');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.indigo} />
      </SafeAreaView>
    );
  }

  if (!pkg) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Package</Text>
          <View style={styles.backBtn} />
        </View>
        <Text style={[styles.empty, { marginTop: 40 }]}>Package not found.</Text>
      </SafeAreaView>
    );
  }

  const isSessionPack = pkg.type === 'session_pack';
  const isTrainerCollects = pkg.trainerId != null; // simplified — client's payment_mode check would be ideal

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{TYPE_LABELS[pkg.type] ?? pkg.type}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Sessions remaining counter */}
        {isSessionPack && (
          <View style={styles.sessionsCard}>
            <Text style={styles.sessionsBig}>{pkg.sessionsRemaining ?? 0}</Text>
            <Text style={styles.sessionsLabel}>sessions remaining</Text>
            <Text style={styles.sessionsTotal}>of {pkg.sessionsTotal ?? '?'} total</Text>
          </View>
        )}

        {/* Package details */}
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.card}>
          <Row label="Type" value={TYPE_LABELS[pkg.type] ?? pkg.type} />
          <Row label="Amount" value={`₹${pkg.amount}`} />
          <Row label="Status" value={pkg.status} />
          {pkg.startDate ? <Row label="Start" value={formatDate(pkg.startDate)} /> : null}
          {pkg.endDate ? <Row label="End" value={formatDate(pkg.endDate)} /> : null}
        </View>

        {/* Payment actions */}
        <Text style={styles.sectionTitle}>Collect payment</Text>
        <View style={styles.actionsCard}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestPayment} disabled={acting}>
            <Text style={styles.primaryBtnText}>Generate UPI link  ₹{pkg.amount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleMarkGymPaid} disabled={acting}>
            {acting ? (
              <ActivityIndicator color={colors.indigo} />
            ) : (
              <Text style={styles.secondaryBtnText}>Mark as paid (gym / cash)</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Payment history */}
        <Text style={styles.sectionTitle}>Payment history ({payments.length})</Text>
        {payments.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>No payments recorded yet.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {payments.map((pay, i) => (
              <View
                key={pay.id}
                style={[styles.payRow, i === payments.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.payAmount}>₹{pay.amount}</Text>
                  <Text style={styles.payMeta}>
                    {pay.method === 'upi_intent' ? 'UPI' : pay.method} · {pay.collectedBy}
                    {pay.upiReference ? ` · Ref: ${pay.upiReference}` : ''}
                  </Text>
                </View>
                {pay.status === 'pending' ? (
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={() => { setShowConfirmRef(pay.id); setUpiRef(''); }}
                  >
                    <Text style={styles.confirmBtnText}>Mark paid</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.paidBadge}>Paid</Text>
                )}
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Confirm payment modal */}
      <Modal visible={!!showConfirmRef} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmTitle}>Mark as paid</Text>
            <Text style={styles.confirmSub}>Optional: enter the UPI reference / UTR number</Text>
            <TextInput
              style={styles.refInput}
              value={upiRef}
              onChangeText={setUpiRef}
              placeholder="UTR / reference (optional)"
              autoCapitalize="none"
            />
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowConfirmRef(null)}
                disabled={acting}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmSaveBtn}
                onPress={handleConfirmUpiPayment}
                disabled={acting}
              >
                {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmSaveBtnText}>Confirm</Text>}
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

  body: { padding: 20, paddingBottom: 60 },

  sessionsCard: {
    backgroundColor: colors.indigo, borderRadius: 16,
    alignItems: 'center', paddingVertical: 28, marginBottom: 24,
  },
  sessionsBig: { fontSize: 56, fontWeight: '800', color: '#fff', lineHeight: 62 },
  sessionsLabel: { fontSize: 16, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  sessionsTotal: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  card: {
    backgroundColor: colors.card, borderRadius: 12,
    paddingHorizontal: 14, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowLabel: { fontSize: 13, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.ink, fontWeight: '600' },

  actionsCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    marginBottom: 24, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  primaryBtn: {
    height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.indigo,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  secondaryBtn: {
    height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: colors.ink },

  emptyBox: {
    backgroundColor: colors.card, borderRadius: 12, paddingVertical: 32,
    alignItems: 'center', marginBottom: 24,
  },
  empty: { fontSize: 13, color: colors.faint, textAlign: 'center' },

  payRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  payAmount: { fontSize: 15, fontWeight: '700', color: colors.ink },
  payMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  confirmBtn: {
    borderWidth: 1.5, borderColor: colors.indigo, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  confirmBtnText: { fontSize: 13, color: colors.indigo, fontWeight: '600' },
  paidBadge: { fontSize: 12, fontWeight: '700', color: '#2E7D32' },

  // Confirm modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  confirmSheet: {
    backgroundColor: colors.card, borderRadius: 16, padding: 24, width: '100%',
  },
  confirmTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  confirmSub: { fontSize: 13, color: colors.muted, marginBottom: 16 },
  refInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 10,
    height: 44, paddingHorizontal: 12, fontSize: 15, color: colors.ink,
    backgroundColor: colors.bg, marginBottom: 16,
  },
  confirmActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  cancelText: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  confirmSaveBtn: {
    flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.indigo,
  },
  confirmSaveBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
