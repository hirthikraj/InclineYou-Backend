/**
 * Screens 18–24 · § 02 — the client's log. FR-4.3.
 *
 * This is not a client version of workout logging. It is **workout logging**,
 * opened by a different person: the same `db/log.ts` writes, the same `buildLog`
 * view, the same set table, the same Previous column, the same rest timer, and
 * the same record computed on read. A client's log of Sunday's session and their
 * trainer's log of Sunday's session are not two records that reconcile — they are
 * one record with two readers, and whoever taps the tick first writes it.
 *
 * ── What is different, and why ────────────────────────────────────────────
 *
 * The composition, and three things that are missing from it:
 *
 *  - **No Finish.** Marking a session done is what moves a pack, and a pack is
 *    the trainer's to move. A client who could close the session could spend a
 *    session, and nothing a client does may change what they owe.
 *  - **No swap, no add, no remove.** Those change the plan their trainer built.
 *    The client's answer to a busy rack is to log what they did and say so.
 *  - **The tab bar stays.** On the trainer's phone the log is a mode that takes
 *    the whole screen, because they are running somebody else's hour. A client is
 *    in their own app, and the design keeps the bar on this frame.
 *
 * What is identical: the 56px Log set button, the tick that accepts last time's
 * numbers in one tap, and the fact that nothing here waits for the network.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import { buildBests, clock12, coachFirstName, dayName } from '../../client/client';
import { buildLog, type LogExerciseView, type LogView } from '../../log/log';
import { logSet, seedLogFromPlan, startUnbookedLog, untickSet, updateSet } from '../../db/log';
import RecordSheet from './RecordSheet';
import {
  AppBar,
  Button,
  Callout,
  Card,
  Empty,
  IconButton,
  IconChevron,
  IconDumbbell,
  IconMenu,
  List,
  Pulse,
  RestTimer,
  Row,
  SectionHead,
  SetRow,
  Sets,
  SetsHead,
  Tag,
  colors,
  space,
  tnum,
} from '../../design';
import { useShell } from '../../navigation/AppShell';

type Nav = NativeStackNavigationProp<ClientStackParamList>;

/** Half-typed rows live here for the length of the visit, never in the database. */
type Draft = { load: string; reps: string };

export default function ClientLogScreen() {
  const navigation = useNavigation<Nav>();
  const shell = useShell();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);

  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [rest, setRest] = useState<{ total: number; endsAt: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [shownRecord, setShownRecord] = useState<string | null>(null);
  const seeded = useRef<string | null>(null);

  /* ---- which log is open ---- */
  const todaysWorkout = useMemo(() => {
    if (!clientId) return null;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return (
      input.workouts.find((w) => w.clientId === clientId && w.sessionDate === iso && !w.endedAt) ??
      null
    );
  }, [input.workouts, clientId]);

  useEffect(() => {
    if (todaysWorkout) setWorkoutId(todaysWorkout.id);
  }, [todaysWorkout]);

  const view: LogView | null = useMemo(
    () => (workoutId ? buildLog(input, workoutId, Date.now()) : null),
    [input, workoutId],
  );

  /* ---- seed today's plan into the log, once ---- */
  useEffect(() => {
    if (!view || seeded.current === view.workoutId) return;
    seeded.current = view.workoutId;
    // The plan's day comes off the booking this log belongs to; an unbooked log
    // uses today's weekday, which is the numbering templates key their days by.
    const booking = input.sessions.find((sch) => sch.id === view.scheduledId);
    const weekday = new Date().getDay() === 0 ? 7 : new Date().getDay();
    void seedLogFromPlan(view.workoutId, view.programId, booking?.templateDay ?? weekday);
  }, [view]);

  /* ---- the rest clock, and nothing else on a timer ---- */
  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [rest]);

  useFocusEffect(
    useCallback(() => {
      setTick((n) => n + 1);
    }, []),
  );

  const remaining = rest ? Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000)) : 0;
  useEffect(() => {
    if (rest && remaining === 0) setRest(null);
  }, [rest, remaining]);

  const first = coachFirstName(input.coach);

  /** No plan, no booking, nothing open — one tap makes a log to write into. */
  const open = async () => {
    if (!clientId || opening) return;
    setOpening(true);
    try {
      const opened = await startUnbookedLog(input.coach?.id ?? '', clientId);
      setWorkoutId(opened.workoutId);
    } finally {
      setOpening(false);
    }
  };

  if (!clientId) return null;

  if (!view) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Log"
            subtitle="Nothing open"
            leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
          />
        </View>
        <Empty
          icon={IconDumbbell}
          title="No session open"
          body="Start today's session from Today, or open an empty log — it works on a rest day and works with no plan assigned."
          action={
            <Button label="Log a workout" variant="secondary" loading={opening} onPress={() => void open()} />
          }
          style={styles.empty}
        />
      </SafeAreaView>
    );
  }

  /** The booking this log belongs to, if it belongs to one. */
  const booked = input.sessions.find((sch) => sch.id === view.scheduledId);
  const exercise =
    view.exercises.find((e) => e.id === openExercise) ?? view.exercises.find((e) => !e.complete) ?? view.exercises[0];
  const record = view.records.find((r) => r.announced) ?? null;
  // What it beat and when. `buildBests` already computes that sentence from the
  // same rows, so the record moment and the Progress list can never disagree.
  const beaten = record
    ? (clientId ? buildBests(input, clientId, Date.now()) : []).find(
        (b) => b.exerciseId === record.exerciseId,
      )?.detail ?? null
    : null;
  const recordReps = record
    ? view.exercises
        .flatMap((e) => e.sets)
        .find((slot) => slot.setId === record.setId)?.reps
    : undefined;
  const upNext = view.exercises.filter((e) => e.id !== exercise?.id);
  const elapsed = Date.now() - view.startedAt;

  const draftKey = (exerciseId: string, n: number) => `${exerciseId}:${n}`;

  const setDraft = (exerciseId: string, n: number, patch: Partial<Draft>) =>
    setDrafts((held) => {
      const key = draftKey(exerciseId, n);
      const current = held[key] ?? { load: '', reps: '' };
      return { ...held, [key]: { ...current, ...patch } };
    });

  /**
   * The tick. On an empty row it takes the Previous numbers exactly as shown —
   * one tap for a set that went to plan. On a green row it un-ticks and the
   * numbers stay put.
   */
  const toggle = async (row: LogExerciseView, n: number) => {
    const slot = row.sets.find((s) => s.number === n);
    if (!slot) return;

    if (slot.done && slot.setId) {
      const key = draftKey(row.exerciseId, n);
      setDrafts((held) => ({ ...held, [key]: { load: slot.load, reps: slot.reps } }));
      await untickSet(slot.setId);
      return;
    }

    const draft = drafts[draftKey(row.exerciseId, n)];
    const load = Number(draft?.load || slot.previousLoad || 0);
    const reps = Number(draft?.reps || slot.previousReps || 0);
    if (!reps) return;

    await logSet(view.workoutId, row.exerciseId, n, {
      loadKg: row.logType === 'reps' ? null : load,
      reps,
    });

    if (row.restSeconds) setRest({ total: row.restSeconds, endsAt: Date.now() + row.restSeconds * 1000 });
  };

  const commit = async (row: LogExerciseView, n: number) => {
    const slot = row.sets.find((s) => s.number === n);
    if (!slot?.done || !slot.setId) return;
    const draft = drafts[draftKey(row.exerciseId, n)];
    if (!draft) return;
    await updateSet(slot.setId, {
      loadKg: row.logType === 'reps' ? null : Number(draft.load || 0),
      reps: Number(draft.reps || slot.reps || 0),
    });
  };

  const nextSlot = exercise?.sets.find((s) => !s.done)?.number ?? null;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        {/* One elapsed reading on this screen, not two. The trainer's log puts a
            running clock in the sub-line because they are being paid for the
            hour; a client is not, and the status line below already says how far
            in they are. Two readings from the same number that disagree by a
            rounding is worse than either. */}
        {/* The day, not the programme. "Core A · Week 5, past the 4 planned" is
            the trainer's framing of somebody else's block; a client is doing
            Core A, at half past six, with Anguraj. */}
        <AppBar
          title={booked?.dayLabel?.trim() || view.plan || 'Your workout'}
          subtitle={[
            booked ? `${dayName(booked.scheduledAt)} ${clock12(booked.scheduledAt)}` : null,
            input.coach ? `with ${first}` : 'on this phone',
          ]
            .filter(Boolean)
            .join(' · ')}
          leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.status}>
          <Pulse />
          <Text style={styles.statusText}>
            {elapsed < 60_000 ? 'In session' : `In session · ${Math.floor(elapsed / 60000)} min`}
          </Text>
          <View style={styles.spacer} />
          {/* The one thing sync gets to say in a session. */}
          <Tag label={view.exercises.some((e) => e.queued) ? 'Queued' : 'On this phone'} tone="neutral" />
        </View>

        {exercise ? (
          <Card>
            <View style={styles.cardHead}>
              <View style={styles.cardText}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <Text style={styles.exerciseMeta}>
                  Exercise {view.exercises.indexOf(exercise) + 1} of {view.exercises.length}
                  {exercise.value.bottom === 'planned' ? ` · ${exercise.value.top}` : ''}
                </Text>
              </View>
              {exercise.sets.some((s) => s.pr) ? <Tag label="Best today" tone="pr" /> : null}
            </View>

            <Sets>
              <SetsHead load={exercise.logType === 'reps' ? '' : 'kg'} />
              {exercise.sets.map((slot) => {
                const key = draftKey(exercise.exerciseId, slot.number);
                const draft = drafts[key];
                return (
                  <SetRow
                    key={slot.number}
                    number={slot.number}
                    previous={slot.previous}
                    load={draft?.load ?? slot.load}
                    reps={draft?.reps ?? slot.reps}
                    onLoad={(next) => setDraft(exercise.exerciseId, slot.number, { load: next })}
                    onReps={(next) => setDraft(exercise.exerciseId, slot.number, { reps: next })}
                    done={slot.done}
                    queued={slot.queued}
                    pr={slot.pr}
                    next={slot.number === nextSlot}
                    onToggle={() => void toggle(exercise, slot.number)}
                    onCommit={() => void commit(exercise, slot.number)}
                    onFillFromPrevious={
                      slot.previousLoad || slot.previousReps
                        ? () =>
                            setDraft(exercise.exerciseId, slot.number, {
                              load: slot.previousLoad ? String(slot.previousLoad) : '',
                              reps: slot.previousReps ? String(slot.previousReps) : '',
                            })
                        : undefined
                    }
                  />
                );
              })}
            </Sets>

            {rest ? (
              <RestTimer
                remaining={remaining}
                total={rest.total}
                onAdjust={(delta) =>
                  setRest((r) => (r ? { ...r, endsAt: r.endsAt + delta * 1000 } : r))
                }
                style={styles.timer}
              />
            ) : null}

            <View style={styles.actions}>
              <Button
                label={nextSlot ? `Log set ${nextSlot}` : 'All sets logged'}
                size="lg"
                disabled={!nextSlot}
                onPress={() => nextSlot && void toggle(exercise, nextSlot)}
                style={styles.primary}
              />
              {upNext.length ? (
                <Button
                  label="Next"
                  variant="ghost"
                  size="lg"
                  onPress={() => setOpenExercise(upNext[0].id)}
                  style={styles.secondary}
                />
              ) : null}
            </View>
          </Card>
        ) : (
          <Empty
            icon={IconDumbbell}
            title="Nothing planned"
            body={`${first} hasn't put anything on today. Log what you do and it is still yours.`}
            style={styles.empty}
          />
        )}

        {upNext.length ? (
          <>
            <SectionHead label="Up next" count={upNext.length} />
            <List style={styles.group}>
              {upNext.map((row) => (
                <Row
                  key={row.id}
                  grouped
                  title={row.name}
                  subtitle={row.last}
                  spine={row.complete ? 'done' : undefined}
                  onPress={() => setOpenExercise(row.id)}
                  trailing={<IconChevron size={18} color={colors.ink3} />}
                />
              ))}
            </List>
          </>
        ) : null}

        <Callout style={styles.note}>
          {first} sees these sets on their phone as you log them. Marking the session done is
          theirs — that is what takes one off your pack.
        </Callout>
      </ScrollView>

      {/* 2b · a record is the only event in this app worth stopping for. */}
      <RecordSheet
        record={record && record.setId !== shownRecord ? record : null}
        coach={first}
        previous={beaten}
        reps={recordReps ? Number(recordReps) : null}
        onClose={() => setShownRecord(record?.setId ?? null)}
        onHistory={(exerciseId) => {
          setShownRecord(record?.setId ?? null);
          navigation.navigate('ExerciseHistory', { clientId, exerciseId });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  status: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginBottom: space.s3 },
  statusText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
  spacer: { flex: 1 },

  cardHead: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  cardText: { flex: 1 },
  exerciseName: { fontSize: 17, fontWeight: '700', letterSpacing: -0.26, color: colors.ink },
  exerciseMeta: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: 7,
    ...tnum,
  },

  timer: { marginTop: space.s2 },
  actions: { flexDirection: 'row', gap: space.s2, marginTop: space.s3 },
  primary: { flex: 1 },
  secondary: { flexGrow: 0, flexShrink: 0, flexBasis: 100 },

  group: { marginBottom: space.s2 },
  note: { marginTop: space.s3 },
  empty: { marginTop: space.s7 },
});
