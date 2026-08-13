/**
 * The client file's More menu.
 *
 * § 12: "the same menu as a long press on the roster (3a), plus Edit and Body
 * metrics." So it is deliberately the roster's verb list in the roster's order,
 * with the two the file adds slotted in — a trainer who learned the menu on the
 * roster should not have to learn it again here.
 *
 * What it drops is "Select clients", which is a roster gesture and means nothing
 * on one record, and the destructive row: pausing, archiving and removing all
 * live together on their own screen (7b) because the difference between them is
 * the whole decision, and a menu row cannot explain it.
 */

import React from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { whatsappUri } from '../../../money/money';
import {
  IconCalendar,
  IconChart,
  IconEdit,
  IconLayers,
  IconMessage,
  IconPause,
  IconRupee,
  Menu,
  colors,
  space,
  type MenuAction,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function FileMenu({
  visible,
  clientId,
  phone,
  paused,
  onClose,
}: {
  visible: boolean;
  clientId: string;
  phone: string | null;
  paused: boolean;
  onClose: () => void;
}) {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const go = (run: () => void) => () => {
    onClose();
    run();
  };

  const actions: MenuAction[] = [
    {
      key: 'remind',
      label: phone ? 'Remind on WhatsApp' : 'No phone number saved',
      icon: IconMessage,
      onPress: phone
        ? go(() => {
            const uri = whatsappUri(phone, '');
            if (uri) void Linking.openURL(uri);
          })
        : onClose,
    },
    {
      key: 'payment',
      label: 'Record a payment',
      icon: IconRupee,
      onPress: go(() => navigation.navigate('MoneyBook', { clientId, record: true })),
    },
    {
      key: 'session',
      label: 'Book a session',
      icon: IconCalendar,
      onPress: go(() => navigation.navigate('Home', { screen: 'DiaryTab', params: { book: true, clientId } } as never)),
    },
    {
      key: 'program',
      label: 'Change program',
      icon: IconLayers,
      onPress: go(() => navigation.navigate('ProgramList', { clientId })),
    },
    {
      key: 'metrics',
      label: 'Body metrics',
      icon: IconChart,
      onPress: go(() => navigation.navigate('BodyMetrics', { clientId })),
    },
    {
      key: 'edit',
      label: 'Edit client',
      icon: IconEdit,
      onPress: go(() => navigation.navigate('EditClient', { clientId })),
    },
    {
      key: 'end',
      label: paused ? 'Resume, or end' : 'Pause or end',
      icon: IconPause,
      separated: true,
      onPress: go(() => navigation.navigate('ClientEnd', { clientId })),
    },
  ];

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <View
        style={[styles.layer, { paddingBottom: insets.bottom + space.s6 }]}
        pointerEvents="box-none"
      >
        <Menu actions={actions} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  layer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingHorizontal: space.inset,
  },
});
