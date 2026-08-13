/**
 * The client's four surfaces — Today · Log · Progress · Payments.
 *
 * Four labelled tabs and **no centre button**, which is the only structural
 * difference between the two halves of this app. A trainer creates four different
 * kinds of thing between sessions, so their bar has a create action in the
 * middle. A client creates one kind, in one place: every create action they have
 * is contextual and lives on the screen that owns it — the + in Progress logs a
 * body metric, the tick in the set table logs a set, Pay by UPI lives on
 * Payments. A global + would open a sheet with one item in it.
 *
 * Two IA nodes are deliberately not tabs. **Sessions** is four rows long for a
 * client with a 24-session pack, and a tab whose content is four rows is a wasted
 * tab — so it is pushed from Today's pack row, from the rest-day section head and
 * from the reschedule notice, which is how anybody actually arrives at it.
 * **The weekly report** happens once a week: it arrives as a notification on
 * Sunday and is reachable afterwards from Progress and the drawer.
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import TodayScreen from '../screens/client/TodayScreen';
import ClientLogScreen from '../screens/client/ClientLogScreen';
import ClientProgressScreen from '../screens/client/ClientProgressScreen';
import PaymentsScreen from '../screens/client/PaymentsScreen';
import ClientDrawer, { type ClientDrawerKey } from '../screens/client/ClientDrawer';
import {
  NavBar,
  IconChart,
  IconDumbbell,
  IconHome,
  IconWallet,
  colors,
  motion,
  type NavTab,
} from '../design';
import { ShellProvider, useShell } from './AppShell';
import type { ClientStackParamList } from './ClientStack';

export type ClientTabsParamList = {
  TodayTab: undefined;
  LogTab: undefined;
  ProgressTab: undefined;
  /** `pay` opens the UPI sheet straight away — one tap earlier, from Today's row. */
  PaymentsTab: { pay?: boolean } | undefined;
};

const Tab = createBottomTabNavigator<ClientTabsParamList>();

/**
 * The fourth key stays `money`-shaped so the bar matches the trainer's; the
 * label is Payments, because a client has a bill rather than a book.
 */
const TABS: NavTab[] = [
  { key: 'TodayTab', label: 'Today', icon: IconHome },
  { key: 'LogTab', label: 'Log', icon: IconDumbbell },
  { key: 'ProgressTab', label: 'Progress', icon: IconChart },
  { key: 'PaymentsTab', label: 'Payments', icon: IconWallet },
];

export default function ClientTabs() {
  return (
    <ShellProvider>
      <Tabs />
    </ShellProvider>
  );
}

function Tabs() {
  const navigation = useNavigation<NativeStackNavigationProp<ClientStackParamList>>();
  const shell = useShell();

  const openDrawerItem = (key: ClientDrawerKey) => {
    switch (key) {
      case 'profile':
        navigation.navigate('ClientProfile');
        return;
      case 'reports':
        navigation.navigate('Reports');
        return;
      case 'help':
        navigation.navigate('ClientHelp');
        return;
      case 'signOut':
        navigation.navigate('SignOut');
    }
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          transitionSpec: { animation: 'timing', config: { duration: motion.fast } },
          sceneStyle: { backgroundColor: colors.canvas },
          freezeOnBlur: true,
        }}
        tabBar={({ state, navigation: tabNav }) =>
          shell.chromeHidden ? null : (
            <NavBar
              tabs={TABS}
              activeKey={state.routes[state.index].name}
              onSelect={(key) => {
                const active = state.routes[state.index].name === key;
                // Tapping the active tab scrolls to top; a second tap syncs.
                // Both are owned by the screen, which is why this emits.
                if (active) {
                  tabNav.emit({
                    type: 'tabPress',
                    target: state.routes[state.index].key,
                    canPreventDefault: true,
                  });
                } else tabNav.navigate(key as never);
              }}
            />
          )
        }
      >
        <Tab.Screen name="TodayTab" component={TodayScreen} />
        <Tab.Screen name="LogTab" component={ClientLogScreen} />
        <Tab.Screen name="ProgressTab" component={ClientProgressScreen} />
        <Tab.Screen name="PaymentsTab" component={PaymentsScreen} />
      </Tab.Navigator>

      <ClientDrawer
        visible={shell.drawerOpen}
        onClose={shell.closeDrawer}
        onNavigate={openDrawerItem}
      />
    </>
  );
}
