/**
 * `.tx-avatar` — initials on a fixed palette.
 *
 * Profile photos are not in the MVP, so this is not a placeholder waiting for
 * an image: it is what a client sees. The colour is derived from the name so
 * it is stable across devices and reinstalls, and every colour in the palette
 * clears 5.9:1 against white lettering.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { avatarColor, colors, initials, radius } from './tokens';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<AvatarSize, { box: number; font: number }> = {
  xs: { box: 26, font: 9.5 },
  sm: { box: 34, font: 12 },
  md: { box: 40, font: 14 },
  lg: { box: 52, font: 18 },
  xl: { box: 72, font: 25 },
};

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  /** `.tx-avatar` is round; the app-bar variant squares off to r2. */
  square?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Avatar({ name, size = 'md', square = false, style }: AvatarProps) {
  const { box, font } = SIZES[size];
  const mark = initials(name);
  // No name yet — a grey well, not a coloured badge with nothing in it.
  const empty = mark.length === 0;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={empty ? 'No name yet' : name}
      style={[
        styles.avatar,
        {
          width: box,
          height: box,
          borderRadius: square ? radius.r2 : radius.full,
          backgroundColor: empty ? colors.surface2 : avatarColor(name.trim().toLowerCase()),
        },
        style,
      ]}
    >
      <Text style={[styles.mark, { fontSize: font }, empty && styles.markEmpty]}>{mark || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mark: { color: '#FFFFFF', fontWeight: '700', letterSpacing: -0.2 },
  markEmpty: { color: colors.ink3 },
});
