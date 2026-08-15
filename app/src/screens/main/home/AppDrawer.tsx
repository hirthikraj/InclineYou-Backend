/**
 * 1a · the navigation drawer, corrected.
 *
 * ── Two destinations removed, and why ─────────────────────────────────────
 *
 * When this drawer was first built, **Payments** and **Packages** had nowhere
 * else to live. The Money tab now contains both — the ledger, the chase list and
 * the packs you sell. The Clients screen set the rule out loud: **the drawer must
 * not be a second route to something a tab already owns**, which is why Weekly
 * slots moved into the Diary. The same rule applies here, so both are gone.
 *
 * The remaining seven regroup into **Training · Growth · App**. Groups of one are
 * gone with them: Reports and Adherence now sit with Nudges under Growth, which
 * is what all three are for.
 *
 * ── And the mode switch, for now ──────────────────────────────────────────
 *
 * "Switch to my own training" sat in the header block between the profile and
 * the destinations. It is hidden behind `SELF_TRAINING_ENABLED` — see the note
 * on that constant. Hidden rather than shown-and-refused, the same way batches
 * are: the header is the first thing read on every drawer open, and a row there
 * that leads to "not built yet" is the app admitting it is unfinished before
 * the trainer has reached anything they came for.
 *
 * ── Badges ────────────────────────────────────────────────────────────────
 *
 * Only where a number drives an action. Nudges carries how many drafts are
 * waiting, which is a job. Exercises carries the library size as the quiet
 * variant, because 873 is information. Settings is never badged — a permanently
 * badged drawer teaches people to ignore badges.
 *
 * Queries are gated on `visible`: the drawer is mounted for the life of the app,
 * and standing subscriptions for a panel nobody has opened is rent with no tenant.
 */

import React, { useEffect, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { combineLatest, map } from 'rxjs';
import { database } from '../../../db';
import type ClientModel from '../../../db/models/Client';
import type ExerciseModel from '../../../db/models/Exercise';
import type NudgeRuleModel from '../../../db/models/NudgeRule';
import type ScheduledSessionModel from '../../../db/models/ScheduledSession';
import type PackageModel from '../../../db/models/Package';
import type PaymentModel from '../../../db/models/Payment';
import type NudgeLogModel from '../../../db/models/NudgeLog';
import { buildWaiting, type NudgeInput } from '../../../nudges/rules';
import { loadDraft } from '../../../setup/draft';
import { SELF_TRAINING_ENABLED } from '../../../settings/prefs';
import { usePrefs } from '../../../settings/usePrefs';
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
  IconSettings,
  IconShield,
  colors,
  radius,
} from '../../../design';

export interface DrawerCounts {
  clients: number;
  exercises: number;
  /** How many nudge drafts are waiting. A job, so it gets the loud badge. */
  waiting: number;
}

const NO_COUNTS: DrawerCounts = { clients: 0, exercises: 0, waiting: 0 };

export interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Every destination the drawer reaches. All seven are built. */
  onNavigate: (key: DrawerKey) => void;
  /** Optional while `SELF_TRAINING_ENABLED` is off — nothing can call it. */
  onSwitchMode?: () => void;
  onSignOut: () => void;
}

/**
 * The eight interactions: the profile block, seven destinations and sign out —
 * plus the mode switch when self-training is switched back on. Payments and
 * Packages are deliberately absent; see the note at the top.
 */
export type DrawerKey =
  | 'profile'
  | 'programs'
  | 'exercises'
  | 'reports'
  | 'adherence'
  | 'nudges'
  | 'settings'
  | 'help';

export default function AppDrawer({
  visible,
  onClose,
  onNavigate,
  onSwitchMode,
  onSignOut,
}: AppDrawerProps) {
  const [name, setName] = useState('');
  const [counts, setCounts] = useState<DrawerCounts>(NO_COUNTS);
  const { prefs } = usePrefs();

  /**
   * Both effects wait for the opening animation to finish.
   *
   * They are what makes the drawer's content appear, and every one of them lands
   * a `setState` — a full re-render of the panel, its avatar and its rows. Run
   * that while the panel is sliding and React is doing layout work on the same
   * frames the animation needs, which is felt as a stutter halfway through the
   * open. `runAfterInteractions` costs the name and the badges a few hundred
   * milliseconds; nobody is reading them mid-slide.
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

  const self = prefs.mode === 'self';

  return (
    <Drawer
      visible={visible}
      onClose={onClose}
      header={
        <>
          {/* M3's documented drawer profile block. The chevron is a cue, not a
              second control — it goes to the same place the block does. */}
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

          {SELF_TRAINING_ENABLED ? (
            <Pressable
              onPress={() => {
                onClose();
                onSwitchMode?.();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.switch, pressed && styles.pressed]}
            >
              <IconRefresh size={17} color={colors.ink2} />
              <Text style={styles.switchLabel}>
                {self ? 'Switch back to coaching' : 'Switch to my own training'}
              </Text>
            </Pressable>
          ) : null}
        </>
      }
      footer={
        <>
          <DrawerItem icon={IconLogout} label="Sign out" onPress={onSignOut} />
          <DrawerVersion>{versionLine()}</DrawerVersion>
        </>
      }
    >
      <DrawerLabel>Training</DrawerLabel>
      <DrawerItem icon={IconLayers} label="Programs" onPress={go('programs')} />
      <DrawerItem
        icon={IconDumbbell}
        label="Exercises"
        badge={counts.exercises}
        quietBadge
        onPress={go('exercises')}
      />

      <DrawerLabel>Growth</DrawerLabel>
      <DrawerItem icon={IconChart} label="Reports" onPress={go('reports')} />
      <DrawerItem icon={IconBadge} label="Adherence" onPress={go('adherence')} />
      <DrawerItem icon={IconMessage} label="Nudges" badge={counts.waiting} onPress={go('nudges')} />

      <DrawerLabel>App</DrawerLabel>
      <DrawerItem icon={IconSettings} label="Settings" onPress={go('settings')} />
      <DrawerItem icon={IconShield} label="Help" onPress={go('help')} />
    </Drawer>
  );
}

/**
 * The counts the drawer shows, in one subscription.
 *
 * The waiting count is the expensive one — it derives every draft from six tables
 * — which is exactly why this is gated on `visible` and deferred past the slide.
 * It is also the only honest way to badge Nudges: a stored queue would let the
 * badge claim work that was already done.
 */
function subscribeCounts(onChange: (counts: DrawerCounts) => void) {
  return combineLatest([
    database.get<ClientModel>('clients').query().observeWithColumns(['name', 'phone', 'status']),
    database.get<ExerciseModel>('exercises').query().observe(),
    database.get<NudgeRuleModel>('nudge_rules').query().observeWithColumns(['enabled', 'threshold', 'action', 'message', 'kind']),
    database
      .get<ScheduledSessionModel>('scheduled_sessions')
      .query()
      .observeWithColumns(['scheduled_at', 'status']),
    database
      .get<PackageModel>('packages')
      .query()
      .observeWithColumns(['sessions_remaining', 'amount', 'status', 'due_date', 'written_off_at']),
    database.get<PaymentModel>('payments').query().observeWithColumns(['amount', 'status', 'paid_at']),
    database.get<NudgeLogModel>('nudge_logs').query().observeWithColumns(['sent_at', 'status']),
  ])
    .pipe(
      map(([clients, exercises, rules, sessions, packages, payments, logs]) => {
        const input: NudgeInput = { rules, clients, sessions, packages, payments, logs };
        return {
          clients: clients.length,
          exercises: exercises.length,
          waiting: buildWaiting(input, Date.now()).length,
        };
      }),
    )
    .subscribe(onChange);
}

/** Support asks for this every time. Tapping it shares it. */
function versionLine(): string {
  const config = Constants.expoConfig;
  const version = config?.version ?? '1.0.0';
  const build = config?.android?.versionCode ?? config?.ios?.buildNumber;
  return build ? `XRep ${version} (${build})` : `XRep ${version}`;
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
