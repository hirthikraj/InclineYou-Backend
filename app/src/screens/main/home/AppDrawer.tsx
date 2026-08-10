/**
 * 3a · the navigation drawer.
 *
 * Grouped by frequency, most-used first, with Business at the top — the money
 * group is the thing every competitor buries on a desktop browser, and it is
 * the wedge. Nothing daily lives in here: the four tabs cover the daily
 * surfaces, and NN/g's finding is that hidden navigation is used 57% of the
 * time against 86% for a visible/hidden combination, so the rule is not "no
 * hamburger", it is "nothing daily behind one".
 *
 * Badges appear only where a number drives an action — money owed, unread
 * nudges — and the exercise count is the quiet variant because 873 is
 * information, not a job. Settings is never badged; a permanently badged
 * drawer teaches people to ignore badges.
 *
 * Queries are gated on `visible`: the drawer is mounted for the life of the
 * app, and four standing subscriptions for a panel nobody has opened is rent
 * with no tenant.
 */

import React, { useEffect, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { combineLatest, map } from 'rxjs';
import { database } from '../../../db';
import type ClientModel from '../../../db/models/Client';
import type PaymentModel from '../../../db/models/Payment';
import type ExerciseModel from '../../../db/models/Exercise';
import { loadDraft } from '../../../setup/draft';
import {
  Avatar,
  Drawer,
  DrawerItem,
  DrawerLabel,
  DrawerVersion,
  IconBadge,
  IconChart,
  IconChevron,
  IconDumbbell,
  IconLayers,
  IconLogout,
  IconMessage,
  IconRefresh,
  IconRupee,
  IconClock,
  IconSettings,
  IconShield,
  IconWallet,
  colors,
  radius,
} from '../../../design';

const DUE = new Set(['pending', 'due', 'unpaid', 'overdue']);

export interface DrawerCounts {
  clients: number;
  overdue: number;
  exercises: number;
}

const NO_COUNTS: DrawerCounts = { clients: 0, overdue: 0, exercises: 0 };

export interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Every destination the drawer can actually reach today. */
  onNavigate: (key: DrawerKey) => void;
  onSignOut: () => void;
}

export type DrawerKey =
  | 'profile'
  | 'switch'
  | 'payments'
  | 'packages'
  | 'reports'
  | 'programs'
  | 'exercises'
  | 'nudges'
  | 'adherence'
  | 'hours'
  | 'settings'
  | 'help';

export default function AppDrawer({ visible, onClose, onNavigate, onSignOut }: AppDrawerProps) {
  const [name, setName] = useState('');
  const [counts, setCounts] = useState<DrawerCounts>(NO_COUNTS);

  /**
   * Both effects wait for the opening animation to finish.
   *
   * They are what makes the drawer's content appear, and every one of them
   * lands a `setState` — a full re-render of the panel, its avatar and its
   * twelve rows. Run that while the panel is sliding and React is doing layout
   * work on the same frames the animation needs, which is felt as a stutter
   * halfway through the open. `runAfterInteractions` costs the name and the
   * badges a few hundred milliseconds; nobody is reading them mid-slide.
   */
  useEffect(() => {
    if (!visible) return;
    let live = true;
    const task = InteractionManager.runAfterInteractions(() => {
      void loadDraft().then((draft) => {
        if (live) setName(draft.name.trim());
      });
    });
    return () => {
      live = false;
      task.cancel();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let sub: { unsubscribe: () => void } | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      sub = subscribeCounts(setCounts);
    });
    return () => {
      task.cancel();
      sub?.unsubscribe();
    };
  }, [visible]);

  const go = (key: DrawerKey) => () => {
    onClose();
    onNavigate(key);
  };

  return (
    <Drawer
      visible={visible}
      onClose={onClose}
      header={
        <>
          {/* M3's documented drawer profile block — tapping it opens profile
              and business settings, which is where the gym and the split live. */}
          <Pressable
            onPress={go('profile')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.id, pressed && styles.pressed]}
          >
            <Avatar name={name} size="md" style={styles.idAvatar} />
            <View style={styles.idMain}>
              <Text numberOfLines={1} style={styles.idName}>
                {name || 'Your profile'}
              </Text>
              <Text numberOfLines={1} style={styles.idSub}>
                {counts.clients === 1 ? '1 client' : `${counts.clients} clients`}
              </Text>
            </View>
            <IconChevron size={18} color={colors.ink3} />
          </Pressable>

          <Pressable
            onPress={go('switch')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.switch, pressed && styles.pressed]}
          >
            <IconRefresh size={17} color={colors.ink2} />
            <Text style={styles.switchLabel}>Switch to my own training</Text>
          </Pressable>
        </>
      }
      footer={
        <>
          <DrawerItem icon={IconLogout} label="Sign out" onPress={onSignOut} />
          <DrawerVersion>{versionLine()}</DrawerVersion>
        </>
      }
    >
      <DrawerLabel>Business</DrawerLabel>
      <DrawerItem icon={IconRupee} label="Payments" badge={counts.overdue} onPress={go('payments')} />
      <DrawerItem icon={IconWallet} label="Packages" onPress={go('packages')} />
      <DrawerItem icon={IconChart} label="Reports" onPress={go('reports')} />

      <DrawerLabel>Training</DrawerLabel>
      <DrawerItem icon={IconLayers} label="Programs" onPress={go('programs')} />
      <DrawerItem
        icon={IconDumbbell}
        label="Exercises"
        badge={counts.exercises}
        quietBadge
        onPress={go('exercises')}
      />

      <DrawerLabel>Clients</DrawerLabel>
      {/* No badge on Nudges: there is no read state for one yet, and a count
          that can't be cleared is nagging rather than informing. */}
      <DrawerItem icon={IconMessage} label="Nudges" onPress={go('nudges')} />
      <DrawerItem icon={IconBadge} label="Adherence" onPress={go('adherence')} />

      <DrawerLabel>App</DrawerLabel>
      <DrawerItem icon={IconClock} label="When you work" onPress={go('hours')} />
      <DrawerItem icon={IconSettings} label="Settings" onPress={go('settings')} />
      <DrawerItem icon={IconShield} label="Help" onPress={go('help')} />
    </Drawer>
  );
}

/** The three counts the drawer badges, in one subscription. */
function subscribeCounts(onChange: (counts: DrawerCounts) => void) {
  return combineLatest([
    database.get<ClientModel>('clients').query().observe(),
    database.get<PaymentModel>('payments').query().observe(),
    database.get<ExerciseModel>('exercises').query().observe(),
  ])
    .pipe(
      map(([clients, payments, exercises]) => ({
        clients: clients.length,
        overdue: payments.filter((p) => DUE.has((p.status || '').toLowerCase())).length,
        exercises: exercises.length,
      })),
    )
    .subscribe(onChange);
}

/** Support asks for this every time, which is why the line is tappable to copy. */
function versionLine(): string {
  const config = Constants.expoConfig;
  const version = config?.version ?? '1.0.0';
  const build = config?.android?.versionCode ?? config?.ios?.buildNumber;
  return build ? `Train X ${version} (${build})` : `Train X ${version}`;
}

const styles = StyleSheet.create({
  id: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, width: '100%' },
  idAvatar: { width: 44, height: 44 },
  idMain: { flex: 1, minWidth: 0 },
  idName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.32, color: colors.ink },
  idSub: { fontSize: 12.5, color: colors.ink3, marginTop: 2 },

  switch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minHeight: 44,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
  },
  switchLabel: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.ink2 },

  pressed: { opacity: 0.7 },
});
