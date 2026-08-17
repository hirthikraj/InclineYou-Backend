/**
 * 5d · The client's plan — step 4 of adding a client, and the last one.
 *
 * The week was picked on 5c; this screen puts a program on it. A template's
 * days are ordinal slots, and the server refuses an apply whose schedule does
 * not cover them exactly — so the shelf is split by that rule up front:
 * programs whose day-count matches the client's week are pickable, the rest
 * say what week they'd need. The weekdays and times themselves are already
 * decided — they ride in from `weekly_schedule` untouched, which is the whole
 * point of asking for the week first.
 *
 * **Which day lands where is the trainer's call.** Day 1 on the earliest
 * weekday is the default, not a rule — a client who wants legs fresh on Monday
 * maps Day 3 there, and the mapping list under the picked program is where
 * that is said. The confirmation dialog reads the mapping back before anything
 * is written.
 *
 * **Confirming also books the sessions.** The week and the plan together are a
 * standing appointment, so the apply is followed by a `bookSeries` on exactly
 * those weekdays and times — as many sessions as the client has paid for
 * (their pack's remaining count), or the program's own length when nothing on
 * their account counts sessions. The apply is the transaction that matters;
 * a booking that fails leaves a plan without sessions, which the diary books
 * in one tap, so it never takes the apply down with it.
 *
 * The copy is the app's one online-only write (see AssignProgramScreen for the
 * full argument): it happens on the server so it is all-or-nothing. Offline —
 * or template-less — the step is skippable, and the roster's "Set up" verb
 * brings the trainer back here until a live plan exists. Only then is the
 * client fully in the routine.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { isAxiosError } from 'axios';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { applyTemplate, type ScheduleEntry } from '../../../api/programs';
import { syncDatabase } from '../../../db/sync';
import { observeClient } from '../../../db/clients';
import { bookSeries } from '../../../db/diary';
import { packSessionsLeft } from '../../../db/money';
import { useAuth } from '../../../store/AuthContext';
import { useTraining } from '../../../training/useTraining';
import { parseBlueprint, parseDayLabels, parseTrainingDays } from '../../../training/training';
import DayMapList from '../../../training/DayMapList';
import {
  parseWeeklySchedule,
  slotOccurrences,
  timeToMinute,
  type WeeklySlot,
} from '../../../clients/schedule';
import type { DeliveryMode } from '../../../home/mode';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  ChoiceSlot,
  Dialog,
  DialogStrong,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconLayers,
  List,
  Radio,
  Row,
  SkipButton,
  Steps,
  StepsLabel,
  Toast,
  colors,
  formatMinute,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'ClientPlan'>;

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "17 Aug" — the shape the diary's own booking copy uses. */
function stamp(at?: number): string {
  if (!at) return '';
  const d = new Date(at);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/** How many weeks to book when nothing on the client's account counts sessions. */
const FALLBACK_WEEKS = 4;

interface ShelfEntry {
  id: string;
  name: string;
  weeks: number | null;
  /** The template's ordinal day slots — the same union AssignProgram computes. */
  slots: number[];
  /** Trainer-authored day names, keyed by slot: {3: 'Legs'}. */
  labels: Record<number, string>;
}

export default function ClientPlanScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useRoute<Rt>().params;
  const { trainerId } = useAuth();
  const { input } = useTraining();

  const [name, setName] = useState('');
  const [week, setWeek] = useState<WeeklySlot[]>([]);
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState<DeliveryMode | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  /** Trainer's remap of which plan day lands where. Null means the default order. */
  const [mapPick, setMapPick] = useState<number[] | null>(null);
  /** Sessions the client has paid for — the booking bound. Null: no pack counts. */
  const [packLeft, setPackLeft] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const sub = observeClient(clientId).subscribe((client) => {
      if (!client) {
        navigation.goBack();
        return;
      }
      setName(client.name);
      setWeek(parseWeeklySchedule(client.weeklySchedule));
      setDuration(client.sessionDurationMinutes || 60);
      setMode(
        client.deliveryMode === 'floor' || client.deliveryMode === 'remote'
          ? client.deliveryMode
          : undefined,
      );
    });
    return () => sub.unsubscribe();
  }, [clientId, navigation]);

  // The pack sold two steps ago (or before) bounds the booking. Read once —
  // nothing on this screen changes it.
  useEffect(() => {
    let alive = true;
    packSessionsLeft(clientId)
      .then((left) => {
        if (alive) setPackLeft(left);
      })
      .catch(() => {
        /* Unreadable is the same answer as no pack: fall back to the program's length. */
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  const shelf: ShelfEntry[] = useMemo(
    () =>
      input.templates.map((template) => {
        const blueprint = parseBlueprint(template.structure);
        const laidOut = parseTrainingDays(template.trainingDays, blueprint);
        const used = blueprint
          .map((entry) => entry.day)
          .filter((day): day is number => day != null && day >= 1 && day <= 7);
        return {
          id: template.id,
          name: template.name,
          weeks: template.weeks ?? null,
          slots: [...new Set([...laidOut, ...used])].sort((a, b) => a - b),
          labels: parseDayLabels(template.dayLabels),
        };
      }),
    [input.templates],
  );

  const fits = useMemo(() => shelf.filter((t) => t.slots.length === week.length), [shelf, week]);
  const rest = useMemo(
    () => shelf.filter((t) => t.slots.length !== week.length),
    [shelf, week],
  );

  const first = name.split(' ')[0] || 'They';
  const weekLabel = week.map((s) => WEEKDAY_SHORT[s.weekday - 1]).join('/');
  const chosen = fits.find((t) => t.id === picked) ?? null;
  const ready = chosen !== null && week.length > 0 && !saving;

  /**
   * Which plan day lands on which weekday. Default: slot i on the i-th
   * weekday, earliest first — the order a training week usually means. The
   * trainer's remap replaces it only while it is still a permutation of THIS
   * template's slots, so a remap made on one program cannot leak onto another.
   */
  const map = useMemo(() => {
    if (!chosen) return [];
    const valid =
      mapPick !== null &&
      mapPick.length === chosen.slots.length &&
      chosen.slots.every((d) => mapPick.includes(d));
    return valid ? mapPick : chosen.slots;
  }, [chosen, mapPick]);

  /**
   * What confirming will book: the client's standing slots, repeated until
   * their pack runs out — nobody should be booked into sessions they have not
   * paid for. With no session-counting pack on the account, the program's own
   * length is the bound (or a month, for a program with no length).
   */
  const occurrences = useMemo(() => {
    if (!chosen || week.length === 0) return [];
    const count = packLeft ?? (chosen.weeks ?? FALLBACK_WEEKS) * week.length;
    const slots = week.map((s) => ({ weekday: s.weekday, minute: timeToMinute(s.time) ?? 0 }));
    return slotOccurrences(Date.now(), slots, count);
  }, [chosen, week, packLeft]);

  const assign = async () => {
    if (!ready || !chosen) return;
    setConfirming(false);
    setSaving(true);
    try {
      const schedule: ScheduleEntry[] = week.map((slot, i) => ({
        day: map[i],
        weekday: slot.weekday,
        time: slot.time,
      }));
      const { id: programId } = await applyTemplate(chosen.id, clientId, schedule, chosen.name);
      // Pull the new program down so the client's screens show it now.
      await syncDatabase('client-plan');
      // The standing week, booked as real diary rows. Its own try: the plan is
      // already on the client, and losing the apply over a booking hiccup would
      // cost far more than booking again from the diary does.
      if (occurrences.length > 0 && trainerId) {
        try {
          await bookSeries(
            { trainerId, clientId, durationMinutes: duration, mode, programId },
            occurrences,
          );
        } catch {
          /* The diary books the same week in one tap. */
        }
      }
      navigation.replace('ClientAdded', { clientId });
    } catch (e) {
      const detail = isAxiosError(e)
        ? (e.response?.data as { detail?: string } | undefined)?.detail
        : null;
      setNotice(detail ?? 'Could not assign it. Copying a program needs a connection.');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={`${first}'s plan`}
          subtitle="Add a client · step 4"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <SkipButton
              label="Finish later"
              onPress={() => navigation.replace('ClientAdded', { clientId })}
            />
          }
        />
        <View style={styles.steps}>
          <Steps count={4} current={3} />
          <StepsLabel current={3} count={4} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {week.length === 0 ? (
          /* Deep-linked here without a week — the plan cannot land on nothing. */
          <>
            <Empty
              icon={IconLayers}
              title="Their week comes first"
              body={`A plan lands on the days ${first} trains, and those aren't picked yet.`}
              style={styles.empty}
            />
            <Button
              label={`Pick ${first}'s week`}
              size="lg"
              block
              onPress={() => navigation.replace('ClientSchedule', { clientId })}
              style={styles.action}
            />
          </>
        ) : shelf.length === 0 ? (
          <>
            <Empty
              icon={IconLayers}
              title="No programs on your shelf yet"
              body={`Build one in Programs and it'll be pickable here. ${first} keeps their ${weekLabel} week either way — finish this later from the roster.`}
              style={styles.empty}
            />
            <Button
              label="Open Programs"
              size="lg"
              block
              onPress={() => navigation.navigate('Programs')}
              style={styles.action}
            />
          </>
        ) : (
          <>
            <Text style={styles.meta}>
              {`${first} trains ${week.length} day${week.length === 1 ? '' : 's'} a week — ${weekLabel}. A plan with the same number of days lands on exactly those, at the times already picked.`}
            </Text>

            {fits.length > 0 ? (
              <>
                <GroupHead label={`Fits their ${week.length}-day week`} count={fits.length} />
                <List>
                  {fits.map((t) => (
                    <Row
                      key={t.id}
                      grouped
                      selected={t.id === picked}
                      title={t.name}
                      subtitle={t.weeks ? `${t.weeks} weeks` : undefined}
                      leading={
                        <ChoiceSlot>
                          <Radio checked={t.id === picked} />
                        </ChoiceSlot>
                      }
                      onPress={() => {
                        setPicked((cur) => (cur === t.id ? null : t.id));
                        // A remap belongs to the program it was made on.
                        setMapPick(null);
                      }}
                    />
                  ))}
                </List>
              </>
            ) : (
              <Callout style={styles.note}>
                Nothing on your shelf trains <CalloutStrong>{week.length} days</CalloutStrong> a
                week. Build one in Programs, or go back and pick a different week for {first}.
              </Callout>
            )}

            {rest.length > 0 ? (
              <>
                <GroupHead label="Needs a different week" count={rest.length} style={styles.section} />
                <List>
                  {rest.map((t) => (
                    <Row
                      key={t.id}
                      grouped
                      title={t.name}
                      subtitle={`Trains ${t.slots.length} day${t.slots.length === 1 ? '' : 's'} a week — their week has ${week.length}`}
                    />
                  ))}
                </List>
              </>
            ) : null}

            {chosen && chosen.slots.length > 1 ? (
              <>
                <GroupHead label="Which day lands where" style={styles.section} />
                <Text style={styles.meta}>
                  {`Day ${chosen.slots[0]} goes on ${first}'s earliest day unless you say otherwise. Tap a day to move it — the two days swap.`}
                </Text>
                <DayMapList
                  rows={week.map(
                    (s) => `${WEEKDAY_LONG[s.weekday - 1]} · ${formatMinute(timeToMinute(s.time) ?? 0)}`,
                  )}
                  days={chosen.slots}
                  labels={chosen.labels}
                  map={map}
                  onChange={setMapPick}
                />
              </>
            ) : null}

            <Callout style={styles.note}>
              This <CalloutStrong>copies</CalloutStrong> the program onto {first}, starting today,
              on their {weekLabel} slots
              {occurrences.length > 0 ? (
                <>
                  , and books{' '}
                  <CalloutStrong>
                    {occurrences.length} session{occurrences.length === 1 ? '' : 's'}
                  </CalloutStrong>{' '}
                  on them —{' '}
                  {packLeft !== null
                    ? 'as many as their pack has left'
                    : 'the length of the program'}
                  . The copy happens on the server so it is all-or-nothing — this one step needs a
                  connection.
                </>
              ) : (
                <>. It happens on the server so it is all-or-nothing — this one step needs a connection.</>
              )}
            </Callout>

            <Button
              label={chosen ? `Put ${first} on ${chosen.name}` : 'Pick a program'}
              size="lg"
              block
              disabled={!ready}
              loading={saving}
              onPress={() => setConfirming(true)}
              style={styles.action}
            />
          </>
        )}
      </ScrollView>

      {/* The read-back before anything is written: the mapping as chosen, and
          what confirming books. The one moment the whole flow asks twice. */}
      <Dialog
        visible={confirming && chosen !== null}
        title={`Put ${first} on ${chosen?.name ?? ''}?`}
        confirmLabel={
          occurrences.length > 0
            ? `Book ${occurrences.length} session${occurrences.length === 1 ? '' : 's'}`
            : 'Assign it'
        }
        confirmVariant="primary"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void assign()}
      >
        {week
          .map((slot, i) => {
            const label = chosen?.labels[map[i]];
            return `${WEEKDAY_LONG[slot.weekday - 1]} ${formatMinute(timeToMinute(slot.time) ?? 0)} — Day ${map[i]}${label ? ` · ${label}` : ''}`;
          })
          .join('\n')}
        {occurrences.length > 0 ? (
          <>
            {'\n\n'}Books{' '}
            <DialogStrong>
              {occurrences.length} session{occurrences.length === 1 ? '' : 's'}
            </DialogStrong>{' '}
            on these slots, the first on {stamp(occurrences[0])}, the last on{' '}
            {stamp(occurrences[occurrences.length - 1])}
            {packLeft !== null ? ' — the day their pack runs out' : ''}. Any one of them can be
            moved or cancelled from the diary.
          </>
        ) : (
          <>
            {'\n\n'}No sessions get booked: their pack has nothing left on it. Sell one from their
            file and the diary books this same week in one tap.
          </>
        )}
      </Dialog>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  steps: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: 2 },
  body: { paddingHorizontal: space.inset, paddingTop: space.s5, paddingBottom: space.s10 },

  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  section: { marginTop: space.s5 },
  note: { marginTop: space.s4 },
  action: { marginTop: space.s5 },
  empty: { marginTop: space.s7 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
