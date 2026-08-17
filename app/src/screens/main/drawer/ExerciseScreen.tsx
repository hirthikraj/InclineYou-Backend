/**
 * 3d · One exercise.
 *
 * Records, then how-to as numbered steps. The order is Hevy's and it is right: an
 * exercise page should answer **"what's my best?"** before it answers "how do I do
 * it?", because the coach standing on the floor already knows how.
 *
 * The three records are Hevy's set exactly — **heaviest, estimated 1RM, best set**
 * — because those are the three a coach quotes out loud.
 *
 * ── No demo loop ──────────────────────────────────────────────────────────
 *
 * The design opens the How-to tab with a demonstration and there is none. The
 * library briefly shipped one — a 180×180 animation per exercise — and it came
 * out with the rest of the artwork: the frames are © Gym visual and we hold no
 * licence for them, which is not a thing a fallback can paper over.
 *
 * So the tab opens on the numbered steps, which are MIT and genuinely ours. They
 * were always the substance of it; the loop was the illustration. A coach reading
 * "how do I set this up" gets an answer either way.
 *
 * Nothing here is stubbed for the loop's return. If a licence is bought, or a
 * freely licensed set is adopted, this is where the frame goes back — above
 * `GroupHead`, inside the tab rather than above the tabs, because the records are
 * what a coach opens this page for and a frame across the top pushes them below
 * the fold.
 *
 * ── Records and history are per client when you arrive from a client ──────
 *
 * The tap map asks for it and it matters: a coach next to Ananya wants Ananya's
 * best, not the gym's. `clientId` on the route is what switches it, and the header
 * says which one you are looking at so the number is never ambiguous.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useTraining } from '../../../training/useTraining';
import { buildExercise } from '../../../training/training';
import { toggleFavourite } from '../../../db/training';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Avatar,
  Callout,
  Empty,
  GroupHead,
  IconAlert,
  IconBack,
  IconButton,
  IconDumbbell,
  IconStar,
  List,
  Reveal,
  Row,
  Segmented,
  Skeleton,
  Stat,
  StatRail,
  Tag,
  Timeline,
  TimelineItem,
  colors,
  radius,
  space,
  type,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'Exercise'>;

type Tab = 'howto' | 'records' | 'history';

export default function ExerciseScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { trainerId } = useAuth();
  const { input, ready } = useTraining();

  const [tab, setTab] = React.useState<Tab>('howto');

  const view = useMemo(
    () => buildExercise(input, params.exerciseId, params.clientId ?? null),
    [input, params.exerciseId, params.clientId],
  );

  if (ready && !view) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Exercise"
            leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          />
        </View>
        <Empty
          icon={IconDumbbell}
          title="That exercise isn't here"
          body="It may have been removed, or it hasn't reached this phone yet."
          style={styles.empty}
        />
      </SafeAreaView>
    );
  }

  const tabs = [
    { key: 'howto' as const, label: 'How to' },
    { key: 'records' as const, label: 'Records' },
    { key: 'history' as const, label: 'History' },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view?.name ?? 'Exercise'}
          subtitle={view?.meta}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            view ? (
              <IconButton
                icon={(props) => <IconStar {...props} filled={view.favourite} />}
                label={view.favourite ? 'Unstar' : 'Favourite'}
                bare
                color={view.favourite ? colors.accentText : colors.ink2}
                onPress={() => {
                  if (trainerId) void toggleFavourite(trainerId, view.id);
                }}
              />
            ) : undefined
          }
        />
      </View>

      <Reveal ready={ready && view !== null} skeleton={<ExerciseSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {view ? (
            <>
              {view.scopedTo ? (
                <View style={styles.scope}>
                  <Avatar name={view.scopedTo} size="sm" />
                  <Text style={styles.scopeText} numberOfLines={1}>
                    {view.scopedTo}&apos;s records and history
                  </Text>
                </View>
              ) : null}

              <Segmented options={tabs} value={tab} onChange={setTab} style={styles.tabs} />

              {view.records.length ? (
                <StatRail style={styles.rail}>
                  {view.records.map((record) => (
                    <Stat
                      key={record.label}
                      label={record.label}
                      value={record.value}
                      unit={record.unit || undefined}
                    />
                  ))}
                </StatRail>
              ) : (
                /* No zeroes. "0 kg heaviest" is a claim about the client; nothing
                   logged is a fact about the app. */
                <Callout style={styles.rail}>
                  Nothing logged against this yet{view.scopedTo ? ` for ${view.scopedTo}` : ''}. The
                  records appear the first time a set is written down.
                </Callout>
              )}

              {tab === 'howto' ? (
                <View style={styles.section}>
                  <GroupHead label="How to do it" />
                  {view.steps.length ? (
                    <>
                      <Timeline style={styles.timeline}>
                        {view.steps.map((step, i) => (
                          /*
                           * The sentence IS the step. An earlier version derived a
                           * heading from its first clause and put the full sentence
                           * underneath, which read as "This exercise is best
                           * performed" followed by "This exercise is best performed
                           * inside a squat rack for safety purposes." — the same
                           * words twice, because the source is one sentence and not
                           * a heading plus a body.
                           */
                          <TimelineItem
                            key={i}
                            index={i + 1}
                            label={step}
                            state="todo"
                            last={i === view.steps.length - 1}
                          />
                        ))}
                      </Timeline>
                      <Callout icon={IconAlert} style={styles.note}>
                        Instructions are coaching cues, not medical advice. If a client has a shoulder
                        history, you decide whether this belongs in their program.
                      </Callout>
                    </>
                  ) : (
                    <Callout style={styles.note}>
                      No cues written for this one. {view.custom ? 'It’s yours — you know it.' : ''}
                    </Callout>
                  )}
                </View>
              ) : null}

              {tab === 'records' ? (
                <View style={styles.section}>
                  <GroupHead label={view.scopedTo ? `${view.scopedTo}'s bests` : 'Bests, all clients'} />
                  {view.records.length ? (
                    <List>
                      {view.records.map((record) => (
                        <Row
                          key={record.label}
                          grouped
                          title={record.label}
                          subtitle={RECORD_META[record.label] ?? undefined}
                          wrap
                          trailing={<Tag label={`${record.value}${record.unit}`} tone="accent" />}
                        />
                      ))}
                    </List>
                  ) : (
                    <Callout style={styles.note}>Nothing to rank yet.</Callout>
                  )}
                </View>
              ) : null}

              {tab === 'history' ? (
                <View style={styles.section}>
                  <GroupHead label="Every time it was logged" count={view.history.length} />
                  {view.history.length ? (
                    <List>
                      {view.history.map((entry) => (
                        <Row
                          key={entry.workoutId}
                          grouped
                          leading={<Avatar name={entry.clientName} size="sm" />}
                          title={view.scopedTo ? formatDate(entry.date) : entry.clientName}
                          subtitle={
                            view.scopedTo
                              ? entry.summary
                              : `${formatDate(entry.date)} · ${entry.summary}`
                          }
                          wrap
                          onPress={
                            entry.clientId
                              ? () => navigation.navigate('ClientDetail', { clientId: entry.clientId })
                              : undefined
                          }
                        />
                      ))}
                    </List>
                  ) : (
                    <Callout style={styles.note}>
                      Never logged{view.scopedTo ? ` by ${view.scopedTo}` : ''} yet.
                    </Callout>
                  )}
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </Reveal>
    </SafeAreaView>
  );
}

/** What each record actually means, said once rather than in a tooltip. */
const RECORD_META: Record<string, string> = {
  Heaviest: 'The most weight moved for at least one rep.',
  'Est. 1RM': 'Epley’s estimate from the best set. An estimate, not a lift that happened.',
  'Best set': 'The single set that moved the most total weight.',
  'Most reps': 'The most reps in one set.',
  'Total reps': 'Every rep ever logged against this.',
  'Sets logged': 'How many sets are on record.',
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** 'YYYY-MM-DD' → "9 Aug". Parsed by field, not by `Date`, which would time-zone it. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

function ExerciseSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading this exercise">
      <Skeleton height={48} round={radius.r2} style={styles.tabs} />
      <StatRail style={styles.rail}>
        <Skeleton height={78} round={radius.r2} />
        <Skeleton height={78} round={radius.r2} />
        <Skeleton height={78} round={radius.r2} />
      </StatRail>
      <Skeleton width={112} height={10} style={styles.headGap} />
      <Skeleton height={140} round={radius.r2} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  scope: { flexDirection: 'row', alignItems: 'center', gap: space.s2, marginTop: space.s3 },
  scopeText: { ...type.bodySm, color: colors.ink2, flex: 1, minWidth: 0 },

  tabs: { marginTop: space.s4 },
  rail: { marginTop: space.s4 },

  section: { marginTop: space.s2 },
  timeline: { marginTop: space.s1 },
  headGap: { marginTop: space.s5, marginBottom: space.s3 },
  note: { marginTop: space.s3 },
  empty: { marginTop: space.s7 },
});
