/**
 * 5a · When you work.
 *
 * Two layers of availability, not four. Trainerize stacks Vacation over
 * Date-specific over Appointment-type over General; it is a complete model and
 * it is far too much for a trainer with a phone. This is layer one — weekly
 * hours — and time blocks are layer two.
 *
 * And it keeps Trainerize's best rule, stated on the screen: these constrain
 * what a client can self-book. They never constrain the trainer.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import {
  AppBar,
  AvailRow,
  Button,
  Callout,
  Chip,
  IconBack,
  IconButton,
  IconShield,
  Seg,
  Sheet,
  colors,
  space,
} from '../../../design';
import { useAuth } from '../../../store/AuthContext';
import { observeWorkingHours, saveWorkingHours, type HourWindow } from '../../../db/diary';
import { mergeWindows } from '../../../diary/diary';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The windows a trainer actually picks from.
 *
 * Peak on an Indian gym floor is 06:00–10:00 and 17:00–21:00, which is why the
 * split shift is the default shape here and not an edge case. Presets rather
 * than two time pickers: a picker asks four questions to say "mornings".
 */
const PRESETS: { key: string; label: string; window: HourWindow }[] = [
  { key: 'early', label: '05:00 – 09:00', window: { startMinute: 300, endMinute: 540 } },
  { key: 'morning', label: '06:00 – 11:00', window: { startMinute: 360, endMinute: 660 } },
  { key: 'midday', label: '11:00 – 15:00', window: { startMinute: 660, endMinute: 900 } },
  { key: 'evening', label: '17:00 – 21:00', window: { startMinute: 1020, endMinute: 1260 } },
  { key: 'late', label: '19:00 – 22:00', window: { startMinute: 1140, endMinute: 1320 } },
];

export function formatWindow(w: { startMinute: number; endMinute: number }): string {
  return `${clock(w.startMinute)} – ${clock(w.endMinute)}`;
}

function clock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function WorkingHoursScreen() {
  const navigation = useNavigation();
  const { trainerId } = useAuth();
  const [rows, setRows] = useState<{ weekday: number; startMinute: number; endMinute: number }[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<HourWindow[]>([]);

  useEffect(() => {
    const sub = observeWorkingHours().subscribe((all) =>
      setRows(
        all.map((r) => ({
          weekday: r.weekday,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
        })),
      ),
    );
    return () => sub.unsubscribe();
  }, []);

  const byDay = useMemo(() => {
    const out = new Map<number, HourWindow[]>();
    for (const row of rows) {
      const list = out.get(row.weekday) ?? [];
      list.push({ startMinute: row.startMinute, endMinute: row.endMinute });
      out.set(row.weekday, list);
    }
    // Merged with the diary's own rule, not just sorted. A day that has the
    // same window stored twice — an old tombstone the phone never learned
    // about, or hours saved twice — must draw one pill here and produce one
    // gap there, or the two screens contradict each other.
    for (const [weekday, list] of out) out.set(weekday, mergeWindows(list));
    return out;
  }, [rows]);

  const open = (weekday: number) => {
    setDraft(byDay.get(weekday) ?? []);
    setEditing(weekday);
  };

  const toggle = (window: HourWindow) =>
    setDraft((current) => {
      const has = current.some(
        (w) => w.startMinute === window.startMinute && w.endMinute === window.endMinute,
      );
      return has
        ? current.filter((w) => !(w.startMinute === window.startMinute && w.endMinute === window.endMinute))
        : [...current, window].sort((a, b) => a.startMinute - b.startMinute);
    });

  const save = async () => {
    if (editing === null || !trainerId) return;
    await saveWorkingHours(trainerId, editing, draft);
    setEditing(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.pad}>
        <AppBar
          title="When you work"
          subtitle="Clients can only self-book inside these"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.list}>
          {DAYS.map((day, i) => (
            <AvailRow
              key={day}
              day={SHORT[i]}
              windows={(byDay.get(i) ?? []).map(formatWindow)}
              onPress={() => open(i)}
            />
          ))}
        </View>

        <Callout icon={IconShield} style={styles.note}>
          Your own booking ignores all of this. Settings exist to constrain clients, not the person
          who set them.
        </Callout>
      </ScrollView>

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === null ? '' : DAYS[editing]}
      >
        <Text style={styles.label}>Which hours</Text>
        <Seg style={styles.seg}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset.key}
              label={preset.label}
              selected={draft.some(
                (w) =>
                  w.startMinute === preset.window.startMinute &&
                  w.endMinute === preset.window.endMinute,
              )}
              onPress={() => toggle(preset.window)}
            />
          ))}
        </Seg>

        <Text style={styles.hint}>
          {draft.length === 0
            ? 'Nothing picked — this day will be closed.'
            : `A split shift is two windows: ${draft.map(formatWindow).join(' and ')}.`}
        </Text>

        <Button
          label={draft.length === 0 ? 'Close this day' : 'Save hours'}
          size="lg"
          block
          style={styles.cta}
          onPress={() => void save()}
        />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s9 },
  list: { marginTop: space.s3, gap: 6 },
  note: { marginTop: space.s6 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  seg: { marginTop: space.s3 },
  hint: { marginTop: space.s4, fontSize: 13, color: colors.ink3 },
  cta: { marginTop: space.s5 },
});
