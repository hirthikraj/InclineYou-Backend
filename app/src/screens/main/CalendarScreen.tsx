import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observeSessionsInRange, findClientsByIds } from '../../db/sessions';
import type ScheduledSession from '../../db/models/ScheduledSession';
import type Client from '../../db/models/Client';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'Calendar'>;

const DAY_ABBREVS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_COLOR: Record<string, string> = {
  scheduled: colors.indigo,
  done:       '#2E7D32',
  no_show:    '#B26A00',
  cancelled:  '#9E9E9E',
};

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toDateKey(d: Date): string {
  // Local YYYY-MM-DD to avoid UTC offset drift
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function CalendarScreen({ route, navigation }: Props) {
  const initialDate = route.params?.selectedDate;

  const [weekStart, setWeekStart] = useState<Date>(() => {
    const base = initialDate ? new Date(initialDate + 'T00:00:00') : new Date();
    return getMonday(base);
  });

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialDate) return initialDate;
    return toDateKey(new Date());
  });

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const weekEndMs = useMemo(
    () => addDays(weekStart, 7).getTime() - 1,
    [weekStart],
  );

  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});

  useEffect(() => {
    const sub = observeSessionsInRange(weekStart.getTime(), weekEndMs).subscribe(setSessions);
    return () => sub.unsubscribe();
  }, [weekStart, weekEndMs]);

  useEffect(() => {
    const ids = [...new Set(sessions.map((s) => s.clientId).filter(Boolean))];
    if (!ids.length) { setClients({}); return; }
    findClientsByIds(ids).then(setClients);
  }, [sessions]);

  const byDate = useMemo(() => {
    const map: Record<string, ScheduledSession[]> = {};
    sessions.forEach((s) => {
      const ms = s.scheduledAt instanceof Date ? s.scheduledAt.getTime() : Number(s.scheduledAt);
      const key = toDateKey(new Date(ms));
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [sessions]);

  const todayKey = toDateKey(new Date());
  const selectedSessions = byDate[selectedDate] ?? [];

  const goToPrevWeek = () => {
    const newStart = addDays(weekStart, -7);
    setWeekStart(newStart);
    // Keep selected date in the new week: select Mon of the new week if current selection is outside
    const newEnd = addDays(newStart, 6);
    if (selectedDate < toDateKey(newStart) || selectedDate > toDateKey(newEnd)) {
      setSelectedDate(toDateKey(newStart));
    }
  };

  const goToNextWeek = () => {
    const newStart = addDays(weekStart, 7);
    setWeekStart(newStart);
    const newEnd = addDays(newStart, 6);
    if (selectedDate < toDateKey(newStart) || selectedDate > toDateKey(newEnd)) {
      setSelectedDate(toDateKey(newStart));
    }
  };

  const monthLabel = weekStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calendar</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Week navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={goToPrevWeek} style={styles.navArrow}>
          <Text style={styles.navArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={goToNextWeek} style={styles.navArrow}>
          <Text style={styles.navArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day strip */}
      <View style={styles.dayStrip}>
        {weekDays.map((day, i) => {
          const key = toDateKey(day);
          const isSelected = key === selectedDate;
          const hasSessions = (byDate[key]?.length ?? 0) > 0;
          const isToday = key === todayKey;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.dayCell, isSelected && styles.dayCellSelected]}
              onPress={() => setSelectedDate(key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayAbbrev, isSelected && styles.dayTextSelected]}>
                {DAY_ABBREVS[i]}
              </Text>
              <Text style={[
                styles.dayNum,
                isSelected && styles.dayTextSelected,
                isToday && !isSelected && styles.dayNumToday,
              ]}>
                {day.getDate()}
              </Text>
              {hasSessions ? (
                <View style={[styles.dot, isSelected && styles.dotSelected]} />
              ) : (
                <View style={styles.dotPlaceholder} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day header */}
      <View style={styles.dayHeaderRow}>
        <Text style={styles.dayHeaderDate}>
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
        </Text>
        <Text style={styles.dayHeaderCount}>
          {selectedSessions.length > 0
            ? `${selectedSessions.length} session${selectedSessions.length !== 1 ? 's' : ''}`
            : 'No sessions'}
        </Text>
      </View>

      {selectedSessions.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No sessions on this day.</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('ScheduleSession', {})}
          >
            <Text style={styles.addBtnText}>+ Schedule a session</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listBody} showsVerticalScrollIndicator={false}>
          {selectedSessions.map((s) => {
            const ms = s.scheduledAt instanceof Date ? s.scheduledAt.getTime() : Number(s.scheduledAt);
            const clientName = clients[s.clientId]?.name ?? 'Unknown client';
            const statusColor = STATUS_COLOR[s.status] ?? colors.indigo;
            return (
              <TouchableOpacity
                key={s.id}
                style={styles.sessionCard}
                onPress={() => navigation.navigate('SessionDetail', { sessionId: s.id })}
                activeOpacity={0.8}
              >
                <View style={[styles.statusBar, { backgroundColor: statusColor }]} />
                <View style={styles.sessionBody}>
                  <Text style={styles.sessionClient}>{clientName}</Text>
                  <Text style={styles.sessionMeta}>
                    {formatTime(ms)}
                    {s.durationMinutes ? `  ·  ${s.durationMinutes} min` : ''}
                    {s.dayLabel ? `  ·  ${s.dayLabel}` : ''}
                  </Text>
                </View>
                <Text style={[styles.sessionStatus, { color: statusColor }]}>
                  {s.status}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.scheduleBtn}
            onPress={() => navigation.navigate('ScheduleSession', {})}
          >
            <Text style={styles.scheduleBtnText}>+ Add session</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 56, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },

  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  monthLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  navArrow: { paddingHorizontal: 12, paddingVertical: 4 },
  navArrowText: { fontSize: 24, color: colors.indigo, lineHeight: 28 },

  dayStrip: {
    flexDirection: 'row', backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
    paddingBottom: 8,
  },
  dayCell: {
    flex: 1, alignItems: 'center', paddingVertical: 6,
    borderRadius: 10, marginHorizontal: 2,
  },
  dayCellSelected: { backgroundColor: colors.indigo },
  dayAbbrev: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  dayNum: { fontSize: 16, fontWeight: '700', color: colors.ink, marginVertical: 2 },
  dayNumToday: { color: colors.indigo },
  dayTextSelected: { color: '#fff' },
  dot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: colors.indigo, marginTop: 2,
  },
  dotSelected: { backgroundColor: '#fff' },
  dotPlaceholder: { width: 5, height: 5, marginTop: 2 },

  dayHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  dayHeaderDate: { fontSize: 14, fontWeight: '700', color: colors.ink },
  dayHeaderCount: { fontSize: 13, color: colors.muted },

  emptyBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48,
  },
  emptyText: { fontSize: 14, color: colors.faint, marginBottom: 16 },
  addBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.indigo,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  listBody: { padding: 16, paddingBottom: 60 },

  sessionCard: {
    backgroundColor: colors.card, borderRadius: 12, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  statusBar: { width: 4, alignSelf: 'stretch' },
  sessionBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  sessionClient: { fontSize: 14, fontWeight: '700', color: colors.ink },
  sessionMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  sessionStatus: { fontSize: 12, fontWeight: '700', paddingRight: 14, textTransform: 'capitalize' },

  scheduleBtn: {
    height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.indigo, marginTop: 8,
  },
  scheduleBtnText: { fontSize: 14, fontWeight: '600', color: colors.indigo },
});
