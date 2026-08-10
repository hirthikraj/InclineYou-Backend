/**
 * The long-press menu on a ledger entry.
 *
 * §08: every entry is editable and deletable, and **delete always asks**. It is
 * a book, and books get corrected — but a deleted payment changes a client's
 * pack, so it is never silent.
 *
 * The entry is lifted out above the menu, still showing what is being acted on.
 * A menu of four verbs with no subject is how the wrong payment gets deleted.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconEdit,
  IconRepeat,
  IconSend,
  IconTrash,
  LedgerRow,
  Menu,
  colors,
  radius,
  space,
  type MenuAction,
} from '../../../design';
import { signed, type LedgerEntry } from '../../../money/money';

export type EntryMenuKey = 'receipt' | 'edit' | 'undo' | 'delete';

export default function EntryMenu({
  entry,
  onPick,
  onClose,
}: {
  entry: LedgerEntry | null;
  onPick: (key: EntryMenuKey, entry: LedgerEntry) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!entry) return null;

  const isPayment = entry.kind === 'payment';

  const actions: MenuAction[] = [
    ...(isPayment
      ? [
          {
            key: 'receipt',
            label: 'Send the receipt',
            icon: IconSend,
            onPress: () => onPick('receipt', entry),
          } satisfies MenuAction,
          {
            key: 'edit',
            label: 'Edit this entry',
            icon: IconEdit,
            onPress: () => onPick('edit', entry),
          } satisfies MenuAction,
        ]
      : []),
    ...(entry.undoable
      ? [
          {
            key: 'undo',
            label: 'Undo — it never arrived',
            icon: IconRepeat,
            onPress: () => onPick('undo', entry),
          } satisfies MenuAction,
        ]
      : []),
    {
      key: 'delete',
      label: 'Delete this entry',
      icon: IconTrash,
      destructive: true,
      separated: true,
      onPress: () => onPick('delete', entry),
    },
  ];

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.layer, { paddingBottom: insets.bottom + space.s6 }]} pointerEvents="box-none">
        <View style={styles.lift} pointerEvents="none">
          <LedgerRow
            direction={entry.direction}
            title={entry.title}
            detail={entry.detail}
            amount={signed(entry.amount, entry.direction)}
            note={entry.note}
          />
        </View>
        <Menu actions={actions} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  layer: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.inset, gap: 10 },
  lift: {
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});
