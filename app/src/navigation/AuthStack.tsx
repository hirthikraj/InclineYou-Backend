import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PhoneScreen from '../screens/auth/PhoneScreen';
import OtpScreen from '../screens/auth/OtpScreen';
import RoleScreen from '../screens/auth/RoleScreen';
import UnknownScreen from '../screens/auth/UnknownScreen';
import PausedScreen from '../screens/auth/PausedScreen';
import type { Membership } from '../api/auth';

/** What a successful verify hands the role picker. */
export interface RoleSession {
  token: string;
  trainerId: string | null;
  owesSetup: boolean;
  memberships: Membership[];
  /** The trainer's own name, for "Welcome back, Ravi". Absent on a fresh account. */
  name?: string;
}

export type AuthStackParamList = {
  Phone: undefined;
  /**
   * `lockedFor` opens straight into state 3c with that many seconds left, for
   * when the number is already serving a lock and asking for a code told us so.
   * Absent on the normal path, where a code has actually been sent.
   */
  Otp: { phone: string; lockedFor?: number };
  /**
   * § 05 · Resolve role. Reached only when the number is genuinely both, or is a
   * client of more than one trainer — one role resolves silently and never lands
   * here.
   */
  Role: { session: RoleSession };
  /** § 07a · the number is on nobody's roster. The token claims a trainer account. */
  Unknown: { phone: string; token: string };
  /**
   * § 07b · LEGACY. Every membership paused, no token, nothing to open.
   *
   * Pause is not a wall any more: a paused client signs in, gets their history
   * and their logging, and reads the pause as a banner on Today. This route
   * survives for one case only — a new app talking to a backend from before that
   * change, which still answers `role: "paused"` with no token. Delete it once
   * no such server is running.
   */
  Paused: { trainerName: string; trainerPhone: string | null; pausedOn: string | null };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Phone" component={PhoneScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
      <Stack.Screen name="Role" component={RoleScreen} />
      <Stack.Screen name="Unknown" component={UnknownScreen} />
      <Stack.Screen name="Paused" component={PausedScreen} />
    </Stack.Navigator>
  );
}
