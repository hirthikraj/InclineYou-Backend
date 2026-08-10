/**
 * `.tx-menu` — the long-press menu.
 *
 * NN/g's finding on contextual swipe drives the whole shape of this: burying
 * an action behind a swipe stops people finding it, so every swipe action is
 * also here, and everything here is also on the client's own screen. That makes
 * this the discoverable middle path, not a shortcut for power users.
 *
 * Destructive is last, separated by a rule, and red — and the caller still
 * confirms it. A menu item is not a confirmation.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tap } from './tokens';
import type { IconProps } from './icons';

export interface MenuAction {
  key: string;
  label: string;
  icon?: React.ComponentType<IconProps>;
  destructive?: boolean;
  /** Draws a rule above this item. Use it once, before the destructive group. */
  separated?: boolean;
  onPress: () => void;
}

export default function Menu({
  actions,
  style,
}: {
  actions: MenuAction[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.menu, style]} accessibilityRole="menu">
      {actions.map((action) => (
        <React.Fragment key={action.key}>
          {action.separated ? <View style={styles.rule} /> : null}
          <Pressable
            onPress={action.onPress}
            accessibilityRole="menuitem"
            accessibilityLabel={action.label}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          >
            {action.icon ? (
              <action.icon
                size={18}
                color={action.destructive ? colors.danger : colors.ink2}
                strokeWidth={1.8}
              />
            ) : null}
            <Text style={[styles.label, action.destructive && styles.destructive]}>
              {action.label}
            </Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    minWidth: 210,
    padding: 6,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    // e3 — the menu floats over a scrim, so it is the one place a shadow earns
    // its cost.
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    width: '100%',
    minHeight: tap.min - 4,
    paddingHorizontal: space.s3,
    borderRadius: radius.r1,
  },
  itemPressed: { backgroundColor: colors.surface3 },
  label: { flex: 1, fontSize: 14.5, color: colors.ink },
  destructive: { color: colors.danger },
  rule: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
});
