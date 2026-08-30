/**
 * The client's drawer — the same container, five destinations instead of nine.
 *
 * Nothing daily is behind it, which is the rule the trainer's bar encodes too:
 * Today, the log, progress and payments are all tabs, so what is left here is what
 * somebody opens once a month.
 *
 * "Switch to coaching" appears only when this number is also a trainer. The role
 * is a lens, not an account — same login, same records, same sync state — so the
 * switch changes the tab bar and the home composition and nothing else.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { useAuth } from '../../store/AuthContext';
import { useClient } from '../../client/useClient';
import {
  Avatar,
  Drawer,
  DrawerItem,
  DrawerLabel,
  DrawerVersion,
  IconChart,
  IconLogout,
  IconShield,
  IconUser,
  IconUsers,
  colors,
  space,
} from '../../design';

export type ClientDrawerKey = 'profile' | 'reports' | 'help' | 'signOut';

export default function ClientDrawer({
  visible,
  onClose,
  onNavigate,
}: {
  visible: boolean;
  onClose: () => void;
  onNavigate: (key: ClientDrawerKey) => void;
}) {
  const { clientId, trainerId, switchIdentity } = useAuth();
  const { input } = useClient(visible ? clientId : null);
  const [switching, setSwitching] = useState(false);

  const me = input.me;
  const coach = input.coach;
  const reports = input.reports.filter((r) => r.clientId === clientId).length;

  const go = (key: ClientDrawerKey) => {
    onClose();
    onNavigate(key);
  };

  return (
    <Drawer
      visible={visible}
      onClose={onClose}
      header={
        <View style={styles.header}>
          <Avatar name={me?.name ?? 'You'} size="lg" />
          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>
              {me?.name ?? 'You'}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {coach ? `Training with ${coach.name}` : 'Your training'}
            </Text>
          </View>
        </View>
      }
      footer={
        <>
          <DrawerItem icon={IconLogout} label="Sign out" onPress={() => go('signOut')} />
          <DrawerVersion>{`XRep ${Constants.expoConfig?.version ?? ''}`}</DrawerVersion>
        </>
      }
    >
      <DrawerLabel>You</DrawerLabel>
      <DrawerItem icon={IconUser} label="Your details" onPress={() => go('profile')} />
      <DrawerItem
        icon={IconChart}
        label="Weekly reports"
        badge={reports || undefined}
        quietBadge
        onPress={() => go('reports')}
      />

      <DrawerLabel>App</DrawerLabel>
      <DrawerItem icon={IconShield} label="Help" onPress={() => go('help')} />

      {/* Only for somebody who is both. A trainer who also trains with a coach
          crosses back here — a fresh trainer token, not a local flip, since a
          client token has no trainer authority on the server; see
          `AuthContext#switchIdentity`. */}
      {trainerId ? (
        <>
          <DrawerLabel>Coaching</DrawerLabel>
          <DrawerItem
            icon={IconUsers}
            label="Switch to coaching"
            onPress={() => {
              if (switching) return;
              setSwitching(true);
              void switchIdentity('trainer').finally(() => {
                setSwitching(false);
                onClose();
              });
            }}
          />
        </>
      ) : null}
    </Drawer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  identity: { flex: 1 },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink },
  detail: { fontSize: 12.5, color: colors.ink3, marginTop: 2 },
});
