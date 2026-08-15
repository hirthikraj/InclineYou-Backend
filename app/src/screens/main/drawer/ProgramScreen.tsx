/**
 * 3b · Inside a program.
 *
 * Week chips, then days, then exercises with **sets × reps · rest** on the row.
 * That hierarchy is TrueCoach's and Trainerize's, and it is right — it is how a
 * trainer talks about a plan.
 *
 * ── The days are laid out, not inferred ───────────────────────────────────
 *
 * A day exists because the program trains on it, which is a thing the trainer
 * said when they created it and can change from **Days** in the app bar. It does
 * NOT exist merely because an exercise is sitting on it — that was the old rule
 * and it had a trap in it: the first exercise went on Monday, Monday became the
 * only day the program had, and there was no longer anywhere to put Tuesday's
 * first exercise.
 *
 * Every day gets its own section whether or not anything is on it, and every
 * section collapses. Six sections open at once is a scroll; the header of a
 * closed one still carries its count, which is the thing being scanned for.
 *
 * ── Week chips now move the content ───────────────────────────────────────
 *
 * They used to move only the label, and the screen said so plainly rather than
 * drawing four identical weeks. That was the honest answer while the blueprint
 * held one week's shape. It holds a week per entry now, so:
 *
 *   · **Week 1** is the week you build.
 *   · **A later week with nothing of its own repeats week 1** — the screen says
 *     that, draws week 1's shape dimmed, and offers to copy a week into it.
 *   · **Once copied, the week is its own.** Editing it afterwards is ordinary
 *     editing, and it never touches the week it came from.
 *
 * The one thing that is still refused: inventing per-week numbers nobody wrote.
 * A week repeats until a trainer copies something into it and changes it.
 *
 * Editing an exercise's numbers still needs the server — the endpoint that
 * rewrites the blueprint is the one that validates it — so a row opens the
 * exercise. Adding and removing are local writes to the same JSON column, so
 * they happen here.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useTraining } from '../../../training/useTraining';
import { buildProgram } from '../../../training/training';
import {
  removeFromBlueprint,
  setTrainingDays,
  updateTemplate,
  copyWeek,
  clearWeek,
} from '../../../db/training';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Chip,
  Dialog,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconCalendar,
  IconCopy,
  IconLayers,
  IconPlus,
  IconUsers,
  List,
  Reveal,
  Row,
  Seg,
  Sheet,
  Skeleton,
  SkeletonRow,
  Thumb,
  Toast,
  colors,
  radius,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'Program'>;

/** 1 = Monday, the same convention the blueprint stores. */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The lengths a trainer actually writes, plus the honest one-week answer. */
const LENGTHS = [1, 4, 6, 8, 12];

export default function ProgramScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { input, ready } = useTraining();

  const [week, setWeek] = useState(1);
  /** Keyed `week:day` — a day closed in week 1 says nothing about week 3. */
  const [shut, setShut] = useState<Record<string, boolean>>({});
  /** Long-pressed row, awaiting confirmation. Removing is the one destructive act here. */
  const [removing, setRemoving] = useState<{ name: string; exerciseId: string; day: number } | null>(
    null,
  );
  const [layingOut, setLayingOut] = useState(false);
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [draftWeeks, setDraftWeeks] = useState(1);
  const [copying, setCopying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const view = useMemo(
    () => buildProgram(input, params.templateId, week),
    [input, params.templateId, week],
  );

  // Only reachable if the template was deleted on another device while this was
  // open. Saying so beats an empty screen with a title.
  if (ready && !view) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Program"
            leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          />
        </View>
        <Empty
          icon={IconLayers}
          title="That program is gone"
          body="It was removed, probably from another device. Anyone already on it keeps their copy."
          style={styles.empty}
        />
      </SafeAreaView>
    );
  }

  const openLayout = () => {
    setDraftDays(view?.trainingDays ?? []);
    setDraftWeeks(view?.weeks ?? 1);
    setLayingOut(true);
  };

  /**
   * Two writes, because they are two columns and one of them can fail on its
   * own. Shortening the program is allowed and it does not delete anything: the
   * weeks past the new end stop being drawn, and lengthening it again brings
   * them back exactly as they were.
   */
  const saveLayout = () => {
    const days = draftDays;
    const length = draftWeeks;
    setLayingOut(false);
    if (length < week) setWeek(1);
    void Promise.all([
      setTrainingDays(params.templateId, days),
      updateTemplate(params.templateId, { weeks: length }),
    ])
      .then(() =>
        setNotice(
          days.length
            ? `${days.length} day${days.length === 1 ? '' : 's'} a week, ${length} week${length === 1 ? '' : 's'} long.`
            : 'No days on this program. Add one to start putting exercises somewhere.',
        ),
      )
      .catch(() => setNotice('Could not save that.'));
  };

  /** Week 1 first, then any other week that has been written in its own right. */
  const sources = (view?.authoredWeeks ?? []).filter((w) => w !== week);

  const copyFrom = (from: number) => {
    setCopying(false);
    void copyWeek(params.templateId, from, week)
      .then((count) =>
        setNotice(
          count
            ? `Week ${from} copied into week ${week}. Change what you like — week ${from} stays as it was.`
            : `Week ${from} has nothing on it to copy.`,
        ),
      )
      .catch(() => setNotice(`Week ${week} already has exercises on it.`));
  };

  const reset = () => {
    setResetting(false);
    void clearWeek(params.templateId, week)
      .then(() => setNotice(`Week ${week} goes back to repeating week 1.`))
      .catch(() => setNotice('Could not clear that week.'));
  };

  const add = (day: number) =>
    navigation.navigate('Exercises', {
      pickFor: { templateId: params.templateId, day, week },
    });

  const toggle = (day: number) =>
    setShut((current) => ({ ...current, [`${week}:${day}`]: !current[`${week}:${day}`] }));

  const editable = view ? !view.repeats : false;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view?.name ?? 'Program'}
          subtitle={view?.subtitle}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <IconButton icon={IconCalendar} label="Days it trains on" bare onPress={openLayout} />
          }
        />
      </View>

      <Reveal ready={ready && view !== null} skeleton={<ProgramSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {view ? (
            <>
              {view.weeks > 1 ? (
                <Seg style={styles.chips}>
                  {Array.from({ length: view.weeks }, (_, i) => (
                    <Chip
                      key={i}
                      label={`Week ${i + 1}`}
                      selected={week === i + 1}
                      onPress={() => setWeek(i + 1)}
                    />
                  ))}
                </Seg>
              ) : null}

              {/* A week nobody has written yet, shown as what it actually is:
                  week 1's shape, dimmed, with the one action that changes it. */}
              {view.repeats ? (
                <Callout icon={IconCopy} style={styles.note}>
                  <CalloutStrong>Week {week} repeats week 1.</CalloutStrong> Copy a week into it to
                  give it numbers of its own — after that the two have nothing to do with each other.
                </Callout>
              ) : null}

              {view.trainingDays.length === 0 && view.empty ? (
                <>
                  <Empty
                    icon={IconCalendar}
                    title="No days on this program yet"
                    body="Say which days of the week it trains on and each one gets a section to fill in. You can change them later."
                    action={<Button label="Choose the days" icon={IconCalendar} onPress={openLayout} />}
                    style={styles.empty}
                  />
                </>
              ) : (
                <>
                  {view.days.map((day) => {
                    const closed = Boolean(shut[`${week}:${day.day}`]);
                    return (
                      <View key={day.day}>
                        <GroupHead
                          label={day.title}
                          count={day.exercises.length}
                          collapsed={closed}
                          onPress={() => toggle(day.day)}
                        />

                        {closed ? null : (
                          <>
                            {day.exercises.length ? (
                              <List>
                                {day.exercises.map((exercise) => (
                                  <Row
                                    key={exercise.id}
                                    grouped
                                    dim={view.repeats}
                                    leading={<Thumb size="sm" custom={exercise.custom} />}
                                    title={exercise.name}
                                    subtitle={exercise.prescription}
                                    onPress={() =>
                                      navigation.navigate('Exercise', { exerciseId: exercise.exerciseId })
                                    }
                                    onLongPress={
                                      editable
                                        ? () => setRemoving({ ...exercise, day: day.day })
                                        : undefined
                                    }
                                  />
                                ))}
                              </List>
                            ) : (
                              <Text style={styles.bare}>
                                Nothing on {WEEKDAYS[day.day - 1] ?? 'this day'} yet.
                              </Text>
                            )}

                            {editable ? (
                              <Button
                                label="Add an exercise"
                                icon={IconPlus}
                                variant="text"
                                onPress={() => add(day.day)}
                                style={styles.add}
                              />
                            ) : null}
                          </>
                        )}
                      </View>
                    );
                  })}

                  {view.repeats ? (
                    <Button
                      label={sources.length > 1 ? 'Copy a week into this one' : `Copy week 1 into week ${week}`}
                      icon={IconCopy}
                      variant="secondary"
                      block
                      onPress={() => (sources.length > 1 ? setCopying(true) : copyFrom(1))}
                      style={styles.copy}
                    />
                  ) : null}

                  {!view.repeats && week > 1 && view.authoredWeeks.includes(week) ? (
                    <Button
                      label={`Clear week ${week}`}
                      variant="ghost"
                      onPress={() => setResetting(true)}
                      style={styles.clear}
                    />
                  ) : null}

                  <View style={styles.actions}>
                    <Button
                      label="Assign to a client"
                      icon={IconUsers}
                      onPress={() =>
                        navigation.navigate('AssignProgram', { templateId: view.id, name: view.name })
                      }
                      style={styles.grow}
                    />
                  </View>

                  {/* Said once, at the point of action, rather than on every row. */}
                  <Text style={styles.fine}>
                    Assigning copies this onto them — every week of it. Editing it afterwards never
                    touches their plan.
                  </Text>
                </>
              )}
            </>
          ) : null}
        </ScrollView>
      </Reveal>

      {/* The layout. Changing it never deletes anything: a day taken off the
          list keeps whatever was on it, and 3b keeps drawing it. */}
      <Sheet visible={layingOut} onClose={() => setLayingOut(false)} title="How this program runs">
        <Text style={styles.label}>Days a week</Text>
        <Seg>
          {SHORT.map((label, i) => (
            <Chip
              key={label}
              label={label}
              selected={draftDays.includes(i + 1)}
              onPress={() =>
                setDraftDays((current) =>
                  current.includes(i + 1)
                    ? current.filter((d) => d !== i + 1)
                    : [...current, i + 1].sort((a, b) => a - b),
                )
              }
            />
          ))}
        </Seg>
        <Text style={styles.meta}>
          {draftDays.length
            ? `${draftDays.length} day${draftDays.length === 1 ? '' : 's'} a week. Taking a day off the list leaves whatever is on it alone — remove those exercises yourself if you meant to.`
            : 'A program with no days has nowhere to put an exercise.'}
        </Text>

        <Text style={styles.label}>How long it runs</Text>
        <Seg>
          {LENGTHS.map((n) => (
            <Chip
              key={n}
              label={n === 1 ? '1 week' : `${n} weeks`}
              selected={draftWeeks === n}
              onPress={() => setDraftWeeks(n)}
            />
          ))}
        </Seg>
        <Text style={styles.meta}>
          {draftWeeks === 1
            ? 'One week, repeated for as long as the client is on it.'
            : `Week 1 is the one you build. Weeks 2–${draftWeeks} repeat it until you copy a week into them and change something.`}
        </Text>

        <Button label="Save it" variant="primary" size="lg" block onPress={saveLayout} />
      </Sheet>

      {/* Only asked when there is more than one week to copy from. One source
          and the button does it without a question nobody has an answer to. */}
      <Sheet visible={copying} onClose={() => setCopying(false)} title={`Copy into week ${week}`}>
        <Text style={styles.meta}>
          Whichever week you pick is duplicated onto week {week}. Nothing about the week you copy
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

      <Dialog
        visible={removing !== null}
        title={`Take ${removing?.name ?? 'it'} off week ${week}?`}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target) {
            void removeFromBlueprint(params.templateId, target.exerciseId, target.day, week);
          }
        }}
      >
        It comes off this week of the template only. Other weeks keep it, and anyone already
        assigned this program keeps the copy they are training on.
      </Dialog>

      <Dialog
        visible={resetting}
        title={`Clear week ${week}?`}
        confirmLabel="Clear it"
        onCancel={() => setResetting(false)}
        onConfirm={reset}
      >
        Everything you wrote for week {week} goes, and the week repeats week 1 again. Other weeks
        are untouched.
      </Dialog>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function ProgramSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading this program">
      <Seg style={styles.chips}>
        <Skeleton width={78} height={34} round={radius.full} />
        <Skeleton width={78} height={34} round={radius.full} />
        <Skeleton width={78} height={34} round={radius.full} />
      </Seg>
      <Skeleton width={124} height={10} style={styles.headGap} />
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

  chips: { marginTop: space.s3 },
  headGap: { marginTop: space.s5, marginBottom: space.s3 },
  note: { marginTop: space.s4 },
  actions: { flexDirection: 'row', gap: space.s2, marginTop: space.s5 },
  grow: { flex: 1 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s3 },
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginTop: space.s3, marginBottom: space.s4 },
  label: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: space.s2,
  },
  empty: { marginTop: space.s7 },
  add: { alignSelf: 'flex-start', marginTop: 2, marginBottom: space.s2 },
  copy: { marginTop: space.s4 },
  clear: { alignSelf: 'flex-start', marginTop: space.s3 },
  bare: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.ink3,
    paddingVertical: space.s2,
  },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
