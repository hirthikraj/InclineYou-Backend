import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../navigation/AuthStack';
import { verifyOtp } from '../../api/auth';
import { useAuth } from '../../store/AuthContext';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Otp'>;
  route: RouteProp<AuthStackParamList, 'Otp'>;
};

export default function OtpScreen({ route }: Props) {
  const { phone } = route.params;
  const { signIn } = useAuth();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleVerify = async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await verifyOtp(phone, otp);
      await signIn(data.token, data.trainerId);
      // RootNavigator will re-render automatically once token is set
    } catch {
      Alert.alert('Wrong OTP', 'The code is incorrect or expired.');
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
        <Text style={styles.title}>Verify OTP</Text>
        <Text style={styles.subtitle}>
          Code sent to +91 {phone}
        </Text>

        <TextInput
          ref={inputRef}
          style={styles.otpInput}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="------"
          placeholderTextColor="#bbb"
          value={otp}
          onChangeText={setOtp}
          autoFocus
          letterSpacing={8}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Verify & Sign In</Text>
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
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 28 },
  otpInput: {
    borderWidth: 1.5, borderColor: '#D0D5DD', borderRadius: 10,
    height: 60, textAlign: 'center', fontSize: 28, fontWeight: '600',
    letterSpacing: 10, marginBottom: 24, color: '#1A1A2E',
  },
  btn: {
    backgroundColor: '#4F46E5', borderRadius: 10,
    height: 50, alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
