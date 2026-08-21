/**
 * 6j · a teammate's plan, and the one place an admin may change it.
 *
 * ── What this is for, precisely ───────────────────────────────────────────
 *
 * Priya is off sick, her client is standing on the floor, and the plan says 5×5
 * back squat for a shoulder that is not having it. Handing the client over
 * permanently is the wrong answer to one swapped exercise, and "wait for Priya"
 * is not an answer at all.
 *
 * That is the whole scope. Change a prescription, add something, take something
 * out. There is deliberately **no way to create or delete the plan itself** —
 * those are handover-shaped decisions, and the handover exists and is audited.
 *
 * ── Why the screen keeps saying whose plan it is ──────────────────────────
 *
 * Every edit here writes a `team_activity` row and pushes to the coach, so the
 * one thing this screen must never do is let an admin forget they are in
 * somebody else's book. Hence the banner, the coach's name in the app bar, and
 * the line in the prescription sheet. The audit trail is what makes the
 * capability safe; telling the admin about it in advance is what makes the audit
 * trail unsurprising rather than an ambush.
 *
 * ── A swap is two steps, on purpose ───────────────────────────────────────
 *
 * Remove, then add. Not one compound "swap" call: two deliberate steps each write
 * their own honest activity row — "Removed Barbell Squat", "Added Leg Press" —
 * where a swap would write one row that hides half of what happened, and would
 * have a partial-failure state that leaves a plan with two exercises or none.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import {
  addTeamProgramExercise,
  fetchTeamProgram,
  removeTeamProgramExercise,
  updateTeamProgramExercise,
  TeamError,
  type TeamPrescription,
  type TeamProgramDetail,
  type TeamProgramExercise,
} from '../../../api/team';
import ExercisePickSheet, { type PickedExercise } from './ExercisePickSheet';
import TeamPrescriptionSheet from './TeamPrescriptionSheet';
import {
  AppBar,
  Banner,
  Callout,
  Dialog,
  DialogStrong,
  Empty,
  IconAlert,
  IconBack,
  IconButton,
  IconCloudOff,
  IconDumbbell,
  IconLayers,
  List,
  Row,
  SectionHead,
  SkeletonRow,
  Tag,
  Toast,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'TeamProgram'>;

const WEEKDAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TeamProgramScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const [detail, setDetail] = useState<TeamProgramDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState<TeamProgramExercise | null>(null);
  const [adding, setAdding] = useState<{ day: number | null; week: number | null } | null>(null);
  const [picked, setPicked] = useState<PickedExercise | null>(null);
  const [removing, setRemoving] = useState<TeamProgramExercise | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await fetchTeamProgram(params.programId));
      setError(null);
    } catch (e) {
      setError(e instanceof TeamError ? e.message : 'Could not load that plan.');
    } finally {
      setLoading(false);
    }
  }, [params.programId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** Grouped the way a plan is read: by week, then by day. */
  const days = useMemo(() => {
    const groups = new Map<string, { week: number | null; day: number | null; rows: TeamProgramExercise[] }>();
    (detail?.exercises ?? []).forEach((row) => {
      const key = `${row.week ?? 1}:${row.dayOfWeek ?? 0}`;
      const group = groups.get(key) ?? { week: row.week ?? null, day: row.dayOfWeek ?? null, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    });
    return [...groups.values()];
  }, [detail]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await load();
      setNotice(done);
    } catch (e) {
      setNotice(e instanceof TeamError ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = (prescription: TeamPrescription) => {
    const row = editing;
    setEditing(null);
    if (!row) return;
    void run(
      () => updateTeamProgramExercise(params.programId, row.id, prescription),
      `${row.exerciseName} updated.`,
    );
  };

  const saveAdd = (prescription: TeamPrescription) => {
    const slot = adding;
    const exercise = picked;
    setPicked(null);
    setAdding(null);
    if (!slot || !exercise) return;
    void run(
      () =>
        addTeamProgramExercise(params.programId, exercise.id, {
          ...prescription,
          dayOfWeek: slot.day,
          week: slot.week,
        }),
      `${exercise.name} added.`,
    );
  };

  const confirmRemove = () => {
    const row = removing;
    setRemoving(null);
    if (!row) return;
    void run(
      () => removeTeamProgramExercise(params.programId, row.id),
      `${row.exerciseName} removed.`,
    );
  };

  const coach = detail?.coachName ?? null;
  const readOnly = offline || busy;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={detail?.name ?? params.name}
          // Whose plan, on every frame. The one thing an admin must not forget.
          subtitle={
            detail
              ? `${detail.clientName}${coach && detail.teammates ? ` · ${coach}’s client` : ''}`
              : undefined
          }
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading && detail !== null} onRefresh={load} tintColor={colors.accent} />
        }
      >
        {offline ? (
          <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
            A teammate’s plan lives online. You can’t change it without a connection.
          </Banner>
        ) : null}

        {error && detail === null ? (
          <Banner tone="error" style={styles.banner}>
            {error}
          </Banner>
        ) : null}

        {detail === null && !offline && error === null ? (
          <View style={styles.skeleton}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}

        {detail?.teammates ? (
          <Callout icon={IconAlert} style={styles.rule}>
            You’re editing {coach ? `${coach.split(' ')[0]}’s` : 'a teammate’s'} plan.{' '}
            {coach ? coach.split(' ')[0] : 'They'} will see every change and that you made it.
          </Callout>
        ) : null}

        {detail && detail.exercises.length === 0 ? (
          <Empty
            icon={IconLayers}
            title="Nothing in this plan yet"
            body="Add the first exercise, or hand the client over if the whole plan needs building."
            style={styles.empty}
          />
        ) : null}

        {days.map((group, index) => (
          <View key={`${group.week}:${group.day}`} style={styles.group}>
            <SectionHead
              label={dayLabel(group.week, group.day)}
              count={group.rows.length}
              first={index === 0}
              action={
                readOnly
                  ? undefined
                  : {
                      label: 'Add',
                      onPress: () => setAdding({ day: group.day, week: group.week }),
                    }
              }
            />
            <List>
              {group.rows.map((row) => (
                <Row
                  key={row.id}
                  grouped
                  wrap
                  title={row.exerciseName}
                  subtitle={prescriptionLine(row)}
                  trailing={row.targetLoad ? <Tag label={`${row.targetLoad} kg`} /> : undefined}
                  onPress={readOnly ? undefined : () => setEditing(row)}
                  onLongPress={readOnly ? undefined : () => setRemoving(row)}
                />
              ))}
            </List>
          </View>
        ))}

        {detail && detail.exercises.length > 0 ? (
          <Text style={styles.hint}>Tap an exercise to change it. Press and hold to take it out.</Text>
        ) : null}

        {detail && detail.exercises.length === 0 && !readOnly ? (
          <Row
            title="Add an exercise"
            subtitle="It’ll go on day 1"
            leading={<IconDumbbell size={18} color={colors.ink2} />}
            onPress={() => setAdding({ day: 1, week: 1 })}
          />
        ) : null}
      </ScrollView>

      {/* Pick, then prescribe. Two sheets rather than one long form: choosing an
          exercise and deciding the sets are different decisions, and the second
          one reads better once the first is settled. */}
      <ExercisePickSheet
        visible={adding !== null && picked === null}
        onPick={setPicked}
        onClose={() => setAdding(null)}
      />

      <TeamPrescriptionSheet
        visible={editing !== null || (adding !== null && picked !== null)}
        row={editing}
        exerciseName={editing?.exerciseName ?? picked?.name ?? ''}
        coachName={detail?.teammates ? coach : null}
        clientName={detail?.clientName ?? ''}
        busy={busy}
        onSave={editing ? saveEdit : saveAdd}
        onClose={() => {
          setEditing(null);
          setPicked(null);
          setAdding(null);
        }}
      />

      <Dialog
        visible={removing !== null}
        title={`Take ${removing?.exerciseName ?? 'this'} out?`}
        confirmLabel="Take it out"
        onCancel={() => setRemoving(null)}
        onConfirm={confirmRemove}
      >
        <>
          It comes off {detail?.clientName ?? 'the client'}’s plan from now on. Sets already logged
          against it <DialogStrong>stay in their history</DialogStrong>.
        </>
      </Dialog>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * "Day 2", or "Week 3 · Tue".
 *
 * A program's `day_of_week` is a real weekday (it was resolved from an ordinal
 * slot when the template was applied — V24), so it names the day. `week` only
 * appears past week 1, where a plan repeats and the number starts carrying
 * information.
 */
function dayLabel(week: number | null, day: number | null): string {
  const dayName = day == null || day < 1 || day > 7 ? 'Unscheduled' : WEEKDAYS[day];
  return week != null && week > 1 ? `Week ${week} · ${dayName}` : dayName;
}

/** "4 × 6 · 90s rest", or "3 × 45s" for a hold. */
function prescriptionLine(row: TeamProgramExercise): string {
  const sets = row.sets ?? 0;
  const work =
    row.durationSeconds != null
      ? `${sets} × ${row.durationSeconds}s`
      : row.reps != null
        ? `${sets} × ${row.reps}`
        : `${sets} sets`;
  const parts = [work];
  if (row.restSeconds != null) parts.push(`${row.restSeconds}s rest`);
  if (row.notes) parts.push(row.notes);
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  banner: { marginBottom: space.s4 },
  skeleton: { gap: space.s2, marginTop: space.s4 },
  rule: { marginBottom: space.s4 },
  empty: { marginTop: space.s7 },
  group: { marginBottom: space.s4 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.ink3, marginTop: space.s2 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
