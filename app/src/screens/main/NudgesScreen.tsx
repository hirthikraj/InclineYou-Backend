import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Linking, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observeClient } from '../../db/clients';
import { observePackages } from '../../db/packages';
import { sendNudge } from '../../api/nudge';
import type ClientModel from '../../db/models/Client';
import type PackageModel from '../../db/models/Package';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'Nudges'>;

interface Template {
  key: string;
  label: string;
  description: string;
  icon: string;
  buildMessage: (name: string, pkg: PackageModel | null) => string;
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return '91' + digits;
  return null;
}

const TEMPLATES: Template[] = [
  {
    key: 'session_reminder',
    label: 'Session reminder',
    description: 'Remind about tomorrow\'s session',
    icon: '🗓',
    buildMessage: (name) =>
      `Hi ${name}! Just a reminder for your training session tomorrow. See you there! 💪`,
  },
  {
    key: 'payment_reminder',
    label: 'Payment reminder',
    description: 'Nudge about outstanding fee',
    icon: '💳',
    buildMessage: (name, pkg) => {
      const amt = pkg?.amount ? `₹${pkg.amount}` : 'your training fee';
      return `Hi ${name}, ${amt} is due. Please settle at your earliest convenience. Let me know if you have any questions!`;
    },
  },
  {
    key: 'check_in',
    label: 'Weekly check-in',
    description: 'Check progress and adjust program',
    icon: '💬',
    buildMessage: (name) =>
      `Hi ${name}! How's your week going? Keeping up with your training goals? Let me know if you need any adjustments.`,
  },
  {
    key: 'renewal',
    label: 'Plan renewal',
    description: 'Package expiry is approaching',
    icon: '🔄',
    buildMessage: (name) =>
      `Hi ${name}! Your training package is expiring soon. Would you like to renew? Let's keep the momentum going! 💪`,
  },
];

export default function NudgesScreen({ route, navigation }: Props) {
  const { clientId, clientName: paramName } = route.params;

  const [client, setClient] = useState<ClientModel | null>(null);
  const [packages, setPackages] = useState<PackageModel[]>([]);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    const s1 = observeClient(clientId).subscribe(setClient);
    const s2 = observePackages(clientId).subscribe(setPackages);
    return () => { s1.unsubscribe(); s2.unsubscribe(); };
  }, [clientId]);

  const firstName = (client?.name ?? paramName ?? 'there').split(' ')[0];
  const activePackage = packages.find((p) => p.status === 'active') ?? packages[0] ?? null;

  const handleSend = async (template: Template) => {
    const message = template.buildMessage(firstName, activePackage);
    const normalizedPhone = normalizePhone(client?.phone);
    const whatsappUrl = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
      : null;

    Alert.alert(
      template.label,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share / Copy',
          onPress: () => Share.share({ message }),
        },
        ...(whatsappUrl
          ? [{
              text: 'Open WhatsApp',
              onPress: async () => {
                // Fire-and-forget API record
                sendNudge(clientId, template.key).catch(() => {});
                try {
                  await Linking.openURL(whatsappUrl);
                } catch {
                  Alert.alert('Could not open WhatsApp', 'Make sure WhatsApp is installed.');
                }
              },
            }]
          : []),
      ],
    );

    setSending(template.key);
    setTimeout(() => setSending(null), 1500);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {client?.name ?? paramName ?? 'Reminders'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Tap a template to preview and open in WhatsApp.
        </Text>

        {!client?.phone && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              No phone number saved for this client — you can still copy or share the message.
            </Text>
          </View>
        )}

        {TEMPLATES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.templateCard, sending === t.key && styles.templateCardActive]}
            onPress={() => handleSend(t)}
            activeOpacity={0.8}
          >
            <View style={styles.templateLeft}>
              <Text style={styles.templateIcon}>{t.icon}</Text>
            </View>
            <View style={styles.templateBody}>
              <Text style={styles.templateLabel}>{t.label}</Text>
              <Text style={styles.templateDesc}>{t.description}</Text>
            </View>
            {sending === t.key
              ? <ActivityIndicator color={colors.indigo} />
              : <Text style={styles.templateChev}>›</Text>}
          </TouchableOpacity>
        ))}

        <Text style={styles.footNote}>
          Messages open pre-filled in WhatsApp. No message is sent automatically.
        </Text>
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 56, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },

  body: { padding: 20, paddingBottom: 60 },

  subtitle: { fontSize: 13, color: colors.muted, marginBottom: 20 },

  warnBox: {
    backgroundColor: '#FFF3CD', borderRadius: 10, padding: 14, marginBottom: 16,
  },
  warnText: { fontSize: 13, color: '#856404' },

  templateCard: {
    backgroundColor: colors.card, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  templateCardActive: { opacity: 0.7 },
  templateLeft: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.indigoSoft, alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  templateIcon: { fontSize: 20 },
  templateBody: { flex: 1 },
  templateLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  templateDesc: { fontSize: 12, color: colors.muted, marginTop: 2 },
  templateChev: { fontSize: 22, color: colors.muted, lineHeight: 24 },

  footNote: { textAlign: 'center', fontSize: 12, color: colors.faint, marginTop: 8 },
});
