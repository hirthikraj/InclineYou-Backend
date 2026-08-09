/**
 * The honest placeholder.
 *
 * Clients, Diary and Money are each their own screen in the design programme
 * and none of them is drawn yet. A tab that silently does nothing is the worst
 * possible answer, and quietly hiding the tab would break the four-tab
 * information architecture the whole navigation argument rests on — so the tab
 * is real, it says what it will be, and where a working pre-design screen
 * already exists it hands you straight to it.
 *
 * This file is expected to be deleted, one route at a time.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import {
  AppBar,
  Button,
  Empty,
  IconBack,
  IconButton,
  IconCalendar,
  IconChart,
  IconRupee,
  IconUsers,
  colors,
  space,
  type IconProps,
} from '../../design';

type Stub = {
  title: string;
  body: string;
  icon: React.ComponentType<IconProps>;
  /** The pre-design screen that does this job today, if there is one. */
  existing?: { label: string; go: (nav: NativeStackNavigationProp<MainStackParamList>) => void };
};

const STUBS: Record<string, Stub> = {
  clients: {
    title: 'Clients',
    body: 'The roster, with the status chips and the search. Being designed next.',
    icon: IconUsers,
    existing: { label: 'Open the current roster', go: (nav) => nav.navigate('Clients') },
  },
  diary: {
    title: 'Diary',
    body: 'The week, the day, and rescheduling by drag. Being designed next.',
    icon: IconCalendar,
    existing: { label: 'Open the current calendar', go: (nav) => nav.navigate('Calendar', {}) },
  },
  money: {
    title: 'Money',
    body: 'Packages, payments and what each client owes — the thing every other platform locks to a desktop browser.',
    icon: IconRupee,
  },
};

const FALLBACK: Stub = {
  title: 'Coming soon',
  body: "This one isn't built yet. It'll land with its own screen in the design programme.",
  icon: IconChart,
};

type Props = {
  route?: RouteProp<Record<string, { tab?: string; title?: string } | undefined>, string>;
};

export default function SoonScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const params = route?.params;
  const stub = (params?.tab ? STUBS[params.tab] : undefined) ?? {
    ...FALLBACK,
    title: params?.title ?? FALLBACK.title,
  };
  // Pushed from the drawer rather than selected as a tab — it needs a way back.
  const pushed = !params?.tab;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.inset}>
        <AppBar
          title={stub.title}
          leading={
            pushed ? (
              <IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />
            ) : undefined
          }
        />
      </View>
      <View style={styles.body}>
        <Empty
          icon={stub.icon}
          title={stub.title}
          body={stub.body}
          action={
            stub.existing ? (
              <Button
                label={stub.existing.label}
                variant="secondary"
                onPress={() => stub.existing?.go(navigation)}
              />
            ) : undefined
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  inset: { paddingHorizontal: space.inset },
  body: { flex: 1, justifyContent: 'center' },
});
