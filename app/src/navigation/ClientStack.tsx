/**
 * The client half of the app — FR-11.
 *
 * A separate navigator rather than a branch inside `MainStack`, because the two
 * lenses answer different questions and share almost no destinations. What they
 * DO share is registered here by pointing at the same component: one exercise's
 * history is one exercise's history, and a second copy of that screen would be a
 * second thing to fix.
 *
 * Sign-out is shared for the same reason — it lists what has not reached the
 * server yet, and a queued set matters to whoever logged it.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ClientTabs from './ClientTabs';
import SessionsScreen from '../screens/client/SessionsScreen';
import ReceiptsScreen from '../screens/client/ReceiptsScreen';
import WeekScreen from '../screens/client/WeekScreen';
import ReportsScreen from '../screens/client/ReportsScreen';
import ClientProfileScreen from '../screens/client/ClientProfileScreen';
import ClientHelpScreen from '../screens/client/ClientHelpScreen';
import ClientNotificationsScreen from '../screens/client/ClientNotificationsScreen';
import ExerciseHistoryScreen from '../screens/main/log/ExerciseHistoryScreen';
import SignOutScreen from '../screens/main/drawer/SignOutScreen';
import { motion } from '../design';

export type ClientStackParamList = {
  Home: undefined;
  /** 4a / 4b. Pushed, never a tab — four rows is not a tab's worth of content. */
  Sessions: undefined;
  /** 5c. */
  Receipts: undefined;
  /** 6a. `weekStart` opens a specific week; absent means the latest. */
  Week: { weekStart?: string } | undefined;
  /** Every week that has landed. */
  Reports: undefined;
  ClientProfile: undefined;
  ClientHelp: undefined;
  Notifications: undefined;
  /** Shared with the trainer's stack — the same screen, the same params. */
  ExerciseHistory: { clientId: string; exerciseId: string };
  SignOut: undefined;
};

const Stack = createNativeStackNavigator<ClientStackParamList>();

export default function ClientStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: motion.base,
      }}
    >
      <Stack.Screen name="Home" component={ClientTabs} />
      <Stack.Screen name="Sessions" component={SessionsScreen} />
      <Stack.Screen name="Receipts" component={ReceiptsScreen} />
      <Stack.Screen name="Week" component={WeekScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="ClientProfile" component={ClientProfileScreen} />
      <Stack.Screen name="ClientHelp" component={ClientHelpScreen} />
      <Stack.Screen name="Notifications" component={ClientNotificationsScreen} />
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} />
      <Stack.Screen name="SignOut" component={SignOutScreen} />
    </Stack.Navigator>
  );
}
