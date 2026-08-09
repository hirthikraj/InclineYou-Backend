import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { scheduledSessionsCollection } from '../../db/sessions';
import { saveWeeklySchedule } from '../../db/clients';
import { createSession } from '../../api/sessions';
import { syncDatabase } from '../../db/sync';
import { colors } from '../../theme';
import type ScheduledSession from '../../db/models/ScheduledSession';

type Props = NativeStackScreenProps<MainStackParamList, 'WeeklySlotPicker'>;

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekMonday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  today.setDate(today.getDate() - ((dow + 6) % 7));
  return today;
}

function buildStartTimes(durationMinutes: number): string[] {
  const times: string[] = [];
  const lastStart = 21 * 60 - durationMinutes;
  for (let m = 6 * 60; m <= lastStart; m += 30) {
    const h = Math.floor(m / 60).toString().padStart(2, '0');
    const min = (m % 60).toString().padStart(2, '0');
    times.push(`${h}:${min}`);
  }
  return times;
}

function slotEpoch(weekMonday: Date, weekday: number, time: string): number {
  const d = new Date(weekMonday);
  d.setDate(d.getDate() + (weekday - 1)); // weekday 1=Mon .. 7=Sun
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// slotKey uses weekday (not template day) for conflict detection
function slotKey(weekday: number, time: string) { return `${weekday}|${time}`; }

interface Pick { weekday: number; time?: string }

export default function WeeklySlotPickerScreen({ route, navigation }: Props) {
  const { clientId, sessionsPerWeek, durationMinutes, dayLabels } = route.params;

  const weekMonday = useMemo(getWeekMonday, []);
  const weekStart = weekMonday.getTime();
  const weekEnd = weekStart + 7 * 86400000;

  const startTimes = useMemo(() => buildStartTimes(durationMinutes), [durationMinutes]);
  const durationMs = durationMinutes * 60000;
  const templateDays = useMemo(
    () => Array.from({ length: sessionsPerWeek }, (_, i) => i + 1),
    [sessionsPerWeek],
  );

  const [existingSessions, setExistingSessions] = useState<ScheduledSession[]>([]);
  const [activeDay, setActiveDay] = useState(1);       // template day (1..N)
  const [dayPick, setDayPick] = useState<Record<number, Pick>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    scheduledSessionsCollection
      .query(
        Q.where('scheduled_at', Q.gte(weekStart)),
        Q.where('scheduled_at', Q.lt(weekEnd)),
      )
      .fetch()
      .then(setExistingSessions)
      .catch(() => {});
  }, [weekStart, weekEnd]);

  // Slots that conflict with existing sessions for ANY weekday
  const conflictSet = useMemo(() => {
    const busy = new Set<string>();
    for (let wd = 1; wd <= 7; wd++) {
      for (const time of startTimes) {
        const slotStart = slotEpoch(weekMonday, wd, time);
        const slotEnd = slotStart + durationMs;
        const conflict = existingSessions.some((s) => {
          const sStart = s.scheduledAt instanceof Date ? s.scheduledAt.getTime() : Number(s.scheduledAt);
          const sDur = s.durationMinutes ? s.durationMinutes * 60000 : durationMs;
          return slotStart < sStart + sDur && slotEnd > sStart;
        });
        if (conflict) busy.add(slotKey(wd, time));
      }
    }
    return busy;
  }, [existingSessions, startTimes, durationMs, weekMonday]);

  const activeWeekday = dayPick[activeDay]?.weekday;
  const activeTime = dayPick[activeDay]?.time;
  const assignedCount = Object.values(dayPick).filter((p) => p.time).length;

  const weekdayTakenBy = (wd: number): number | null => {
    const entry = Object.entries(dayPick).find(
      ([d, p]) => Number(d) !== activeDay && p.weekday === wd,
    );
    return entry ? Number(entry[0]) : null;
  };

  const selectWeekday = (wd: number) => {
    const takenBy = weekdayTakenBy(wd);
    if (takenBy !== null) {
      const label = dayLabels?.[takenBy] ? ` (${dayLabels[takenBy]})` : '';
      Alert.alert(
        'Weekday taken',
        `Day ${takenBy}${label} is already on ${WEEKDAY_LABELS[wd - 1]}. Pick a different weekday.`,
      );
      return;
    }
    setDayPick((prev) => ({
      ...prev,
      [activeDay]: {
        weekday: wd,
        // keep time only if same weekday, otherwise reset
        time: prev[activeDay]?.weekday === wd ? prev[activeDay].time : undefined,
      },
    }));
  };

  const selectTime = (time: string) => {
    if (!activeWeekday) return;
    if (conflictSet.has(slotKey(activeWeekday, time))) return;
    setDayPick((prev) => ({ ...prev, [activeDay]: { weekday: activeWeekday, time } }));
  };

  const handleConfirm = async () => {
    if (assignedCount < sessionsPerWeek) {
      Alert.alert(
        'Not done yet',
        `Assign all ${sessionsPerWeek} day${sessionsPerWeek > 1 ? 's' : ''} first (${assignedCount} done).`,
      );
      return;
    }
    setSaving(true);
    try {
      for (const [dayStr, pick] of Object.entries(dayPick)) {
        if (!pick.weekday || !pick.time) continue;
        const templateDay = Number(dayStr);
        await createSession({
          clientId,
          scheduledAt: slotEpoch(weekMonday, pick.weekday, pick.time),
          durationMinutes,
          dayLabel: dayLabels?.[templateDay],
          templateDay,
        });
      }

      const pattern = JSON.stringify(
        Object.entries(dayPick).map(([d, p]) => ({
          templateDay: Number(d),
          weekday: p.weekday,
          time: p.time,
        })),
      );
      await saveWeeklySchedule(clientId, sessionsPerWeek, durationMinutes, pattern);
      await syncDatabase('schedule-sessions');
      navigation.replace('ClientDetail', { clientId });
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => navigation.replace('ClientDetail', { clientId });

  const weekLabel = (() => {
    const end = new Date(weekMonday);
    end.setDate(end.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${fmt(weekMonday)} – ${fmt(end)}`;
  })();

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule sessions</Text>
        <View style={styles.skipBtn} />
      </View>

      {/* ── Sub-header ── */}
      <View style={styles.subHeader}>
        <Text style={styles.weekRange}>{weekLabel}</Text>
        <Text style={styles.progress}>
          {assignedCount} of {sessionsPerWeek} day{sessionsPerWeek > 1 ? 's' : ''} assigned
        </Text>
      </View>

      {/* ── Template day tabs ── */}
      <View style={styles.dayTabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayTabsRow}
        >
          {templateDays.map((day) => {
            const isActive = activeDay === day;
            const isDone = !!(dayPick[day]?.time);
            const label = dayLabels?.[day];
            return (
              <TouchableOpacity
                key={day}
                style={[styles.dayTab, isActive && styles.dayTabActive, isDone && !isActive && styles.dayTabDone]}
                onPress={() => setActiveDay(day)}
              >
                <Text style={[styles.dayTabLabel, isActive && styles.dayTabLabelActive]}>
                  Day {day}
                </Text>
                {label ? (
                  <Text style={[styles.dayTabSub, isActive && styles.dayTabSubActive]} numberOfLines={1}>
                    {label}
                  </Text>
                ) : null}
                {isDone ? <View style={[styles.dayDot, isActive && styles.dayDotActive]} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Weekday picker ── */}
      <View style={styles.weekdaySection}>
        <Text style={styles.weekdayPrompt}>
          Assign Day {activeDay}{dayLabels?.[activeDay] ? ` · ${dayLabels[activeDay]}` : ''} to:
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekdayRow}
        >
          {WEEKDAY_LABELS.map((wdLabel, i) => {
            const wd = i + 1;
            const isSelected = activeWeekday === wd;
            const takenBy = weekdayTakenBy(wd);
            const isTaken = takenBy !== null;
            return (
              <TouchableOpacity
                key={wd}
                style={[
                  styles.wdChip,
                  isSelected && styles.wdChipSelected,
                  isTaken && styles.wdChipTaken,
                ]}
                onPress={() => selectWeekday(wd)}
                activeOpacity={isTaken ? 0.6 : 0.7}
              >
                <Text style={[
                  styles.wdChipText,
                  isSelected && styles.wdChipTextSelected,
                  isTaken && styles.wdChipTextTaken,
                ]}>
                  {wdLabel}
                </Text>
                {isTaken ? (
                  <Text style={styles.wdChipTakenLabel}>D{takenBy}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Time slots ── */}
      {activeWeekday ? (
        <ScrollView
          style={styles.slotsScroll}
          contentContainerStyle={styles.slotsGrid}
          showsVerticalScrollIndicator={false}
        >
          {startTimes.map((time) => {
            const key = slotKey(activeWeekday, time);
            const isBusy = conflictSet.has(key);
            const isSel = activeTime === time;
            return (
              <TouchableOpacity
                key={time}
                style={[styles.slot, isBusy && styles.slotBusy, isSel && styles.slotSelected]}
                onPress={() => selectTime(time)}
                activeOpacity={isBusy ? 1 : 0.7}
              >
                <Text style={[
                  styles.slotTime,
                  isBusy && styles.slotTimeBusy,
                  isSel && styles.slotTimeSelected,
                ]}>
                  {formatTime12(time)}
                </Text>
                {isBusy && <Text style={styles.slotBusyLabel}>Busy</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.noWeekdayBox}>
          <Text style={styles.noWeekdayText}>
            Select a weekday above to see available time slots
          </Text>
        </View>
      )}

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmBtn, assignedCount < sessionsPerWeek && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.confirmText}>Confirm schedule</Text>}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  skipBtn: { width: 60, alignItems: 'flex-end' },
  skipText: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },

  subHeader: {
    backgroundColor: colors.indigo, paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center',
  },
  weekRange: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  progress: { fontSize: 15, fontWeight: '700', color: '#fff', marginTop: 4 },

  // Template day tabs
  dayTabsWrap: {
    height: 72, backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  dayTabsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  dayTab: {
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border,
    marginRight: 8, minWidth: 68,
  },
  dayTabActive: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  dayTabDone: { borderColor: '#2E7D32' },
  dayTabLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  dayTabLabelActive: { color: '#fff' },
  dayTabSub: { fontSize: 10, color: colors.muted, marginTop: 2 },
  dayTabSubActive: { color: 'rgba(255,255,255,0.75)' },
  dayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2E7D32', marginTop: 3 },
  dayDotActive: { backgroundColor: 'rgba(255,255,255,0.8)' },

  // Weekday picker
  weekdaySection: {
    backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  weekdayPrompt: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 8 },
  weekdayRow: { flexDirection: 'row', gap: 6 },
  wdChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border, minWidth: 46,
  },
  wdChipSelected: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  wdChipTaken: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
  wdChipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  wdChipTextSelected: { color: '#fff' },
  wdChipTextTaken: { color: '#BDBDBD' },
  wdChipTakenLabel: { fontSize: 9, color: '#BDBDBD', marginTop: 1 },

  // Time slots
  slotsScroll: { flex: 1 },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10, paddingBottom: 100 },
  slot: {
    width: '47%', paddingVertical: 14, paddingHorizontal: 10,
    backgroundColor: colors.card, borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  slotBusy: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0', opacity: 0.6 },
  slotSelected: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  slotTime: { fontSize: 15, fontWeight: '600', color: colors.ink },
  slotTimeBusy: { color: '#BDBDBD' },
  slotTimeSelected: { color: '#fff' },
  slotBusyLabel: { fontSize: 11, color: '#BDBDBD', marginTop: 2 },

  noWeekdayBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  noWeekdayText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline,
  },
  confirmBtn: {
    backgroundColor: colors.indigo, borderRadius: 12, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
