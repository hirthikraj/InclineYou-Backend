import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AppTabs from './AppTabs';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import SearchScreen from '../screens/main/SearchScreen';
import SoonScreen from '../screens/main/SoonScreen';
import AddClientScreen from '../screens/main/AddClientScreen';
import ClientRosterScreen from '../screens/main/ClientRosterScreen';
import ClientDetailScreen from '../screens/main/ClientDetailScreen';
import EditClientScreen from '../screens/main/EditClientScreen';
import TemplateListScreen from '../screens/main/TemplateListScreen';
import TemplateBuilderScreen from '../screens/main/TemplateBuilderScreen';
import TemplateDetailScreen from '../screens/main/TemplateDetailScreen';
import ExercisePickerScreen from '../screens/main/ExercisePickerScreen';
import ProgramListScreen from '../screens/main/ProgramListScreen';
import ProgramDetailScreen from '../screens/main/ProgramDetailScreen';
import SessionListScreen from '../screens/main/SessionListScreen';
import ScheduleSessionScreen from '../screens/main/ScheduleSessionScreen';
import SessionDetailScreen from '../screens/main/SessionDetailScreen';
import WorkoutLogScreen from '../screens/main/WorkoutLogScreen';
import WeeklySlotPickerScreen from '../screens/main/WeeklySlotPickerScreen';
import ProgressScreen from '../screens/main/ProgressScreen';
import PackageListScreen from '../screens/main/PackageListScreen';
import PackageDetailScreen from '../screens/main/PackageDetailScreen';
import CalendarScreen from '../screens/main/CalendarScreen';
import NudgesScreen from '../screens/main/NudgesScreen';

export type MainStackParamList = {
  /** The four-tab shell. Everything else in this stack pushes over it. */
  Home: undefined;
  // Screen 03 · home
  Notifications: undefined;
  Search: undefined;
  /** The honest placeholder for a destination that isn't designed yet. */
  Soon: { title?: string } | undefined;
  Clients: undefined;
  AddClient: undefined;
  ClientDetail: { clientId: string };
  EditClient: { clientId: string };
  // M2
  TemplateList: undefined;
  TemplateBuilder: undefined;
  TemplateDetail: { templateId: string; templateName: string };
  ExercisePicker: undefined;
  ProgramList: { clientId: string };
  ProgramDetail: { programId: string };
  // M3
  SessionList: { clientId?: string };
  ScheduleSession: { clientId?: string };
  SessionDetail: { sessionId: string };
  WorkoutLog: { workoutId: string; programId?: string; templateDay?: number };
  WeeklySlotPicker: {
    clientId: string;
    sessionsPerWeek: number;
    durationMinutes: number;
    dayLabels?: Record<number, string>; // optional day names from template {"1":"Push Day"}
  };
  // M4
  Progress: { clientId: string; clientName?: string };
  // M5
  PackageList: { clientId: string; clientName?: string };
  PackageDetail: { packageId: string; clientId: string };
  // M6
  Calendar: { selectedDate?: string };
  // M7
  Nudges: { clientId: string; clientName?: string };
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={AppTabs} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Soon" component={SoonScreen} />
      <Stack.Screen name="Clients" component={ClientRosterScreen} />
      <Stack.Screen name="AddClient" component={AddClientScreen} />
      <Stack.Screen name="ClientDetail" component={ClientDetailScreen} />
      <Stack.Screen name="EditClient" component={EditClientScreen} />
      <Stack.Screen name="TemplateList" component={TemplateListScreen} />
      <Stack.Screen name="TemplateBuilder" component={TemplateBuilderScreen} />
      <Stack.Screen name="TemplateDetail" component={TemplateDetailScreen} />
      <Stack.Screen name="ExercisePicker" component={ExercisePickerScreen} />
      <Stack.Screen name="ProgramList" component={ProgramListScreen} />
      <Stack.Screen name="ProgramDetail" component={ProgramDetailScreen} />
      <Stack.Screen name="SessionList" component={SessionListScreen} />
      <Stack.Screen name="ScheduleSession" component={ScheduleSessionScreen} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} />
      <Stack.Screen name="WorkoutLog" component={WorkoutLogScreen} />
      <Stack.Screen name="WeeklySlotPicker" component={WeeklySlotPickerScreen} />
      <Stack.Screen name="Progress" component={ProgressScreen} />
      <Stack.Screen name="PackageList" component={PackageListScreen} />
      <Stack.Screen name="PackageDetail" component={PackageDetailScreen} />
      <Stack.Screen name="Calendar" component={CalendarScreen} />
      <Stack.Screen name="Nudges" component={NudgesScreen} />
    </Stack.Navigator>
  );
}
