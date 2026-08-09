import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observeScheduledSessions, findClientsByIds } from '../../db/sessions';
import type ScheduledSession from '../../db/models/ScheduledSession';
import type Client from '../../db/models/Client';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'SessionList'>;

const STATUS_COLOR: Record<string, string> = {
  scheduled: colors.indigo,
  done:       '#2E7D32',
  no_show:    '#B26A00',
  cancelled:  '#9E9E9E',
};

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function todayBounds(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end   = start + 86400000 - 1;
  return { start, end };
}

export default function SessionListScreen({ route, navigation }: Props) {
  const clientId = route.params?.clientId;
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [clientMap, setClientMap] = useState<Record<string, Client>>({});

  useEffect(() => {
    const sub = observeScheduledSessions(clientId).subscribe(setSessions);
    return () => sub.unsubscribe();
  }, [clientId]);

  useEffect(() => {
    const ids = [...new Set(sessions.map((s) => s.clientId).filter(Boolean))];
    if (!ids.length) { setClientMap({}); return; }
    findClientsByIds(ids).then(setClientMap);
  }, [sessions]);

  const { start: todayStart, end: todayEnd } = useMemo(todayBounds, []);

  const { today, upcoming, past } = useMemo(() => {
    const now = Date.now();
    const t: ScheduledSession[] = [];
    const u: ScheduledSession[] = [];
    const p: ScheduledSession[] = [];
    sessions.forEach((s) => {
      const ms = s.scheduledAt instanceof Date ? s.scheduledAt.getTime() : Number(s.scheduledAt);
      if (ms >= todayStart && ms <= todayEnd) t.push(s);
      else if (ms > todayEnd)                  u.push(s);
      else                                      p.push(s);
    });
    return { today: t, upcoming: u, past: p };
  }, [sessions, todayStart, todayEnd]);

  const sections: { title: string; data: ScheduledSession[] }[] = [];
  if (today.length)    sections.push({ title: 'Today',    data: today });
  if (upcoming.length) sections.push({ title: 'Upcoming', data: upcoming });
  if (past.length)     sections.push({ title: 'Past',     data: past });

  const renderSession = (session: ScheduledSession) => {
    const ms = session.scheduledAt instanceof Date
      ? session.scheduledAt.getTime()
      : Number(session.scheduledAt);
    const clientName = clientMap[session.clientId]?.name ?? '…';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('SessionDetail', { sessionId: session.id })}
        activeOpacity={0.75}
      >
        <View style={styles.cardLeft}>
          <View style={styles.cardTimeRow}>
            <Text style={styles.cardTime}>{formatDateTime(ms)}</Text>
            {session.dayLabel ? (
              <View style={styles.dayLabelPill}>
                <Text style={styles.dayLabelText}>{session.dayLabel}</Text>
              </View>
            ) : null}
          </View>
          {!clientId && (
            <Text style={styles.cardClient} numberOfLines={1}>{clientName}</Text>
          )}
          {session.durationMinutes
            ? <Text style={styles.cardMeta}>{session.durationMinutes} min</Text>
            : null}
          {session.notes
            ? <Text style={styles.cardNotes} numberOfLines={1}>{session.notes}</Text>
            : null}
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.statusBadge, { color: STATUS_COLOR[session.status] ?? colors.muted }]}>
            {session.status}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const allItems: Array<{ type: 'header'; title: string } | { type: 'session'; session: ScheduledSession }> = [];
  sections.forEach(({ title, data }) => {
    allItems.push({ type: 'header', title });
    data.forEach((session) => allItems.push({ type: 'session', session }));
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sessions</Text>
        <View style={styles.backBtn} />
      </View>

      {allItems.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyHead}>No sessions yet</Text>
          <Text style={styles.emptyBody}>Tap + to schedule a session.</Text>
        </View>
      ) : (
        <FlatList
          data={allItems}
          keyExtractor={(item, i) =>
            item.type === 'header' ? `h-${item.title}` : item.session.id
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            item.type === 'header'
              ? <Text style={styles.sectionHeader}>{item.title}</Text>
              : renderSession(item.session)
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ScheduleSession', { clientId })}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 56, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },

  list: { padding: 16, paddingBottom: 100 },

  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 8, marginBottom: 4,
  },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardLeft: { flex: 1 },
  cardTimeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
  cardTime:   { fontSize: 15, fontWeight: '700', color: colors.ink },
  dayLabelPill: {
    backgroundColor: colors.indigoSoft, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  dayLabelText: { fontSize: 11, fontWeight: '700', color: colors.indigo },
  cardClient: { fontSize: 13, color: colors.indigo, fontWeight: '600', marginTop: 2 },
  cardMeta:   { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardNotes:  { fontSize: 12, color: colors.faint, marginTop: 2 },
  cardRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  chevron:    { fontSize: 22, color: colors.border },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyHead: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21 },

  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.indigo, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.indigo, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  fabIcon: { fontSize: 28, color: '#fff', lineHeight: 32 },
});
