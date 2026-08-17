/**
 * 8a–8c · The sync queue.
 *
 * The destination every **Queued** tag in this app has been pointing at. A tag
 * that says a thing is waiting and cannot be tapped is a dead end, and the two
 * places it mattered most — a payment recorded in a basement gym, and sign-out
 * refusing to let go of one — both had nowhere to send anybody.
 *
 * Three states, and they are 8a, 8b and 8c:
 *
 *   · **8a · Waiting.** A grouped list of what is on this phone and not yet on
 *     the server, money first. Every row names the thing, not its table.
 *   · **8b · Clear.** Everything is up, with the time it last went. Not an
 *     apology and not a celebration — a receipt.
 *   · **8c · The last attempt failed.** The server's own words, then the same
 *     list underneath, because a failure changes the reason and nothing else:
 *     the work is still here, and the next attempt still carries it.
 *
 * ── What this screen refuses ──────────────────────────────────────────────
 *
 * **A per-row retry.** A push is one transaction — WatermelonDB sends the whole
 * dirty set or none of it — so a button offering to retry one payment would be
 * a lie about what happens when it is pressed. There is one Sync now, and it
 * does the only thing that exists.
 *
 * **A delete.** Every row here is work somebody did. The only way to lose one is
 * to undo it where it was made, where the trainer can see what they are undoing.
 */

import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { syncDatabase } from '../../../db/sync';
import { useSyncState } from '../../../db/useSync';
import { useQueue } from '../../../sync/useQueue';
import type { QueueKind, QueueRow } from '../../../sync/queue';
import { relativePast } from '../../../home/time';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Empty,
  GroupHead,
  IconAlert,
  IconBack,
  IconButton,
  IconCalendar,
  IconCheck,
  IconCloudOff,
  IconDumbbell,
  IconLayers,
  IconRefresh,
  IconSettings,
  IconUsers,
  IconWallet,
  List,
  Reveal,
  Row,
  Skeleton,
  SkeletonRow,
  SyncBand,
  SyncStamp,
  Tag,
  colors,
  radius,
  space,
  type IconProps,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const GROUP_ICON: Record<QueueKind, React.ComponentType<IconProps>> = {
  money: IconWallet,
  sessions: IconCalendar,
  training: IconDumbbell,
  clients: IconUsers,
  plans: IconLayers,
  setup: IconSettings,
};

export default function SyncQueueScreen() {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const sync = useSyncState();
  const { view, ready, reread } = useQueue(focused);

  const syncing = sync.phase === 'syncing';

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Sync queue"
          subtitle={ready ? view.subtitle : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <IconButton
              icon={IconRefresh}
              label="Sync now"
              bare
              onPress={() => void syncDatabase('queue')}
            />
          }
        />
      </View>

      {syncing ? <SyncBand label="Sending what is waiting…" style={styles.band} /> : null}

      <Reveal ready={ready} skeleton={<QueueSkeleton />} style={styles.reveal}>
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => {
                reread();
                void syncDatabase('queue-pull');
              }}
              tintColor={colors.ink3}
            />
          }
        >
          {view.total === 0 ? (
            /* 8b — and the stamp is the point of it. "Everything is on the
               server" without a time is a claim; with one it is evidence. */
            <>
              <Empty
                icon={IconCheck}
                iconColor={colors.ok}
                title="Everything is on the server"
                body="Nothing on this phone is waiting. Sign out, reinstall or lose the phone — none of it costs you a record."
                style={styles.empty}
              />
              {sync.lastSyncedAt ? (
                <SyncStamp style={styles.stamp}>
                  {`Last synced ${relativePast(sync.lastSyncedAt, Date.now()).toLowerCase()}`}
                </SyncStamp>
              ) : null}
            </>
          ) : (
            <>
              {/* 8c when it failed, the ordinary reason otherwise. Same slot —
                  a failure is not a different screen, it is a different why. */}
              {view.reason ? (
                <Callout
                  icon={view.failed ? IconAlert : IconCloudOff}
                  tone={view.failed ? 'accent' : 'neutral'}
                  style={styles.why}
                >
                  {view.failed ? <CalloutStrong tone="accent">Not through yet — </CalloutStrong> : null}
                  {view.reason}
                </Callout>
              ) : null}

              {view.groups.map((group) => (
                <View key={group.kind}>
                  <GroupHead
                    label={group.label}
                    count={group.rows.length}
                    tone={group.kind === 'money' ? 'alert' : 'default'}
                  />
                  <Text style={styles.note}>{group.note}</Text>
                  <List>
                    {group.rows.map((row) => (
                      <QueueItem key={row.key} row={row} icon={GROUP_ICON[group.kind]} />
                    ))}
                  </List>
                </View>
              ))}

              <View style={styles.foot}>
                <Button
                  label={syncing ? 'Sending…' : 'Sync now'}
                  variant="primary"
                  size="lg"
                  block
                  icon={IconRefresh}
                  loading={syncing}
                  onPress={() => void syncDatabase('queue')}
                />
                <Text style={styles.fine}>
                  You do not have to press this. XRep tries again when the app comes back to the
                  front and the moment the phone finds a connection.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </Reveal>
    </SafeAreaView>
  );
}

/**
 * One queued write.
 *
 * The tag says **Queued** rather than the action, because "created" and
 * "updated" are the database's words for it and a trainer has no use for the
 * difference. A delete is the exception — "Removed" is the whole row, and it
 * carries a neutral tag so a deletion never reads as an alert.
 */
function QueueItem({ row, icon: Icon }: { row: QueueRow; icon: React.ComponentType<IconProps> }) {
  const removed = row.action === 'deleted';
  return (
    <Row
      grouped
      leading={
        <View style={styles.icon}>
          <Icon size={17} color={colors.ink3} />
        </View>
      }
      title={row.title}
      subtitle={row.line || undefined}
      trailing={<Tag label={removed ? 'Removed' : 'Queued'} tone={removed ? 'neutral' : 'info'} />}
    />
  );
}

function QueueSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Reading what is waiting">
      <Skeleton height={62} round={radius.r2} style={styles.why} />
      <Skeleton width={96} height={10} style={styles.headGap} />
      <List>
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonRow key={i} grouped trailing />
        ))}
      </List>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  band: { marginHorizontal: space.inset },

  why: { marginTop: space.s3 },
  // Sits under the group head, above its list — the reason the group is a group.
  note: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.ink3,
    marginBottom: space.s3,
    marginTop: -space.s1,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  foot: { marginTop: space.s6, gap: space.s3 },
  fine: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, textAlign: 'center' },

  empty: { marginTop: space.s7 },
  stamp: { marginTop: space.s2 },
  headGap: { marginTop: space.s5, marginBottom: space.s3 },
});
