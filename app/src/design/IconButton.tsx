/**
 * `.tx-iconbtn` — a 44px square action, with or without its own surface.
 *
 * The two badge forms are not interchangeable. A dot says "there is something
 * here"; a count says "there are eleven things here, and the number is what
 * you act on". The design file only ever puts a count on a destructive-red
 * fill, because a number you can't clear is nagging, not informing.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, tnum } from './tokens';
import type { IconProps } from './icons';

export interface IconButtonProps {
  icon: React.ComponentType<IconProps>;
  onPress?: () => void;
  /** Screen-reader name. Required — an icon alone says nothing out loud. */
  label: string;
  /** `.tx-iconbtn--bare` — no fill, no hairline. The app-bar default. */
  bare?: boolean;
  size?: number;
  color?: string;
  /** Unread marker. Ignored when `count` is set. */
  dot?: boolean;
  /** Shown when > 0. Caps at 99+ so the pill never grows past its corner. */
  count?: number;
  style?: StyleProp<ViewStyle>;
}

export default function IconButton({
  icon: Icon,
  onPress,
  label,
  bare = false,
  size = 21,
  color = colors.ink2,
  dot = false,
  count,
  style,
}: IconButtonProps) {
  const showCount = typeof count === 'number' && count > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={showCount ? `${label}, ${count} unread` : dot ? `${label}, unread` : label}
      style={({ pressed }) => [
        styles.btn,
        !bare && styles.filled,
        pressed && !bare && styles.pressed,
        pressed && bare && styles.pressedBare,
        style,
      ]}
    >
      <Icon size={size} color={color} />
      {showCount ? (
        <View style={styles.count}>
          <Text style={styles.countText} maxFontSizeMultiplier={maxFontScale.micro}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : dot ? (
        <View style={styles.dot} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  pressed: { backgroundColor: colors.surface2 },
  pressedBare: { opacity: 0.6 },

  dot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  count: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 17,
    minHeight: 17,
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.dangerFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.dangerFillInk,
    ...tnum,
  },
});
