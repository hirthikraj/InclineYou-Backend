/**
 * 5c · The client's week — step 3 of adding a client.
 *
 * Which days they train and at what time, once, as the client's standing
 * weekly pattern (`clients.weekly_schedule`). The diary already reads this for
 * its "usually trains around now" suggestions; the plan step reads it next,
 * because the number of days picked here is the number of days the plan must
 * have.
 *
 * **The times on offer are the trainer's own working hours, minus the hours
 * other clients already hold.** Each picked day shows slot chips generated
 * from that weekday's `working_hours` windows — captured at setup (or the
 * seeded default week) — so the answer is chosen from hours that exist rather
 * than typed into hours that don't. A slot inside another client's standing
 * session (their `weekly_schedule` or a live program's schedule) is not
 * offered at all: two clients on one hour every week is a mistake, not a
 * choice, so unlike the diary's warn-only clash rule this one blocks. A day
 * the trainer doesn't work — or one that is fully booked — says so instead of
 * offering slots. Save re-checks against the latest data, so a schedule that
 * synced in mid-edit still can't double-book.
 *
 * Resumable by construction: the screen seeds itself from whatever schedule is
 * already on the client, so leaving halfway and coming back (from the roster's
 * "Set up" verb) lands on the same answers. A client only joins the routine
 * once this AND the plan step are done — the roster chases until then.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { combineLatest } from 'rxjs';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { clientsCollection, observeClient, saveWeeklySchedule } from '../../../db/clients';
import { programsCollection } from '../../../db/programs';
import { observeWorkingHours } from '../../../db/diary';
import { mergeWindows } from '../../../diary/diary';
import { parseWeeklySchedule, serializeWeeklySchedule } from '../../../clients/schedule';
import { busySlots, slotClash, type BusySlot } from '../../../clients/conflicts';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Chip,
  FieldMsg,
  IconBack,
  IconButton,
  Seg,
  SkipButton,
  Steps,
  StepsLabel,
  colors,
  formatMinute,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'ClientSchedule'>;

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** One session, and the grid the slots sit on. The full booking flow owns finer control. */
const SESSION_MINUTES = 60;
const SLOT_STEP = 30;

interface Window {
  startMinute: number;
  endMinute: number;
}

/** Every start a session fits into, across a day's windows. */
function slotsIn(windows: Window[]): number[] {
  const out: number[] = [];
  for (const w of windows) {
    for (let at = w.startMinute; at + SESSION_MINUTES <= w.endMinute; at += SLOT_STEP) out.push(at);
  }
  return out;
}

export default function ClientScheduleScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useRoute<Rt>().params;

  const [name, setName] = useState('');
  /** 0 = Monday, matching `working_hours`. Converted to 1-based on save. */
  const [days, setDays] = useState<number[]>([]);
  const [times, setTimes] = useState<Record<number, number>>({});
  const [hours, setHours] = useState<Map<number, Window[]>>(new Map());
  /** Why a tapped day offered nothing: the trainer is off, or it's all booked. */
  const [dayTap, setDayTap] = useState<{ day: number; reason: 'closed' | 'full' } | null>(null);
  /** Hours the other clients hold — the slots this screen must not offer. */
  const [busy, setBusy] = useState<BusySlot[]>([]);
  /** Set when save catches a clash the chips couldn't — a schedule synced in mid-edit. */
  const [clashMsg, setClashMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  // The client's name for the copy, and — once — whatever week they already
  // have, so resuming shows the same screen they left rather than a blank one.
  useEffect(() => {
    const sub = observeClient(clientId).subscribe((client) => {
      if (!client) {
        navigation.goBack();
        return;
      }
      setName(client.name);
      if (!seeded.current) {
        seeded.current = true;
        const saved = parseWeeklySchedule(client.weeklySchedule);
        if (saved.length > 0) {
          setDays(saved.map((s) => s.weekday - 1).sort((a, b) => a - b));
          setTimes(
            Object.fromEntries(
              saved.map((s) => {
                const [h, m] = s.time.split(':').map((n) => Number.parseInt(n, 10));
                return [s.weekday - 1, h * 60 + (Number.isNaN(m) ? 0 : m)];
              }),
            ),
          );
        }
      }
    });
    return () => sub.unsubscribe();
  }, [clientId, navigation]);

  // Every hour the other clients hold, live: a schedule saved on another
  // screen — or synced in from another device — withdraws its slots here too.
  useEffect(() => {
    const sub = combineLatest([
      clientsCollection
        .query()
        .observeWithColumns(['name', 'status', 'weekly_schedule', 'session_duration_minutes']),
      programsCollection.query().observeWithColumns(['status', 'schedule', 'client_id']),
    ]).subscribe(([allClients, allPrograms]) => {
      setBusy(busySlots(allClients, allPrograms, clientId));
    });
    return () => sub.unsubscribe();
  }, [clientId]);

  useEffect(() => {
    const sub = observeWorkingHours().subscribe((rows) => {
      const byDay = new Map<number, Window[]>();
      for (const row of rows) {
        const list = byDay.get(row.weekday) ?? [];
        list.push({ startMinute: row.startMinute, endMinute: row.endMinute });
        byDay.set(row.weekday, list);
      }
      for (const [weekday, list] of byDay) byDay.set(weekday, mergeWindows(list));
      setHours(byDay);
    });
    return () => sub.unsubscribe();
  }, []);

  const slotsByDay = useMemo(() => {
    const out = new Map<number, number[]>();
    for (let d = 0; d < 7; d += 1) out.set(d, slotsIn(hours.get(d) ?? []));
    return out;
  }, [hours]);

  // The working-hours slots minus everyone else's sessions — what's actually
  // on offer. `busy` weekdays are 1-based, this screen's are 0-based.
  const freeByDay = useMemo(() => {
    const out = new Map<number, number[]>();
    for (let d = 0; d < 7; d += 1) {
      const all = slotsByDay.get(d) ?? [];
      out.set(d, all.filter((at) => !slotClash(busy, d + 1, at, SESSION_MINUTES)));
    }
    return out;
  }, [slotsByDay, busy]);

  const toggleDay = (day: number) => {
    setDayTap(null);
    setClashMsg(null);
    if (days.includes(day)) {
      setDays(days.filter((d) => d !== day));
      return;
    }
    const slots = freeByDay.get(day) ?? [];
    if (slots.length === 0) {
      // Two different answers: the trainer is off that day, or every hour of
      // it is already somebody's.
      setDayTap({ day, reason: (slotsByDay.get(day) ?? []).length === 0 ? 'closed' : 'full' });
      return;
    }
    // A newly picked day borrows the earliest picked time when that slot exists
    // on it — "same slot, most mornings" is the common week — else its first slot.
    if (times[day] == null) {
      const earliest = days.length ? times[Math.min(...days)] : null;
      setTimes({ ...times, [day]: earliest != null && slots.includes(earliest) ? earliest : slots[0] });
    }
    setDays([...days, day].sort((a, b) => a - b));
  };

  const ready = days.length > 0 && days.every((d) => times[d] != null) && !saving;
  const first = name.split(' ')[0] || 'They';

  const save = async () => {
    if (!ready) return;
    // The chips already hide taken hours, but a schedule can sync in while
    // this screen is open — the write re-checks so it can never double-book.
    for (const d of days) {
      const clash = slotClash(busy, d + 1, times[d], SESSION_MINUTES);
      if (clash) {
        setClashMsg(
          `${LONG[d]} ${formatMinute(times[d])} just got taken — ${clash.clientName} now trains ` +
            `${formatMinute(clash.startMinute)} – ${formatMinute(clash.endMinute)}. Pick another time.`,
        );
        return;
      }
    }
    setSaving(true);
    try {
      const slots = days.map((d, i) => ({
        templateDay: i + 1,
        weekday: d + 1,
        time: formatMinute(times[d]),
      }));
      await saveWeeklySchedule(
        clientId,
        days.length,
        SESSION_MINUTES,
        serializeWeeklySchedule(slots),
      );
      navigation.replace('ClientPlan', { clientId });
    } catch {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={`${first}'s week`}
          subtitle="Add a client · step 3"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <SkipButton
              label="Finish later"
              onPress={() => navigation.replace('ClientAdded', { clientId })}
            />
          }
        />
        <View style={styles.steps}>
          <Steps count={4} current={2} />
          <StepsLabel current={2} count={4} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.group}>The days they train</Text>
        <Text style={styles.meta}>
          Their standing weekly slots — the plan on the next step lands on exactly these days. The
          times on offer are your own working hours, minus the ones other clients already hold.
        </Text>
        <Seg>
          {SHORT.map((label, i) => (
            <Chip key={label} label={label} selected={days.includes(i)} onPress={() => toggleDay(i)} />
          ))}
        </Seg>
        {dayTap !== null ? (
          <FieldMsg tone="error">
            {dayTap.reason === 'closed'
              ? `You don't work ${LONG[dayTap.day]}s — your hours say it's closed. Settings → When you work changes that.`
              : `Your ${LONG[dayTap.day]} is fully booked — every slot already belongs to another client.`}
          </FieldMsg>
        ) : null}

        {days.map((day) => {
          const slots = freeByDay.get(day) ?? [];
          const taken = (slotsByDay.get(day) ?? []).length - slots.length;
          const windows = hours.get(day) ?? [];
          const chosen = times[day];
          // A slot chosen before the hours changed stays offered — it was
          // agreed, and silently unpicking it would save a different answer.
          // Save still re-checks it against other clients, so a stale slot
          // can be shown but never double-booked.
          const offered = chosen != null && !slots.includes(chosen) ? [chosen, ...slots] : slots;
          return (
            <View key={day}>
              <Text style={styles.group}>{LONG[day]}</Text>
              <Text style={styles.meta}>
                {windows.length > 0
                  ? `Your hours: ${windows
                      .map((w) => `${formatMinute(w.startMinute)} – ${formatMinute(w.endMinute)}`)
                      .join(' and ')}${
                      taken > 0
                        ? ` · ${taken} slot${taken === 1 ? '' : 's'} hidden — already booked`
                        : ''
                    }`
                  : 'Outside your usual hours.'}
              </Text>
              <Seg>
                {offered.map((at) => (
                  <Chip
                    key={at}
                    label={formatMinute(at)}
                    selected={chosen === at}
                    onPress={() => {
                      setClashMsg(null);
                      setTimes((t) => ({ ...t, [day]: at }));
                    }}
                  />
                ))}
              </Seg>
            </View>
          );
        })}

        {clashMsg ? <FieldMsg tone="error">{clashMsg}</FieldMsg> : null}

        {days.length === 0 ? (
          <Callout style={styles.note}>
            Pick the days first — each one then offers its times.{' '}
            <CalloutStrong>{first} isn&apos;t in your routine yet</CalloutStrong>: that happens once
            their week and their plan are both set.
          </Callout>
        ) : null}

        <Button
          label={
            days.length > 0
              ? `Save ${first}'s ${days.length}-day week`
              : 'Pick at least one day'
          }
          size="lg"
          block
          disabled={!ready}
          loading={saving}
          onPress={() => void save()}
          style={styles.go}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  steps: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: 2 },
  body: { paddingHorizontal: space.inset, paddingTop: space.s5, paddingBottom: space.s10 },

  group: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: space.s2,
    marginTop: space.s5,
  },
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s3 },
  note: { marginTop: space.s5 },
  go: { marginTop: space.s6 },
});
