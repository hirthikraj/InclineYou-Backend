/**
 * The four daily surfaces, and the shell that outlives them.
 *
 * Four tabs, not five: Apple says outright to avoid an overflow tab, and
 * Peloton — a company with real telemetry — renamed theirs away from "More"
 * because the word tells nobody anything. The hamburger IS the More, and
 * shipping both would be two doors to the same room.
 *
 * All four are designed screens now — home, the roster, the diary and the book.
 * Everything older than the design programme stays reachable from the drawer,
 * so nothing that worked yesterday stopped working.
 */

import React from 'react';
import { Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import HomeScreen from '../screens/main/HomeScreen';
import ClientsScreen from '../screens/main/clients/ClientsScreen';
import DiaryScreen from '../screens/main/diary/DiaryScreen';
import MoneyScreen from '../screens/main/money/MoneyScreen';
import AddSheet, { type AddAction } from '../screens/main/home/AddSheet';
import AppDrawer, { type DrawerKey } from '../screens/main/home/AppDrawer';
import { useAuth } from '../store/AuthContext';
import { useSyncState } from '../db/useSync';
import {
  NavBar,
  IconCalendar,
  IconHome,
  IconUsers,
  IconWallet,
  colors,
  motion,
  type NavTab,
} from '../design';
import { ShellProvider, useShell } from './AppShell';
import type { MainStackParamList } from './MainStack';

export type AppTabsParamList = {
  HomeTab: undefined;
  ClientsTab: undefined;
  DiaryTab: undefined;
  /** `record` opens the Money screen with the record sheet already up. */
  MoneyTab: { record?: boolean } | undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

const TABS: NavTab[] = [
  { key: 'HomeTab', label: 'Home', icon: IconHome },
  { key: 'ClientsTab', label: 'Clients', icon: IconUsers },
  { key: 'DiaryTab', label: 'Diary', icon: IconCalendar },
  { key: 'MoneyTab', label: 'Money', icon: IconWallet },
];

export default function AppTabs() {
  return (
    <ShellProvider>
      <Tabs />
    </ShellProvider>
  );
}

function Tabs() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const shell = useShell();
  const { signOut } = useAuth();
  const { hasPending } = useSyncState();

  const openAdd = (action: AddAction) => {
    shell.closeAdd();
    switch (action) {
      case 'workout':
        navigation.navigate('SessionList', {});
        return;
      case 'session':
        navigation.navigate('ScheduleSession', {});
        return;
      case 'client':
        navigation.navigate('AddClient');
        return;
      case 'payment':
        // §06's tap map: "Record a payment is the fourth item, and lands here."
        // It lands with the sheet already open — the + was pressed with the
        // intention already formed, and a screen to look at is not the ask.
        navigation.navigate('Home', { screen: 'MoneyTab', params: { record: true } } as never);
    }
  };

  const openDrawerItem = (key: DrawerKey) => {
    switch (key) {
      case 'exercises':
        navigation.navigate('ExercisePicker');
        return;
      case 'programs':
        navigation.navigate('TemplateList');
        return;
      case 'hours':
        navigation.navigate('WorkingHours');
        return;
      case 'packages':
        navigation.navigate('MoneyPacks');
        return;
      case 'payments':
        navigation.navigate('Home', { screen: 'MoneyTab' } as never);
        return;
      case 'nudges':
      case 'adherence':
        // Both are roster-wide views that don't exist yet, and both are
        // per-client today, so the roster is where they start.
        navigation.navigate('Clients');
        return;
      default:
        // profile · switch · reports · settings · help — none built yet.
        navigation.navigate('Soon', { title: TITLES[key] ?? 'Coming soon' });
    }
  };

  /**
   * Signing out wipes local storage, so anything still queued dies with it.
   * The warning is the whole point — a trainer who logged four sessions on a
   * gym floor with no signal must not lose them to a mistap in a drawer.
   */
  const confirmSignOut = () => {
    shell.closeDrawer();
    if (!hasPending) {
      void signOut();
      return;
    }
    Alert.alert(
      'Unsynced changes',
      "Some records haven't reached the server yet. Signing out now will lose them.",
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Sign out anyway', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          // A cut between tabs reads as a glitch; a short cross-fade reads as a
          // move. 180ms is the system's `fast` — long enough to be seen, short
          // enough that nobody waits for it.
          animation: 'fade',
          transitionSpec: { animation: 'timing', config: { duration: motion.fast } },
          // Both scenes are semi-transparent in the middle of a cross-fade, so
          // whatever is behind them is briefly visible. It has to be canvas.
          sceneStyle: { backgroundColor: colors.canvas },
          // Stops a tab that isn't on screen from re-rendering. Home holds a
          // ticking clock and eight database subscriptions; without this it
          // keeps doing that work behind whichever tab you switched to, on the
          // same frames that tab needs.
          freezeOnBlur: true,
        }}
        tabBar={({ state, navigation: tabNav }) =>
          // The roster's selection mode puts its own actions here (§ 03).
          shell.chromeHidden ? null : (
          <NavBar
            tabs={TABS}
            activeKey={state.routes[state.index].name}
            onSelect={(key) => {
              const active = state.routes[state.index].name === key;
              // § 04: tapping the active tab scrolls to top; a second tap
              // refreshes. Both are owned by the screen, which is why this
              // emits rather than navigating.
              if (active) {
                tabNav.emit({
                  type: 'tabPress',
                  target: state.routes[state.index].key,
                  canPreventDefault: true,
                });
              }
              else tabNav.navigate(key as never);
            }}
            onAdd={shell.openAdd}
          />
          )
        }
      >
        <Tab.Screen name="HomeTab" component={HomeScreen} />
        <Tab.Screen name="ClientsTab" component={ClientsScreen} />
        <Tab.Screen name="DiaryTab" component={DiaryScreen} />
        <Tab.Screen name="MoneyTab" component={MoneyScreen} />
      </Tab.Navigator>

      <AppDrawer
        visible={shell.drawerOpen}
        onClose={shell.closeDrawer}
        onNavigate={openDrawerItem}
        onSignOut={confirmSignOut}
      />
      <AddSheet visible={shell.addOpen} onClose={shell.closeAdd} onPick={openAdd} />
    </>
  );
}

const TITLES: Partial<Record<DrawerKey, string>> = {
  profile: 'Your profile',
  switch: 'My own training',
  reports: 'Reports',
  settings: 'Settings',
  help: 'Help',
};
