/**
 * 3b · Inside a program.
 *
 * Week chips, then days, then exercises with **sets × reps · rest** on the row.
 * That hierarchy is TrueCoach's and Trainerize's, and it is right — it is how a
 * trainer talks about a plan.
 *
 * ── Two things this screen is honest about ────────────────────────────────
 *
 * **Week chips move the label, not the content.** The template's blueprint is one
 * week's shape; a linear-progression program that genuinely differs week to week
 * is authored at a desk, and this screen would need a per-week blueprint to show
 * it. Rather than draw four identical weeks and let a trainer think they are
 * looking at week three's real prescription, the chip row says which week is
 * selected and the body says the shape repeats. Inventing week-specific numbers
 * would be worse than saying the shape is the same.
 *
 * **Editing an exercise's numbers needs the server.** The blueprint lives in
 * `template.structure`, and the endpoint that rewrites it is the same one that
 * validates it. So the row opens the exercise rather than an inline editor, and
 * the assign button is the primary action — which is what this screen is for.
 *
 * Adding and removing an exercise, though, is a local write to that same JSON
 * column, so it happens here: the design draws **Add an exercise** under every
 * day, and without it a program created on this phone would have nowhere to put
 * anything. Defaults of 3 × 10 · 60s go on the row, changed at a desk.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useTraining } from '../../../training/useTraining';
import { buildProgram } from '../../../training/training';
import { removeFromBlueprint } from '../../../db/training';
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
  IconCopy,
  IconLayers,
  IconPlus,
  IconUsers,
  List,
  Reveal,
  Row,
  Seg,
  Skeleton,
  SkeletonRow,
  Thumb,
  colors,
  radius,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'Program'>;

export default function ProgramScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { input, ready } = useTraining();

  const [week, setWeek] = useState(1);
  /** Long-pressed row, awaiting confirmation. Removing is the one destructive act here. */
  const [removing, setRemoving] = useState<{ name: string; exerciseId: string; day: number } | null>(
    null,
  );

  const view = useMemo(() => buildProgram(input, params.templateId), [input, params.templateId]);

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

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view?.name ?? 'Program'}
          subtitle={view?.subtitle}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
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

              {view.empty ? (
                <>
                  <Empty
                    icon={IconLayers}
                    title="Nothing on this program yet"
                    body="Add the first exercise to a day and it starts taking shape. A twelve-week plan is still a desk job — this is for getting it started."
                    style={styles.empty}
                  />
                  <GroupHead label="Add to a day" />
                  <List style={styles.group}>
                    {WEEKDAYS.map((label, i) => (
                      <Row
                        key={label}
                        grouped
                        title={label}
                        subtitle="Nothing yet"
                        onPress={() =>
                          navigation.navigate('Exercises', {
                            pickFor: { templateId: params.templateId, day: i + 1 },
                          })
                        }
                      />
                    ))}
                  </List>
                </>
              ) : (
                <>
                  {view.days.map((day) => (
                    <View key={day.day}>
                      <GroupHead label={day.title} count={day.exercises.length} />
                      <List>
                        {day.exercises.map((exercise) => (
                          <Row
                            key={exercise.id}
                            grouped
                            leading={<Thumb size="sm" custom={exercise.custom} />}
                            title={exercise.name}
                            subtitle={exercise.prescription}
                            onPress={() =>
                              navigation.navigate('Exercise', { exerciseId: exercise.exerciseId })
                            }
                            onLongPress={() => setRemoving({ ...exercise, day: day.day })}
                          />
                        ))}
                      </List>
                      <Button
                        label="Add an exercise"
                        icon={IconPlus}
                        variant="text"
                        onPress={() =>
                          navigation.navigate('Exercises', {
                            pickFor: { templateId: params.templateId, day: day.day },
                          })
                        }
                        style={styles.add}
                      />
                    </View>
                  ))}

                  {view.weeks > 1 ? (
                    <Callout icon={IconCopy} style={styles.note}>
                      <CalloutStrong>Week {week} runs the same shape.</CalloutStrong> This program is
                      one week&apos;s plan repeated for {view.weeks} weeks — per-week progression is
                      authored at a desk, and Train X won&apos;t invent numbers it doesn&apos;t have.
                    </Callout>
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
                    Assigning copies this onto them. Editing it afterwards never touches their plan.
                  </Text>
                </>
              )}
            </>
          ) : null}
        </ScrollView>
      </Reveal>

      <Dialog
        visible={removing !== null}
        title={`Take ${removing?.name ?? 'it'} off this program?`}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target) {
            void removeFromBlueprint(params.templateId, target.exerciseId, target.day);
          }
        }}
      >
        It comes off the template only. Anyone already assigned this program keeps the copy they
        are training on.
      </Dialog>
    </SafeAreaView>
  );
}

/** 1 = Monday, the same convention the blueprint stores. */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
  empty: { marginTop: space.s7 },
  group: { marginBottom: space.s2 },
  add: { alignSelf: 'flex-start', marginTop: 2, marginBottom: space.s2 },
});
