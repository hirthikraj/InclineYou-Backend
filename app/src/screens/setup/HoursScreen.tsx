/**
 * Screen · Trainer setup · When you work.
 *
 * The week's hours, asked once at setup because adding a client now depends on
 * them: a client's days and times are picked FROM these windows, so a trainer
 * who reaches "add a client" without hours on file would be choosing from a
 * default they never saw. Setup used to skip this question and seed a default
 * week at the end (`AuthContext.completeSetup`) — that seed still runs, but
 * only for trainers who skip here, because it stands down the moment any row
 * exists.
 *
 * One set of windows, applied to every day picked. Per-day differences are real
 * but rare on day one, and the full per-day editor is one tap from Settings
 * (Diary → When you work) — this screen's job is a true-enough week in under a
 * minute, not the whole model.
 *
 * Like packs, the hours are written straight into the synced `working_hours`
 * table rather than the setup draft: they are business data the diary reads,
 * and a trainer who quits the flow halfway keeps them.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { useSetup } from '../../setup/SetupContext';
import { useAuth } from '../../store/AuthContext';
import {
  saveWorkingHours,
  workingHoursCollection,
  DEFAULT_WORKING_HOURS,
  type HourWindow,
} from '../../db/diary';
import { mergeWindows } from '../../diary/diary';
import {
  Button,
  Callout,
  CalloutStrong,
  Chip,
  FieldMsg,
  IconButton,
  IconClock,
  IconPlus,
  IconTrash,
  MINUTES_IN_DAY,
  Seg,
  TimeField,
  colors,
  formatMinute,
  space,
} from '../../design';
import { SetupBar, SetupBody, SetupFoot, SetupScreen, SetupSub, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Hours'>;
};

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday–Saturday, Sunday off — the shape of an Indian gym floor's week. */
const DEFAULT_DAYS = [0, 1, 2, 3, 4, 5];

const MIN_WINDOW_MIN = 30;
const NEW_WINDOW_MIN = 2 * 60;

/** The common shapes, as one tap — the same list the full editor offers. */
const PRESETS: { key: string; label: string; window: HourWindow }[] = [
  { key: 'early', label: '05:00 – 09:00', window: { startMinute: 300, endMinute: 540 } },
  { key: 'morning', label: '06:00 – 11:00', window: { startMinute: 360, endMinute: 660 } },
  { key: 'midday', label: '11:00 – 15:00', window: { startMinute: 660, endMinute: 900 } },
  { key: 'evening', label: '17:00 – 21:00', window: { startMinute: 1020, endMinute: 1260 } },
  { key: 'late', label: '19:00 – 22:00', window: { startMinute: 1140, endMinute: 1320 } },
];

function formatWindow(w: HourWindow): string {
  return `${formatMinute(w.startMinute)} – ${formatMinute(w.endMinute)}`;
}

const sameWindows = (a: HourWindow[], b: HourWindow[]) =>
  a.length === b.length &&
  a.every((w, i) => w.startMinute === b[i].startMinute && w.endMinute === b[i].endMinute);

export default function HoursScreen({ navigation }: Props) {
  const { patch, skip } = useSetup();
  const { trainerId } = useAuth();

  const [days, setDays] = useState<number[]>(DEFAULT_DAYS);
  const [windows, setWindows] = useState<HourWindow[]>(DEFAULT_WORKING_HOURS);
  /** What the table already holds, keyed by weekday — the diff base for save. */
  const [stored, setStored] = useState<Map<number, HourWindow[]>>(new Map());
  const [pressed, setPressed] = useState(false);
  const [saving, setSaving] = useState(false);

  // A resumed trainer sees the week they saved, not the default over it. The
  // windows come from the earliest saved day — this screen keeps one set for
  // the whole week, and per-day differences belong to the full editor.
  useEffect(() => {
    let alive = true;
    void workingHoursCollection
      .query()
      .fetch()
      .then((rows) => {
        if (!alive || rows.length === 0) return;
        const byDay = new Map<number, HourWindow[]>();
        for (const row of rows) {
          const list = byDay.get(row.weekday) ?? [];
          list.push({ startMinute: row.startMinute, endMinute: row.endMinute });
          byDay.set(row.weekday, list);
        }
        for (const [weekday, list] of byDay) byDay.set(weekday, mergeWindows(list));
        setStored(byDay);
        const saved = [...byDay.keys()].sort((a, b) => a - b);
        setDays(saved);
        setWindows(byDay.get(saved[0]) ?? DEFAULT_WORKING_HOURS);
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggleDay = (day: number) =>
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b),
    );

  const togglePreset = (window: HourWindow) =>
    setWindows((current) => {
      const has = current.some(
        (w) => w.startMinute === window.startMinute && w.endMinute === window.endMinute,
      );
      return has
        ? current.filter(
            (w) => !(w.startMinute === window.startMinute && w.endMinute === window.endMinute),
          )
        : [...current, window].sort((a, b) => a.startMinute - b.startMinute);
    });

  /** One end moves, the other gets out of the way — same rule as the full editor. */
  const editWindow = (index: number, edge: 'start' | 'end', value: number) =>
    setWindows((current) =>
      current.map((w, i) => {
        if (i !== index) return w;
        if (edge === 'start') {
          const startMinute = Math.min(value, MINUTES_IN_DAY - MIN_WINDOW_MIN);
          return { startMinute, endMinute: Math.max(w.endMinute, startMinute + MIN_WINDOW_MIN) };
        }
        const endMinute = Math.max(value, MIN_WINDOW_MIN);
        return { startMinute: Math.min(w.startMinute, endMinute - MIN_WINDOW_MIN), endMinute };
      }),
    );

  const addWindow = () =>
    setWindows((current) => {
      const latest = current.reduce((max, w) => Math.max(max, w.endMinute), 0);
      const startMinute = Math.min(
        current.length > 0 ? latest + 60 : 6 * 60,
        MINUTES_IN_DAY - NEW_WINDOW_MIN,
      );
      return [...current, { startMinute, endMinute: startMinute + NEW_WINDOW_MIN }];
    });

  const removeWindow = (index: number) =>
    setWindows((current) => current.filter((_, i) => i !== index));

  const invalid = windows.some((w) => w.endMinute - w.startMinute < MIN_WINDOW_MIN);
  const merged = mergeWindows(windows);

  const onSkip = () => {
    skip('hours');
    navigation.navigate('Packs');
  };

  const onContinue = async () => {
    setPressed(true);
    if (invalid) return;
    // No days and no windows is a skip spelled out — treat it as one honestly
    // rather than writing an empty week that closes all seven days.
    if (days.length === 0 || merged.length === 0) return;
    if (!trainerId) return;

    setSaving(true);
    try {
      // Only the weekdays whose answer changed are written: a resumed trainer
      // who edits nothing syncs nothing.
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const next = days.includes(weekday) ? merged : [];
        const before = stored.get(weekday) ?? [];
        if (!sameWindows(next, before)) await saveWorkingHours(trainerId, weekday, next);
      }
      patch({ hoursCount: merged.length * days.length });
      navigation.navigate('Packs');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SetupScreen>
      <SetupBar step="hours" onBack={() => navigation.goBack()} onSkip={onSkip} />

      <SetupBody>
        <SetupTitle tight>When do you train clients?</SetupTitle>
        <SetupSub>
          Adding a client asks for their days and times, and offers slots from these hours. One set
          for the week here — day-by-day differences live in Settings.
        </SetupSub>

        <Text style={styles.group}>The days you work</Text>
        <Seg>
          {SHORT.map((label, i) => (
            <Chip key={label} label={label} selected={days.includes(i)} onPress={() => toggleDay(i)} />
          ))}
        </Seg>
        {pressed && days.length === 0 ? (
          <FieldMsg tone="error">Pick at least one day, or skip the step.</FieldMsg>
        ) : null}

        <Text style={styles.group}>Your hours on those days</Text>
        <Seg>
          {PRESETS.map((preset) => (
            <Chip
              key={preset.key}
              label={preset.label}
              selected={windows.some(
                (w) =>
                  w.startMinute === preset.window.startMinute &&
                  w.endMinute === preset.window.endMinute,
              )}
              onPress={() => togglePreset(preset.window)}
            />
          ))}
        </Seg>

        {windows.map((window, i) => (
          // Keyed by position — unsaved windows have no identity yet.
          <View key={i} style={styles.window}>
            <TimeField
              label="Starts"
              value={window.startMinute}
              onChange={(next) => editWindow(i, 'start', next)}
              style={styles.field}
            />
            <TimeField
              label="Ends"
              value={window.endMinute}
              onChange={(next) => editWindow(i, 'end', next)}
              style={styles.field}
            />
            <IconButton
              icon={IconTrash}
              label={`Remove ${formatWindow(window)}`}
              bare
              onPress={() => removeWindow(i)}
            />
          </View>
        ))}

        <Button
          label={windows.length === 0 ? 'Add hours' : 'Add another window'}
          variant="ghost"
          block
          icon={IconPlus}
          style={styles.add}
          onPress={addWindow}
        />

        {invalid ? (
          <FieldMsg tone="error">
            A window has to be at least {MIN_WINDOW_MIN} minutes long.
          </FieldMsg>
        ) : pressed && merged.length === 0 ? (
          <FieldMsg tone="error">Add at least one window, or skip the step.</FieldMsg>
        ) : merged.length > 1 ? (
          <Text style={styles.hint}>
            A split shift is two windows: {merged.map(formatWindow).join(' and ')}.
          </Text>
        ) : null}

        <Callout icon={IconClock} style={styles.note}>
          Nothing here boxes you in. <CalloutStrong>These constrain what clients can book</CalloutStrong>,
          never you — and each day is editable on its own later, from Settings.
        </Callout>
      </SetupBody>

      <SetupFoot>
        <Button
          label="Continue"
          variant="primary"
          size="lg"
          block
          loading={saving}
          onPress={() => void onContinue()}
        />
      </SetupFoot>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  group: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: space.s2,
    marginTop: space.s6,
  },
  window: { flexDirection: 'row', alignItems: 'flex-end', gap: space.s2, marginTop: space.s3 },
  field: { flex: 1 },
  add: { marginTop: space.s3 },
  hint: { marginTop: space.s3, fontSize: 13, color: colors.ink3 },
  note: { marginTop: 'auto' },
});
