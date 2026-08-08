import React from 'react';
import { Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { syncDatabase } from '../db/sync';
import { useSyncState } from '../db/useSync';
import { colors } from '../theme';

/**
 * The one place that tells the trainer whether their work has left the phone.
 * Shown on every list screen — offline is the normal case, not an error state.
 */
export default function SyncBar() {
  const { phase, lastSyncedAt, hasPending } = useSyncState();

  let text: string;
  if (phase === 'syncing') text = 'Syncing…';
  else if (hasPending) text = 'Waiting to sync — saved on this phone';
  else if (phase === 'error') text = 'Offline — will retry';
  else if (lastSyncedAt) text = `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}`;
  else text = 'Not synced yet';

  const tone = hasPending || phase === 'error' ? styles.warn : styles.ok;

  return (
    <TouchableOpacity style={[styles.bar, tone]} onPress={() => syncDatabase('manual')}>
      {phase === 'syncing' ? (
        <ActivityIndicator size="small" color="#555" />
      ) : (
        <Text style={styles.dot}>●</Text>
      )}
      <Text style={styles.text}>{text}</Text>
      <Text style={styles.action}>Sync now</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 9,
  },
  ok: { backgroundColor: colors.indigoTint },
  warn: { backgroundColor: '#FFF4E5' },
  dot: { fontSize: 9, color: '#7A869A' },
  text: { flex: 1, fontSize: 12, color: colors.body },
  action: { fontSize: 12, fontWeight: '700', color: colors.indigo },
});
