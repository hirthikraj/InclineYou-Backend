/**
 * 3d · the + action.
 *
 * Four things, and the test each one passed: it is something a trainer does
 * between sessions, on a phone, and it is at least three taps deep in every
 * competitor we tore down. Anything that fails that test belongs in the drawer
 * or on a client's screen, not here.
 *
 * The sheet asks "What are you doing?" rather than listing nouns, because the
 * + is pressed with an intention already formed.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  IconCalendar,
  IconDumbbell,
  IconRupee,
  IconUser,
  List,
  Row,
  Sheet,
  colors,
  space,
  type IconProps,
} from '../../../design';

export type AddAction = 'workout' | 'session' | 'client' | 'payment';

const ACTIONS: {
  key: AddAction;
  icon: React.ComponentType<IconProps>;
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'workout',
    icon: IconDumbbell,
    title: 'Log a workout',
    subtitle: 'For a client, or for yourself',
  },
  {
    key: 'session',
    icon: IconCalendar,
    title: 'Book a session',
    subtitle: 'One-off or repeating',
  },
  {
    key: 'client',
    icon: IconUser,
    title: 'Add a client',
    subtitle: 'Name and number is enough',
  },
  {
    key: 'payment',
    icon: IconRupee,
    title: 'Record a payment',
    subtitle: 'UPI, cash or gym-collected',
  },
];

export default function AddSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (action: AddAction) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="What are you doing?">
      <List style={styles.list}>
        {ACTIONS.map(({ key, icon: Icon, title, subtitle }) => (
          <Row
            key={key}
            grouped
            minHeight={60}
            title={title}
            subtitle={subtitle}
            leading={
              <View style={styles.icon}>
                <Icon size={21} color={colors.ink2} />
              </View>
            }
            onPress={() => onPick(key)}
          />
        ))}
      </List>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: space.s3 },
  icon: { width: 21, alignItems: 'center' },
});
