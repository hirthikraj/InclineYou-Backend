/**
 * Screens 18–24 · § 03 — Progress. The only client screen that leads with data.
 *
 * Records first, because a client can quote them; charts second, because a client
 * can only feel them.
 *
 * It obeys the system's chart rule without exception: **every chart is followed by
 * the figure in text**, because a 40px sparkline on a ₹12,000 phone in daylight is
 * a shape, not a reading.
 *
 * Bodyweight is deliberately directionless — no green arrow, no red one. The
 * metric component paints "down" in danger red, and XRep does not have an
 * opinion about which way a client's weight should move. Green for up and red for
 * down on somebody's body is the app taking a position.
 *
 * The + in the app bar is this screen's create action, and the answer to why there
 * is no centre button in the bar: each screen owns its own one.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ClientStackParamList } from '../../navigation/ClientStack';
import { useShell } from '../../navigation/AppShell';
import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import { buildBests, coachFirstName } from '../../client/client';
import { buildProgress } from '../../log/log';
import WeightSheet from './WeightSheet';
import {
  AppBar,
  Empty,
  IconButton,
  IconChart,
  IconMenu,
  IconPlus,
  List,
  Metric,
  Row,
  RowValue,
  SectionHead,
  Tag,
  WeekBars,
  colors,
  space,
} from '../../design';

type Nav = NativeStackNavigationProp<ClientStackParamList>;

export default function ClientProgressScreen() {
  const navigation = useNavigation<Nav>();
  const shell = useShell();
  const { clientId } = useAuth();
  const { input } = useClient(clientId);

  const [at] = useState(() => Date.now());
  const [weightOpen, setWeightOpen] = useState(false);
  const [showAllBests, setShowAllBests] = useState(false);

  const progress = useMemo(
    () => (clientId ? buildProgress(input, clientId, '8w', at) : null),
    [input, clientId, at],
  );
  const bests = useMemo(
    () => (clientId ? buildBests(input, clientId, at) : []),
    [input, clientId, at],
  );

  if (!clientId || !progress) return null;

  const first = coachFirstName(input.coach);
  const shown = showAllBests ? bests : bests.slice(0, 3);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Progress"
          subtitle={
            progress.sessions
              ? `${progress.sessions} session${progress.sessions === 1 ? '' : 's'} logged`
              : 'Nothing logged yet'
          }
          leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
          actions={
            <IconButton
              icon={IconPlus}
              label="Log a body metric"
              bare
              onPress={() => setWeightOpen(true)}
            />
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <SectionHead
          label="Personal bests"
          first
          count={bests.length || undefined}
          action={
            bests.length > 3
              ? {
                  label: showAllBests ? 'Show top 3' : `See all ${bests.length}`,
                  onPress: () => setShowAllBests((v) => !v),
                }
              : undefined
          }
        />
        {shown.length ? (
          <List style={styles.group}>
            {shown.map((best) => (
              <Row
                key={best.exerciseId}
                grouped
                title={best.name}
                subtitle={best.detail}
                onPress={() =>
                  navigation.navigate('ExerciseHistory', { clientId, exerciseId: best.exerciseId })
                }
                trailing={
                  <View style={styles.bestTail}>
                    {best.fresh ? <Tag label="New" tone="pr" /> : null}
                    <RowValue value={best.value} unit={best.unit} minWidth={64} />
                  </View>
                }
              />
            ))}
          </List>
        ) : (
          <Empty
            compact
            icon={IconChart}
            title="No bests yet"
            body="Log a set and the first one is set. Every record here is worked out from your own history, not stored — so a corrected set fixes it."
          />
        )}

        {progress.volume ? (
          <>
            <SectionHead label="Lifted per week" action={{ label: '8 weeks', onPress: () => {} }} />
            <Metric
              label="Kilograms lifted · this week"
              value={progress.volume.value}
              delta={progress.volume.delta ?? undefined}
            >
              <WeekBars
                days={progress.volume.weeks.map((week, i) => ({
                  label: week.label,
                  value: Math.round(week.fraction * 100),
                  on: i === progress.volume!.weeks.length - 1,
                }))}
              />
            </Metric>
            {/* The chart's own figures, in text. */}
            <Text style={styles.note}>{progress.volume.note}</Text>
          </>
        ) : null}

        <SectionHead
          label="Bodyweight"
          action={{ label: 'Log one', onPress: () => setWeightOpen(true) }}
        />
        {progress.bodyweight ? (
          <>
            <Metric label="Kilograms · last reading" value={progress.bodyweight.value} />
            <Text style={styles.note}>{progress.bodyweight.note}</Text>
          </>
        ) : (
          <Empty
            compact
            icon={IconChart}
            title="No readings yet"
            body={`Weigh in when you can — same scale, same time of day. ${first} sees the whole list, not just the latest.`}
          />
        )}
      </ScrollView>

      <WeightSheet
        visible={weightOpen}
        onClose={() => setWeightOpen(false)}
        clientId={clientId}
        input={input}
        coachFirst={first}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  group: { marginBottom: space.s2 },
  bestTail: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  note: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginTop: 8 },
});
