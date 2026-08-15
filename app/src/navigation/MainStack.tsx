import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../design';
import AppTabs from './AppTabs';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import SearchScreen from '../screens/main/SearchScreen';
import SoonScreen from '../screens/main/SoonScreen';
import AddClientScreen from '../screens/main/clients/AddClientScreen';
import AddClientPayScreen from '../screens/main/clients/AddClientPayScreen';
import ClientAddedScreen from '../screens/main/clients/ClientAddedScreen';
import ClientSearchScreen from '../screens/main/clients/ClientSearchScreen';
import WorkingHoursScreen from '../screens/main/diary/WorkingHoursScreen';
import ClientFileScreen from '../screens/main/clients/ClientFileScreen';
import EditClientScreen from '../screens/main/clients/EditClientScreen';
import ClientEndScreen from '../screens/main/clients/ClientEndScreen';
import BodyMetricsScreen from '../screens/main/clients/BodyMetricsScreen';
import ExercisePickerScreen from '../screens/main/ExercisePickerScreen';
import ProgramListScreen from '../screens/main/ProgramListScreen';
import ProgramDetailScreen from '../screens/main/ProgramDetailScreen';
import SessionDetailScreen from '../screens/main/SessionDetailScreen';
// Screen 17 · the workout log
import LogPickScreen from '../screens/main/log/LogPickScreen';
import LogScreen from '../screens/main/log/LogScreen';
import FinishScreen from '../screens/main/log/FinishScreen';
import TodaysBestsScreen from '../screens/main/log/TodaysBestsScreen';
import SessionProgressScreen from '../screens/main/log/SessionProgressScreen';
import ExerciseHistoryScreen from '../screens/main/log/ExerciseHistoryScreen';
import PackageListScreen from '../screens/main/PackageListScreen';
import PackageDetailScreen from '../screens/main/PackageDetailScreen';
import OwedScreen from '../screens/main/money/OwedScreen';
import BookScreen from '../screens/main/money/BookScreen';
import MoneyPacksScreen from '../screens/main/money/PacksScreen';
import GymShareScreen from '../screens/main/money/GymShareScreen';
// Screens 07–16 · behind the drawer
import ProfileScreen from '../screens/main/drawer/ProfileScreen';
import SelfTrainingScreen from '../screens/main/drawer/SelfTrainingScreen';
import ProgramsScreen from '../screens/main/drawer/ProgramsScreen';
import ProgramScreen from '../screens/main/drawer/ProgramScreen';
import AssignProgramScreen from '../screens/main/drawer/AssignProgramScreen';
import ExercisesScreen from '../screens/main/drawer/ExercisesScreen';
import ExerciseScreen from '../screens/main/drawer/ExerciseScreen';
import ReportsScreen from '../screens/main/drawer/ReportsScreen';
import MetricScreen from '../screens/main/drawer/MetricScreen';
import WeeklyScreen from '../screens/main/drawer/WeeklyScreen';
import WeekReportScreen from '../screens/main/drawer/WeekReportScreen';
import SyncQueueScreen from '../screens/main/drawer/SyncQueueScreen';
import AdherenceScreen from '../screens/main/drawer/AdherenceScreen';
import NudgeRulesScreen from '../screens/main/drawer/NudgeRulesScreen';
import SettingsScreen from '../screens/main/drawer/SettingsScreen';
import GettingPaidScreen from '../screens/main/drawer/GettingPaidScreen';
import NotifySettingsScreen from '../screens/main/drawer/NotifySettingsScreen';
import HelpScreen from '../screens/main/drawer/HelpScreen';
import SignOutScreen from '../screens/main/drawer/SignOutScreen';

export type MainStackParamList = {
  /** The four-tab shell. Everything else in this stack pushes over it. */
  Home: undefined;
  // Screen 03 · home
  Notifications: undefined;
  Search: undefined;
  /** The honest placeholder for a destination that isn't designed yet. */
  Soon: { title?: string } | undefined;
  /** Screen 04 · § 02 — the roster's own full-screen search. */
  ClientSearch: undefined;
  /** Screen 05 · § 5a — weekly working hours. */
  WorkingHours: undefined;
  /** `name` arrives pre-filled from the search dead-end (2c). */
  AddClient: { name?: string } | undefined;
  AddClientPay: { name: string; phone: string };
  ClientAdded: { clientId: string };
  ClientDetail: { clientId: string };
  EditClient: { clientId: string };
  ClientEnd: { clientId: string };
  BodyMetrics: { clientId: string };
  // M2
  ExercisePicker: undefined;
  ProgramList: { clientId: string };
  ProgramDetail: { programId: string };
  // M3
  SessionDetail: { sessionId: string };
  /**
   * The + button's "Log a workout": who for.
   *
   * Replaces itself with the log rather than stacking, because nobody backs out
   * of a session into a picker.
   */
  LogPick: undefined;
  /**
   * Screen 17 · the floor screen. A mode, not a tab — it takes the whole phone.
   *
   * `programId` and `templateDay` are what the plan is read from on the first
   * open. They stay optional: logging is allowed to happen before programming
   * exists, which is how a trainer's first week with the app actually goes.
   */
  WorkoutLog: { workoutId: string; programId?: string; templateDay?: number };
  /** 6b — the summary. Arriving here closes the log; it does not close the money. */
  FinishSession: { workoutId: string };
  /** 4b — everything checked, and the two that did not make it. */
  TodaysBests: { workoutId: string };
  /** 5a — volume, the top set and bodyweight. */
  SessionProgress: { clientId: string };
  /** 5b — one exercise, one client, every set. */
  ExerciseHistory: { clientId: string; exerciseId: string };
  // M5
  PackageList: { clientId: string; clientName?: string };
  PackageDetail: { packageId: string; clientId: string };
  /** Screen 06 · § 2a — everything outstanding, sorted by how late. */
  MoneyOwed: undefined;
  /** Screen 06 · § 4a — one client's book. `record` opens the sheet on arrival. */
  MoneyBook: { clientId: string; record?: boolean };
  /** Screen 06 · § 4b — the price list. */
  MoneyPacks: undefined;
  /** Screen 06 · § 5a — the gym's cut, and setting it up. */
  MoneyGym: undefined;

  /* ─────────────────────────── Screens 07–16 · behind the drawer ─────────── */

  /** 2a — you and your business. */
  Profile: undefined;
  /**
   * 2b's destination. The mode sheet lives in the shell; this is what it opens.
   *
   * Unreachable while `SELF_TRAINING_ENABLED` is false — every way in is gated
   * on that constant. The route stays registered so switching the feature back
   * on is the one-line flip it claims to be, and so nothing that navigates here
   * has to be re-typed when it is.
   */
  SelfTraining: undefined;
  /** 3a — the program shelf. */
  Programs: undefined;
  /** 3b — inside one program. */
  Program: { templateId: string };
  /** Client picker → copy. Not a sheet: it needs the whole roster. */
  AssignProgram: { templateId: string; name: string };
  /** 3c — the exercise library. */
  /**
   * `pickFor` turns the library into a picker: a row adds that exercise to the
   * program's day and pops, rather than opening it. `week` is which week of the
   * program the day belongs to — omitted means week 1.
   */
  Exercises: { pickFor?: { templateId: string; day: number; week?: number } } | undefined;
  /**
   * 3d — one exercise. `clientId` scopes the records and history to them, which
   * is what the tap map means by "per client when you arrive from a client".
   */
  Exercise: { exerciseId: string; clientId?: string };
  /** 4a — reports. */
  Reports: undefined;
  /** 4b — inside a metric. */
  Metric: { metric: 'delivered' | 'training'; range: '7d' | '30d' | 'year' };
  /** 7a · 7c — every weekly report that went out, and what happened to it. */
  Weekly: undefined;
  /**
   * 7a · 7b — one client's week, and sending it again.
   *
   * By report from the weekly list, or by client from their file, which resolves
   * to their most recent one. Two ways in because there are two questions:
   * "what went out on the 3rd?" and "what did Ravi last get?".
   */
  WeekReport: { reportId?: string; clientId?: string };
  /** 4c — adherence. */
  Adherence: undefined;
  /** 4d — the if/then rules. `tab` opens on Waiting when the badge is non-zero. */
  NudgeRules: { tab?: 'rules' | 'waiting' | 'sent' } | undefined;
  /** 5a — settings. */
  Settings: undefined;
  /** 5b — getting paid. */
  GettingPaid: undefined;
  /** 5c — notifications. */
  NotifySettings: undefined;
  /** 5d — help. */
  Help: undefined;
  /** 5e — sign out, which blocks on unsynced writes. */
  SignOut: undefined;
  /**
   * 8a–8c — what is waiting to reach the server, and why.
   *
   * Not a drawer destination. Every "Queued" tag in the app is its entry point,
   * which is the only way in that makes sense: nobody goes looking for a sync
   * queue, they tap the thing that told them something was queued.
   */
  SyncQueue: undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // The ground a pushed screen slides over, and what shows through
        // during the slide.
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="Home" component={AppTabs} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Soon" component={SoonScreen} />
      <Stack.Screen name="ClientSearch" component={ClientSearchScreen} />
      <Stack.Screen name="WorkingHours" component={WorkingHoursScreen} />
      <Stack.Screen name="AddClient" component={AddClientScreen} />
      <Stack.Screen name="AddClientPay" component={AddClientPayScreen} />
      <Stack.Screen name="ClientAdded" component={ClientAddedScreen} />
      <Stack.Screen name="ClientDetail" component={ClientFileScreen} />
      <Stack.Screen name="EditClient" component={EditClientScreen} />
      <Stack.Screen name="ClientEnd" component={ClientEndScreen} />
      <Stack.Screen name="BodyMetrics" component={BodyMetricsScreen} />
      <Stack.Screen name="ExercisePicker" component={ExercisePickerScreen} />
      <Stack.Screen name="ProgramList" component={ProgramListScreen} />
      <Stack.Screen name="ProgramDetail" component={ProgramDetailScreen} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} />
      <Stack.Screen name="LogPick" component={LogPickScreen} />
      <Stack.Screen name="WorkoutLog" component={LogScreen} />
      <Stack.Screen name="FinishSession" component={FinishScreen} />
      <Stack.Screen name="TodaysBests" component={TodaysBestsScreen} />
      <Stack.Screen name="SessionProgress" component={SessionProgressScreen} />
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} />
      <Stack.Screen name="PackageList" component={PackageListScreen} />
      <Stack.Screen name="PackageDetail" component={PackageDetailScreen} />
      <Stack.Screen name="MoneyOwed" component={OwedScreen} />
      <Stack.Screen name="MoneyBook" component={BookScreen} />
      <Stack.Screen name="MoneyPacks" component={MoneyPacksScreen} />
      <Stack.Screen name="MoneyGym" component={GymShareScreen} />

      {/* Screens 07–16 · behind the drawer */}
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="SelfTraining" component={SelfTrainingScreen} />
      <Stack.Screen name="Programs" component={ProgramsScreen} />
      <Stack.Screen name="Program" component={ProgramScreen} />
      <Stack.Screen name="AssignProgram" component={AssignProgramScreen} />
      <Stack.Screen name="Exercises" component={ExercisesScreen} />
      <Stack.Screen name="Exercise" component={ExerciseScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Metric" component={MetricScreen} />
      <Stack.Screen name="Weekly" component={WeeklyScreen} />
      <Stack.Screen name="WeekReport" component={WeekReportScreen} />
      <Stack.Screen name="Adherence" component={AdherenceScreen} />
      <Stack.Screen name="NudgeRules" component={NudgeRulesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="GettingPaid" component={GettingPaidScreen} />
      <Stack.Screen name="NotifySettings" component={NotifySettingsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="SignOut" component={SignOutScreen} />
      <Stack.Screen name="SyncQueue" component={SyncQueueScreen} />
    </Stack.Navigator>
  );
}
