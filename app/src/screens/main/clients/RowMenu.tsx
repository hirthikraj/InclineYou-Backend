/**
 * 3a · The long-press menu.
 *
 * The row is lifted out and drawn above the menu, still showing who you are
 * acting on — a menu of six verbs with no subject is how people pause the wrong
 * client. It carries an accent hairline so it reads as held rather than as
 * another list item that happens to be on top of a scrim.
 *
 * Destructive is last, separated, red, and still confirmed by the caller.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Avatar,
  IconCalendar,
  IconCheck,
  IconLayers,
  IconMessage,
  IconPause,
  IconRepeat,
  IconRupee,
  IconTrash,
  Menu,
  Row,
  colors,
  radius,
  space,
  type MenuAction,
} from '../../../design';
import type { RosterRow } from '../../../clients/roster';

export type RowMenuKey =
  | 'remind'
  | 'payment'
  | 'session'
  | 'program'
  | 'select'
  | 'pause'
  | 'resume'
  | 'archive';

export default function RowMenu({
  row,
  onPick,
  onClose,
}: {
  row: RosterRow | null;
  onPick: (key: RowMenuKey, row: RosterRow) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!row) return null;

  const paused = row.status === 'paused';

  const actions: MenuAction[] = [
    {
      key: 'remind',
      label: row.phone ? 'Remind on WhatsApp' : 'No phone number saved',
      icon: IconMessage,
      onPress: () => (row.phone ? onPick('remind', row) : onClose()),
    },
    { key: 'payment', label: 'Record a payment', icon: IconRupee, onPress: () => onPick('payment', row) },
    { key: 'session', label: 'Book a session', icon: IconCalendar, onPress: () => onPick('session', row) },
    { key: 'program', label: 'Change program', icon: IconLayers, onPress: () => onPick('program', row) },
    // § 03 enters selection by long-pressing a second row. A modal menu eats
    // that tap, so the way in is stated instead of hidden — which is the same
    // NN/g argument that put every swipe action in this menu to begin with.
    { key: 'select', label: 'Select clients', icon: IconCheck, onPress: () => onPick('select', row) },
    paused
      ? { key: 'resume', label: 'Resume client', icon: IconRepeat, onPress: () => onPick('resume', row) }
      : { key: 'pause', label: 'Pause client', icon: IconPause, onPress: () => onPick('pause', row) },
    {
      key: 'archive',
      label: 'Archive client',
      icon: IconTrash,
      destructive: true,
      separated: true,
      onPress: () => onPick('archive', row),
    },
  ];

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.layer, { paddingBottom: insets.bottom + space.s6 }]} pointerEvents="box-none">
        <View style={styles.lift} pointerEvents="none">
          <Row
            title={row.name}
            subtitle={row.line}
            severity={row.severity}
            leading={<Avatar name={row.name} size="sm" />}
          />
        </View>
        <Menu actions={actions} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: space.inset,
    gap: 10,
  },
  lift: {
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.accentLine,
    overflow: 'hidden',
  },
});
