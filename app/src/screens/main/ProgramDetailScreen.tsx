/**
 * Inside one client's program.
 *
 * Weeks, then days, then exercises with **sets × reps · rest** on the row — the
 * same hierarchy the template screen (3b) uses, because it is how a trainer
 * talks about a plan and there is no reason for the assigned copy to read
 * differently from the shelf it came off.
 *
 * ── What is different from the template screen ────────────────────────────
 *
 * The numbers are editable here. On the shelf a prescription is a blueprint and
 * rewriting it is a server-validated job; on a client's own copy, changing a set
 * count is the ordinary weekly act of coaching. So a row opens a sheet with
 * three fields rather than opening the exercise.
 *
 * **Every write on this screen is local.** It used to go through the program
 * API, which meant a trainer standing in a gym with one bar of signal watched a
 * spinner to move an exercise from Tuesday to Thursday. `db/log` already writes
 * these rows locally when a swap reaches program scope; this screen now uses the
 * same path, and the sync push carries it all up on the next window.
 *
 * ── Days you have not filled yet ──────────────────────────────────────────
 *
 * The day sections come from the days this plan already uses **and** the days
 * the source program trains on, so a four-day plan shows four headers from the
 * moment it is assigned. Adding to a day that is on neither list is what the +
 * in the app bar is for: it lists all seven, with what is already on each.
 *
 * That is the fix for the thing that was actually broken. The days used to be
 * read off the exercises alone, so the first exercise went on Monday, Monday
 * became the only day the plan had, and there was nowhere to put Tuesday's
 * first exercise.
 *
 * ── Weeks ─────────────────────────────────────────────────────────────────
 *
 * The screen opens on the week the client is actually in, counted from the
 * program's start date. A week with nothing of its own repeats week 1 and says
 * so; copying a week into it makes it independent, and after that editing it
 * touches nothing else. Removing is a long-press, confirmed, and scoped to the
 * week you are looking at.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../navigation/MainStack';
import {
  observeProgramExercises,
  programsCollection,
  templatesCollection,
  findExercisesByIds,
  addProgramExercise,
  removeProgramExercise,
  updateProgramExercise,
  copyProgramWeek,
  clearProgramWeek,
  currentProgramWeek,
  weekOf,
  dayOf,
} from '../../db/programs';
import { readTrainingDays } from '../../db/training';
import { setPendingPick } from '../../db/exercisePick';
import type ProgramExercise from '../../db/models/ProgramExercise';
import type Program from '../../db/models/Program';
import type Exercise from '../../db/models/Exercise';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Chip,
  Control,
  Dialog,
  Empty,
  FieldLabel,
  GroupHead,
  IconBack,
  IconButton,
  IconCopy,
  IconLayers,
  IconPlus,
  List,
  Reveal,
  Row,
  RowValue,
  Seg,
  Sheet,
  Skeleton,
  SkeletonRow,
  Thumb,
  Toast,
  colors,
  space,
} from '../../design';

type Props = NativeStackScreenProps<MainStackParamList, 'ProgramDetail'>;

/** 1 = Monday, the convention the rest of the training data uses. */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dayTitle(day: number | null): string {
  if (day === null) return 'Not on a day yet';
  return WEEKDAYS[day - 1] ?? `Day ${day}`;
}

/** The three numbers, as the row says them: "3 × 10 · 90s rest". */
function prescription(pe: ProgramExercise): string {
  const core = `${pe.sets ?? '—'} × ${pe.reps ?? '—'}`;
  return pe.restSeconds ? `${core} · ${pe.restSeconds}s rest` : core;
}

/** How many weeks a start and an end date describe. Null when either is missing. */
function weeksBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.max(1, Math.ceil((end - start) / (7 * 86_400_000)));
}

/** Sheet state. Held as strings because that is what a text field has. */
interface EditState {
  pe: ProgramExercise;
  name: string;
  sets: string;
  reps: string;
  restSeconds: string;
}

export default function ProgramDetailScreen({ route, navigation }: Props) {
  const { programId } = route.params;

  const [program, setProgram] = useState<Program | null>(null);
  /** The days the program this was copied from trains on. Empty when it wasn't copied. */
  const [sourceDays, setSourceDays] = useState<number[]>([]);
  const [sourceWeeks, setSourceWeeks] = useState<number | null>(null);
  const [rows, setRows] = useState<ProgramExercise[]>([]);
  const [exercises, setExercises] = useState<Record<string, Exercise>>({});
  const [ready, setReady] = useState(false);

  const [week, setWeek] = useState<number | null>(null);
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<EditState | null>(null);
  const [removing, setRemoving] = useState<{ pe: ProgramExercise; name: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    programsCollection.find(programId).then(setProgram).catch(() => setProgram(null));
  }, [programId]);

  // The template is read for its layout only — how many weeks it runs and which
  // days it trains on. Nothing on it can change what is already on the client's
  // copy; assigning was the copy, and this is the copy.
  useEffect(() => {
    const templateId = program?.templateId;
    if (!templateId) return;
    let live = true;
    void templatesCollection
      .find(templateId)
      .then((template) => {
        if (!live) return;
        setSourceDays(readTrainingDays(template.trainingDays, []));
        setSourceWeeks(template.weeks ?? null);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [program?.templateId]);

  useEffect(() => {
    const sub = observeProgramExercises(programId).subscribe((next) => {
      setRows(next);
      setReady(true);
    });
    return () => sub.unsubscribe();
  }, [programId]);

  // Names arrive a beat after the rows do. The row renders either way — an
  // exercise whose name hasn't loaded is still a row you can see the numbers on.
  useEffect(() => {
    const ids = [...new Set(rows.map((pe) => pe.exerciseId).filter(Boolean))];
    if (!ids.length) { setExercises({}); return; }
    void findExercisesByIds(ids).then(setExercises);
  }, [rows]);

  /** Weeks that have been written in their own right. */
  const authoredWeeks = useMemo(
    () => [...new Set(rows.map(weekOf))].sort((a, b) => a - b),
    [rows],
  );

  /**
   * How long this plan runs.
   *
   * Whichever of the three sources says the most, because every one of them is a
   * floor rather than a limit: the template's length, the span the program was
   * booked for, and the weeks somebody has already written. A plan with none of
   * the three is one week, which is what it is.
   */
  const weeks = useMemo(() => {
    const written = authoredWeeks.length ? authoredWeeks[authoredWeeks.length - 1] : 1;
    const booked = weeksBetween(program?.startDate, program?.endDate) ?? 1;
    return Math.max(1, written, sourceWeeks ?? 1, booked);
  }, [authoredWeeks, program?.startDate, program?.endDate, sourceWeeks]);

  /**
   * Opens on the week the client is in, not on week 1.
   *
   * A trainer opening a plan mid-block is looking at this week's work, and
   * making them count chips to get there would be the app knowing the answer and
   * asking anyway. Held as null until the program's start date has loaded so the
   * first render does not settle on week 1 and stay there.
   */
  const current = Math.min(weeks, currentProgramWeek(program?.startDate));
  const shown = Math.min(weeks, week ?? current);

  const own = useMemo(() => rows.filter((pe) => weekOf(pe) === shown), [rows, shown]);
  const repeats = own.length === 0 && shown !== 1 && authoredWeeks.includes(1);
  const showing = useMemo(
    () => (repeats ? rows.filter((pe) => weekOf(pe) === 1) : own),
    [repeats, rows, own],
  );

  /**
   * Every day this plan has, whether or not this week fills it.
   *
   * Union of three things and in this order of authority: the days the source
   * program trains on, the days any week of this plan uses, and the days this
   * week uses. A day is never hidden because the week on screen is empty.
   */
  const days = useMemo(() => {
    const set = new Set<number | null>(sourceDays);
    rows.forEach((pe) => set.add(dayOf(pe)));
    showing.forEach((pe) => set.add(dayOf(pe)));
    return [...set].sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    });
  }, [sourceDays, rows, showing]);

  const groups = useMemo(
    () =>
      days.map((d) => ({
        day: d,
        rows: showing
          .filter((pe) => dayOf(pe) === d)
          .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
      })),
    [days, showing],
  );

  const nameOf = (pe: ProgramExercise) => exercises[pe.exerciseId]?.name ?? 'Exercise';
  const editable = !repeats;

  const openPicker = (target: number | null) => {
    setPicking(false);
    setPendingPick(async (picked) => {
      try {
        await addProgramExercise(programId, {
          exerciseId: picked.id,
          day: target,
          week: shown,
        });
        setNotice(`${picked.name} added to ${dayTitle(target).toLowerCase()}, week ${shown}.`);
      } catch {
        setNotice('Could not add that exercise.');
      }
    });
    navigation.navigate('ExercisePicker');
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateProgramExercise(editing.pe.id, {
        sets: parseInt(editing.sets, 10) || undefined,
        reps: parseInt(editing.reps, 10) || undefined,
        restSeconds: parseInt(editing.restSeconds, 10) || undefined,
      });
      setEditing(null);
    } catch {
      setNotice('Could not save those numbers.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (pe: ProgramExercise, name: string) => {
    try {
      await removeProgramExercise(pe.id);
      setNotice(`${name} taken off week ${shown}.`);
    } catch {
      setNotice('Could not remove that exercise.');
    }
  };

  const sources = authoredWeeks.filter((w) => w !== shown);

  const copyFrom = (from: number) => {
    setCopying(false);
    void copyProgramWeek(programId, from, shown)
      .then((count) =>
        setNotice(
          count
            ? `Week ${from} copied into week ${shown}. Change what you like — week ${from} stays as it was.`
            : `Week ${from} has nothing on it to copy.`,
        ),
      )
      .catch(() => setNotice(`Week ${shown} already has exercises on it.`));
  };

  const reset = () => {
    setResetting(false);
    void clearProgramWeek(programId, shown)
      .then(() => setNotice(`Week ${shown} goes back to repeating week 1.`))
      .catch(() => setNotice('Could not clear that week.'));
  };

  const toggle = (day: number | null) =>
    setShut((c) => ({ ...c, [`${shown}:${day}`]: !c[`${shown}:${day}`] }));

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={program?.name || 'Program'}
          subtitle={program?.goal || undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <IconButton
              icon={IconPlus}
              label="Add an exercise"
              bare
              onPress={() => setPicking(true)}
            />
          }
        />

        {weeks > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {Array.from({ length: weeks }, (_, i) => (
              <Chip
                key={i}
                label={i + 1 === current ? `Week ${i + 1} · now` : `Week ${i + 1}`}
                selected={shown === i + 1}
                onPress={() => setWeek(i + 1)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <Reveal ready={ready} skeleton={<ProgramDetailSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {repeats ? (
            <Callout icon={IconCopy} style={styles.note}>
              <CalloutStrong>Week {shown} repeats week 1.</CalloutStrong> Copy a week into it to give
              this client different numbers — after that the two weeks have nothing to do with each
              other.
            </Callout>
          ) : null}

          {rows.length === 0 && days.length === 0 ? (
            <Empty
              icon={IconLayers}
              title="Nothing on this plan yet"
              body="Add the first exercise and it starts taking shape. Defaults of 3 × 10 go on the row — change them by tapping it."
              action={<Button label="Add an exercise" icon={IconPlus} onPress={() => setPicking(true)} />}
              style={styles.empty}
            />
          ) : (
            <>
              {groups.map((group) => {
                const closed = Boolean(shut[`${shown}:${group.day}`]);
                return (
                  <View key={String(group.day)}>
                    <GroupHead
                      label={dayTitle(group.day)}
                      count={group.rows.length}
                      collapsed={closed}
                      onPress={() => toggle(group.day)}
                    />

                    {closed ? null : (
                      <>
                        {group.rows.length ? (
                          <List>
                            {group.rows.map((pe) => (
                              <Row
                                key={pe.id}
                                grouped
                                dim={repeats}
                                leading={<Thumb size="sm" custom={exercises[pe.exerciseId]?.isCustom} />}
                                title={nameOf(pe)}
                                subtitle={exercises[pe.exerciseId]?.muscleGroup || undefined}
                                trailing={
                                  <RowValue
                                    value={`${pe.sets ?? '—'} × ${pe.reps ?? '—'}`}
                                    unit={pe.restSeconds ? `${pe.restSeconds}s rest` : undefined}
                                  />
                                }
                                onPress={
                                  editable
                                    ? () =>
                                        setEditing({
                                          pe,
                                          name: nameOf(pe),
                                          sets: pe.sets != null ? String(pe.sets) : '',
                                          reps: pe.reps != null ? String(pe.reps) : '',
                                          restSeconds: pe.restSeconds != null ? String(pe.restSeconds) : '',
                                        })
                                    : undefined
                                }
                                onLongPress={
                                  editable ? () => setRemoving({ pe, name: nameOf(pe) }) : undefined
                                }
                              />
                            ))}
                          </List>
                        ) : (
                          <Text style={styles.bare}>
                            Nothing on {dayTitle(group.day).toLowerCase()} yet.
                          </Text>
                        )}

                        {editable ? (
                          <Button
                            label="Add an exercise"
                            icon={IconPlus}
                            variant="text"
                            onPress={() => openPicker(group.day)}
                            style={styles.add}
                          />
                        ) : null}
                      </>
                    )}
                  </View>
                );
              })}

              {repeats ? (
                <Button
                  label={sources.length > 1 ? 'Copy a week into this one' : `Copy week 1 into week ${shown}`}
                  icon={IconCopy}
                  variant="secondary"
                  block
                  onPress={() => (sources.length > 1 ? setCopying(true) : copyFrom(1))}
                  style={styles.copy}
                />
              ) : null}

              {editable && shown > 1 && authoredWeeks.includes(shown) ? (
                <Button
                  label={`Clear week ${shown}`}
                  variant="ghost"
                  onPress={() => setResetting(true)}
                  style={styles.clear}
                />
              ) : null}

              <Text style={styles.fine}>
                Tap a row to change the numbers. Press and hold to take it off — that one is not
                undoable, and it only touches week {shown}.
              </Text>
            </>
          )}
        </ScrollView>
      </Reveal>

      {/* All seven, with what is already on each. Adding to a day this plan has
          never used is the whole point of it being a list rather than a filter. */}
      <Sheet visible={picking} onClose={() => setPicking(false)} title={`Add to week ${shown}`}>
        <Text style={styles.meta}>Which day does it go on?</Text>
        <Seg>
          {SHORT.map((label, i) => {
            const count = showing.filter((pe) => dayOf(pe) === i + 1).length;
            return (
              <Chip
                key={label}
                label={label}
                count={count || undefined}
                onPress={() => openPicker(i + 1)}
              />
            );
          })}
        </Seg>
      </Sheet>

      <Sheet visible={copying} onClose={() => setCopying(false)} title={`Copy into week ${shown}`}>
        <Text style={styles.meta}>
          Whichever week you pick is duplicated onto week {shown}. Nothing about the week you copy
          from changes.
        </Text>
        <List>
          {sources.map((from) => (
            <Row
              key={from}
              grouped
              title={`Week ${from}`}
              subtitle="Copy its days and its numbers"
              onPress={() => copyFrom(from)}
            />
          ))}
        </List>
      </Sheet>

      {/* The three numbers, and nothing else. Anything more is a desk job. */}
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing?.name ?? 'Exercise'}>
        <Text style={styles.meta}>{editing ? prescription(editing.pe) : ''}</Text>

        <View style={styles.fields}>
          <View style={styles.field}>
            <FieldLabel>Sets</FieldLabel>
            <Control
              value={editing?.sets ?? ''}
              onChangeText={(v) => setEditing((s) => (s ? { ...s, sets: v } : s))}
              keyboardType="number-pad"
              placeholder="3"
            />
          </View>
          <View style={styles.field}>
            <FieldLabel>Reps</FieldLabel>
            <Control
              value={editing?.reps ?? ''}
              onChangeText={(v) => setEditing((s) => (s ? { ...s, reps: v } : s))}
              keyboardType="number-pad"
              placeholder="10"
            />
          </View>
          <View style={styles.field}>
            <FieldLabel>Rest</FieldLabel>
            <Control
              value={editing?.restSeconds ?? ''}
              onChangeText={(v) => setEditing((s) => (s ? { ...s, restSeconds: v } : s))}
              keyboardType="number-pad"
              placeholder="90"
              affix="sec"
            />
          </View>
        </View>

        <Button label="Save" variant="primary" size="lg" block loading={saving} onPress={() => void save()} />
      </Sheet>

      <Dialog
        visible={removing !== null}
        title={`Take ${removing?.name ?? 'it'} off week ${shown}?`}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target) void remove(target.pe, target.name);
        }}
      >
        Sets already logged against it stay in their history. Only the plan changes, and only this
        week of it.
      </Dialog>

      <Dialog
        visible={resetting}
        title={`Clear week ${shown}?`}
        confirmLabel="Clear it"
        onCancel={() => setResetting(false)}
        onConfirm={reset}
      >
        Everything written for week {shown} goes, and the week repeats week 1 again. Other weeks are
        untouched, and so is anything already logged.
      </Dialog>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function ProgramDetailSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading this program">
      <Skeleton width={88} height={10} style={styles.headGap} />
      <List>
        <SkeletonRow grouped />
        <SkeletonRow grouped />
        <SkeletonRow grouped />
      </List>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  chips: { gap: space.s2, paddingTop: space.s3, paddingBottom: 2, paddingRight: space.inset },
  headGap: { marginTop: space.s5, marginBottom: space.s3 },
  note: { marginTop: space.s4 },
  add: { alignSelf: 'flex-start', marginTop: 2, marginBottom: space.s2 },
  copy: { marginTop: space.s4 },
  clear: { alignSelf: 'flex-start', marginTop: space.s3 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s3 },
  empty: { marginTop: space.s7 },
  bare: { fontSize: 13, lineHeight: 20, color: colors.ink3, paddingVertical: space.s2 },

  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  fields: { flexDirection: 'row', gap: space.s2, marginBottom: space.s5 },
  field: { flex: 1 },

  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
