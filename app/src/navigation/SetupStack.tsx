/**
 * Trainer setup — the six-step flow that runs once, between sign-in and the app.
 *
 * It is its own stack rather than a modal over the deck: the trainer has an
 * account but no profile, and letting them wander into an app that will ask for
 * a name on every invite anyway is a worse first run than six taps.
 *
 * `Preflight` is the entry point in both directions — first run and resume —
 * because it is the screen that decides which of those this is.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SetupStep } from '../setup/draft';
import { SetupProvider } from '../setup/SetupContext';
import PreflightScreen from '../screens/setup/PreflightScreen';
import NameScreen from '../screens/setup/NameScreen';
import ExperienceScreen from '../screens/setup/ExperienceScreen';
import SpecialitiesScreen from '../screens/setup/SpecialitiesScreen';
import CertificationsScreen from '../screens/setup/CertificationsScreen';
import LanguagesScreen from '../screens/setup/LanguagesScreen';
import HoursScreen from '../screens/setup/HoursScreen';
import SetupPacksScreen from '../screens/setup/PacksScreen';
import PaymentScreen from '../screens/setup/PaymentScreen';
import DoneScreen from '../screens/setup/DoneScreen';

export type SetupStackParamList = {
  Preflight: undefined;
  Name: undefined;
  Experience: undefined;
  Specialities: undefined;
  Certifications: undefined;
  Languages: undefined;
  Hours: undefined;
  Packs: undefined;
  Payment: undefined;
  Done: undefined;
};

/** The one place a step id becomes a route. Resume reads this to jump back in. */
export const STEP_ROUTES: Record<SetupStep, keyof SetupStackParamList> = {
  name: 'Name',
  experience: 'Experience',
  specialities: 'Specialities',
  certifications: 'Certifications',
  languages: 'Languages',
  hours: 'Hours',
  packs: 'Packs',
  payment: 'Payment',
};

const Stack = createNativeStackNavigator<SetupStackParamList>();

export default function SetupStack() {
  return (
    <SetupProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Preflight" component={PreflightScreen} />
        <Stack.Screen name="Name" component={NameScreen} />
        <Stack.Screen name="Experience" component={ExperienceScreen} />
        <Stack.Screen name="Specialities" component={SpecialitiesScreen} />
        <Stack.Screen name="Certifications" component={CertificationsScreen} />
        <Stack.Screen name="Languages" component={LanguagesScreen} />
        <Stack.Screen name="Hours" component={HoursScreen} />
        <Stack.Screen name="Packs" component={SetupPacksScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        {/* No swiping back out of the success screen into the form. */}
        <Stack.Screen name="Done" component={DoneScreen} options={{ gestureEnabled: false }} />
      </Stack.Navigator>
    </SetupProvider>
  );
}
