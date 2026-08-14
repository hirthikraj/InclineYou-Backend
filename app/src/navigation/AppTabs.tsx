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

import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import HomeScreen from '../screens/main/HomeScreen';
import ClientsScreen from '../screens/main/clients/ClientsScreen';
import DiaryScreen from '../screens/main/diary/DiaryScreen';
import MoneyScreen from '../screens/main/money/MoneyScreen';
import AddSheet, { type AddAction } from '../screens/main/home/AddSheet';
import AppDrawer, { type DrawerKey } from '../screens/main/home/AppDrawer';
import ModeSheet from '../screens/main/drawer/ModeSheet';
import { isPaused } from '../api/auth';
import { database } from '../db';
import { useAuth } from '../store/AuthContext';
import type ClientModel from '../db/models/Client';
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
  /**
   * `book` opens the diary with the booking sheet already up — the designed way
   * to book (3a), which is a sheet on the diary rather than a screen of its own.
   * `clientId` pre-selects who, and `at` the slot; both optional, because "book
   * a session" from the + button knows neither.
   */
  DiaryTab: { book?: boolean; clientId?: string; at?: number } | undefined;
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
  const { memberships, switchLens } = useAuth();
  const [modeOpen, setModeOpen] = useState(false);
  const clientCount = useClientCount(modeOpen);

  const openAdd = (action: AddAction) => {
    shell.closeAdd();
    switch (action) {
      case 'workout':
        // One question — who — and then straight into the log. Not the session
        // list: the + was pressed to start logging, and a list of appointments
        // is an answer to a different question.
        navigation.navigate('LogPick');
        return;
      case 'session':
        navigation.navigate('Home', { screen: 'DiaryTab', params: { book: true } } as never);
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

  /**
   * Every drawer destination, and all seven are real screens now.
   *
   * Nudges opens on **Waiting** when the badge is non-zero — the tap map's rule,
   * and the right one: a number on a drawer item is a job, and the job is on the
   * second tab.
   */
  const openDrawerItem = (key: DrawerKey) => {
    switch (key) {
      case 'profile':
        navigation.navigate('Profile');
        return;
      case 'programs':
        navigation.navigate('Programs');
        return;
      case 'exercises':
        navigation.navigate('Exercises');
        return;
      case 'reports':
        navigation.navigate('Reports');
        return;
      case 'adherence':
        navigation.navigate('Adherence');
        return;
      case 'nudges':
        navigation.navigate('NudgeRules', {});
        return;
      case 'settings':
        navigation.navigate('Settings');
        return;
      case 'help':
        navigation.navigate('Help');
    }
  };

  /**
   * Sign-out is a screen, not an alert.
   *
   * An alert cannot say WHAT is unsynced, and "some records haven't reached the
   * server" is not enough to decide with — a queued nudge log is worth losing and
   * a recorded payment is not. §5e lists what is waiting and offers the safe path
   * first. This just gets there.
   */
  const confirmSignOut = () => {
    shell.closeDrawer();
    navigation.navigate('SignOut');
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
        onSwitchMode={() => setModeOpen(true)}
        onSignOut={confirmSignOut}
      />
      <AddSheet visible={shell.addOpen} onClose={shell.closeAdd} onPick={openAdd} />

      {/* 2b. Mounted in the shell rather than in the drawer, because the drawer
          closes to open it and a sheet inside a closing panel closes with it. */}
      <ModeSheet
        visible={modeOpen}
        clients={clientCount}
        onClose={() => setModeOpen(false)}
        onSwitched={(mode) => {
          setModeOpen(false);
          if (mode !== 'self') return;
          // FR-11 · the other half of the lens. A trainer who is also somebody's
          // client has a real book to switch into — their own plan, their own
          // sets, read from the client side of the same records. A trainer who
          // trains nobody's client still lands on the screen that says the
          // self-training contents are not built, because inventing a second
          // data model for them would be guessing.
          //
          // A live roster first. Since pause stopped being a wall, `memberships`
          // carries paused ones too — and dropping a trainer who trains with
          // somebody into the paused book they also have would be the wrong one
          // of the two. A paused roster is still worth opening when it is all
          // they have: the history is in it.
          const mine = memberships.find((m) => !isPaused(m)) ?? memberships[0];
          if (mine) void switchLens('client', mine.clientId);
          else navigation.navigate('SelfTraining');
        }}
      />
    </>
  );
}


/**
 * How many clients are on the roster, for the mode sheet's subtitle.
 *
 * Its own tiny hook, and gated on the sheet being open, because the shell is
 * mounted for the life of the app and a standing count for one line of copy in a
 * sheet nobody has opened is a subscription with no reader.
 */
function useClientCount(active: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    const sub = database
      .get<ClientModel>('clients')
      .query()
      .observeCount()
      .subscribe(setCount);
    return () => sub.unsubscribe();
  }, [active]);

  return count;
}
