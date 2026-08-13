/**
 * Assign a program: client picker → start date → copy.
 *
 * The one write in this feature that goes through the server rather than the sync
 * queue, and the reason is worth stating: **the copy is one transaction.** It
 * creates a program and writes one `program_exercise` row per entry in the
 * blueprint, and a half-written copy is a client on a plan with three exercises
 * missing. `POST /v1/templates/{id}/apply` already does it atomically; doing it
 * again on the phone would give the app two versions of its most consequential
 * write.
 *
 * That means this screen needs a connection, and it says so up front rather than
 * failing at the end. Everything else in the app works offline; this doesn't, and
 * pretending otherwise would cost somebody their plan.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { applyTemplate } from '../../../api/programs';
import { syncDatabase } from '../../../db/sync';
import { useTraining } from '../../../training/useTraining';
import {
  AppBar,
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconCopy,
  IconUsers,
  List,
  Radio,
  Row,
  Toast,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'AssignProgram'>;

export default function AssignProgramScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { input } = useTraining();

  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Set on success. The screen stays up so the confirmation is actually read. */
  const [done, setDone] = useState(false);

  /** Who is already on a live copy of this template, so the row can say so. */
  const already = useMemo(() => {
    const dead = new Set(['cancelled', 'canceled', 'completed', 'archived']);
    return new Set(
      input.programs
        .filter((p) => p.templateId === params.templateId && !dead.has(p.status.toLowerCase()))
        .map((p) => p.clientId),
    );
  }, [input.programs, params.templateId]);

  const clients = useMemo(
    () => [...input.clients].sort((a, b) => a.name.localeCompare(b.name)),
    [input.clients],
  );

  const assign = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      await applyTemplate(params.templateId, picked, params.name);
      // Pull the new program and its exercises down so the client's screens show
      // it without waiting for the next scheduled sync.
      await syncDatabase('assign-program');
      const name = clients.find((c) => c.id === picked)?.name ?? 'them';
      // Deliberately not going back here. Popping the screen unmounts the toast
      // with it, so the trainer taps a button and nothing appears to happen —
      // the confirmation has to outlive the action that earned it.
      setDone(true);
      setNotice(`${params.name} copied onto ${name}.`);
    } catch {
      setNotice('Could not assign it. Copying a program needs a connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Assign this program"
          subtitle={params.name}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {clients.length === 0 ? (
          <Empty
            icon={IconUsers}
            title="No clients yet"
            body="A program needs somebody to be on. Add a client first."
            style={styles.empty}
          />
        ) : (
          <>
            <GroupHead label="Who is it for" count={clients.length} />
            <List>
              {clients.map((client) => (
                <Row
                  key={client.id}
                  grouped
                  leading={<Avatar name={client.name} size="sm" />}
                  title={client.name}
                  subtitle={already.has(client.id) ? 'Already on this program' : undefined}
                  onPress={() => setPicked(client.id)}
                  trailing={<Radio checked={picked === client.id} />}
                />
              ))}
            </List>

            <Callout icon={IconCopy} style={styles.note}>
              This <CalloutStrong>copies</CalloutStrong> the program onto them, starting today.
              Editing the template afterwards will never change their plan — and assigning it again
              later gives them a second, separate copy.
            </Callout>

            {done ? (
              <Button
                label="Done"
                variant="primary"
                size="lg"
                block
                onPress={() => navigation.goBack()}
                style={styles.action}
              />
            ) : (
              <Button
                label={saving ? 'Copying…' : 'Copy it onto them'}
                variant="primary"
                size="lg"
                block
                loading={saving}
                disabled={!picked || saving}
                onPress={() => void assign()}
                style={styles.action}
              />
            )}

            <Text style={styles.fine}>
              The copy happens on the server so it is all-or-nothing. This one step needs a
              connection.
            </Text>
          </>
        )}
      </ScrollView>

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
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  note: { marginTop: space.s4 },
  action: { marginTop: space.s4 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s3 },
  empty: { marginTop: space.s7 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
