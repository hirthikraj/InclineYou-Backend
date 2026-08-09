import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PhoneScreen from '../screens/auth/PhoneScreen';
import OtpScreen from '../screens/auth/OtpScreen';

export type AuthStackParamList = {
  Phone: undefined;
  /**
   * `lockedFor` opens straight into state 3c with that many seconds left, for
   * when the number is already serving a lock and asking for a code told us so.
   * Absent on the normal path, where a code has actually been sent.
   */
  Otp: { phone: string; lockedFor?: number };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Phone" component={PhoneScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
    </Stack.Navigator>
  );
}
