/**
 * One appointment.
 *
 * The diary owns the *quick* version of this — tap a session in the day and a
 * sheet gives you Start, Move and the three didn't-train outcomes without
 * losing your place in the schedule. This screen is what the other doors open
 * onto: home's hero, the client file's session list. Those arrive from outside
 * the diary, with no day behind them to keep, so a screen is right and a sheet
 * would be a sheet over nothing.
 *
 * Start is the primary and it is the only large button, because on the day of,
 * at the time of, it is the only thing anybody wants. Move is one row deeper.
 * The two outcomes that end a session without training sit last and are
 * confirmed, since both of them touch the client's pack.
 *
 * Marking done is a **local** write — `endSession`, the same call the home
 * screen's End uses. One implementation of "session delivered", and it works on
 * a gym floor with no signal.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../navigation/MainStack';
import { scheduledSessionsCollection, findClientsByIds, endSession } from '../../db/sessions';
import { updateSession } from '../../api/sessions';
import { syncDatabase } from '../../db/sync';
import type ScheduledSession from '../../db/models/ScheduledSession';
import type Client from '../../db/models/Client';
import {
  AppBar,
  Avatar,
  Button,
  Control,
  Dialog,
  Empty,
  FieldLabel,
  IconBack,
  IconButton,
  IconCalendar,
  IconMove,
  IconPlay,
  Kv,
  KvRow,
  Reveal,
  Sheet,
  Skeleton,
  SkeletonCard,
  Tag,
  Toast,
  colors,
  space,
  type TagTone,
} from '../../design';

type Props = NativeStackScreenProps<MainStackParamList, 'SessionDetail'>;

const STATUS: Record<string, { label: string; tone: TagTone }> = {
  scheduled: { label: 'Booked', tone: 'accent' },
  done: { label: 'Delivered', tone: 'ok' },
  no_show: { label: 'No-show', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** The model stores a Date on some paths and epoch millis on others. */
function millis(at: Date | number): number {
  return at instanceof Date ? at.getTime() : Number(at);
}

function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export default function SessionDetailScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;

  const [session, setSession] = useState<ScheduledSession | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [ready, setReady] = useState(false);

  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [ending, setEnding] = useState<'no_show' | 'cancelled' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    try {
      const sub = scheduledSessionsCollection.findAndObserve(sessionId).subscribe({
        next: (next) => { if (live) { setSession(next); setReady(true); } },
        // The row was deleted on another device while this was open.
        error: () => { if (live) { setSession(null); setReady(true); } },
      });
      return () => { live = false; sub.unsubscribe(); };
    } catch {
      setReady(true);
      return () => { live = false; };
    }
  }, [sessionId]);

  useEffect(() => {
    const id = session?.clientId;
    if (!id) return;
    void findClientsByIds([id]).then((map) => setClient(map[id] ?? null));
  }, [session?.clientId]);

  const at = useMemo(() => (session ? millis(session.scheduledAt) : null), [session]);

  /** Seeds the move sheet from where the session is now, in local time. */
  const openMove = () => {
    if (at === null) return;
    const d = new Date(at);
    setDate(d.toLocaleDateString('en-CA')); // YYYY-MM-DD, without the UTC shift
    setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setMoving(true);
  };

  const move = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      setNotice('Use YYYY-MM-DD and HH:MM.');
      return;
    }
    const to = new Date(`${date}T${time}:00`).getTime();
    if (Number.isNaN(to)) {
      setNotice('That is not a real date and time.');
      return;
    }
    setBusy(true);
    try {
      await updateSession(sessionId, { scheduledAt: to });
      await syncDatabase('reschedule-session');
      setMoving(false);
      setNotice(`Moved to ${clock(to)} on ${longDate(to)}.`);
    } catch {
      setNotice('Could not move it. It stays where it was.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Done opens the log rather than closing the screen.
   *
   * `replace`, not `navigate`: nobody backs out of a workout into the
   * appointment they just started.
   */
  const start = async () => {
    setBusy(true);
    try {
      const workoutId = await endSession(sessionId);
      navigation.replace('WorkoutLog', {
        workoutId,
        programId: session?.programId || undefined,
        templateDay: session?.templateDay ?? undefined,
      });
    } catch {
      setNotice('Could not start the log.');
    } finally {
      setBusy(false);
    }
  };

  const close = async (status: 'no_show' | 'cancelled') => {
    setBusy(true);
    try {
      await updateSession(sessionId, { status });
      await syncDatabase('update-session-status');
      navigation.goBack();
    } catch {
      setNotice('Could not update it.');
    } finally {
      setBusy(false);
    }
  };

  const status = session ? (STATUS[session.status] ?? { label: session.status, tone: 'neutral' as TagTone }) : null;
  const booked = session?.status === 'scheduled';
  const name = client?.name ?? 'This client';

  if (ready && !session) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Session"
            leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          />
        </View>
        <Empty
          icon={IconCalendar}
          title="That session is gone"
          body="It was deleted, probably from another device. Anything already logged against it is still in the client's history."
          style={styles.empty}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={client?.name ?? 'Session'}
          subtitle={at !== null ? `${clock(at)} · ${longDate(at)}` : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={status ? <Tag label={status.label} tone={status.tone} /> : undefined}
        />
      </View>

      <Reveal ready={ready} skeleton={<SessionSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {session && at !== null ? (
            <>
              <Kv style={styles.kv}>
                <KvRow
                  label="Client"
                  value={name}
                  leading={client ? <Avatar name={client.name} size="sm" /> : undefined}
                />
                <KvRow label="Starts" value={clock(at)} detail={longDate(at)} />
                <KvRow
                  label="Runs for"
                  value={session.durationMinutes ? String(session.durationMinutes) : '—'}
                  suffix={session.durationMinutes ? 'min' : undefined}
                />
                {session.dayLabel ? <KvRow label="Plan day" value={session.dayLabel} /> : null}
                {session.notes ? <KvRow label="Note" value={session.notes} /> : null}
              </Kv>

              {booked ? (
                <>
                  <Button
                    label="Start the session"
                    icon={IconPlay}
                    variant="primary"
                    size="lg"
                    block
                    loading={busy && !moving && ending === null}
                    onPress={() => void start()}
                  />
                  <Button
                    label="Move it"
                    icon={IconMove}
                    variant="secondary"
                    block
                    onPress={openMove}
                    style={styles.second}
                  />

                  <Text style={styles.fine}>She didn&apos;t train?</Text>
                  <View style={styles.outcomes}>
                    <Button
                      label="No-show"
                      variant="ghost"
                      onPress={() => setEnding('no_show')}
                      style={styles.grow}
                    />
                    <Button
                      label="Cancelled"
                      variant="ghost"
                      onPress={() => setEnding('cancelled')}
                      style={styles.grow}
                    />
                  </View>
                </>
              ) : (
                <Text style={styles.fine}>
                  {session.status === 'done'
                    ? 'Delivered. The sets are on the client file, under their history.'
                    : 'This one is closed. Book another from the diary.'}
                </Text>
              )}
            </>
          ) : null}
        </ScrollView>
      </Reveal>

      <Sheet visible={moving} onClose={() => setMoving(false)} title="Move this session">
        <Text style={styles.meta}>
          {at !== null ? `Currently ${clock(at)} on ${longDate(at)}.` : ''} The client is not told —
          send them a message afterwards if the change matters to them.
        </Text>

        <View style={styles.fields}>
          <View style={styles.grow}>
            <FieldLabel>Date</FieldLabel>
            <Control value={date} onChangeText={setDate} placeholder="2026-08-20" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.grow}>
            <FieldLabel>Time · 24h</FieldLabel>
            <Control value={time} onChangeText={setTime} placeholder="07:00" keyboardType="numbers-and-punctuation" />
          </View>
        </View>

        <Button label="Move it" variant="primary" size="lg" block loading={busy} onPress={() => void move()} />
      </Sheet>

      <Dialog
        visible={ending !== null}
        title={ending === 'no_show' ? `Mark ${name} a no-show?` : 'Cancel this session?'}
        confirmLabel={ending === 'no_show' ? 'No-show' : 'Cancel it'}
        cancelLabel="Back"
        onCancel={() => setEnding(null)}
        onConfirm={() => {
          const outcome = ending;
          setEnding(null);
          if (outcome) void close(outcome);
        }}
      >
        {ending === 'no_show'
          ? 'The slot is spent — it comes off their pack, the same as a session they turned up for.'
          : 'The slot goes back. Nothing comes off their pack.'}
      </Dialog>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function SessionSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading this session">
      <SkeletonCard height={196} style={styles.skelCard} />
      <Skeleton height={52} style={styles.skelButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  kv: { marginTop: space.s4, marginBottom: space.s5 },
  second: { marginTop: space.s2 },
  outcomes: { flexDirection: 'row', gap: space.s2, marginTop: space.s2 },
  grow: { flex: 1 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s5 },
  empty: { marginTop: space.s7 },

  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  fields: { flexDirection: 'row', gap: space.s2, marginBottom: space.s5 },

  skelCard: { marginTop: space.s4 },
  skelButton: { marginTop: space.s5, borderRadius: 8 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
