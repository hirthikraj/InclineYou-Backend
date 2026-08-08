import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/AuthStack';
import { requestOtp } from '../../api/auth';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Phone'>;
};

export default function PhoneScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (phone.length !== 10) {
      Alert.alert('Invalid number', 'Enter a 10-digit Indian mobile number.');
      return;
    }
    setLoading(true);
    try {
      await requestOtp(phone);
      navigation.navigate('Otp', { phone });
    } catch {
      Alert.alert('Error', 'Could not send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>TrainX</Text>
        <Text style={styles.subtitle}>Enter your mobile number</Text>

        <View style={styles.inputRow}>
          <Text style={styles.code}>+91</Text>
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            maxLength={10}
            placeholder="9876543210"
            value={phone}
            onChangeText={setPhone}
            autoFocus
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSend}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Send OTP</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6FA', justifyContent: 'center' },
  card: {
    margin: 24, padding: 28,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 24 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#D0D5DD', borderRadius: 10,
    paddingHorizontal: 12, height: 50, marginBottom: 20,
  },
  code: { fontSize: 16, color: '#333', marginRight: 8 },
  input: { flex: 1, fontSize: 17, letterSpacing: 1 },
  btn: {
    backgroundColor: '#4F46E5', borderRadius: 10,
    height: 50, alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
