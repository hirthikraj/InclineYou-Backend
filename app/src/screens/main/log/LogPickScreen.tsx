/**
 * `+` → **Log a workout** — who for.
 *
 * The + is pressed with the intention already formed, so this screen asks one
 * question and asks it once. It does not ask what kind of workout, or which
 * program, or when: all three are answerable from who, and asking is how a
 * two-tap action becomes a five-tap one.
 *
 * ── Three groups, in the order a gym floor answers the question ───────────
 *
 * **Still open** first. A trainer who logs four clients a morning has logs on
 * the go, and coming back to one is the commonest reason to press + at all.
 * Nothing is started here — it goes straight back in.
 *
 * **Booked today** second. One tap opens the log against the booking, exactly
 * as the diary's Start does, so the two routes cannot drift.
 *
 * **Everybody else** third, and this is the group no competitor offers. Every
 * logger in the teardown assumes a workout belongs to a booking or a saved
 * routine. In a gym where the trainer is on the floor, a client turning up on a
 * day she does not normally train is a Tuesday — and §06 already says logging
 * is allowed to happen before programming exists. Before booking, too.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useLog } from '../../../log/useLog';
import { buildLogPick } from '../../../log/log';
import { startUnbookedLog } from '../../../db/log';
import { startSession } from '../../../db/sessions';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Avatar,
  Callout,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconChevron,
  IconUser,
  IconUserAdd,
  List,
  Pulse,
  Row,
  Search,
  Tag,
  Toast,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function LogPickScreen() {
  const navigation = useNavigation<Nav>();
  const { trainerId } = useAuth();
  const { input } = useLog();

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [at] = useState(() => Date.now());

  const view = useMemo(() => buildLogPick(input, at), [input, at]);

  const q = query.trim().toLowerCase();
  const roster = q
    ? view.roster.filter((r) => r.clientName.toLowerCase().includes(q))
    : view.roster;

  /** Replaces this screen rather than stacking it: nobody backs out of a log into a picker. */
  const openLog = (params: MainStackParamList['WorkoutLog']) =>
    navigation.replace('WorkoutLog', params);

  const startBooked = async (scheduledId: string, programId: string | null, templateDay: number | null) => {
    setBusy(scheduledId);
    try {
      const workoutId = await startSession(scheduledId);
      openLog({
        workoutId,
        programId: programId ?? undefined,
        templateDay: templateDay ?? undefined,
      });
    } catch {
      setNotice('Could not open that session. Try it from the diary.');
      setBusy(null);
    }
  };

  const startUnbooked = async (clientId: string) => {
    if (!trainerId) return;
    setBusy(clientId);
    try {
      const opened = await startUnbookedLog(trainerId, clientId);
      openLog({
        workoutId: opened.workoutId,
        programId: opened.programId ?? undefined,
        templateDay: opened.templateDay ?? undefined,
      });
    } catch {
      setNotice('Could not open a log for them.');
      setBusy(null);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Log a workout"
          subtitle="Who for"
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      {view.empty ? (
        <Empty
          icon={IconUserAdd}
          title="Nobody to log for yet"
          body="Add a client and the log has somebody to belong to."
          style={styles.empty}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {view.open.length ? (
            <>
              <GroupHead label="Still open" count={view.open.length} />
              <List style={styles.group}>
                {view.open.map((row) => (
                  <Row
                    key={row.workoutId}
                    grouped
                    leading={<Avatar name={row.clientName} size="sm" />}
                    title={row.clientName}
                    subtitle={row.meta}
                    onPress={() =>
                      openLog({
                        workoutId: row.workoutId,
                        programId: row.programId ?? undefined,
                        templateDay: row.templateDay ?? undefined,
                      })
                    }
                    trailing={<Pulse />}
                  />
                ))}
              </List>
            </>
          ) : null}

          {view.booked.length ? (
            <>
              <GroupHead label="Booked today" count={view.booked.length} />
              <List style={styles.group}>
                {view.booked.map((row) => (
                  <Row
                    key={row.scheduledId}
                    grouped
                    leading={<Avatar name={row.clientName} size="sm" />}
                    title={row.clientName}
                    subtitle={row.meta}
                    onPress={() => void startBooked(row.scheduledId, row.programId, row.templateDay)}
                    trailing={
                      busy === row.scheduledId ? (
                        <Tag label="Opening" tone="accent" />
                      ) : (
                        <IconChevron size={18} color={colors.ink3} />
                      )
                    }
                  />
                ))}
              </List>
            </>
          ) : null}

          <GroupHead
            label={view.open.length || view.booked.length ? 'Anyone else' : 'Your clients'}
            count={roster.length}
          />
          <Search
            value={query}
            onChangeText={setQuery}
            placeholder="Search clients"
            style={styles.search}
          />

          {roster.length ? (
            <List style={styles.group}>
              {roster.map((row) => (
                <Row
                  key={row.clientId}
                  grouped
                  leading={<Avatar name={row.clientName} size="sm" />}
                  title={row.clientName}
                  subtitle={row.meta}
                  onPress={() => void startUnbooked(row.clientId)}
                  trailing={
                    busy === row.clientId ? (
                      <Tag label="Opening" tone="accent" />
                    ) : (
                      <IconChevron size={18} color={colors.ink3} />
                    )
                  }
                />
              ))}
            </List>
          ) : (
            <Text style={styles.none}>Nobody by that name.</Text>
          )}

          <Callout style={styles.note}>
            Logging somebody who is not booked in does not book them. It records what they did, and
            the session count in the diary stays what it was.
          </Callout>

          {/* The + sheet promises "for a client, or for yourself". The second
              half is not built, and a row that says where it went is better
              than a promise with nothing behind it. */}
          <Row
            leading={<IconUser size={18} color={colors.ink3} />}
            title="Log your own workout"
            subtitle="Your own training is a separate book — and not built yet"
            trailing={<IconChevron size={18} color={colors.ink3} />}
            onPress={() => navigation.navigate('SelfTraining')}
            style={styles.self}
          />
        </ScrollView>
      )}

      {notice ? (
        <View style={styles.toastDock} pointerEvents="box-none">
          <Toast action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>{notice}</Toast>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  group: { marginBottom: space.s2 },
  search: { marginBottom: space.s3 },
  none: { fontSize: 13, color: colors.ink3, paddingVertical: space.s5, textAlign: 'center' },
  note: { marginTop: space.s3 },
  self: { marginTop: space.s3 },

  toastDock: { paddingHorizontal: space.inset, paddingBottom: space.s2 },
  empty: { marginTop: space.s7 },
});
