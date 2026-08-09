/**
 * The four daily surfaces, and the shell that outlives them.
 *
 * Four tabs, not five: Apple says outright to avoid an overflow tab, and
 * Peloton — a company with real telemetry — renamed theirs away from "More"
 * because the word tells nobody anything. The hamburger IS the More, and
 * shipping both would be two doors to the same room.
 *
 * Home is designed. Clients, Diary and Money are stubs on purpose: each is its
 * own screen in the design programme and building them against the old UI now
 * would mean rebuilding them twice. The existing pre-design screens stay
 * reachable from the stub so nothing that worked yesterday stops working.
 */

import React from 'react';
import { Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import HomeScreen from '../screens/main/HomeScreen';
import SoonScreen from '../screens/main/SoonScreen';
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
  motion,
  type NavTab,
} from '../design';
import { ShellProvider, useShell } from './AppShell';
import type { MainStackParamList } from './MainStack';

export type AppTabsParamList = {
  HomeTab: undefined;
  /** The three stubs share one screen; the param picks which promise it makes. */
  ClientsTab: { tab: 'clients' };
  DiaryTab: { tab: 'diary' };
  MoneyTab: { tab: 'money' };
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
        // Payments hang off a package, which hangs off a client, so the roster
        // is the honest first step until the Money screen exists.
        navigation.navigate('Clients');
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
      case 'packages':
      case 'payments':
      case 'nudges':
      case 'adherence':
        // All four are roster-wide views that don't exist yet; every one of
        // them is per-client today, so the roster is where they start.
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
          // Stops a tab that isn't on screen from re-rendering. Home holds a
          // ticking clock and eight database subscriptions; without this it
          // keeps doing that work behind whichever tab you switched to, on the
          // same frames that tab needs.
          freezeOnBlur: true,
        }}
        tabBar={({ state, navigation: tabNav }) => (
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
        )}
      >
        <Tab.Screen name="HomeTab" component={HomeScreen} />
        <Tab.Screen name="ClientsTab" component={SoonScreen} initialParams={{ tab: 'clients' }} />
        <Tab.Screen name="DiaryTab" component={SoonScreen} initialParams={{ tab: 'diary' }} />
        <Tab.Screen name="MoneyTab" component={SoonScreen} initialParams={{ tab: 'money' }} />
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
