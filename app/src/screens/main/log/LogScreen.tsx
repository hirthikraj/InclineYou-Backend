/**
 * Screen 17 · § 01 — the floor screen.
 *
 * The log opens from a booked session and takes the whole phone. No tab bar, no
 * hamburger: mid-session there is nowhere else to be, so this is a **mode, not a
 * tab**. One exercise is expanded and the rest are rows, so the thing under your
 * thumb is always the thing you are doing — which is the one lesson worth taking
 * from Jefit, and it is a negative one.
 *
 * ── What holds the numbers, and why it is not all in the database ─────────
 *
 * A logged set lives in `set_logs` and nowhere else. An **un**logged row holds
 * whatever has been typed into it, and that lives here in `drafts` for the
 * length of the visit. It is not written down, on purpose: §09 says last
 * session's numbers are placeholders and never values, and until somebody taps
 * the tick the log has not claimed a weight nobody lifted. A half-typed row
 * survives a keyboard dismissal and a scroll; it does not survive leaving the
 * session, and it should not.
 *
 * ── The tick ──────────────────────────────────────────────────────────────
 *
 * On an empty row it accepts the Previous numbers exactly as shown — one tap for
 * a set that went to plan. On a green row it un-ticks and the numbers stay put.
 * Either way it is a local write that returns in the same frame; nothing on this
 * screen waits for the network, and there is no skeleton anywhere in a session
 * because every number here is already on the phone.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useLog } from '../../../log/useLog';
import { buildLog, type LogExerciseView, type LogInput, type LogView } from '../../../log/log';
import {
  addSetSlot,
  deleteSet,
  discardLog,
  logSet,
  removeExercise,
  restoreExercise,
  seedLogFromPlan,
  untickSet,
  updateSet,
} from '../../../db/log';
import { useSyncState } from '../../../db/useSync';
import SetSheet, { type SetSpec } from './SetSheet';
import AddExerciseSheet from './AddExerciseSheet';
import SwapSheet from './SwapSheet';
import SessionMenuSheet from './SessionMenuSheet';
import RestSheet from './RestSheet';
import {
  AppBar,
  Banner,
  Button,
  Callout,
  CalloutStrong,
  Card,
  Dock,
  Empty,
  IconBack,
  IconButton,
  IconChart,
  IconCheck,
  IconChevron,
  IconCloudOff,
  IconClock,
  IconDots,
  IconDumbbell,
  IconLayers,
  IconPlus,
  IconRepeat,
  PrCard,
  Pulse,
  RestTimer,
  Row,
  SetNote,
  SetRow,
  Sets,
  SetsHead,
  SwipeRow,
  Tag,
  Toast,
  colors,
  radius,
  space,
  tnum,
  type,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'WorkoutLog'>;

/** A slot's identity across renders: exercise plus set number, never an index. */
const slotKey = (exerciseId: string, n: number) => `${exerciseId}:${n}`;

interface Draft {
  load: string;
  reps: string;
}

interface Rest {
  exerciseId: string;
  total: number;
  endsAt: number;
}

interface Notice {
  text: string;
  action?: { label: string; onPress: () => void };
}

export default function LogScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { input } = useLog();
  const sync = useSyncState();
  const network = useNetworkState();

  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rest, setRest] = useState<Rest | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);

  const [setSpec, setSetSpec] = useState<SetSpec | null>(null);
  const [adding, setAdding] = useState(false);
  /** The card being replaced, and — when the picker chose first — what with. */
  const [swapping, setSwapping] = useState<{ target: LogExerciseView; to: string | null } | null>(null);
  const [menu, setMenu] = useState(false);
  const [resting, setResting] = useState<LogExerciseView | null>(null);

  const view = useMemo(
    () => buildLog(input, params.workoutId, now),
    [input, params.workoutId, now],
  );

  const offline = network.isConnected === false || network.isInternetReachable === false;

  /* ---------------------------------------------------------------- clocks */

  // One second, and only while the screen is in front. The session clock and
  // the rest bar are the only two things on this screen that move on their own.
  useFocusEffect(
    useCallback(() => {
      const tick = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(tick);
    }, []),
  );

  useEffect(() => {
    if (!rest) return;
    const left = Math.max(0, Math.round((rest.endsAt - now) / 1000));
    setRemaining(left);
    if (left === 0) setRest(null);
  }, [rest, now]);

  /* ------------------------------------------------------- the plan, once */

  useEffect(() => {
    void seedLogFromPlan(params.workoutId, params.programId, params.templateDay);
  }, [params.workoutId, params.programId, params.templateDay]);

  // The exercise under the thumb: the first one still unfinished. Chosen once
  // per arrival rather than tracked, so finishing an exercise does not snatch
  // the screen away while the trainer is still reading it.
  useEffect(() => {
    if (openId !== null || !view) return;
    const next = view.exercises.find((e) => !e.complete) ?? view.exercises[0];
    if (next) setOpenId(next.id);
  }, [view, openId]);

  /* --------------------------------------------------------------- writing */

  const draftFor = (exerciseId: string, n: number, fallback: Draft): Draft =>
    drafts[slotKey(exerciseId, n)] ?? fallback;

  const setDraft = (exerciseId: string, n: number, patch: Partial<Draft>) => {
    const key = slotKey(exerciseId, n);
    setDrafts((held) => {
      const current = held[key] ?? { load: '', reps: '' };
      return { ...held, [key]: { ...current, ...patch } };
    });
  };

  const clearDraft = (exerciseId: string, n: number) => {
    const key = slotKey(exerciseId, n);
    setDrafts((held) => {
      if (!(key in held)) return held;
      const next = { ...held };
      delete next[key];
      return next;
    });
  };

  const startRest = (exercise: LogExerciseView) => {
    if (!exercise.restSeconds) return;
    setRest({
      exerciseId: exercise.exerciseId,
      total: exercise.restSeconds,
      endsAt: Date.now() + exercise.restSeconds * 1000,
    });
  };

  /**
   * The tick.
   *
   * Empty row: take what is typed, and fall back to Previous for anything that
   * is not — that is the one-tap fast path, and it is the reason the Previous
   * column earns its width. Green row: un-tick, and put the numbers back into
   * the row as a draft so nothing disappears under the thumb.
   */
  const toggle = async (exercise: LogExerciseView, n: number) => {
    const row = exercise.sets.find((s) => s.number === n);
    if (!row) return;

    if (row.done && row.setId) {
      setDraft(exercise.exerciseId, n, { load: row.load, reps: row.reps });
      await untickSet(row.setId);
      if (rest?.exerciseId === exercise.exerciseId) setRest(null);
      return;
    }

    const draft = draftFor(exercise.exerciseId, n, { load: '', reps: '' });
    const load = draft.load.trim() || (row.previousLoad != null ? String(row.previousLoad) : '');
    const reps = draft.reps.trim() || (row.previousReps != null ? String(row.previousReps) : '');

    const repsValue = Number.parseInt(reps, 10);
    if (!Number.isFinite(repsValue) || repsValue <= 0) {
      setNotice({ text: 'How many reps? Nothing to log without that.' });
      return;
    }
    const loadValue = Number.parseFloat(load);

    await logSet(params.workoutId, exercise.exerciseId, n, {
      loadKg: exercise.logType === 'reps' || !Number.isFinite(loadValue) ? null : loadValue,
      reps: repsValue,
    });
    clearDraft(exercise.exerciseId, n);
    startRest(exercise);
  };

  /** Committed when the field loses focus, so a logged set edits in place. */
  const commit = async (exercise: LogExerciseView, n: number) => {
    const row = exercise.sets.find((s) => s.number === n);
    if (!row?.done || !row.setId) return;
    const draft = drafts[slotKey(exercise.exerciseId, n)];
    if (!draft) return;

    const load = Number.parseFloat(draft.load);
    const reps = Number.parseInt(draft.reps, 10);
    await updateSet(row.setId, {
      loadKg: Number.isFinite(load) ? load : null,
      reps: Number.isFinite(reps) ? reps : null,
    });
    clearDraft(exercise.exerciseId, n);
  };

  const removeSet = async (exercise: LogExerciseView, n: number) => {
    const row = exercise.sets.find((s) => s.number === n);
    if (!row?.setId) return;
    await deleteSet(row.setId);
    setNotice({ text: `Set ${n} deleted · sets renumbered` });
  };

  const dropExercise = async (exercise: LogExerciseView) => {
    await removeExercise(exercise.id);
    if (openId === exercise.id) setOpenId(null);
    setNotice({
      text: `${exercise.name} taken out of today`,
      action: { label: 'Undo', onPress: () => void restoreExercise(exercise.id) },
    });
  };

  /**
   * The only destructive action on this screen, and the only one that asks
   * first. Everything else is undo-after; twenty confirmations a session is a
   * different app.
   */
  const discard = () => {
    Alert.alert(
      'Discard this session?',
      'Every set logged this morning goes with it. The appointment itself stays in the diary.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            void discardLog(params.workoutId).then(() => navigation.goBack());
          },
        },
      ],
    );
  };

  /* ---------------------------------------------------------------- render */

  if (!view) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Workout log"
            leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          />
        </View>
        <Empty
          icon={IconDumbbell}
          title="That session isn't on this phone"
          body="It may have been discarded, or it hasn't synced across yet."
          style={styles.empty}
        />
      </SafeAreaView>
    );
  }

  const elapsed = (pausedAt ?? now) - view.startedAt;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view.clientName}
          subtitle={view.plan ?? 'No program assigned'}
          // The clock is passed apart so truncation eats the program name and
          // never the running figure. See `subtitleAside` in AppBar.
          subtitleAside={clock(elapsed)}
          onSubtitlePress={() => setPausedAt(pausedAt === null ? Date.now() : null)}
          leading={
            <IconButton
              icon={IconBack}
              label="Back"
              bare
              onPress={() => navigation.goBack()}
              // §07: the back arrow leaves and the session keeps running. The
              // long press is the only way to throw it away.
              onLongPress={discard}
            />
          }
          actions={
            <>
              <IconButton
                icon={offline ? IconCloudOff : IconChart}
                label={offline ? 'Waiting to sync' : 'Progress'}
                bare
                color={offline ? colors.warn : colors.ink2}
                onPress={() =>
                  offline
                    ? setNotice({
                        text: sync.pendingCount
                          ? `${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} on this phone. They go up when the bars come back.`
                          : 'Nothing waiting. Everything here is on the server.',
                      })
                    : navigation.navigate('SessionProgress', { clientId: view.clientId })
                }
              />
              <IconButton icon={IconDots} label="Session menu" bare onPress={() => setMenu(true)} />
            </>
          }
        />
      </View>

      {offline ? (
        <View style={styles.pad}>
          <Banner tone="offline" icon={IconCloudOff}>
            Offline — everything still works.
            {sync.pendingCount ? ` ${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} waiting.` : ''}
          </Banner>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {view.emptyPlan ? (
          <NoPlan view={view} onAdd={() => setAdding(true)} navigation={navigation} />
        ) : (
          <>
            <View style={styles.stick}>
              <Text style={styles.stickLabel}>Exercises</Text>
              <Text style={styles.stickCount}>{view.stick}</Text>
            </View>

            {view.exercises.map((exercise) => {
              const open = exercise.id === openId;
              const record = view.records.find((r) => r.exerciseId === exercise.exerciseId) ?? null;

              if (!open) {
                return (
                  <SwipeRow
                    key={exercise.id}
                    action={{ label: 'Remove' }}
                    onAction={() => void dropExercise(exercise)}
                    style={styles.collapsed}
                  >
                    <Row
                      // A done exercise mid-session keeps full contrast. §09: a
                      // done session in the diary is history and dims; a done
                      // exercise is what you scroll back to check.
                      spine={exercise.complete ? 'done' : exercise.started ? 'now' : 'idle'}
                      title={exercise.name}
                      subtitle={exercise.started ? exercise.summary : exercise.last}
                      onPress={() => setOpenId(exercise.id)}
                      trailing={
                        <View style={styles.value}>
                          <Text style={styles.valueTop}>{exercise.value.top}</Text>
                          <Text style={styles.valueBottom}>{exercise.value.bottom}</Text>
                        </View>
                      }
                    />
                  </SwipeRow>
                );
              }

              return (
                <View key={exercise.id} style={styles.openBlock}>
                  {/* One glow per screen: the card gives it up the moment a
                      record lands, so the gold is the only live thing. */}
                  <Card live={!record} style={styles.head}>
                    <View style={styles.headRow}>
                      {!record ? <Pulse /> : null}
                      <View style={styles.headText}>
                        <Text style={styles.headName} numberOfLines={2}>
                          {exercise.name}
                        </Text>
                        <Text style={styles.headMeta} numberOfLines={1}>
                          {exercise.last}
                        </Text>
                      </View>
                      {exercise.unplanned ? <Tag label="Unplanned" /> : null}
                      <IconButton
                        icon={IconDots}
                        label="Exercise menu"
                        bare
                        onPress={() => setResting(exercise)}
                      />
                    </View>
                    {exercise.swappedFrom ? (
                      <Text style={styles.swapped}>Instead of {exercise.swappedFrom}</Text>
                    ) : null}
                  </Card>

                  <Sets style={styles.sets}>
                    <SetsHead
                      load={exercise.logType === 'reps' ? '—' : 'kg'}
                      reps="Reps"
                    />
                    {exercise.sets.flatMap((row) => {
                      const draft = draftFor(exercise.exerciseId, row.number, {
                        load: row.load,
                        reps: row.reps,
                      });
                      const nextUp =
                        !row.done && exercise.sets.filter((s) => !s.done)[0]?.number === row.number;

                      const node = (
                        <SetRow
                          key={`set-${row.number}`}
                          number={row.number}
                          previous={row.previous}
                          load={draft.load}
                          reps={draft.reps}
                          onLoad={(v) => setDraft(exercise.exerciseId, row.number, { load: v })}
                          onReps={(v) => {
                            setDraft(exercise.exerciseId, row.number, { reps: v });
                          }}
                          done={row.done}
                          onToggle={() => void toggle(exercise, row.number)}
                          next={nextUp && rest?.exerciseId === exercise.exerciseId}
                          queued={row.queued}
                          pr={row.pr}
                          onCommit={() => void commit(exercise, row.number)}
                          onFillFromPrevious={() =>
                            setDraft(exercise.exerciseId, row.number, {
                              load: row.previousLoad != null ? String(row.previousLoad) : '',
                              reps: row.previousReps != null ? String(row.previousReps) : '',
                            })
                          }
                          onLongPress={() =>
                            setSetSpec({
                              workoutId: params.workoutId,
                              exerciseId: exercise.exerciseId,
                              exerciseName: exercise.name,
                              logType: exercise.logType,
                              setNumber: row.number,
                              setId: row.setId,
                              load: draft.load,
                              reps: draft.reps,
                              rpe: row.rpe,
                              note: row.note,
                              onDelete: row.setId ? () => void removeSet(exercise, row.number) : undefined,
                            })
                          }
                        />
                      );

                      // The note belongs inside the table, under its set — it is
                      // read next week with the same set under your thumb, which
                      // is the one thing TrueCoach got righter than anybody.
                      return row.note
                        ? [
                            node,
                            <SetNote
                              key={`note-${row.number}`}
                              text={row.note}
                              onPress={() =>
                                setSetSpec({
                                  workoutId: params.workoutId,
                                  exerciseId: exercise.exerciseId,
                                  exerciseName: exercise.name,
                                  logType: exercise.logType,
                                  setNumber: row.number,
                                  setId: row.setId,
                                  load: draft.load,
                                  reps: draft.reps,
                                  rpe: row.rpe,
                                  note: row.note,
                                  focusNote: true,
                                })
                              }
                            />,
                          ]
                        : [node];
                    })}
                  </Sets>

                  {rest && rest.exerciseId === exercise.exerciseId ? (
                    <>
                      <RestTimer
                        remaining={remaining}
                        total={rest.total}
                        onAdjust={(delta) =>
                          setRest((r) => (r ? { ...r, endsAt: r.endsAt + delta * 1000 } : r))
                        }
                        style={styles.timer}
                      />
                      <Text style={styles.timerNote}>
                        Rest {rest.total}s — set for {exercise.name.toLowerCase()}, not for the app.
                      </Text>
                    </>
                  ) : null}

                  <Button
                    label="Add set"
                    variant="secondary"
                    block
                    icon={IconPlus}
                    onPress={() => void addSetSlot(exercise.id)}
                    style={styles.addSet}
                  />

                  {record ? (
                    <PrCard
                      setLabel={record.setLabel}
                      value={record.value}
                      unit={record.unit}
                      was={record.was}
                      delta={record.delta}
                      why={record.why}
                      quiet={!record.announced}
                      onPress={() =>
                        navigation.navigate('ExerciseHistory', {
                          clientId: view.clientId,
                          exerciseId: exercise.exerciseId,
                        })
                      }
                      style={styles.pr}
                    />
                  ) : null}
                </View>
              );
            })}

            <Button
              label="Add an exercise"
              variant="secondary"
              block
              icon={IconPlus}
              onPress={() => setAdding(true)}
              style={styles.addExercise}
            />

            {offline ? (
              <Callout icon={IconCloudOff} style={styles.note}>
                The amber ring means the set is on this phone and not yet on the server.{' '}
                <CalloutStrong>Nothing here waits for the network</CalloutStrong> — the tick writes
                locally and returns in the same frame.
              </Callout>
            ) : null}

            {sync.pendingCount > 0 ? (
              <View style={styles.synced}>
                <IconClock size={14} color={colors.ink3} />
                <Text style={styles.syncedText}>
                  {sync.pendingCount} change{sync.pendingCount === 1 ? '' : 's'} on this phone
                  {sync.lastSyncedAt ? ` · last synced ${hhmm(sync.lastSyncedAt)}` : ''}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {notice ? (
        <View style={styles.toastDock} pointerEvents="box-none">
          <Toast
            action={
              notice.action
                ? {
                    label: notice.action.label,
                    onPress: () => {
                      notice.action?.onPress();
                      setNotice(null);
                    },
                  }
                : { label: 'Dismiss', onPress: () => setNotice(null) }
            }
          >
            {notice.text}
          </Toast>
        </View>
      ) : null}

      <Dock>
        <Button
          label="Finish session"
          variant="primary"
          size="lg"
          block
          onPress={() => navigation.navigate('FinishSession', { workoutId: params.workoutId })}
        />
      </Dock>

      <SetSheet
        spec={setSpec}
        onClose={() => setSetSpec(null)}
        onSaved={(n) => clearDraft(setSpec?.exerciseId ?? '', n)}
      />
      <AddExerciseSheet
        visible={adding}
        workoutId={params.workoutId}
        clientId={view.clientId}
        clientName={view.clientName}
        input={input}
        already={new Set(view.exercises.map((e) => e.exerciseId))}
        openName={view.exercises.find((e) => e.id === openId)?.name ?? null}
        onClose={() => setAdding(false)}
        onSwapInstead={(exerciseId) => {
          setAdding(false);
          const target = view.exercises.find((e) => e.id === openId) ?? null;
          if (target) setSwapping({ target, to: exerciseId });
          else setNotice({ text: 'Open the exercise you want to replace first, then swap it.' });
        }}
      />
      <SwapSheet
        swap={swapping}
        input={input}
        clientId={view.clientId}
        clientName={view.clientName}
        already={new Set(view.exercises.map((e) => e.exerciseId))}
        clientCount={swapCount(view, input)}
        onClose={() => setSwapping(null)}
        onDone={(name) => {
          setSwapping(null);
          setNotice({ text: `${name} swapped in for today.` });
        }}
        onRefused={(text) => {
          setSwapping(null);
          setNotice({ text });
        }}
      />
      <SessionMenuSheet
        visible={menu}
        view={view}
        onClose={() => setMenu(false)}
        onAdd={() => {
          setMenu(false);
          setAdding(true);
        }}
        onBests={() => {
          setMenu(false);
          navigation.navigate('TodaysBests', { workoutId: params.workoutId });
        }}
        onDiscard={() => {
          setMenu(false);
          discard();
        }}
        onRestore={(id) => void restoreExercise(id)}
      />
      <RestSheet
        exercise={resting}
        onClose={() => setResting(null)}
        onSwap={(exercise) => {
          setResting(null);
          setSwapping({ target: exercise, to: null });
        }}
        onRemove={(exercise) => {
          setResting(null);
          void dropExercise(exercise);
        }}
        onOpenExercise={(exercise) => {
          setResting(null);
          navigation.navigate('Exercise', {
            exerciseId: exercise.exerciseId,
            clientId: view.clientId,
          });
        }}
      />
    </SafeAreaView>
  );
}

/** § 6c — a client with no program, which is a new trainer's likeliest first screen. */
function NoPlan({
  view,
  onAdd,
  navigation,
}: {
  view: LogView;
  onAdd: () => void;
  navigation: Nav;
}) {
  const first = view.clientName.split(' ')[0];
  return (
    <>
      <Empty
        icon={IconDumbbell}
        title={`Nothing planned for ${first}`}
        body="The log does not need a plan. Start empty and add exercises as you go, or put a program on them first."
        style={styles.emptyPlan}
      />
      <Button label="Add an exercise" variant="secondary" block icon={IconPlus} onPress={onAdd} />

      {view.quiet ? (
        <Callout style={styles.note}>{view.quiet}</Callout>
      ) : null}

      <Text style={styles.quickest}>Quickest way in</Text>
      {view.repeat ? (
        <Row
          leading={<IconRepeat size={18} color={colors.ink3} />}
          title={view.repeat.label}
          subtitle={view.repeat.meta}
          trailing={<IconChevron size={18} color={colors.ink3} />}
          onPress={onAdd}
          style={styles.wayIn}
        />
      ) : null}
      <Row
        leading={<IconLayers size={18} color={colors.ink3} />}
        title={`Build a program for ${first}`}
        subtitle="From a template, or empty"
        trailing={<IconChevron size={18} color={colors.ink3} />}
        onPress={() => navigation.navigate('ProgramList', { clientId: view.clientId })}
        style={styles.wayIn}
      />
    </>
  );
}

/** How many clients are on the same template — the swap sheet's blast radius. */
function swapCount(view: LogView, input: LogInput): number {
  const program = input.programs.find((p) => p.id === view.programId);
  if (!program?.templateId) return 0;
  return new Set(
    input.programs
      .filter((p) => p.templateId === program.templateId && p.status.toLowerCase() === 'active')
      .map((p) => p.clientId),
  ).size;
}

/** "12:06" — minutes and seconds under an hour, then hours. A session clock, not a time of day. */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function hhmm(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  // Room for the dock, which is fixed and would otherwise sit on the last row.
  body: { paddingHorizontal: space.inset, paddingBottom: space.s6 },

  stick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 9,
    paddingBottom: 7,
  },
  stickLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  stickCount: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.37, color: colors.ink3, ...tnum },

  collapsed: { marginBottom: space.s2 },
  value: { alignItems: 'flex-end', minWidth: 44 },
  valueTop: { fontSize: 15, fontWeight: '800', color: colors.ink, ...tnum },
  valueBottom: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.ink3, marginTop: 2 },

  openBlock: { marginBottom: space.s3 },
  head: { paddingVertical: 11, paddingHorizontal: space.s3 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  headText: { flex: 1, minWidth: 0 },
  headName: { ...type.h3, color: colors.ink },
  headMeta: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  swapped: { fontSize: 12, color: colors.ink3, marginTop: 8 },

  sets: { marginTop: space.s2 },
  timer: { marginTop: space.s2 },
  timerNote: { fontSize: 12, lineHeight: 17, color: colors.ink3, marginTop: space.s2 },
  addSet: { marginTop: space.s2 },
  pr: { marginTop: space.s3 },

  addExercise: { marginTop: space.s2 },
  note: { marginTop: space.s3 },

  synced: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.s3 },
  syncedText: { fontSize: 11, color: colors.ink3, ...tnum },

  toastDock: { paddingHorizontal: space.inset, paddingBottom: space.s2 },

  empty: { marginTop: space.s7 },
  emptyPlan: { marginTop: space.s6, marginBottom: space.s3 },
  quickest: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: space.s6,
    marginBottom: space.s2,
  },
  wayIn: { marginBottom: space.s2 },
});
