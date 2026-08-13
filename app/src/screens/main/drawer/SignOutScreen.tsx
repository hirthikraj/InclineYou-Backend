/**
 * 5e · Sign out.
 *
 * **Two unsynced changes turn sign-out into a decision.** Three options, the safe
 * one first, and the destructive one spelled out — *sign out and lose them*. No
 * competitor in the teardown checks this, and a trainer who loses a recorded
 * payment does not come back.
 *
 * ── Why this is a screen and not an Alert ────────────────────────────────
 *
 * The previous build used `Alert.alert` with two buttons. An alert cannot show
 * *what* is unsynced, and "some records haven't reached the server" is not enough
 * to decide with — a queued nudge log is worth losing and a recorded payment is
 * not. This lists what is waiting, by table, so the choice is informed.
 *
 * It is also why the safe option is first and is the primary button: syncing then
 * signing out is what almost everybody wants, and making it the default costs the
 * other two nothing.
 *
 * The destructive path is deliberately not styled as a button-shaped trap. It says
 * what it does.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useAuth } from '../../../store/AuthContext';
import { useSyncState } from '../../../db/useSync';
import { refreshPending, syncDatabase } from '../../../db/sync';
import { pendingSummary, type PendingLine } from '../../../db/pending';
import {
  AppBar,
  Button,
  Danger,
  GroupHead,
  IconBack,
  IconButton,
  IconRefresh,
  List,
  Row,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function SignOutScreen() {
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();
  const { hasPending, pendingCount } = useSyncState();

  const [lines, setLines] = useState<PendingLine[] | null>(null);
  const [busy, setBusy] = useState<'sync' | 'out' | null>(null);
  const [failed, setFailed] = useState(false);

  // Read once on mount and again after a sync attempt. `useSyncState` gives the
  // count; this gives the breakdown, which is what makes the decision informed.
  useEffect(() => {
    let alive = true;
    void refreshPending();
    void pendingSummary().then((next) => {
      if (alive) setLines(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const syncThenOut = async () => {
    setBusy('sync');
    setFailed(false);
    await syncDatabase('sign-out');
    await refreshPending();
    const remaining = await pendingSummary();
    setLines(remaining);

    if (remaining.length) {
      // Still queued: offline, or the server refused something. Do NOT sign out —
      // that is exactly the case this screen exists to prevent.
      setBusy(null);
      setFailed(true);
      return;
    }
    setBusy('out');
    await signOut();
  };

  const signOutAnyway = async () => {
    setBusy('out');
    await signOut();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Sign out of Train X?"
          subtitle={hasPending ? 'Something is still waiting' : 'Nothing is waiting'}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {hasPending ? (
          <>
            {/* The verb has to agree as well as the noun. "1 change haven't
                synced" is the kind of line that makes a warning read as
                machine-generated at the exact moment it needs to be believed. */}
            <Danger
              title={
                pendingCount === 1
                  ? "1 change hasn't synced yet"
                  : `${pendingCount || 'Some'} changes haven't synced yet`
              }
            >
              Signing out now clears this phone&apos;s copy, and those would be lost. Nothing that
              reached the server is at risk.
            </Danger>

            {lines?.length ? (
              <>
                <GroupHead label="What's waiting" count={pendingCount} />
                <List>
                  {lines.map((line) => (
                    <Row
                      key={line.table}
                      grouped
                      title={line.label}
                      subtitle={line.detail}
                      wrap
                      trailing={<Text style={styles.count}>{line.count}</Text>}
                    />
                  ))}
                </List>
              </>
            ) : null}

            {failed ? (
              <Danger title="Still not through" style={styles.failed}>
                The sync did not clear the queue — most likely there is no connection. Stay signed in
                and try again when there is one.
              </Danger>
            ) : null}

            <View style={styles.actions}>
              <Button
                label={busy === 'sync' ? 'Syncing…' : 'Sync first, then sign out'}
                variant="primary"
                size="lg"
                block
                icon={IconRefresh}
                loading={busy === 'sync'}
                disabled={busy !== null}
                onPress={() => void syncThenOut()}
              />
              <Button
                label="Stay signed in"
                variant="ghost"
                block
                disabled={busy !== null}
                onPress={() => navigation.goBack()}
              />
              {/* `danger` is red ink on no fill, which is what this needs. A red
                  FILLED button beside two others invites the muscle memory of
                  tapping the loudest thing, and this is the one option here that
                  cannot be undone. */}
              <Button
                label="Sign out and lose them"
                variant="danger"
                block
                disabled={busy !== null}
                onPress={() => void signOutAnyway()}
                style={styles.destructive}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.clear}>
              Everything on this phone has reached the server. Signing out is safe.
            </Text>
            <View style={styles.actions}>
              <Button
                label="Sign out"
                variant="primary"
                size="lg"
                block
                loading={busy === 'out'}
                disabled={busy !== null}
                onPress={() => void signOutAnyway()}
              />
              <Button
                label="Stay signed in"
                variant="ghost"
                block
                disabled={busy !== null}
                onPress={() => navigation.goBack()}
              />
            </View>
          </>
        )}

        <Text style={styles.legal}>
          Signing back in restores everything that reached the server. You&apos;ll need the same phone
          number and a new code.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10, paddingTop: space.s3 },

  count: { fontSize: 15, fontWeight: '800', color: colors.ink },
  failed: { marginTop: space.s4 },
  actions: { marginTop: space.s5, gap: space.s2 },
  // Set apart from the two safe options, so it is never the next thing a thumb
  // lands on after a mis-tap.
  destructive: { marginTop: space.s3 },
  clear: { fontSize: 14, lineHeight: 21, color: colors.ink2, marginTop: space.s3 },
  legal: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s5 },
});
