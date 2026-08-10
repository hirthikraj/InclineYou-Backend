/**
 * `.tx-selectbar` — the app bar, while a selection is live.
 *
 * It replaces `AppBar` in place rather than sliding in above it, so the list
 * below never moves. Same height, same first slot: the menu button becomes a
 * cancel, and the title becomes the count.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, space, tnum } from './tokens';
import type { IconProps } from './icons';

export interface SelectBarAction {
  label: string;
  icon?: React.ComponentType<IconProps>;
  destructive?: boolean;
  onPress: () => void;
}

export default function SelectBar({
  count,
  leading,
  action,
  style,
}: {
  count: number;
  /** The cancel button. */
  leading?: React.ReactNode;
  action?: SelectBarAction;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.bar, style]} accessibilityLiveRegion="polite">
      {leading}
      <Text style={styles.count} maxFontSizeMultiplier={maxFontScale.control}>
        {count} selected
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          {action.icon ? (
            <action.icon
              size={15}
              color={action.destructive ? colors.danger : colors.ink}
              strokeWidth={2.6}
            />
          ) : null}
          <Text style={[styles.actionLabel, action.destructive && styles.destructive]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    minHeight: 56,
    paddingVertical: 2,
  },
  count: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.34,
    color: colors.ink,
    ...tnum,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: space.s3,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
  },
  pressed: { opacity: 0.7 },
  actionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.48, color: colors.ink },
  destructive: { color: colors.danger },
});
